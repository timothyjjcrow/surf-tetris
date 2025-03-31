// networking.js - Handles WebSocket communication

export class NetworkManager {
  constructor(callbacks) {
    this.ws = null;
    this.callbacks = callbacks || {};
  }

  // Connect to WebSocket server
  connectWebSocket() {
    // Determine WebSocket protocol based on page protocol
    let wsUrl;
    if (window.location.protocol === "https:") {
      // Use wss:// and the same hostname, no port needed for standard HTTPS/WSS port 443
      wsUrl = `wss://${window.location.host}`;
    } else {
      // Use ws:// and add the port for local development (e.g., localhost:8080)
      wsUrl = `ws://${window.location.hostname}:8080`;
    }

    console.log(`Attempting to connect WebSocket to: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log("WebSocket connection established");
      if (this.callbacks.onOpen) this.callbacks.onOpen();
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("Message from server:", message); // Log raw message
        if (this.callbacks.onMessage) this.callbacks.onMessage(message);
      } catch (e) {
        console.error("Failed to parse message or handle server message:", e);
        console.error("Received data:", event.data); // Log raw data on error
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket Error:", error);
      if (this.callbacks.onError) this.callbacks.onError(error);
    };

    this.ws.onclose = () => {
      console.log("WebSocket connection closed");
      if (this.callbacks.onClose) this.callbacks.onClose();
      this.ws = null; // Clear the WebSocket object
    };
  }

  // Send a message to the server
  sendMessageToServer(type, payload = {}) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, payload });
      console.log("Sending message:", message);
      this.ws.send(message);
    } else {
      console.warn("WebSocket not open. Cannot send message.");
    }
  }

  // Helper methods for common message types
  findPublicMatch() {
    this.sendMessageToServer("find_public_match");
  }

  createPrivateMatch() {
    this.sendMessageToServer("create_private_match");
  }

  joinPrivateMatch(roomCode) {
    this.sendMessageToServer("join_private_match", { roomCode });
  }

  reportLineClear(lineCount) {
    this.sendMessageToServer("line_clear", { lines: lineCount });
  }

  reportGameOver(score, linesCleared) {
    this.sendMessageToServer("game_over", { score, linesCleared });
  }

  reportPieceLocked(board) {
    this.sendMessageToServer("piece_locked", { board });
  }

  // Check if WebSocket is connected
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  // Close the connection
  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}
