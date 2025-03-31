const WebSocket = require('ws');
const gameManager = require('./gameManager');
const { sendMessage, broadcastToOpponent, logAndIgnore, GARBAGE_MAP } = require('./utils');

function handleConnection(wss) {
    wss.on('connection', (ws) => {
        console.log(`Client connected. Total clients: ${wss.clients.size} (Approx. active players: ${gameManager.getTotalPlayers()})`);
        ws.roomId = null; // Assign null initially
        ws.playerNumber = null; // Assign null initially
        ws.lost = false;
        ws.boardState = null; // Initialize board state tracking

        // Send initial status or welcome message
        sendMessage(ws, { type: 'status', payload: { message: 'Connected. Choose match type.' } });

        // --- Message Handling ---
        ws.on('message', (message) => {
            let data;
            try {
                data = JSON.parse(message);
            } catch (error) {
                console.error('Failed to parse message:', message, error);
                sendMessage(ws, { type: 'error', payload: { message: 'Invalid message format.' } });
                return;
            }

            // Improved logging
            if (data.type !== 'update_state') { // Don't log frequent state updates
                console.log(`Received (Player ${ws.playerNumber}, Room ${ws.roomId}):`, data);
            }

            // --- Handle Different Message Types ---
            try {
                 // Matchmaking messages (handled by gameManager)
                 if (data.type === 'find_public_match') {
                    gameManager.handleFindPublicMatch(ws);
                    return;
                } else if (data.type === 'create_private_match') {
                    gameManager.handleCreatePrivateMatch(ws);
                    return;
                } else if (data.type === 'join_private_match') {
                    gameManager.handleJoinPrivateMatch(ws, data.payload);
                    return;
                }

                // --- In-Game Messages (Require a valid room) ---
                const currentRoom = gameManager.getRoom(ws.roomId);
                if (!currentRoom) {
                    logAndIgnore(ws, data.type, false);
                    return; // Ignore messages if not in a valid room
                }

                const opponent = gameManager.getOpponent(ws);

                switch (data.type) {
                    case 'piece_locked':
                        // **Server Authority**: Validate if necessary
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} locked piece.`);
                        if (opponent) {
                             broadcastToOpponent(ws, {
                                type: 'opponent_piece_locked',
                                payload: data.payload // Send piece type, rotation, final position etc.
                            }, true, gameManager.getGameRooms()); // Pass gameRooms map
                        }
                        break;

                    case 'line_clear':
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} cleared lines.`, data.payload);
                        const linesCleared = data.payload.lines || 0;
                        const garbageToSend = GARBAGE_MAP[linesCleared] || 0;

                        // TODO: Implement Combo logic & Garbage canceling

                        if (garbageToSend > 0 && opponent) {
                             console.log(`Room ${ws.roomId}: Sending ${garbageToSend} garbage lines to Player ${opponent.playerNumber}`);
                             sendMessage(opponent, {
                                type: 'receive_garbage',
                                payload: { lines: garbageToSend }
                            });
                        }
                        break;

                    case 'update_state':
                        // Store board state in the client's object for reference
                        ws.boardState = data.payload.board;
                        // Relay minimal state to the opponent (only the board)
                        if (opponent) {
                             broadcastToOpponent(ws, {
                                type: 'opponent_state',
                                payload: { board: ws.boardState }
                            }, false, gameManager.getGameRooms()); // Don't log opponent state broadcasts
                        }
                        break;

                    // DEPRECATED? Clients shouldn't directly send garbage this way
                    // case 'send_garbage':
                    //     if (typeof data.payload.lines === 'number' && data.payload.lines > 0 && opponent) {
                    //         broadcastToOpponent(ws, {
                    //             type: 'receive_garbage',
                    //             payload: { lines: data.payload.lines }
                    //         }, true, gameManager.getGameRooms());
                    //     } else {
                    //         console.warn("Invalid or unnecessary send_garbage data received:", data.payload);
                    //     }
                    //     break;

                    case 'player_lost': // Client signals they have lost
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} reported loss.`);
                        ws.lost = true;
                        if (opponent) {
                            sendMessage(opponent, { type: 'opponent_lost' });
                            // Check if opponent also lost (e.g., simultaneous loss - unlikely but possible)
                            if (opponent.lost) {
                                console.log(`Room ${ws.roomId}: Both players lost (draw).`);
                                // Handle draw condition if necessary
                            } else {
                                console.log(`Room ${ws.roomId}: Player ${opponent.playerNumber} wins!`);
                                // Declare opponent the winner
                                sendMessage(opponent, { type: 'game_over', payload: { result: 'win' } });
                                sendMessage(ws, { type: 'game_over', payload: { result: 'loss' } });
                            }
                            // Consider cleaning up the room or marking it as finished
                            // gameManager.handleGameEnd(ws.roomId);
                        } else {
                            // Opponent already disconnected, handle as win for this player? Or just end.
                            console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} lost, but opponent disconnected.`);
                            sendMessage(ws, { type: 'game_over', payload: { result: 'opponent_left' } });
                            // Clean up room via disconnect handler eventually
                        }
                        break;

                     case 'rematch_request':
                        console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} requests rematch.`);
                        if (opponent) {
                            // Notify opponent of the request
                            sendMessage(opponent, { type: 'opponent_rematch_request' });
                            // Need state on room/players to track if both requested
                        } else {
                             sendMessage(ws, { type: 'error', payload: { message: 'Cannot request rematch, opponent disconnected.' } });
                        }
                        break;

                    case 'rematch_accept':
                         console.log(`Room ${ws.roomId}: Player ${ws.playerNumber} accepts rematch.`);
                         if (opponent) {
                            // Notify opponent of acceptance
                            sendMessage(opponent, { type: 'opponent_rematch_accept' });
                            // TODO: Reset game state for both players and restart
                            // Need robust state management here
                         } else {
                            sendMessage(ws, { type: 'error', payload: { message: 'Cannot accept rematch, opponent disconnected.' } });
                         }
                         break;

                    default:
                        logAndIgnore(ws, data.type, true);
                        break;
                }
            } catch (error) {
                console.error(`Error handling message type ${data?.type} for Player ${ws.playerNumber}, Room ${ws.roomId}:`, error);
                sendMessage(ws, { type: 'error', payload: { message: 'Internal server error handling message.' } });
            }
        });

        // --- Disconnection Handling ---
        ws.on('close', () => {
            gameManager.handleDisconnect(ws);
            console.log(`Client connection closed. Total clients: ${wss.clients.size}`);
        });

        ws.on('error', (error) => {
            console.error(`WebSocket error for client (Player ${ws.playerNumber}, Room ${ws.roomId}):`, error);
            // Attempt graceful cleanup, although close event should also trigger
            gameManager.handleDisconnect(ws); 
        });
    });

    console.log('WebSocket connection handler initialized.');
}

module.exports = { handleConnection };
