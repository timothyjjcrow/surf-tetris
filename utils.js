const WebSocket = require('ws');

// Simple Garbage Calculation Rules
const GARBAGE_MAP = {
    1: 0, // Single
    2: 1, // Double
    3: 2, // Triple
    4: 4  // Tetris
    // TODO: Add T-Spins, Combos
};

/**
 * Sends a JSON message to a specific WebSocket client.
 * @param {WebSocket} ws The WebSocket client.
 * @param {object} message The message object to send.
 */
function sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.log("Attempted to send message to closed socket.");
    }
}

/**
 * Broadcasts a message to the opponent of the sender in the same room.
 * @param {WebSocket} senderWs The WebSocket of the sender.
 * @param {object} message The message object to send.
 * @param {boolean} [log=true] Whether to log the broadcast.
 * @param {Map<string, object>} gameRooms The map of active game rooms.
 */
function broadcastToOpponent(senderWs, message, log = true, gameRooms) {
    const currentRoom = gameRooms.get(senderWs.roomId);
    if (!currentRoom) {
        console.log(`broadcastToOpponent: Sender ${senderWs.playerNumber} not in a valid room (${senderWs.roomId}).`);
        return;
    }
    const opponent = (senderWs === currentRoom.player1) ? currentRoom.player2 : currentRoom.player1;

    if (opponent && opponent.readyState === WebSocket.OPEN) {
        if (log) {
            console.log(`Room ${senderWs.roomId}: Broadcasting to Player ${opponent.playerNumber}:`, message.type);
        }
        sendMessage(opponent, message);
    } else if (opponent) {
        if (log) { console.log(`Room ${senderWs.roomId}: Opponent ${opponent.playerNumber} not available for broadcast.`); }
    } else {
        // Should not happen in a valid room setup
        if (log) { console.log(`Room ${senderWs.roomId}: No opponent found for Player ${senderWs.playerNumber}.`); }
    }
}

/**
 * Generates a simple random 4-character room code.
 * @returns {string} The generated room code.
 */
function generateRoomCode() {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

/**
 * Logs ignored messages from clients not in a room or sending unexpected messages.
 * @param {WebSocket} ws The WebSocket client.
 * @param {string} messageType The type of message being ignored.
 * @param {boolean} [isDefault=false] If the message was caught by the default switch case.
 */
function logAndIgnore(ws, messageType, isDefault = false) {
    const reason = isDefault ? "Unknown message type" : "Client not in a valid room or message out of context";
    console.log(`Ignoring message type '${messageType}' from client (Player ${ws.playerNumber}, Room ${ws.roomId}). Reason: ${reason}.`);
    // Optionally send an error back to the client if it's unexpected behavior
    // sendMessage(ws, { type: 'error', payload: { message: `Cannot process '${messageType}' right now.` } });
}

module.exports = {
    GARBAGE_MAP,
    sendMessage,
    broadcastToOpponent,
    generateRoomCode,
    logAndIgnore
};
