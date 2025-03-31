// ui.js - Handles user interface interactions and screens

export class GameUI {
  constructor(elements) {
    // Store UI elements
    this.startScreenElement = elements.startScreenElement;
    this.gameAreaElement = elements.gameAreaElement;
    this.statusElement = elements.statusElement;
    this.scoreElement = elements.scoreElement;
    this.linesElement = elements.linesElement;
    this.playPublicButton = elements.playPublicButton;
    this.createPrivateButton = elements.createPrivateButton;
    this.joinPrivateButton = elements.joinPrivateButton;
    this.roomCodeInput = elements.roomCodeInput;
    this.privateRoomInfo = elements.privateRoomInfo;
  }

  // Update the status message
  updateStatus(text) {
    this.statusElement.textContent = text;
  }

  // Update score display
  updateScore(score) {
    this.scoreElement.textContent = `Score: ${score}`;
  }

  // Update lines cleared display
  updateLines(lines) {
    this.linesElement.textContent = `Lines: ${lines}`;
  }

  // Show the start/lobby screen
  showStartScreen() {
    this.startScreenElement.style.display = "flex"; // Use flex as set in CSS
    this.gameAreaElement.style.display = "none";
    this.privateRoomInfo.style.display = "none"; // Hide room code info
    this.roomCodeInput.value = ""; // Clear input
    this.enableStartScreen(); // Ensure buttons are enabled
  }

  // Hide the start/lobby screen
  hideStartScreen() {
    this.startScreenElement.style.display = "none";
  }

  // Show the main game area
  showGameArea() {
    this.hideStartScreen(); // Ensure start screen is hidden
    this.gameAreaElement.style.display = "flex";
  }

  // Disable buttons during connection/matchmaking
  disableStartScreen() {
    this.playPublicButton.disabled = true;
    this.createPrivateButton.disabled = true;
    this.joinPrivateButton.disabled = true;
    this.roomCodeInput.disabled = true;
  }

  // Enable buttons
  enableStartScreen() {
    this.playPublicButton.disabled = false;
    this.createPrivateButton.disabled = false;
    this.joinPrivateButton.disabled = false;
    this.roomCodeInput.disabled = false;
  }

  // Display the room code for private games
  displayRoomCode(code) {
    this.privateRoomInfo.textContent = `Room Code: ${code}`;
    this.privateRoomInfo.style.display = "block";
  }

  // Setup event listeners for the start screen buttons
  setupEventListeners(handlers) {
    this.playPublicButton.addEventListener("click", handlers.playPublic);
    this.createPrivateButton.addEventListener("click", handlers.createPrivate);
    this.joinPrivateButton.addEventListener("click", handlers.joinPrivate);
  }

  // Get the room code from the input field
  getRoomCode() {
    return this.roomCodeInput.value.trim().toUpperCase();
  }
}

export class InputHandler {
  constructor(keyMap) {
    this.keyMap = keyMap;
    this.moveInterval = null;
    this.repeatDelay = 150; // ms delay before repeat starts
    this.repeatRate = 50; // ms between repeats
    this.moveKeyDown = null;
    this.repeatTimeout = null;
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.addEventListener("keydown", (event) => this.handleKeyDown(event));
    document.addEventListener("keyup", (event) => this.handleKeyUp(event));
  }

  handleKeyDown(event) {
    // This method will be completed by the game manager that has game state info
    if (this.onKeyDown) {
      this.onKeyDown(event);
    }
  }

  handleKeyUp(event) {
    // This method will be completed by the game manager that has game state info
    if (this.onKeyUp) {
      this.onKeyUp(event);
    }
  }

  stopMovement() {
    clearInterval(this.moveInterval);
    clearTimeout(this.repeatTimeout);
    this.moveInterval = null;
    this.repeatTimeout = null;
    this.moveKeyDown = null;
  }

  startMovement(key) {
    if (this.moveKeyDown === key) return; // Already moving this way
    this.stopMovement(); // Stop any previous movement
    this.moveKeyDown = key;

    // Initial move
    if (this.keyMap[key]) this.keyMap[key]();

    // Start repeat timer
    this.repeatTimeout = setTimeout(() => {
      if (this.keyMap[key]) {
        this.moveInterval = setInterval(() => {
          this.keyMap[key]();
        }, this.repeatRate);
      }
    }, this.repeatDelay);
  }
}
