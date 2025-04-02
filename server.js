const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path'); // Keep path
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Import database and routes
const db = require('./dbConfig');
const { router: authRoutes } = require('./routes/authRoutes');
const statsRoutes = require('./routes/statsRoutes');
const { initializeDatabase } = require('./dbInit');
const gameStatsModel = require('./models/gameStatsModel');

const PORT = process.env.PORT || 8080;

// Create Express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.'));

// Session configuration (if needed for non-JWT authentication)
app.use(session({
  secret: process.env.SESSION_SECRET || 'tetris-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/stats', statsRoutes);

// Test leaderboard endpoint for local testing
app.get('/api/stats/test-leaderboard', (req, res) => {
  console.log('Serving test leaderboard data');
  
  // Sample leaderboard data for testing
  const testLeaderboard = [
    {
      id: 1,
      username: 'tim',
      elo_rating: 1250,
      wins: 3,
      losses: 1,
      games_played: 4,
      win_percentage: 75
    },
    {
      id: 2,
      username: 'videogameenjoyer',
      elo_rating: 1220,
      wins: 2,
      losses: 2,
      games_played: 4,
      win_percentage: 50
    },
    {
      id: 3,
      username: 'tetris_master',
      elo_rating: 1400,
      wins: 8,
      losses: 2,
      games_played: 10,
      win_percentage: 80
    }
  ];
  
  res.json(testLeaderboard);
});

// API endpoint for leaderboard
app.get('/api/stats/leaderboard', async (req, res) => {
  try {
    console.log('Fetching leaderboard data');
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await gameStatsModel.getLeaderboardWithStats(limit, offset);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result.leaderboard);
  } catch (error) {
    console.error('Error serving leaderboard:', error);
    res.status(500).json({ error: 'Server error fetching leaderboard data' });
  }
});

// Store active game rooms and waiting player
let gameRooms = new Map(); // roomId -> { id: string, player1: ws, player2: ws, roomType: 'public'|'private', /* other room state */ }
let waitingPlayer = null;   // Holds the WebSocket of the player waiting for a public match
let privateRooms = new Map(); // roomCode -> { creatorWs: ws, creatorId: string, roomId: string | null } (roomId is null until joined)
let roomIdCounter = 1;
// Track player acceptance for matches
let pendingMatches = new Map(); // roomId -> { player1Accepted: boolean, player2Accepted: boolean, player1: ws, player2: ws }

// Track authenticated users
let authenticatedUsers = new Map(); // userId -> { ws: WebSocket, username: string, eloRating: number }

// Simple Garbage Calculation Rules
const GARBAGE_MAP = {
    1: 0, // Single
    2: 1, // Double
    3: 2, // Triple
    4: 4  // Tetris
    // TODO: Add T-Spins, Combos
};

// --- HTTP Server Setup (to serve static files) ---
const server = http.createServer(app);

// --- WebSocket Server Setup (attach to HTTP server) ---
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server

wss.on('connection', (ws) => {
    console.log(`Client connected. Total clients: ${wss.clients.size}`);
    ws.roomId = null; // Assign null initially
    ws.playerNumber = null; // Assign null initially
    ws.lost = false; // Assign lost status initially
    ws.userId = null; // Add userId for authenticated users
    ws.lastScore = null; // Add lastScore for match result recording
    ws.lastLines = null; // Add lastLines for match result recording

    // Send initial status or welcome message if desired
    sendMessage(ws, { type: 'status', payload: { message: 'Connected to server. Choose match type.' } });

    // --- Message Handling ---
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Improved logging
            if (data.type !== 'update_state') { // Don't log frequent state updates
                console.log(`Received (Player ${ws.playerNumber}, Room ${ws.roomId}):`, data);
            }

            // --- Handle Different Message Types ---
            switch (data.type) {
                // -- Authentication Messages --
                case 'authenticate':
                    // Handle authentication with JWT token
                    handleAuthentication(ws, data.payload);
                    break;

                // -- Matchmaking Messages (No room check needed) --
                case 'find_public_match':
                    // Check if the player is authenticated - required for matchmaking
                    if (!ws.userId) {
                        console.log("Unauthenticated player tried to find a match");
                        sendMessage(ws, { 
                            type: 'error', 
                            payload: { message: 'You must be logged in to play matches.' }
                        });
                        break;
                    }
                    
                    // First, clear any existing references to this client in the waiting list
                    if (waitingPlayer === ws) {
                        // If the same client is clicking the button again, just ignore
                        console.log(`Player ${ws.userId} already waiting for public match.`);
                        sendMessage(ws, { 
                            type: 'status', 
                            payload: { 
                                message: 'Already searching for match...', 
                                matchmaking: true 
                            } 
                        });
                        break;
                    }
                    
                    // Clear waitingPlayer if their connection is closed
                    if (waitingPlayer && waitingPlayer.readyState !== WebSocket.OPEN) {
                        console.log("Clearing disconnected waiting player");
                        waitingPlayer = null;
                    }
                    
                    // If we have a waiting player, check it's not the same user on a different connection
                    if (waitingPlayer) {
                        // Double-check the connection is still open
                        if (waitingPlayer.readyState !== WebSocket.OPEN) {
                            console.log("Waiting player connection closed, clearing reference");
                            waitingPlayer = null;
                        }
                        // Prevent matching with yourself (same userId)
                        else if (waitingPlayer.userId === ws.userId) {
                            console.log(`Player (${ws.userId}) tried to match with themselves on a different connection`);
                            sendMessage(ws, { 
                                type: 'error', 
                                payload: { message: 'Cannot play against yourself!' }
                            });
                            break;
                        }
                        else {
                            // Valid match found!
                            console.log(`Found waiting player ${waitingPlayer.userId}, creating public room with ${ws.userId}...`);
                            const player1 = waitingPlayer;
                            const player2 = ws;
                            waitingPlayer = null; // Clear waitingPlayer reference
                            
                            // Create a new room but don't start the game yet - wait for both players to accept
                            const roomId = createRoom(player1, player2, 'public', false);
                            
                            // Add this match to the pending matches, waiting for acceptances
                            pendingMatches.set(roomId, {
                                player1Accepted: false,
                                player2Accepted: false,
                                player1,
                                player2
                            });
                            
                            break;
                        }
                    }
                    
                    // If we get here, there's no valid waiting player, so become the waiting player
                    console.log(`Player ${ws.userId} added to waitlist.`);
                    waitingPlayer = ws;
                    sendMessage(ws, { 
                        type: 'status', 
                        payload: { 
                            message: 'Waiting for opponent... ', 
                            matchmaking: true 
                        }
                    });
                    break;

                case 'accept_match':
                    // Handle match acceptance
                    if (ws.roomId) {
                        const roomId = ws.roomId;
                        const pendingMatch = pendingMatches.get(roomId);
                        
                        if (pendingMatch) {
                            // Mark this player as accepted
                            if (ws === pendingMatch.player1) {
                                pendingMatch.player1Accepted = true;
                                console.log(`Player 1 (${ws.userId}) accepted match in room ${roomId}`);
                                
                                // Notify player they're waiting for opponent
                                sendMessage(ws, {
                                    type: 'waiting_for_opponent',
                                    payload: { message: 'Waiting for opponent to accept or decline...' }
                                });
                                
                            } else if (ws === pendingMatch.player2) {
                                pendingMatch.player2Accepted = true;
                                console.log(`Player 2 (${ws.userId}) accepted match in room ${roomId}`);
                                
                                // Notify player they're waiting for opponent
                                sendMessage(ws, {
                                    type: 'waiting_for_opponent',
                                    payload: { message: 'Waiting for opponent to accept or decline...' }
                                });
                            }
                            
                            // Check if both players have accepted
                            if (pendingMatch.player1Accepted && pendingMatch.player2Accepted) {
                                console.log(`Both players accepted match in room ${roomId}, starting game`);
                                
                                // Send match accepted message to both players to start the game
                                sendMessage(pendingMatch.player1, {
                                    type: 'match_accepted',
                                    payload: {}
                                });
                                
                                sendMessage(pendingMatch.player2, {
                                    type: 'match_accepted',
                                    payload: {}
                                });
                                
                                // Remove from pending matches since it's now active
                                pendingMatches.delete(roomId);
                            }
                        }
                    }
                    break;
                    
                case 'decline_match':
                    // Handle match declination
                    if (ws.roomId) {
                        const roomId = ws.roomId;
                        const pendingMatch = pendingMatches.get(roomId);
                        
                        if (pendingMatch) {
                            // Get the opponent who will be notified
                            const opponent = (ws === pendingMatch.player1) ? pendingMatch.player2 : pendingMatch.player1;
                            
                            console.log(`Player ${ws.userId} declined match in room ${roomId}`);
                            
                            // Notify the opponent that the match was declined
                            if (opponent && opponent.readyState === WebSocket.OPEN) {
                                sendMessage(opponent, {
                                    type: 'match_declined',
                                    payload: { message: 'Opponent declined the match.' }
                                });
                                
                                // Clear opponent's room assignment and player number
                                opponent.roomId = null;
                                opponent.playerNumber = null;
                            }
                            
                            // Clear this player's room assignment and player number
                            ws.roomId = null;
                            ws.playerNumber = null;
                            
                            // Clean up room and pending match
                            pendingMatches.delete(roomId);
                            handleRoomCleanup(roomId);
                            
                            // Send confirmation to the player who declined that they're now free to find another match
                            sendMessage(ws, {
                                type: 'matchmaking_reset',
                                payload: { message: 'You declined the match. You can search for another game.' }
                            });
                        }
                    }
                    break;

                case 'create_private_match':
                    // Check if the player is authenticated - required for matchmaking
                    if (!ws.userId) {
                        console.log("Unauthenticated player tried to create a private match");
                        sendMessage(ws, { 
                            type: 'error', 
                            payload: { message: 'You must be logged in to play matches.' }
                        });
                        break;
                    }
                    
                    const newRoomCode = generateRoomCode();
                    privateRooms.set(newRoomCode, { 
                        creatorWs: ws, 
                        creatorId: ws.userId, // Store the creator's user ID 
                        roomId: null
                    });
                    console.log(`Created private room with code ${newRoomCode} for player ${ws.userId}`);
                    sendMessage(ws, { type: 'private_match_created', payload: { roomCode: newRoomCode } });
                    break;

                case 'join_private_match':
                    // Check if the player is authenticated - required for matchmaking
                    if (!ws.userId) {
                        console.log("Unauthenticated player tried to join a private match");
                        sendMessage(ws, { 
                            type: 'error', 
                            payload: { message: 'You must be logged in to play matches.' }
                        });
                        break;
                    }
                    
                    const roomCodeToJoin = data.payload.roomCode;
                    if (privateRooms.has(roomCodeToJoin)) {
                        const privateRoom = privateRooms.get(roomCodeToJoin);
                        
                        // Check if player is trying to join their own room
                        if (privateRoom.creatorWs === ws || privateRoom.creatorId === ws.userId) {
                            console.log(`Player ${ws.userId} tried to join their own room`);
                            sendMessage(ws, { 
                                type: 'error', 
                                payload: { message: 'Cannot join your own room' }
                            });
                            break;
                        }
                        
                        if (privateRoom.roomId === null) { // Room is waiting
                            const player1 = privateRoom.creatorWs;
                            const player2 = ws;
                            console.log(`Player ${ws.userId} joining private room ${roomCodeToJoin} created by ${privateRoom.creatorId}...`);
                            const newRoomId = createRoom(player1, player2, 'private');
                            privateRooms.delete(roomCodeToJoin); // Room started, remove from private list
                            console.log(`Private room ${roomCodeToJoin} started as game room ${newRoomId}`);
                        } else {
                            sendMessage(ws, { type: 'error', payload: { message: 'Private room already started or invalid' } });
                        }
                    } else {
                        sendMessage(ws, { type: 'error', payload: { message: 'Invalid room code' } });
                    }
                    break;

                // -- In-Game Messages (Room check IS needed) --
                case 'piece_locked':
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        // **Server Authority**: Validate the move if necessary (simple pass-through for now)
                        // In a real game, you might check if the lock position is valid based on server state.
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} locked piece.`);
                        if (opponent && opponent.readyState === WebSocket.OPEN) {
                            sendMessage(opponent, {
                                type: 'opponent_piece_locked',
                                payload: data.payload // Send piece type, rotation, final position, grid state etc.
                            });
                        }
                        break;
                    }

                case 'line_clear': // Client informs server about lines cleared for garbage calculation
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} cleared lines.`, data.payload);
                        const linesCleared = data.payload.lines || 0;
                        const garbageToSend = GARBAGE_MAP[linesCleared] || 0;

                        // TODO: Implement Combo logic
                        // TODO: Implement Garbage canceling logic

                        if (garbageToSend > 0 && opponent && opponent.readyState === WebSocket.OPEN) {
                            console.log(`Room ${ws.roomId}: Sending ${garbageToSend} garbage lines to Player ${opponent.playerNumber}`);
                            sendMessage(opponent, {
                                type: 'receive_garbage',
                                payload: { lines: garbageToSend }
                            });
                        }
                        break;
                    }

                case 'update_state':
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        // Store board state in the client's object
                        ws.boardState = data.payload.board;
                        // Relay minimal state to the opponent
                        broadcastToOpponent(ws, {
                            type: 'opponent_state',
                            payload: { board: ws.boardState }
                        }, false); // Don't log opponent state broadcasts
                        break;
                    }

                case 'send_garbage':
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        if (typeof data.payload.lines === 'number' && data.payload.lines > 0) {
                            broadcastToOpponent(ws, {
                                type: 'receive_garbage',
                                payload: { lines: data.payload.lines }
                            }, true);
                        } else {
                            console.warn("Invalid garbage data received:", data.payload);
                        }
                        break;
                    }

                case 'game_over':
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { 
                            console.error(`Game over received but room ${ws.roomId} not found`);
                            logAndIgnore(ws, data.type); 
                            break; 
                        }
                        
                        // Check if userId was provided in the payload and use it
                        if (data.payload.userId) {
                            ws.userId = data.payload.userId;
                            console.log(`Updated user ID from game_over payload: ${ws.userId}`);
                        } else {
                            console.log(`No userId in payload. Current userId: ${ws.userId || 'not set'}`);
                        }
                        
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} game over. User ID: ${ws.userId || 'not set'}`);
                        
                        // Mark player as lost
                        ws.lost = true;
                        
                        // Save score and lines in case they weren't updated recently
                        if (data.payload.score !== undefined) {
                            ws.lastScore = data.payload.score;
                            console.log(`Player ${ws.playerNumber} final score: ${ws.lastScore}`);
                        }
                        
                        if (data.payload.linesCleared !== undefined) {
                            ws.lastLines = data.payload.linesCleared;
                            console.log(`Player ${ws.playerNumber} final lines: ${ws.lastLines}`);
                        }
                        
                        // Check if the other player is still playing
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        if (opponent && opponent.readyState === WebSocket.OPEN) {
                            // Notify opponent this player lost
                            sendMessage(opponent, {
                                type: 'opponent_game_over',
                                payload: {
                                    message: 'Your opponent lost!',
                                    opponentScore: data.payload.score || 0,
                                    opponentLines: data.payload.linesCleared || 0
                                }
                            });
                            
                            // Notify this player their opponent won (only if opponent hasn't also lost)
                            if (!opponent.lost) {
                                sendMessage(ws, {
                                    type: 'game_lost',
                                    payload: {
                                        message: 'You lost!',
                                        opponentScore: 0, // We don't have this info yet
                                        opponentLines: 0 // We don't have this info yet
                                    }
                                });
                            }
                        }
                        
                        // If both players are done, clean up the room
                        const allDone = (ws.lost && (opponent ? opponent.lost : true));
                        if (allDone) {
                            console.log(`Room ${ws.roomId}: Both players done, removing room.`);
                            
                            // Record match result in database if both players are authenticated
                            if (ws.userId && opponent && opponent.userId) {
                                try {
                                    console.log(`Recording match result: Player ${ws.userId} vs Player ${opponent.userId}`);
                                    console.log(`Player ${ws.userId} lost: ${ws.lost}, Player ${opponent.userId} lost: ${opponent.lost}`);
                                    
                                    // Determine winner based on who is still playing (not lost)
                                    let winnerId;
                                    
                                    // In case both players lost (e.g. disconnection), use the one with higher score
                                    if (ws.lost && opponent.lost) {
                                        winnerId = (ws.lastScore || 0) > (opponent.lastScore || 0) ? ws.userId : opponent.userId;
                                        console.log(`Both players lost, winner determined by score. Winner: ${winnerId}`);
                                    } else {
                                        winnerId = ws.lost ? opponent.userId : ws.userId;
                                    }
                                    
                                    console.log(`Winner: ${winnerId}`);
                                    console.log(`Player 1 score: ${ws.lastScore || 0}, Player 2 score: ${opponent.lastScore || 0}`);
                                    
                                    // Match data includes scores and lines cleared
                                    const matchData = {
                                        winnerScore: ws.lost ? (opponent.lastScore || 0) : (ws.lastScore || 0),
                                        loserScore: ws.lost ? (ws.lastScore || 0) : (opponent.lastScore || 0),
                                        winnerLines: ws.lost ? (opponent.lastLines || 0) : (ws.lastLines || 0),
                                        loserLines: ws.lost ? (ws.lastLines || 0) : (opponent.lastLines || 0)
                                    };
                                    
                                    // For debugging
                                    console.log('Match data:', matchData);
                                    
                                    // Import the gameStatsModel directly
                                    const gameStatsModel = require('./models/gameStatsModel');
                                    
                                    // Record match result
                                    gameStatsModel.recordMatchResult(ws.userId, opponent.userId, winnerId, matchData)
                                        .then((result) => {
                                            if (result.success) {
                                                console.log(`Match result recorded: ${winnerId} won against ${opponent.userId}`);
                                                console.log('ELO changes:', {
                                                    player1EloChange: result.player1EloChange || 0,
                                                    player2EloChange: result.player2EloChange || 0
                                                });
                                                
                                                // Send update notification to both players
                                                const updateMsg = {
                                                    type: 'stats_updated',
                                                    payload: {
                                                        message: 'Your stats have been updated!',
                                                        eloChange: 0 // Will be updated below
                                                    }
                                                };
                                                
                                                if (ws.readyState === WebSocket.OPEN) {
                                                    // Add ELO info specific to this player
                                                    updateMsg.payload.eloChange = 
                                                        ws.userId === winnerId ? result.player1EloChange : result.player2EloChange;
                                                    sendMessage(ws, updateMsg);
                                                }
                                                
                                                if (opponent && opponent.readyState === WebSocket.OPEN) {
                                                    // Add ELO info specific to opponent
                                                    updateMsg.payload.eloChange = 
                                                        opponent.userId === winnerId ? result.player1EloChange : result.player2EloChange;
                                                    sendMessage(opponent, updateMsg);
                                                }
                                                
                                                // Call additional leaderboard update endpoint to force refresh
                                                try {
                                                    // Using internal API call to refresh the leaderboard cache
                                                    const statsRoutes = require('./routes/statsRoutes');
                                                    statsRoutes.refreshLeaderboardCache();
                                                    console.log('Leaderboard cache refreshed');
                                                } catch (error) {
                                                    console.error('Error refreshing leaderboard cache:', error);
                                                }
                                            } else {
                                                console.error('Failed to record match result:', result.error);
                                            }
                                        })
                                        .catch(err => {
                                            console.error('Error recording match result:', err);
                                            console.error('Error details:', err.stack);
                                        });
                                } catch (err) {
                                    console.error('Error processing match result:', err);
                                    console.error('Error stack:', err.stack);
                                }
                            } else {
                                console.log('Cannot record match result - missing user IDs:');
                                console.log(`Player 1 ID: ${ws.userId || 'not set'}`);
                                console.log(`Player 2 ID: ${opponent ? opponent.userId || 'not set' : 'opponent disconnected'}`);
                            }
                            
                            // Delete the game room when finished
                            gameRooms.delete(ws.roomId);
                        }
                        break;
                    }
                    
                case 'speed_up':
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} sent speed-up attack.`);
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        
                        if (opponent && opponent.readyState === WebSocket.OPEN) {
                            // Notify opponent about the speed-up attack
                            sendMessage(opponent, {
                                type: 'speed_up',
                                payload: {
                                    type: 'received',
                                    duration: data.payload.duration,
                                    factor: data.payload.factor
                                }
                            });
                            
                            // Confirm to the sender
                            sendMessage(ws, {
                                type: 'speed_up',
                                payload: { type: 'sent' }
                            });
                        }
                        break;
                    }
                    
                case 'scramble':
                    {
                        const currentRoom = gameRooms.get(ws.roomId);
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} sent scramble attack.`);
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        
                        if (opponent && opponent.readyState === WebSocket.OPEN) {
                            // Notify opponent about the scramble attack
                            sendMessage(opponent, {
                                type: 'scramble',
                                payload: {
                                    type: 'received',
                                    intensity: data.payload.intensity
                                }
                            });
                            
                            // Confirm to the sender
                            sendMessage(ws, {
                                type: 'scramble',
                                payload: { type: 'sent' }
                            });
                        }
                        break;
                    }

                case 'cancel_match_search':
                    if (waitingPlayer === ws) {
                        console.log("Player cancelled match search");
                        waitingPlayer = null;
                        sendMessage(ws, { type: 'status', payload: { message: 'Match search cancelled.' } });
                    }
                    break;

                case 'update_score':
                    ws.lastScore = data.payload.score;
                    ws.lastLines = data.payload.lines;
                    
                    // If user ID is provided, make sure it's set
                    if (data.payload.userId) {
                        ws.userId = data.payload.userId;
                        console.log(`Updated user ID in score update: ${ws.userId}`);
                    }
                    
                    console.log(`Player ${ws.playerNumber} updated score: ${ws.lastScore}, lines: ${ws.lastLines}, userId: ${ws.userId || 'not set'}`);
                    break;

                case 'user_auth':
                    if (data.payload && data.payload.token) {
                        try {
                            // Verify and decode the JWT token
                            const JWT_SECRET = process.env.JWT_SECRET || 'tetris-secret-key-12345';
                            const decoded = jwt.verify(data.payload.token, JWT_SECRET);
                            
                            // Extract user information from the token
                            ws.userId = decoded.userId;
                            ws.username = decoded.username;
                            
                            console.log(`User authenticated from token: UserID=${ws.userId}, Username=${ws.username}`);
                            
                            // Confirm authentication to client
                            sendMessage(ws, {
                                type: 'auth_confirmed',
                                payload: { 
                                    message: 'Authentication successful',
                                    userId: ws.userId,
                                    username: ws.username
                                }
                            });
                            
                            // Debug log all authenticated clients
                            console.log('Currently authenticated clients:');
                            wss.clients.forEach(client => {
                                if (client.userId) {
                                    console.log(`- Client: User ID ${client.userId}`);
                                }
                            });
                        } catch (error) {
                            console.error('Token verification failed:', error);
                            sendMessage(ws, {
                                type: 'auth_error',
                                payload: { 
                                    message: 'Authentication failed: Invalid token'
                                }
                            });
                        }
                    } else if (data.payload && data.payload.userId) {
                        // Fallback to direct userId authentication (less secure)
                        ws.userId = data.payload.userId;
                        console.log(`User authenticated with direct ID: ${ws.userId}`);
                        
                        // Confirm authentication to client
                        sendMessage(ws, {
                            type: 'auth_confirmed',
                            payload: { 
                                message: 'Authentication successful',
                                userId: ws.userId
                            }
                        });
                    }
                    break;

                default:
                    // If the message type is unknown or requires a room but the client isn't in one
                    logAndIgnore(ws, data.type, true);
                    console.log(`Unknown message type received: ${data.type}`);
            }
        } catch (error) {
            console.error('Failed to parse message or handle client message:', error);
        }
    });

    // --- Disconnection Handling ---
    ws.on('close', () => {
        // Get the room this client was in, if any
        const roomId = ws.roomId;
        const playerNumber = ws.playerNumber;
        
        console.log(`Client disconnected. Room: ${roomId || 'null'}, Player: ${playerNumber || 'null'}. Rooms left: ${gameRooms.size}`);
        
        // Clear waitingPlayer if this client was waiting
        if (waitingPlayer === ws) {
            console.log(`Clearing waiting player ${ws.userId || 'unknown'} due to disconnect`);
            waitingPlayer = null;
        }
        
        // If this client was in a room, notify the other player and handle cleanup
        if (roomId) {
          const room = gameRooms.get(roomId);
          if (room) {
            // Get the other player in the room
            const otherPlayer = (ws === room.player1) ? room.player2 : room.player1;
            
            console.log(`Room ${roomId}: Player ${playerNumber} left. Room state updated.`);
            
            // Notify the other player if they're still connected
            if (otherPlayer && otherPlayer.readyState === WebSocket.OPEN) {
              sendMessage(otherPlayer, {
                type: "opponent_disconnected",
                payload: { message: "Your opponent disconnected." }
              });
              
              // Mark the disconnected player as lost
              ws.lost = true;
              
              // Handle room cleanup and match recording
              handleRoomCleanup(roomId, ws.userId);
            }
          }
        }
        
        console.log(`Client disconnected. Player ${playerNumber || 'N/A'}, Room: ${roomId ? roomId : '(no room)'}. Rooms left: ${gameRooms.size}`);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for Player ${ws.playerNumber} in Room ${ws.roomId}:`, error);
        // Attempt cleanup on error as well
        cleanupClient(ws);
    });
});

// --- Utility Functions ---
function createRoom(player1, player2, roomType = 'public', autoStart = true) {
    const roomId = `room_${roomIdCounter++}`;
    
    console.log(`Creating ${roomType} room ${roomId} for players ${player1.userId} and ${player2.userId}`);
    
    // Assign room to both players
    player1.roomId = roomId;
    player2.roomId = roomId;
    
    // Assign player numbers
    player1.playerNumber = 1;
    player2.playerNumber = 2;
    
    // Reset player states
    player1.lost = false;
    player2.lost = false;
    player1.lastScore = null;
    player1.lastLines = null;
    player2.lastScore = null;
    player2.lastLines = null;
    
    // Create and store the room
    gameRooms.set(roomId, {
        id: roomId,
        player1: player1,
        player2: player2,
        roomType: roomType,
        created: Date.now()
    });
    
    // Send match found notification to both players
    const matchFoundPayload = { opponentFound: true, roomId: roomId };
    
    sendMessage(player1, { 
        type: 'match_found', 
        payload: { ...matchFoundPayload, playerNumber: 1 } 
    });
    
    sendMessage(player2, { 
        type: 'match_found', 
        payload: { ...matchFoundPayload, playerNumber: 2 } 
    });
    
    // Start the game immediately for private matches or if autoStart is true
    if (autoStart) {
        // Private matches or other auto-start scenarios would immediately start
        sendMessage(player1, { type: 'match_accepted', payload: {} });
        sendMessage(player2, { type: 'match_accepted', payload: {} });
    }
    
    return roomId;
}

function sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.log('Attempted to send message to a closed connection.');
    }
}

function broadcastToOpponent(senderWs, message, log = true) {
    const currentRoom = gameRooms.get(senderWs.roomId);
    if (!currentRoom) {
        // This might happen if a message is processed just as the opponent disconnects
        console.warn(`broadcastToOpponent: Cannot find room ${senderWs.roomId} for sender Player ${senderWs.playerNumber}.`);
        return;
    }

    const opponent = (senderWs === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
    if (opponent && opponent.readyState === WebSocket.OPEN) {
         opponent.send(JSON.stringify(message));
    }
    if (log) {
        console.log(`Room ${senderWs.roomId}: Broadcasting type '${message.type}' from Player ${senderWs.playerNumber} to Player ${opponent ? opponent.playerNumber : '(gone)'}`);
    }
}

function cleanupClient(ws) {
    const playerIdentifier = `Player ${ws.playerNumber || '(N/A)'}`;
    const roomIdentifier = ws.roomId || '(no room)';
    // If client was waiting for a public match
    if (waitingPlayer === ws) {
        console.log(`${playerIdentifier} was waiting for public match, clearing waitlist.`);
        waitingPlayer = null;
    }

    // If client created a private room that wasn't joined yet
    for (const [code, roomInfo] of privateRooms.entries()) {
        if (roomInfo.creatorWs === ws && roomInfo.roomId === null) {
            console.log(`${playerIdentifier} was creator of private room ${code}, removing room.`);
            privateRooms.delete(code);
            break; // Client can only be creator of one room at a time
        }
    }

    // If client was in an active game room
    const roomId = ws.roomId;
    if (roomId && gameRooms.has(roomId)) {
        const room = gameRooms.get(roomId);
        // Notify opponent only if the disconnecting player hadn't already lost
        if (!ws.lost && room.player1 === ws) {
            if (room.player2 && room.player2.readyState === WebSocket.OPEN) {
                sendMessage(room.player2, { type: 'opponent_left', payload: { message: 'Opponent disconnected' } });
            }
        } else if (!ws.lost && room.player2 === ws) {
            if (room.player1 && room.player1.readyState === WebSocket.OPEN) {
                sendMessage(room.player1, { type: 'opponent_left', payload: { message: 'Opponent disconnected' } });
            }
        }

        // Update room state - set disconnected player to null
        if (room.player1 === ws) room.player1 = null;
        if (room.player2 === ws) room.player2 = null;

        // Remove the room if it's now empty (or effectively empty - e.g., one player left, the other already lost)
        const p1Exists = room.player1 && room.player1.readyState === WebSocket.OPEN;
        const p2Exists = room.player2 && room.player2.readyState === WebSocket.OPEN;

        if (!p1Exists && !p2Exists) {
            console.log(`Room ${roomId} is now empty, deleting.`);
            gameRooms.delete(roomId);
        } else {
             console.log(`Room ${roomId}: ${playerIdentifier} left. Room state updated.`);
        }
    }

    console.log(`Client disconnected. ${playerIdentifier}, Room: ${roomIdentifier}. Rooms left: ${gameRooms.size}`);
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789'; // Avoid I, O, 0
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (privateRooms.has(code)); // Ensure code is unique among active private rooms
    return code;
}

function logAndIgnore(ws, messageType, isDefault = false) {
    if (isDefault) {
        console.warn(`Received unknown or invalid message type '${messageType}' from client (Player ${ws.playerNumber}, Room ${ws.roomId}). Ignoring.`);
    } else {
        console.warn(`Received message type '${messageType}' from client not in a valid room (Player ${ws.playerNumber}, Room ${ws.roomId}). Ignoring.`);
    }
}

function handleAuthentication(ws, payload) {
    const token = payload.token;
    if (!token) {
        console.log('No authentication token provided.');
        return;
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log('Invalid authentication token:', err);
            return;
        }

        const userId = decoded.userId;
        const username = decoded.username;
        const eloRating = decoded.eloRating;

        authenticatedUsers.set(userId, { ws: ws, username: username, eloRating: eloRating });
        ws.userId = userId;

        console.log(`User authenticated: ${username} (ID: ${userId})`);
    });
}

function handleRoomCleanup(roomId, disconnectedPlayerId = null) {
  const room = gameRooms.get(roomId);
  if (!room) return;
  
  // Get players in the room
  const players = Array.from(wss.clients)
    .filter(client => client.roomId === roomId);
  
  console.log(`Room cleanup for ${roomId}. Players still connected: ${players.length}. Disconnected player ID: ${disconnectedPlayerId || 'none'}`);
  
  // If we have two players with user IDs, record the match result
  if (players.length <= 1 && room.player1 && room.player2) {
    let player1Client = room.player1;
    let player2Client = room.player2;
    
    // Find the player who lost (either the disconnected one or the one who sent game_over)
    const player1Lost = player1Client.lost || (disconnectedPlayerId && player1Client.userId == disconnectedPlayerId);
    const player2Lost = player2Client.lost || (disconnectedPlayerId && player2Client.userId == disconnectedPlayerId);
    
    console.log(`Recording match on room cleanup: Player1(${player1Client.userId}) lost=${player1Lost}, Player2(${player2Client.userId}) lost=${player2Lost}`);
    
    if (player1Client.userId && player2Client.userId && (player1Lost || player2Lost)) {
      // Determine winner based on who didn't lose
      let winnerId;
      
      if (player1Lost && player2Lost) {
        // If both lost, use score as tiebreaker
        winnerId = (player1Client.lastScore || 0) > (player2Client.lastScore || 0) ? player1Client.userId : player2Client.userId;
      } else {
        winnerId = player1Lost ? player2Client.userId : player1Client.userId;
      }
      
      // For logging purposes only
      console.log(`Recording match in cleanup: Winner=${winnerId}`);
      
      // Match data with scores
      const matchData = {
        winnerScore: winnerId === player1Client.userId ? (player1Client.lastScore || 0) : (player2Client.lastScore || 0),
        loserScore: winnerId !== player1Client.userId ? (player1Client.lastScore || 0) : (player2Client.lastScore || 0),
        winnerLines: winnerId === player1Client.userId ? (player1Client.lastLines || 0) : (player2Client.lastLines || 0),
        loserLines: winnerId !== player1Client.userId ? (player1Client.lastLines || 0) : (player2Client.lastLines || 0)
      };
      
      // Record the match result
      const gameStatsModel = require('./models/gameStatsModel');
      gameStatsModel.recordMatchResult(player1Client.userId, player2Client.userId, winnerId, matchData)
        .then(result => {
          if (result.success) {
            console.log(`Match result recorded on room cleanup: ${winnerId} won`);
            console.log('ELO changes:', {
              player1EloChange: result.player1EloChange || 0,
              player2EloChange: result.player2EloChange || 0
            });
            
            // Notify any remaining connected players
            players.forEach(player => {
              if (player.readyState === WebSocket.OPEN) {
                const eloChange = player.userId === winnerId ? result.player1EloChange : result.player2EloChange;
                sendMessage(player, {
                  type: 'stats_updated',
                  payload: {
                    message: 'Your stats have been updated!',
                    eloChange
                  }
                });
              }
            });
          } else {
            console.error('Failed to record match result on cleanup:', result.error);
          }
        })
        .catch(err => {
          console.error('Error recording match result on cleanup:', err);
        });
    }
  }
  
  // Clean up room if empty or just has dummy connections
  if (players.length === 0) {
    console.log(`Removing empty room ${roomId}`);
    gameRooms.delete(roomId);
  }
}

// Initialize database
initializeDatabase();

// Start the HTTP server (which also handles WebSocket upgrades)
server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}, serving static files and handling WebSocket connections.`);
});
