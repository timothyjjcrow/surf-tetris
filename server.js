const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path'); // Keep path

const PORT = process.env.PORT || 8080;

// Store active game rooms and waiting player
let gameRooms = new Map(); // roomId -> { id: string, player1: ws, player2: ws, /* other room state */ }
let waitingPlayer = null;   // Holds the WebSocket of the player waiting for a public match
let privateRooms = new Map(); // roomCode -> { creatorWs: ws, roomId: string | null } (roomId is null until joined)
let roomIdCounter = 1;

// Simple Garbage Calculation Rules
const GARBAGE_MAP = {
    1: 0, // Single
    2: 1, // Double
    3: 2, // Triple
    4: 4  // Tetris
    // TODO: Add T-Spins, Combos
};

// --- HTTP Server Setup (to serve static files) ---
const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        // Add other types if needed
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                // Page not found
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('404 Not Found');
            } else {
                // Server error
                res.writeHead(500);
                res.end('Sorry, check with the site admin for error: '+error.code+' ..\n');
            }
        } else {
            // Success
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

// --- WebSocket Server Setup (attach to HTTP server) ---
const wss = new WebSocket.Server({ server }); // Attach WebSocket server to the HTTP server

wss.on('connection', (ws) => {
    console.log(`Client connected. Total clients: ${wss.clients.size}`);
    ws.roomId = null; // Assign null initially
    ws.playerNumber = null; // Assign null initially
    ws.lost = false; // Assign lost status initially

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
                // -- Matchmaking Messages (No room check needed) --
                case 'find_public_match':
                    if (waitingPlayer && waitingPlayer !== ws) {
                        console.log("Found waiting player, creating public room...");
                        const player1 = waitingPlayer;
                        const player2 = ws;
                        waitingPlayer = null;
                        createRoom(player1, player2, 'public');
                    } else if (waitingPlayer === ws) {
                        console.log("Player already waiting for public match.");
                        sendMessage(ws, { type: 'status', payload: { message: 'Already searching for match...' } });
                    } else {
                        console.log("No waiting player, adding current player to waitlist.");
                        waitingPlayer = ws;
                        sendMessage(ws, { type: 'status', payload: { message: 'Waiting for opponent... ' } });
                    }
                    break;

                case 'create_private_match':
                    const newRoomCode = generateRoomCode();
                    privateRooms.set(newRoomCode, { creatorWs: ws, roomId: null });
                    console.log(`Created private room with code ${newRoomCode} for player`);
                    sendMessage(ws, { type: 'private_match_created', payload: { roomCode: newRoomCode } });
                    break;

                case 'join_private_match':
                    const roomCodeToJoin = data.payload.roomCode;
                    if (privateRooms.has(roomCodeToJoin)) {
                        const privateRoom = privateRooms.get(roomCodeToJoin);
                        if (privateRoom.creatorWs === ws) {
                             sendMessage(ws, { type: 'error', payload: { message: 'Cannot join your own room' } });
                             break;
                        }
                        if (privateRoom.roomId === null) { // Room is waiting
                            const player1 = privateRoom.creatorWs;
                            const player2 = ws;
                            console.log(`Player joining private room ${roomCodeToJoin}...`);
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
                        if (!currentRoom) { logAndIgnore(ws, data.type); break; }
                        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;
                        console.log(`Player ${ws.playerNumber} in room ${ws.roomId} lost.`);
                        ws.lost = true; // Mark this player as having lost
                        // Notify opponent they won
                        broadcastToOpponent(ws, {
                            type: 'opponent_lost'
                        }, true);
                        // Optional: Could clean up the room if both players lost or one disconnected earlier
                        break;
                    }

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
        console.log(`Client disconnected. Room: ${ws.roomId}, Player: ${ws.playerNumber}. Rooms left: ${gameRooms.size}`);
        cleanupClient(ws);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for Player ${ws.playerNumber} in Room ${ws.roomId}:`, error);
        // Attempt cleanup on error as well
        cleanupClient(ws);
    });
});

// --- Utility Functions ---
function createRoom(player1, player2, roomType = 'public') {
    const roomId = `room-${roomIdCounter++}`;
    console.log(`Creating ${roomType} room ${roomId} for Player ${player1.playerNumber || '(connecting)'} and Player ${player2.playerNumber || '(connecting)'}`);
    player1.roomId = roomId;
    player1.playerNumber = 1;
    player2.roomId = roomId;
    player2.playerNumber = 2;

    const room = { id: roomId, player1: player1, player2: player2 };
    gameRooms.set(roomId, room);

    // Notify both players they are matched
    sendMessage(player1, { type: 'match_found', payload: { opponentFound: true, playerNumber: 1, roomId: roomId } });
    sendMessage(player2, { type: 'match_found', payload: { opponentFound: true, playerNumber: 2, roomId: roomId } });
    console.log(`Room ${roomId}: Sent match_found to both players.`);

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

// Start the HTTP server (which also handles WebSocket upgrades)
server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT}, serving static files and handling WebSocket connections.`);
});
