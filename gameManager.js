const WebSocket = require('ws');
const { sendMessage, generateRoomCode } = require('./utils');

// --- Game State ---
let gameRooms = new Map(); // roomId -> { id: string, player1: ws, player2: ws, roomType: 'public'|'private', /* other room state */ }
let waitingPlayer = null;   // Holds the WebSocket of the player waiting for a public match
let privateRooms = new Map(); // roomCode -> { creatorWs: ws, roomId: string | null }
let roomIdCounter = 1;

// --- Room Management ---

/**
 * Creates a new game room, assigns players, and notifies them.
 * @param {WebSocket} player1
 * @param {WebSocket} player2
 * @param {'public'|'private'} roomType
 * @returns {string} The ID of the created room.
 */
function createRoom(player1, player2, roomType = 'public') {
    const roomId = `room_${roomIdCounter++}`;
    console.log(`Creating ${roomType} room ${roomId}...`);

    player1.roomId = roomId;
    player2.roomId = roomId;
    player1.playerNumber = 1;
    player2.playerNumber = 2;
    player1.lost = false;
    player2.lost = false;
    // Clear any pending matchmaking status
    if (waitingPlayer === player1) waitingPlayer = null;

    const room = { id: roomId, player1, player2, roomType };
    gameRooms.set(roomId, room);

    console.log(`Room ${roomId}: Player 1 connected.`);
    console.log(`Room ${roomId}: Player 2 connected.`);

    // Notify both players that the match has started
    const startMessage = { type: 'match_found', payload: { roomId: roomId } };
    sendMessage(player1, { ...startMessage, payload: { ...startMessage.payload, playerNumber: 1 } });
    sendMessage(player2, { ...startMessage, payload: { ...startMessage.payload, playerNumber: 2 } });

    return roomId;
}

/**
 * Handles cleanup when a client disconnects.
 * @param {WebSocket} ws The disconnecting client.
 */
function handleDisconnect(ws) {
    console.log(`Client disconnected. Room: ${ws.roomId}, Player: ${ws.playerNumber}.`);

    // Remove from waiting list if they were waiting
    if (waitingPlayer === ws) {
        console.log("Waiting player disconnected.");
        waitingPlayer = null;
        return; // No room cleanup needed
    }

    // Remove from any private room they created but wasn't joined
    let codeToDelete = null;
    for (const [code, roomInfo] of privateRooms.entries()) {
        if (roomInfo.creatorWs === ws && roomInfo.roomId === null) {
            console.log(`Creator of private room ${code} disconnected before join.`);
            codeToDelete = code;
            break;
        }
    }
    if (codeToDelete) {
        privateRooms.delete(codeToDelete);
    }

    // Handle disconnection from an active game room
    const roomId = ws.roomId;
    const currentRoom = gameRooms.get(roomId);

    if (currentRoom) {
        console.log(`Cleaning up room ${roomId} due to player ${ws.playerNumber} disconnect.`);
        const opponent = (ws === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;

        // Notify the opponent, if they are still connected
        if (opponent && opponent.readyState === WebSocket.OPEN) {
            console.log(`Notifying opponent (Player ${opponent.playerNumber}) in room ${roomId} about disconnect.`);
            sendMessage(opponent, { type: 'opponent_disconnected', payload: { message: 'Your opponent has disconnected.' } });
            // Optionally reset opponent's state, move them out of the room context on the server
             opponent.roomId = null;
             opponent.playerNumber = null;
             opponent.lost = false; // Reset status
             sendMessage(opponent, { type: 'status', payload: { message: 'Opponent left. Choose a new match type.' }});

        }

        // Close the opponent's connection if you want to force them out
        // if (opponent && opponent.readyState === WebSocket.OPEN) {
        //     opponent.close();
        // }

        // Remove the room
        gameRooms.delete(roomId);
        console.log(`Room ${roomId} removed. Active rooms: ${gameRooms.size}`);
    } else {
        console.log(`Disconnected client was not in an active game room.`);
    }
}


// --- Matchmaking Logic ---

function handleFindPublicMatch(ws) {
    if (ws.roomId) {
        sendMessage(ws, { type: 'error', payload: { message: 'Already in a room.' } });
        return;
    }
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
}

function handleCreatePrivateMatch(ws) {
    if (ws.roomId) {
        sendMessage(ws, { type: 'error', payload: { message: 'Already in a room.' } });
        return;
    }
    const newRoomCode = generateRoomCode();
    // Clean up any old private room request from the same user
     for (const [code, roomInfo] of privateRooms.entries()) {
        if (roomInfo.creatorWs === ws && roomInfo.roomId === null) {
            privateRooms.delete(code);
            console.log(`Removed previous pending private room ${code} for player.`);
            break;
        }
    }
    privateRooms.set(newRoomCode, { creatorWs: ws, roomId: null });
    console.log(`Created private room with code ${newRoomCode} for player`);
    sendMessage(ws, { type: 'private_match_created', payload: { roomCode: newRoomCode } });
}

function handleJoinPrivateMatch(ws, payload) {
    if (ws.roomId) {
        sendMessage(ws, { type: 'error', payload: { message: 'Already in a room.' } });
        return;
    }
    const roomCodeToJoin = payload.roomCode;
    if (privateRooms.has(roomCodeToJoin)) {
        const privateRoom = privateRooms.get(roomCodeToJoin);
        if (privateRoom.creatorWs === ws) {
             sendMessage(ws, { type: 'error', payload: { message: 'Cannot join your own room' } });
             return;
        }
        if (privateRoom.roomId === null) { // Room is waiting
            const player1 = privateRoom.creatorWs;
            const player2 = ws;
            console.log(`Player joining private room ${roomCodeToJoin}...`);
            const newRoomId = createRoom(player1, player2, 'private');
            // Update the private room entry before deleting (though not strictly necessary)
            privateRoom.roomId = newRoomId;
            privateRooms.delete(roomCodeToJoin); // Room started, remove from private list
            console.log(`Private room ${roomCodeToJoin} started as game room ${newRoomId}`);
        } else {
            // Should not happen if cleanup is correct, but handle defensively
            sendMessage(ws, { type: 'error', payload: { message: 'Private room already started or invalid' } });
        }
    } else {
        sendMessage(ws, { type: 'error', payload: { message: 'Invalid room code' } });
    }
}

// --- Getters ---

function getRoom(roomId) {
    return gameRooms.get(roomId);
}

function getOpponent(ws) {
    const room = getRoom(ws.roomId);
    if (!room) return null;
    return (ws === room.player1) ? room.player2 : room.player1;
}

function getGameRooms() { // Primarily for debugging or admin purposes
    return gameRooms;
}

function getTotalPlayers() { // Primarily for debugging or admin purposes
    let count = waitingPlayer ? 1 : 0;
    gameRooms.forEach(room => {
        if (room.player1) count++;
        if (room.player2) count++;
    });
    return count;
}

module.exports = {
    handleDisconnect,
    handleFindPublicMatch,
    handleCreatePrivateMatch,
    handleJoinPrivateMatch,
    getRoom,
    getOpponent,
    getGameRooms, // Expose map for broadcast
    getTotalPlayers // For logging total connections if needed
};
