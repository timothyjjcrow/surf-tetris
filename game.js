// --- Import Renderer and Constants ---
import { GameRenderer } from './renderer.js';
import {
  COLS,
  ROWS,
  BLOCK_SIZE,
  HIDDEN_ROWS,
  TOTAL_ROWS,
  NEXT_QUEUE_SIZE,
  PREVIEW_BOX_SIZE,
  OPPONENT_COLS,
  OPPONENT_ROWS,
  OPPONENT_HIDDEN_ROWS,
  OPPONENT_TOTAL_ROWS,
  OPPONENT_BLOCK_SIZE,
  LOCK_DELAY,
  INITIAL_DROP_INTERVAL,
  COLORS,
  SHAPES,
  SRS_KICKS,
  SPEEDUP_NOTIFICATION_DURATION,
  SPEEDUP_LINES_THRESHOLD,
  SPEEDUP_DURATION,
  SPEEDUP_FACTOR,
  SCRAMBLE_INTENSITY,
  SCRAMBLE_NOTIFICATION_DURATION
} from './constants.js';
import { MobileControlsHandler } from './mobileControls.js';

// --- DOM Elements ---
const gameCanvas = document.getElementById("gameCanvas");
const holdCanvas = document.getElementById("holdCanvas");
const nextCanvas = document.getElementById("nextCanvas");
const opponentCanvas = document.getElementById("opponentCanvas"); // Get the existing canvas instead of creating a new one
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");

// Speed-up notification element
const notificationContainer = document.createElement("div");
notificationContainer.id = "notificationContainer";
notificationContainer.style.cssText = `
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  pointer-events: none;
`;
document.body.appendChild(notificationContainer);

// Add CSS for notification animations
const notificationStyle = document.createElement("style");
notificationStyle.textContent = `
  @keyframes fadeInOut {
    0% { opacity: 0; transform: translateY(-20px); }
    10% { opacity: 1; transform: translateY(0); }
    90% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-20px); }
  }
  .game-notification {
    padding: 10px 20px;
    margin: 10px auto;
    border-radius: 5px;
    color: white;
    font-weight: bold;
    text-align: center;
    animation: fadeInOut 3s forwards;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    pointer-events: none;
  }
  .speedup-sent {
    background-color: #4CAF50; /* Green for sending attack */
  }
  .speedup-received {
    background-color: #F44336; /* Red for receiving attack */
  }
  .scramble-sent {
    background-color: #2196F3; /* Blue for sending scramble */
  }
  .scramble-received {
    background-color: #FF9800; /* Orange for receiving scramble */
  }
  .error-notification {
    background-color: #FF0000; /* Red for error */
  }
  /* Shake effect animation for scramble attack */
  @keyframes shake {
    0% { transform: translate(0, 0); }
    10% { transform: translate(-5px, -5px); }
    20% { transform: translate(5px, -5px); }
    30% { transform: translate(-5px, 5px); }
    40% { transform: translate(5px, 5px); }
    50% { transform: translate(-5px, -5px); }
    60% { transform: translate(5px, -5px); }
    70% { transform: translate(-5px, 5px); }
    80% { transform: translate(5px, 5px); }
    90% { transform: translate(-5px, 0); }
    100% { transform: translate(0, 0); }
  }
  .shake-effect {
    animation: shake 0.8s cubic-bezier(.36,.07,.19,.97) both;
    animation-iteration-count: 3;
    transform-origin: center;
    backface-visibility: hidden;
    perspective: 1000px;
  }
  /* Speed lines effect for speed-up attack */
  @keyframes speedLines {
    0% { 
      background-position: 0 0;
      opacity: 0.2;
    }
    50% {
      opacity: 0.5;
    }
    100% { 
      background-position: 100px 0;
      opacity: 0.2;
    }
  }
  .speed-lines-effect {
    position: relative;
  }
  .speed-lines-effect::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: linear-gradient(90deg, transparent 0%, transparent 40%, rgba(255, 0, 0, 0.8) 40%, transparent 41%,
                                      transparent 60%, rgba(255, 0, 0, 0.8) 60%, transparent 61%,
                                      transparent 80%, rgba(255, 0, 0, 0.8) 80%, transparent 81%);
    background-size: 100px 100%;
    animation: speedLines 0.5s linear infinite;
    z-index: 2;
    pointer-events: none;
  }
  /* Style for speed boost indicator */
  .speed-boost {
    color: #F44336;
    font-weight: bold;
    animation: pulse 0.5s infinite alternate;
  }
  @keyframes pulse {
    from { opacity: 0.7; }
    to { opacity: 1; }
  }
`;
document.head.appendChild(notificationStyle);

// Initialize canvas dimensions
document.addEventListener('DOMContentLoaded', () => {
  // Main game board
  gameCanvas.width = COLS * BLOCK_SIZE;
  gameCanvas.height = ROWS * BLOCK_SIZE;
  
  // Hold display
  holdCanvas.width = PREVIEW_BOX_SIZE * (BLOCK_SIZE / 1.5);
  holdCanvas.height = PREVIEW_BOX_SIZE * (BLOCK_SIZE / 1.5);
  
  // Next queue display
  nextCanvas.width = PREVIEW_BOX_SIZE * (BLOCK_SIZE / 1.5);
  nextCanvas.height = NEXT_QUEUE_SIZE * PREVIEW_BOX_SIZE * (BLOCK_SIZE / 2);
  
  // Opponent display
  opponentCanvas.width = OPPONENT_COLS * OPPONENT_BLOCK_SIZE;
  opponentCanvas.height = OPPONENT_ROWS * OPPONENT_BLOCK_SIZE;
  
  // Initialize renderer
  renderer = new GameRenderer(gameCanvas, holdCanvas, nextCanvas, opponentCanvas);
  
  // Set up game actions for mobile controls
  const gameActions = {
    moveLeft: () => movePiece(-1, 0),
    moveRight: () => movePiece(1, 0),
    softDrop: softDrop,
    hardDrop: hardDrop,
    rotate: rotatePiece,
    hold: holdCurrentPiece,
    startMovement: startMovement,
    stopMovement: stopMovement
  };
  
  // Initialize mobile controls
  mobileControls = new MobileControlsHandler(gameActions);
  
  // Set up start screen
  showStartScreen();
});

// --- Initial rendering contexts ---
const gameCtx = gameCanvas.getContext("2d");
const holdCtx = holdCanvas.getContext("2d");
const nextCtx = nextCanvas.getContext("2d");
const opponentCtx = opponentCanvas.getContext("2d");

// Create renderer instance
let renderer = null;

// UI Elements
const statusElement = document.getElementById("status");
const startScreen = document.getElementById("startScreen");
const gameAreaElement = document.getElementById("gameArea");

// Start screen buttons
const playPublicButton = document.getElementById("playPublicButton");
const createPrivateButton = document.getElementById("createPrivateButton");
const joinPrivateButton = document.getElementById("joinPrivateButton");
const roomCodeInput = document.getElementById("roomCodeInput");
const privateRoomInfo = document.getElementById("privateRoomInfo");

// --- Game State ---
let board = [];
let opponentBoard = [];
let currentPiece = null;
let currentX = 0;
let currentY = 0;
let score = 0;
let linesCleared = 0;
let holdPiece = null;
let canHold = true;
let nextQueue = [];
let pieceBag = [];
let pendingGarbageLines = 0;
let incomingGarbageLines = 0;
let gameOver = false;
let gameWon = false;
let gameStarted = false;
let playerNumber = null;
let opponentLost = false;
let playerLost = false; 
let playerWon = false; 
let roomId = null; 
let level = 1; // Added missing level variable with initial value
let searchingForMatch = false; // Track if we're currently searching for a match

// Speed-up attack state
let isSpeedUpActive = false;
let speedUpTimer = null;
let baseDropInterval = INITIAL_DROP_INTERVAL;

// Scramble attack state
let isScrambleActive = false;
let scrambleTimer = null;
let originalBoardState = null;

// Animation and timing state
let lastTime = 0;
let accumulatedTime = 0; 
let dropInterval = INITIAL_DROP_INTERVAL;
let lockDelayTimer = null;
let animationFrameId = null;

// Mobile controls handler
let mobileControls = null;

// WebSocket connection
let ws = null;
const SERVER_URL = `ws://${window.location.hostname}:8080`; // Adjust if server is elsewhere

function connectWebSocket() {
  // Determine WebSocket protocol based on page protocol
  let wsUrl;
  if (window.location.protocol === "https:") {
    // Use wss:// and the same hostname, no port needed for standard HTTPS/WSS port 443
    wsUrl = `wss://${window.location.host}`;
  } else {
    // Use ws:// for http:// pages
    wsUrl = SERVER_URL;
  }
  
  console.log(`Connecting to WebSocket at ${wsUrl}`);
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connected!");
    // Try to get user info from localStorage
    const token = localStorage.getItem('tetris_token');
    const userId = localStorage.getItem('tetris_user_id');
    
    // Send authentication if we have the user data
    if (token) {
      console.log(`Authenticating with token, userId from localStorage: ${userId || 'not found'}`);
      sendMessageToServer('user_auth', { token });
    } else {
      console.log('No authentication data found in localStorage');
    }
    updateStatus("Connected to server. Choose match type.");
    // Reset game state variables needed for start screen logic
    gameStarted = false;
    playerLost = false;
    playerWon = false;
    opponentLost = false;
    // Make sure start screen is enabled on fresh connection
    enableStartScreen();
  };

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      console.log("Message from server:", message); // Log raw message
      handleServerMessage(message);
    } catch (e) {
      console.error("Failed to parse message or handle server message:", e);
      console.error("Received data:", event.data); // Log raw data on error
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket Error:", error);
    updateStatus("Connection error. Please refresh.");
    // Disable buttons or show error state on start screen
    disableStartScreen("Connection Error");
  };

  ws.onclose = () => {
    console.log("WebSocket connection closed");
    updateStatus("Disconnected. Please refresh.");
    // Disable buttons or show error state on start screen
    disableStartScreen("Disconnected");
    // Optionally attempt to reconnect? For now, just indicate disconnection.
    ws = null; // Clear the WebSocket object
  };
}

function sendMessageToServer(type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const message = JSON.stringify({ type, payload });
    console.log("Sending message:", message);
    ws.send(message);
  } else {
    console.warn("WebSocket not open. Cannot send message.");
  }
}

// --- Server Message Handler ---
function handleServerMessage(message) {
  switch (message.type) {
    case "match_found":
      gameWon = false; // Reset win state on new match
      if (message.payload.opponentFound) {
        hideStartScreen(); // Hide lobby screen
        console.log(
          `Match found! You are Player ${message.payload.playerNumber}. Room: ${message.payload.roomId}`
        );
        playerNumber = message.payload.playerNumber;
        roomId = message.payload.roomId;
        updateStatus(`Opponent found! Player ${playerNumber}. Starting...`);
        // Reset search state when match is found
        searchingForMatch = false;
        // TODO: Implement countdown?
        showGameArea(); // Show the main game UI
        initOpponentBoard(); // Initialize opponent display
        resetGame(); // Reset game state (which calls gameLoop)
      } else {
        console.log("Waiting for an opponent...");
        updateStatus("Searching for opponent...");
      }
      break;

    case "opponent_piece_locked":
      console.log("Opponent locked piece", message.payload);
      // Server sends { payload: { board: opponentBoardState } }
      updateOpponentBoard(message.payload?.board); // Access board directly
      drawOpponentBoard();
      break;

    case "receive_garbage":
      console.log("Received garbage instruction:", message.payload);
      incomingGarbageLines += message.payload.lines;
      console.log(`Incoming garbage updated: ${incomingGarbageLines}`);
      drawPendingGarbageIndicator(); // Update indicator visually
      break;

    case "opponent_lost":
      console.log("Opponent lost! You win!");
      gameWon = true; // Set the win flag
      updateStatus("YOU WIN!");
      
      // Forcefully insert return to menu button multiple ways for winner
      insertReturnToMenuButton();
      setTimeout(insertReturnToMenuButton, 500); // Try again after a short delay
      setTimeout(forceButtonCreation, 1000); // Try with another method as fallback
      
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      break;

    case "opponent_disconnected":
      console.log("Opponent disconnected! You win by default.");
      updateStatus("Opponent disconnected. You Win!");
      showReturnToMenuButton(); // Add return to menu button when opponent disconnects
      gameOver = true; // Stop local game
      gameStarted = false;
      if (ws) ws.close(); // Close connection cleanly
      break;

    case "opponent_state":
      if (message.payload.board) {
        opponentBoardState = message.payload.board;
      }
      break;

    case "private_match_created":
      // Display the room code in a more prominent way
      updateStatus(`Private room created! Share code: ${message.payload.roomCode}`);
      privateRoomInfo.innerHTML = `
        <div style="background-color: rgba(0,0,0,0.7); padding: 15px; border-radius: 10px; margin-bottom: 20px;">
          <h3 style="margin-top: 0; color: #4CAF50;">Room Code: ${message.payload.roomCode}</h3>
          <p>Share this code with a friend to play! Waiting for opponent...</p>
        </div>
      `;
      privateRoomInfo.style.display = "block";
      break;

    case "error":
      console.error("Server error:", message.payload.message);
      
      // Enhanced error handling with visual feedback
      if (message.payload.message.includes("Cannot play against yourself") || 
          message.payload.message.includes("Cannot join your own room")) {
        // Show a more prominent self-match error
        showNotification(`⚠️ ${message.payload.message}`, "error-notification", 5000);
        updateStatus(message.payload.message);
      } else if (message.payload.message.includes("must be logged in")) {
        // Auth error - redirect to login page
        showNotification("Login Required", "error-notification", 3000);
        updateStatus("You must be logged in to play. Redirecting to login...");
        
        // Delay redirect to allow user to read the message
        setTimeout(() => {
          window.location.href = "login.html";
        }, 2000);
      } else {
        // Default error handling
        updateStatus(`Error: ${message.payload.message}`);
      }
      
      if (!gameStarted) {
        // If error happens before game start, allow retry
        enableStartScreen();
      }
      break;

    case "game_over":
      // Handled by checkGameOver sending the message
      break;

    case "speed_up":
      if (message.payload.type === "sent") {
        // Show notification for sent speed-up
        showNotification("Speed-up sent!", "speedup-sent");
      } else if (message.payload.type === "received") {
        // Activate speed-up on receive
        activateSpeedUp(message.payload.duration);
        showNotification("Speed-up received!", "speedup-received");
      }
      break;

    case "scramble":
      if (message.payload.type === "sent") {
        // Show notification for sent scramble
        showNotification("Scramble sent!", "scramble-sent");
      } else if (message.payload.type === "received") {
        // Activate scramble on receive
        showNotification("Board scrambled!", "scramble-received");
        
        // Apply scramble to current player's board directly
        scrambleCurrentBoard(message.payload.intensity);
      }
      break;

    case "opponent_game_over":
      // Handler for when opponent loses
      console.log("Opponent lost the game!");
      opponentLost = true;
      playerWon = true;
      gameWon = true;
      
      // Show victory message with opponent's stats
      const opponentScore = message.payload.opponentScore || 0;
      const opponentLines = message.payload.opponentLines || 0;
      updateStatus(`You won! Opponent score: ${opponentScore}, lines: ${opponentLines}`);
      
      // Show a victory notification
      showNotification("You won the game!", "speedup-sent");
      
      // Show return to menu button for winner
      insertReturnToMenuButton();
      setTimeout(insertReturnToMenuButton, 500); // Retry after a short delay for reliability
      setTimeout(forceButtonCreation, 1000); // Use fallback method as well
      
      // Stop the game loop
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      break;

    case "game_lost":
      // Handler for when we're told we lost
      console.log("Game lost confirmed by server");
      playerLost = true;
      gameOver = true;
      
      // Show loss message with opponent stats if available
      const winnerScore = message.payload.opponentScore || 0;
      const winnerLines = message.payload.opponentLines || 0;
      updateStatus(`You lost! Opponent score: ${winnerScore}, lines: ${winnerLines}`);
      showReturnToMenuButton(); // Add return to menu button when player loses
      break;

    case "auth_confirmed":
      console.log("Authentication confirmed by server for user ID:", message.payload.userId);
      // Update localStorage with the userId from the server (in case it was missing)
      if (message.payload.userId) {
        localStorage.setItem('tetris_user_id', message.payload.userId);
        console.log(`Updated localStorage with user ID: ${message.payload.userId}`);
      }
      if (message.payload.username) {
        localStorage.setItem('tetris_username', message.payload.username);
      }
      break;

    case "auth_error":
      console.error("Authentication error:", message.payload.message);
      // If token is invalid, clear it and redirect to login
      if (message.payload.message && message.payload.message.includes("Invalid token")) {
        console.warn("Token appears to be invalid, clearing authentication data");
        localStorage.removeItem('tetris_token');
        localStorage.removeItem('tetris_user_id');
        // Only redirect if we're not already on the login page
        if (!window.location.href.includes('login.html')) {
          // Ask user if they want to log in again
          const confirmLogin = confirm("Your login session has expired. Would you like to log in again?");
          if (confirmLogin) {
            window.location.href = 'login.html';
          }
        }
      }
      break;

    case "status": // General status updates from server
      updateStatus(message.payload.message);
      
      // Check if this is a matchmaking status update
      if (message.payload.matchmaking === true) {
        showMatchmakingState(true);
      } else {
        // Keep start screen enabled unless matchmaking is actively in progress
        // (disableStartScreen is called explicitly when sending match requests)
        if (!gameStarted && startScreen.style.display !== "none") {
          // Don't re-enable if we're *already* disabled waiting for match_found
          const anyButtonDisabled =
            playPublicButton.disabled ||
            createPrivateButton.disabled ||
            joinPrivateButton.disabled;
          if (!anyButtonDisabled) {
            enableStartScreen();
          }
        }
      }
      break;

    default:
      console.log(`Unknown message type from server: ${message.type}`);
  }
}

// Handle matchmaking button state
function showMatchmakingState(isMatchmaking) {
  if (isMatchmaking) {
    // Disable all matchmaking buttons during matchmaking
    playPublicButton.disabled = true;
    createPrivateButton.disabled = true;
    joinPrivateButton.disabled = true;
    
    // Add visual indicators for matchmaking state
    playPublicButton.style.opacity = "0.5";
    createPrivateButton.style.opacity = "0.5";
    joinPrivateButton.style.opacity = "0.5";
    
    // Show a spinner or other visual indicator next to the play button
    if (!document.getElementById("matchmaking-spinner")) {
      const spinner = document.createElement("div");
      spinner.id = "matchmaking-spinner";
      spinner.innerHTML = "⟳"; // Simple spinner character
      spinner.style.display = "inline-block";
      spinner.style.marginLeft = "10px";
      spinner.style.animation = "spin 1s linear infinite";
      playPublicButton.parentNode.insertBefore(spinner, playPublicButton.nextSibling);
      
      // Add the spin animation
      const styleElement = document.createElement("style");
      styleElement.textContent = `
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(styleElement);
    }
  } else {
    // Re-enable buttons when matchmaking ends
    playPublicButton.disabled = false;
    createPrivateButton.disabled = false;
    joinPrivateButton.disabled = false;
    
    // Restore normal appearance
    playPublicButton.style.opacity = "1";
    createPrivateButton.style.opacity = "1";
    joinPrivateButton.style.opacity = "1";
    
    // Remove the spinner if it exists
    const spinner = document.getElementById("matchmaking-spinner");
    if (spinner) {
      spinner.remove();
    }
  }
}

// --- Initialization ---
function initGameState() {
  // Initialize game state variables
  board = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));
  opponentBoard = Array.from({ length: OPPONENT_TOTAL_ROWS }, () => Array(OPPONENT_COLS).fill(0));
  
  // Generate initial bag and next queue
  fillBag();
  
  // Reset game state
  holdPiece = null;
  canHold = true;
  score = 0;
  linesCleared = 0;
  pendingGarbageLines = 0;
  incomingGarbageLines = 0;
  
  // Reset status flags
  gameOver = false;
  gameWon = false;
  gameStarted = true;
  
  // Update UI
  updateScore(score);
  updateLines(linesCleared);
  
  // Spawn first piece
  spawnPiece();
}

function initOpponentBoard() {
  opponentBoard = Array.from({ length: OPPONENT_TOTAL_ROWS }, () =>
    Array(OPPONENT_COLS).fill(0)
  );
  drawOpponentBoard(); // Draw initial empty board
}

// --- Piece Generation (7-Bag Randomizer) ---
function generateBag() {
  const pieces = Object.keys(SHAPES);
  // Fisher-Yates Shuffle
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return pieces;
}

function fillBag() {
  if (pieceBag.length < 7) {
    // Keep at least 7 pieces available (current + hold + next queue)
    pieceBag.push(...generateBag());
  }
  while (nextQueue.length < NEXT_QUEUE_SIZE) {
    // Ensure next queue has enough pieces
    nextQueue.push(pieceBag.shift());
    if (pieceBag.length === 0) {
      pieceBag.push(...generateBag());
    }
  }
}

// --- Spawning ---
function spawnPiece() {
  if (gameOver || gameWon) return; // Don't spawn if game ended
  fillBag();
  const pieceType = nextQueue.shift();
  const shape = SHAPES[pieceType];
  const color = COLORS[pieceType];

  currentPiece = {
    type: pieceType,
    shape: shape,
    color: color,
    x: Math.floor(COLS / 2) - Math.ceil(shape[0].length / 2), // Center horizontally
    y:
      HIDDEN_ROWS -
      shape.length +
      shape.findIndex((row) => row.some((cell) => cell)), // Start above visible area
    rotation: 0, // Initial rotation state
  };

  // Initial position adjustments (rough centering)
  if (pieceType === "I") currentPiece.y += 1; // I is weird
  if (pieceType === "O") currentPiece.x -= 1; // O offset

  currentX = currentPiece.x;
  currentY = currentPiece.y;

  canHold = true; // Allow holding again after a piece locks

  // Game Over Check
  if (checkGameOver()) return; // Stop if game over

  fillBag(); // Refill bag/queue if needed
  drawNextQueue();
  drawHoldPiece();
}

// Helper to spawn a specific piece type (used for swapping from hold)
function spawnSpecificPiece(pieceType) {
  const shape = SHAPES[pieceType];
  const color = COLORS[pieceType];

  currentPiece = {
    type: pieceType,
    shape: shape,
    color: color,
    x: Math.floor(COLS / 2) - Math.ceil(shape[0].length / 2),
    y:
      HIDDEN_ROWS -
      shape.length +
      shape.findIndex((row) => row.some((cell) => cell)),
    rotation: 0,
  };
  if (pieceType === "I") currentPiece.y += 1;
  if (pieceType === "O") currentPiece.x -= 1;

  currentX = currentPiece.x;
  currentY = currentPiece.y;

  // Check for game over immediately on swap spawn
  if (checkCollision(currentX, currentY, currentPiece.shape)) {
    gameOver = true;
    console.log("Game Over (from Hold)!");
    alert(`Game Over!
Score: ${score}
Lines: ${linesCleared}`);
  }
}

// --- Collision Detection ---
function checkCollision(x, y, shape) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        // If this is a block of the piece
        const boardX = x + c;
        const boardY = y + r;

        // Check boundaries
        if (boardX < 0 || boardX >= COLS || boardY >= TOTAL_ROWS) {
          return true; // Collision with walls or floor
        }
        // Check against existing blocks on the board (ignore cells below 0)
        if (boardY >= 0 && board[boardY] && board[boardY][boardX]) {
          // Check if the y coordinate is valid before accessing board[boardY]
          return true; // Collision with another piece
        }
      }
    }
  }
  return false; // No collision
}

// --- Movement ---
function movePiece(dx, dy) {
  if (gameOver || gameWon || !gameStarted) return false;
  clearTimeout(lockDelayTimer); // Cancel lock delay on successful move
  lockDelayTimer = null;

  if (!checkCollision(currentX + dx, currentY + dy, currentPiece.shape)) {
    currentX += dx;
    currentY += dy;
    // Reset lock delay if moving downwards wasn't the cause of the check
    if (dy === 0) {
      resetLockDelayIfTouching(); // Reset lock delay after successful rotation
    }
    return true; // Move successful
  } else if (dy > 0) {
    // If moving down caused collision, start lock delay
    startLockDelay();
  }
  return false; // Move failed
}

function softDrop() {
  // Move the piece down with a moderate effect
  let moveCount = 0;
  
  // Move down until collision or a reasonable limit
  const maxMoves = 2; // Reduced from 3 to 2 for more moderate effect
  
  while (moveCount < maxMoves && movePiece(0, 1)) {
    moveCount++;
    // Add score for soft drop (optional)
    score += 1;
  }
  
  // Reset last time to prevent immediate auto-drop after soft drop
  lastTime = performance.now();
  
  // Update score display if we moved
  if (moveCount > 0) {
    updateScore(score);
  }
  
  return moveCount > 0;
}

function hardDrop() {
  if (gameOver || gameWon || !gameStarted) return;
  clearTimeout(lockDelayTimer);
  lockDelayTimer = null;
  let distance = 0;
  while (!checkCollision(currentX, currentY + 1, currentPiece.shape)) {
    currentY++;
    distance++;
  }
  // Add score for hard drop (optional)
  // score += distance * 2;
  // scoreElement.textContent = `Score: ${score}`;
  lockPiece();
}

// --- SRS Rotation Helper ---
function getRotatedShape(shape) {
  const N = shape.length;
  const newShape = Array.from({ length: N }, () => Array(N).fill(0));
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      // Clockwise rotation transformation
      newShape[c][N - 1 - r] = shape[r][c];
    }
  }
  return newShape;
}

// --- Rotation (SRS Implementation) ---
function rotatePiece() {
  if (
    !currentPiece ||
    currentPiece.type === "O" ||
    gameOver ||
    gameWon ||
    !gameStarted
  )
    return; // O piece doesn't rotate

  clearTimeout(lockDelayTimer); // Cancel lock delay attempt
  lockDelayTimer = null;

  const originalShape = currentPiece.shape;
  const rotatedShape = getRotatedShape(originalShape);
  const currentRotation = currentPiece.rotation;
  const nextRotation = (currentRotation + 1) % 4;
  const pieceType = currentPiece.type;

  const kickTable = pieceType === "I" ? SRS_KICKS.I : SRS_KICKS.JLSTZ;
  const rotationKey = `${currentRotation}->${nextRotation}`;
  const kicks = kickTable[rotationKey] || [[0, 0]]; // Default to [0,0] if key missing

  // Try each kick offset
  for (const [dx, dy] of kicks) {
    const newX = currentX + dx;
    // SRS dy is often inverted compared to typical screen coordinates
    const newY = currentY - dy; // !!! SUBTRACT dy for SRS kicks !!!

    if (!checkCollision(newX, newY, rotatedShape)) {
      // Valid rotation found!
      currentX = newX;
      currentY = newY;
      currentPiece.shape = rotatedShape;
      currentPiece.rotation = nextRotation;
      resetLockDelayIfTouching(); // Reset lock delay after successful rotation
      console.log(
        `Rotated ${pieceType} to state ${nextRotation} with kick [${dx}, ${dy}]`
      );
      return; // Exit after successful rotation
    }
  }

  console.log(
    `Rotation blocked for ${pieceType} from state ${currentRotation}`
  );
  // If loop finishes without returning, rotation failed
}

// --- Locking ---
function lockPiece() {
  if (gameOver || gameWon || !gameStarted) return;
  clearTimeout(lockDelayTimer);
  lockDelayTimer = null;

  const shape = currentPiece.shape;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const boardX = currentX + c;
        const boardY = currentY + r;
        // Only lock blocks within the board bounds (important for pieces locking partially off-screen)
        if (
          boardY >= 0 &&
          boardY < TOTAL_ROWS &&
          boardX >= 0 &&
          boardX < COLS
        ) {
          board[boardY][boardX] = currentPiece.type; // Store piece type or color index
        }
      }
    }
  }

  const clearedLineCount = clearLines();

  // Apply incoming garbage AFTER clearing lines and BEFORE spawning next piece
  if (incomingGarbageLines > 0) {
    console.log(`Applying ${incomingGarbageLines} incoming garbage lines.`);

    // Create a new board to hold the modified state
    const newBoard = Array.from({ length: TOTAL_ROWS }, () => 
      Array(COLS).fill(0)
    );
    
    // Generate a random hole position for the garbage lines
    const holePosition = Math.floor(Math.random() * COLS);
    
    // First, check if adding garbage would cause game over by pushing blocks into hidden rows
    let wouldCauseGameOver = false;
    for (let r = 0; r < incomingGarbageLines; r++) {
      // Check if there are any blocks in the rows that would be pushed into hidden rows
      if (board[r] && board[r].some(cell => cell !== 0)) {
        wouldCauseGameOver = true;
        break;
      }
    }
    
    if (wouldCauseGameOver) {
      console.log("Garbage would cause game over - applying but setting game over state");
      gameOver = true;
      updateStatus("Game Over!");
      if (ws && ws.readyState === WebSocket.OPEN && gameStarted) {
        sendMessageToServer("game_over", { score, linesCleared });
        console.log("Sent 'game_over' message to server.");
      }
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    }
    
    // Move all existing blocks up by incomingGarbageLines rows
    for (let r = 0; r < TOTAL_ROWS - incomingGarbageLines; r++) {
      // newBoard[r] gets content from board[r + incomingGarbageLines]
      if (r + incomingGarbageLines < TOTAL_ROWS) {
        newBoard[r] = [...board[r + incomingGarbageLines]];
      }
    }
    
    // Add garbage lines at the bottom of the visible board
    for (let r = TOTAL_ROWS - incomingGarbageLines; r < TOTAL_ROWS; r++) {
      const line = Array(COLS).fill("GARBAGE");
      // Create one hole in each garbage line at the same position
      line[holePosition] = 0;
      newBoard[r] = line;
    }
    
    // Replace the old board with the new one
    board = newBoard;
    
    // Reset the counter and update indicator
    incomingGarbageLines = 0;
    drawPendingGarbageIndicator();
    
    // Draw the updated board to show garbage
    drawBoard();
    
    // If garbage caused game over, return now
    if (wouldCauseGameOver) {
      return true; // Stop further actions if game over
    }
  }

  // --- Scoring and Leveling (based on lines cleared THIS lock) --- //
  if (clearedLineCount > 0) {
    const points = [0, 100, 300, 500, 800];
    score += points[clearedLineCount] * level;

    linesCleared += clearedLineCount;
    level = Math.floor(linesCleared / 10) + 1;
    baseDropInterval = Math.max(100, 1000 - (level - 1) * 50);
    if (!isSpeedUpActive) {
      dropInterval = baseDropInterval;
    }

    updateScore(score);
    updateLines(linesCleared);

    console.log(
      `Cleared ${clearedLineCount} lines! Score: ${score}, Lines: ${linesCleared}, Level: ${level}`
    );

    // Inform server about line clears
    sendMessageToServer("line_clear", { lines: clearedLineCount });
    
    // Check if we should trigger an attack
    if (clearedLineCount >= SPEEDUP_LINES_THRESHOLD) {
      console.log("Sending attack!");
      
      // Randomly choose between speed-up and scramble attacks
      const attackType = Math.random() < 0.5 ? 'speed_up' : 'scramble';
      
      if (attackType === 'speed_up') {
        sendMessageToServer("speed_up", { 
          duration: SPEEDUP_DURATION / 1000, // Convert to seconds for network transmission
          factor: SPEEDUP_FACTOR 
        });
        // Show notification that we sent a speed-up attack
        showNotification("Speed-up sent to opponent!", "speedup-sent");
      } else {
        sendMessageToServer("scramble", { 
          intensity: SCRAMBLE_INTENSITY
        });
        // Show notification that we sent a scramble attack
        showNotification("Scramble sent to opponent!", "scramble-sent");
      }
    }
  }

  // --- Spawn Next Piece --- //
  spawnPiece();
  drawBoard(); // Update board immediately after locking

  // Send locked piece info to server
  sendMessageToServer("piece_locked", {
    board: board, // Send the entire board state for now (simplest)
    // TODO: Send less data (piece type, rotation, x, y) later for efficiency
  });
  
  // Send updated score to server
  sendScoreUpdate();
}

function isTouchingGround() {
  return checkCollision(currentX, currentY + 1, currentPiece.shape);
}

// Update: Reset lock timer also if piece is on ground
function startLockDelay() {
  if (lockDelayTimer) return; // Don't restart if already running
  // Check immediately if it should lock (prevents delay if already grounded for a while)
  if (!isTouchingGround()) return; // Only start if touching

  lockDelayTimer = setTimeout(() => {
    if (isTouchingGround()) {
      // Double-check if still touching when timer expires
      lockPiece();
    }
    lockDelayTimer = null;
  }, LOCK_DELAY);
}

function resetLockDelayIfTouching() {
  clearTimeout(lockDelayTimer);
  lockDelayTimer = null;
  if (isTouchingGround()) {
    startLockDelay(); // Restart the timer only if touching
  }
}

// --- Line Clearing ---
function clearLines() {
  let linesToClear = [];
  for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
    if (board[r].every((cell) => cell !== 0)) {
      linesToClear.push(r);
    }
  }

  if (linesToClear.length > 0) {
    // Remove lines from bottom up
    for (const rowIndex of linesToClear) {
      board.splice(rowIndex, 1);
    }
    // Add new empty lines at the top
    for (let i = 0; i < linesToClear.length; i++) {
      board.unshift(Array(COLS).fill(0));
    }

    // Update score & lines cleared
    const points = getLinePoints(linesToClear.length);
    score += points;
    linesCleared += linesToClear.length;
    updateScoreDisplay();
    
    // Send updated score to server immediately after clearing lines
    sendScoreUpdate();
    
    return linesToClear.length;
  }
  return 0;
}

// --- Hold Piece ---
function holdCurrentPiece() {
  if (!canHold || gameOver || gameWon || !gameStarted) return;

  clearTimeout(lockDelayTimer); // Cancel lock delay
  lockDelayTimer = null;

  const pieceToHold = currentPiece.type;

  if (holdPiece) {
    // Swap current piece with hold piece
    const heldPieceType = holdPiece;
    holdPiece = pieceToHold;
    spawnSpecificPiece(heldPieceType);
  } else {
    // First time holding
    holdPiece = pieceToHold;
    spawnPiece(); // Spawn the next piece from the queue
  }

  canHold = false; // Can only hold once per piece lock
  drawHoldPiece();
}

// --- Drawing Pending Garbage Indicator ---
function drawPendingGarbageIndicator() {
  if (renderer) {
    renderer.drawPendingGarbageIndicator(incomingGarbageLines);
  }
}

// --- Ghost Piece Calculation ---
function getGhostPieceY() {
  let ghostY = currentY;
  while (!checkCollision(currentX, ghostY + 1, currentPiece.shape)) {
    ghostY++;
  }
  return ghostY;
}

// --- Drawing Functions ---
function drawBoard() {
  // Use the renderer to draw the board
  if (renderer) {
    renderer.drawBoard(board);
  }
}

function drawCurrentPiece() {
  // Use the renderer to draw the current piece
  if (renderer && currentPiece) {
    const ghostY = getGhostPieceY();
    renderer.drawCurrentPiece(currentPiece, currentX, currentY, ghostY);
  }
}

function drawHoldPiece() {
  // Use the renderer to draw the hold piece
  if (renderer) {
    renderer.drawHoldPiece(holdPiece);
  }
}

function drawNextQueue() {
  // Use the renderer to draw the next queue
  if (renderer) {
    renderer.drawNextQueue(nextQueue, NEXT_QUEUE_SIZE);
  }
}

function drawOpponentBoard() {
  // Use the renderer to draw the opponent board
  if (renderer) {
    renderer.drawOpponentBoard(opponentBoard);
  }
}

// --- Opponent Board Management ---
// Note: The duplicate initOpponentBoard function was removed here

function updateOpponentBoard(newBoardState) {
  // Directly replace the opponent's board state
  // Assumes server sends the complete board state
  if (
    Array.isArray(newBoardState) &&
    newBoardState.length === OPPONENT_TOTAL_ROWS
  ) {
    opponentBoard = newBoardState;
  } else {
    console.warn("Received invalid opponent board state", newBoardState);
  }
}

// --- UI Updates ---
function updateStatus(text) {
  // Simple status update
  statusElement.textContent = text;
}

function updateScore(score) {
  // Update score display
  scoreElement.textContent = `Score: ${score}`;
}

function updateLines(lines) {
  // Update lines cleared display
  linesElement.textContent = `Lines: ${lines}`;
}

function updateScoreDisplay() {
  // Update score display
  scoreElement.textContent = `Score: ${score}`;
}

// Show a notification message
function showNotification(message, type, duration = 3000) {
  const notification = document.createElement("div");
  notification.className = `game-notification ${type}`;
  notification.textContent = message;
  notificationContainer.appendChild(notification);
  
  // Remove notification after animation completes
  setTimeout(() => {
    notification.remove();
  }, duration);
}

// --- Game Loop ---
function gameLoop(timestamp = 0) {
  if (gameOver || gameWon || !gameStarted) {
    return; // Skip loop if game is not active
  }

  const deltaTime = timestamp - lastTime;

  if (deltaTime >= dropInterval) {
    // Time to drop the piece
    if (!movePiece(0, 1)) {
      // If can't move down, start lock delay or lock immediately
      if (isTouchingGround()) {
        if (!lockDelayTimer) {
          startLockDelay();
        }
      }
    }
    lastTime = timestamp;
  }

  // Draw everything
  if (renderer) {
    renderer.drawBoard(board);
    
    // Only draw current piece if game is active
    if (currentPiece && !gameOver && !gameWon) {
      const ghostY = getGhostPieceY();
      renderer.drawCurrentPiece(currentPiece, currentX, currentY, ghostY);
    }
    
    // Draw garbage indicator if needed
    if (incomingGarbageLines > 0) {
      renderer.drawPendingGarbageIndicator(incomingGarbageLines);
    }
    
    // If game is over or won, ensure return button is visible
    if (gameWon) {
      // Check if button exists, if not create it
      if (!document.getElementById('returnToMenuBtn') && !document.getElementById('winner-return-btn')) {
        console.log("Draw function detected game won but no return button - creating one");
        forceButtonCreation();
      }
    }
  }

  // Request next frame
  animationFrameId = requestAnimationFrame(gameLoop);
}

// --- Input Handling ---
const keyMap = {
  ArrowLeft: () => movePiece(-1, 0),
  ArrowRight: () => movePiece(1, 0),
  ArrowDown: softDrop,
  ArrowUp: rotatePiece, // Rotate
  " ": hardDrop, // Space bar
  c: holdCurrentPiece, // Change from KeyC to c
  C: holdCurrentPiece, // Also add uppercase C for caps lock
  KeyC: holdCurrentPiece, // Keep original for compatibility
};

// Game actions for mobile controls
const gameActions = {
  moveLeft: () => movePiece(-1, 0),
  moveRight: () => movePiece(1, 0),
  softDrop: softDrop,
  hardDrop: hardDrop,
  rotate: rotatePiece,
  hold: holdCurrentPiece,
  startMovement: startMovement,
  stopMovement: stopMovement
};

document.addEventListener("keydown", (event) => {
  // Ignore input if game not active
  if (gameOver || gameWon || !gameStarted) return;

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (!moveKeyDown) {
      // Only start movement if not already moving
      startMovement(event.key);
    }
  } else if (keyMap[event.code] || keyMap[event.key]) {
    event.preventDefault(); // Prevent default browser actions (like space scrolling)
    // Try both event.code (for KeyC) and event.key (for "c" or "C")
    const handler = keyMap[event.code] || keyMap[event.key];
    if (handler) handler();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (moveKeyDown === event.key) {
      stopMovement();
    }
  }
});
// Auto-repeat for left/right movement
let moveInterval = null;
let repeatDelay = 150; // ms delay before repeat starts
let repeatRate = 50; // ms between repeats
let moveKeyDown = null;
let repeatTimeout = null;

function stopMovement() {
  clearInterval(moveInterval);
  clearTimeout(repeatTimeout);
  moveInterval = null;
  repeatTimeout = null;
  moveKeyDown = null;
}

function startMovement(key) {
  if (moveKeyDown === key) return; // Already moving this way
  stopMovement(); // Stop any previous movement
  moveKeyDown = key;

  // Initial move
  if (keyMap[key]) keyMap[key]();

  // Start repeat timer
  repeatTimeout = setTimeout(() => {
    if (keyMap[key]) {
      moveInterval = setInterval(() => {
        keyMap[key]();
      }, repeatRate);
    }
  }, repeatDelay);
}

// --- Start Screen Flow ---
function showStartScreen() {
  startScreen.style.display = "flex"; // Use flex as set in CSS
  gameAreaElement.style.display = "none";
  privateRoomInfo.style.display = "none"; // Hide room code info
  roomCodeInput.value = ""; // Clear input
  enableStartScreen(); // Ensure buttons are enabled
}

function hideStartScreen() {
  startScreen.style.display = "none";
}

function showGameArea() {
  // Hide start screen and show game area
  hideStartScreen();
  gameAreaElement.style.display = "flex";
  
  // Show mobile controls when game area is visible
  if (mobileControls) {
    mobileControls.show();
  }
}

// Disable buttons/input during connection/matchmaking attempts
function disableStartScreen(reason = "") {
  if (reason) {
    updateStatus(reason);
  }
  
  // Don't hide the screen, just disable the buttons
  playPublicButton.disabled = true;
  createPrivateButton.disabled = true;
  joinPrivateButton.disabled = true;
  roomCodeInput.disabled = true;
}

function enableStartScreen() {
  startScreen.style.display = "block";
  
  // Re-enable all buttons
  playPublicButton.disabled = false;
  createPrivateButton.disabled = false;
  joinPrivateButton.disabled = false;
  roomCodeInput.disabled = false;
  
  // Reset button styling
  playPublicButton.style.opacity = "1";
  playPublicButton.style.cursor = "pointer";
  
  searchingForMatch = false; // Reset search state when enabling start screen
}

// Display the generated room code
function displayRoomCode(code) {
  privateRoomInfo.textContent = `Room Code: ${code}`;
  privateRoomInfo.style.display = "block";
}

// --- New Button Handlers ---
function handlePlayPublic() {
  // Prevent multiple requests if already searching
  if (searchingForMatch) {
    console.log("Already searching for a match");
    return;
  }
  
  // Immediately disable the button to prevent multiple clicks
  playPublicButton.disabled = true;
  playPublicButton.style.opacity = "0.5";
  playPublicButton.style.cursor = "not-allowed";
  
  searchingForMatch = true;
  updateStatus("Connecting to server...");
  disableStartScreen();
  
  // Connect to server and request public match
  connectWebSocket();
  
  // Wait for connection to establish before sending match request
  setTimeout(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      sendMessageToServer("find_public_match");
      updateStatus("Finding opponent...");
      showMatchmakingState(true);
    } else {
      updateStatus("Connection failed. Try again.");
      searchingForMatch = false; // Reset search state
      enableStartScreen();
    }
  }, 500);
}

function handleCreatePrivate() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    updateStatus("Connecting... Click Create Private again once connected.");
    return;
  }
  console.log("Requesting private match creation...");
  sendMessageToServer("create_private_match");
  updateStatus("Creating private match...");
  showMatchmakingState(true);
  disableStartScreen();
}

function handleJoinPrivate() {
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (roomCode.length !== 4) {
    // Basic validation
    updateStatus("Invalid room code (must be 4 characters).");
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket();
    updateStatus("Connecting... Click Join Private again once connected.");
    return;
  }

  console.log(`Attempting to join private match with code: ${roomCode}...`);
  sendMessageToServer("join_private_match", { roomCode });
  updateStatus(`Joining room ${roomCode}...`);
  showMatchmakingState(true);
  disableStartScreen();
}

// Initial setup when the script loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Loaded. Setting up start screen.");
  showStartScreen();
  // New button listeners
  playPublicButton.addEventListener("click", handlePlayPublic);
  createPrivateButton.addEventListener("click", handleCreatePrivate);
  joinPrivateButton.addEventListener("click", handleJoinPrivate);

  // Automatically try to connect WebSocket on load for convenience
  connectWebSocket();
});

// --- Game Over Check ---
function checkGameOver() {
  // Check if any part of the spawn location already has blocks
  if (currentPiece) {
    const shape = currentPiece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardRow = currentY + r;
          const boardCol = currentX + c;
          // If a block is in the hidden rows, we'll assume it's a valid move
          // But if the board already has a block there in the visible area, it's game over
          if (
            boardRow >= 0 && // Only checking visible rows
            boardRow < TOTAL_ROWS &&
            boardCol >= 0 &&
            boardCol < COLS &&
            board[boardRow][boardCol] !== 0
          ) {
            console.log("Game over condition detected!");
            gameOver = true;
            updateStatus("Game Over!");
            
            // Get user ID from localStorage
            const userId = localStorage.getItem('tetris_user_id');
            
            // Always send the user ID with the game over message
            if (userId) {
              sendMessageToServer("game_over", { 
                score,
                linesCleared,
                userId
              });
              console.log("Sent game_over message to server with score:", score, "lines:", linesCleared, "userId:", userId);
            } else {
              // Still try to send even without user ID, but log the issue
              sendMessageToServer("game_over", { 
                score, 
                linesCleared,
                // Send an empty user ID indicator to help with debugging
                noUserId: true
              });
              console.log("WARNING: Sent game_over message without user ID. Authentication may be missing!");
            }
            
            playerLost = true;
            showReturnToMenuButton();
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }
            return true;
          }
        }
      }
    }
  }
  return false;
}

// Direct DOM insertion of Return to Menu button - more reliable approach
function insertReturnToMenuButton() {
  console.log("FORCEFULLY inserting Return to Menu button");
  
  // Remove any existing button first
  const existingButton = document.getElementById('returnToMenuBtn');
  if (existingButton) {
    existingButton.remove();
  }
  
  // Create button with inline styles for maximum reliability
  const menuBtn = document.createElement('button');
  menuBtn.id = 'returnToMenuBtn';
  menuBtn.innerText = 'Return to Menu';
  
  // Apply styles directly to the element
  Object.assign(menuBtn.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '15px 30px',
    backgroundColor: '#4CAF50',
    color: 'white',
    fontSize: '18px',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    zIndex: '9999',
    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.3)'
  });
  
  // Mobile-specific styles
  if (window.innerWidth <= 767) {
    Object.assign(menuBtn.style, {
      padding: '20px 40px',
      fontSize: '22px'
    });
  }
  
  // Add event listener
  menuBtn.addEventListener('click', function() {
    window.location.href = '/';
  });
  
  // Add to document body directly (most reliable)
  document.body.appendChild(menuBtn);
  
  console.log("Return to Menu button forcefully added");
  
  // Try to move it to the front
  document.body.appendChild(menuBtn);
}

// Call the original function as a fallback
function showReturnToMenuButton() {
  // Check if button already exists
  if (document.getElementById('returnToMenuBtn')) return;
  
  console.log("Creating Return to Menu button (original method)");
  insertReturnToMenuButton();
}

// Function to send score updates to the server
function sendScoreUpdate() {
  if (ws && ws.readyState === WebSocket.OPEN && gameStarted) {
    // Get the user ID from localStorage
    const userId = localStorage.getItem('tetris_user_id');
    
    sendMessageToServer("update_score", {
      score: score,
      lines: linesCleared,
      userId: userId // Send user ID with each score update
    });
    
    console.log(`Score update sent: Score=${score}, Lines=${linesCleared}, UserID=${userId || 'not logged in'}`);
  }
}

// Send periodic score updates (every 10 seconds)
function startPeriodicScoreUpdates() {
  if (scoreUpdateInterval) clearInterval(scoreUpdateInterval);
  
  scoreUpdateInterval = setInterval(() => {
    if (gameStarted && !gameOver && !gameWon) {
      sendScoreUpdate();
    } else {
      clearInterval(scoreUpdateInterval);
      scoreUpdateInterval = null;
    }
  }, 10000); // Send score update every 10 seconds
}

// Initialize score update interval
let scoreUpdateInterval = null;

function getLinePoints(lines) {
  const points = [0, 100, 300, 500, 800];
  return points[lines];
}

// Activate speed-up attack
function activateSpeedUp(duration) {
  if (isSpeedUpActive) return; // Don't activate if already active
  
  isSpeedUpActive = true;
  
  // Store original drop interval
  const originalDropInterval = dropInterval;
  baseDropInterval = dropInterval;
  
  // Apply progressive speed-up effect for more dramatic impact
  const applySpeedUpEffect = (progress) => {
    // Calculate current factor based on progress (0 to 1)
    // Start with a strong initial boost, then gradually increase to maximum
    const currentFactor = 1.5 + (SPEEDUP_FACTOR - 1.5) * progress;
    dropInterval = Math.max(50, originalDropInterval / currentFactor);
    
    // Update UI to reflect current speed factor
    updateSpeedDisplay(currentFactor);
  };
  
  // Create function to update speed display
  const updateSpeedDisplay = (factor) => {
    // Update score/stats display with current speed factor
    if (scoreElement) {
      const speedIndicator = Math.floor((factor - 1) * 100);
      const currentScore = parseInt(scoreElement.textContent.split(':')[1].trim());
      scoreElement.innerHTML = `Score: ${currentScore} <span class="speed-boost">+${speedIndicator}% SPEED!</span>`;
    }
  };
  
  // Create speedup effect overlay
  const speedUpOverlay = document.createElement('div');
  speedUpOverlay.className = 'speed-effect-overlay';
  speedUpOverlay.style.position = 'absolute';
  speedUpOverlay.style.top = '0';
  speedUpOverlay.style.left = '0';
  speedUpOverlay.style.width = '100%';
  speedUpOverlay.style.height = '100%';
  speedUpOverlay.style.pointerEvents = 'none';
  speedUpOverlay.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
  speedUpOverlay.style.zIndex = '10';
  
  // Add blur effect for more intensity
  gameCanvas.style.filter = 'blur(1px)';
  // Add speed lines effect
  gameCanvas.classList.add('speed-lines-effect');
  
  // Add the overlay to the canvas container
  gameCanvas.parentElement.appendChild(speedUpOverlay);
  
  // Visual indicator for progress
  const progressBar = document.createElement('div');
  progressBar.style.position = 'absolute';
  progressBar.style.bottom = '0';
  progressBar.style.left = '0';
  progressBar.style.height = '5px';
  progressBar.style.width = '100%';
  progressBar.style.backgroundColor = 'rgb(255, 50, 50)';
  progressBar.style.opacity = '0.8';
  progressBar.style.zIndex = '11';
  progressBar.style.transition = 'width linear';
  speedUpOverlay.appendChild(progressBar);
  
  // Start with an immediate speed change
  applySpeedUpEffect(0.5); // Start at 50% of max effect
  
  // Create a heartbeat/pulse effect to emphasize the urgency
  let pulseCount = 0;
  const pulseInterval = setInterval(() => {
    if (!isSpeedUpActive) {
      clearInterval(pulseInterval);
      return;
    }
    
    // Create pulse effect
    gameCanvas.style.transform = 'scale(1.01)';
    setTimeout(() => {
      if (gameCanvas) {
        gameCanvas.style.transform = 'scale(1)';
      }
    }, 150);
    
    // Increase speed gradually with each pulse
    pulseCount++;
    if (pulseCount <= 5) {
      // Progressive speed increase
      applySpeedUpEffect(0.5 + (pulseCount * 0.1)); // 0.5, 0.6, 0.7, 0.8, 0.9, 1.0
    }
  }, 2000); // Pulse every 2 seconds
  
  // Update progress bar to show time remaining
  const startTime = Date.now();
  const updateInterval = setInterval(() => {
    if (!isSpeedUpActive) {
      clearInterval(updateInterval);
      return;
    }
    
    const elapsed = Date.now() - startTime;
    const timeLeft = Math.max(0, duration * 1000 - elapsed);
    const widthPercentage = (timeLeft / (duration * 1000)) * 100;
    progressBar.style.width = `${widthPercentage}%`;
    
    // Faster flashing as time runs out
    if (widthPercentage < 30) {
      progressBar.style.opacity = Math.random() > 0.5 ? '1' : '0.4';
    }
  }, 100);
  
  // Set timeout to deactivate the speed-up
  speedUpTimer = setTimeout(() => {
    // Gradually restore normal speed (smooth transition)
    const transitionSteps = 5;
    const stepDuration = 300; // ms
    
    const transitionInterval = setInterval(() => {
      const currentTransitionStep = transitionSteps - 1;
      if (currentTransitionStep <= 0) {
        clearInterval(transitionInterval);
        dropInterval = baseDropInterval;
        isSpeedUpActive = false;
        
        // Remove all visual effects
        if (gameCanvas) {
          gameCanvas.style.filter = 'none';
          gameCanvas.style.transform = 'scale(1)';
          gameCanvas.classList.remove('speed-lines-effect');
          
          // Remove our speed effect overlay
          if (speedUpOverlay.parentElement) {
            speedUpOverlay.parentElement.removeChild(speedUpOverlay);
          }
          
          // Reset score display
          if (scoreElement) {
            const currentScore = parseInt(scoreElement.textContent.split(':')[1].trim());
            scoreElement.textContent = `Score: ${currentScore}`;
          }
        }
        
        // Clear our intervals
        clearInterval(pulseInterval);
        clearInterval(updateInterval);
        
        return;
      }
      
      const factor = 1 + ((SPEEDUP_FACTOR - 1) * (currentTransitionStep / transitionSteps));
      dropInterval = Math.max(50, baseDropInterval / factor);
      
      transitionSteps--;
    }, stepDuration);
  }, duration * 1000); // Convert seconds to milliseconds
}

// Activate scramble attack
function activateScramble(intensity) {
  if (isScrambleActive) return; // Don't activate if already active
  
  isScrambleActive = true;
  // Store original board state by deep copying
  originalBoardState = board.map(row => [...row]);
  
  // Scramble the board by swapping blocks
  for (let i = 0; i < intensity; i++) {
    // Pick a random row to scramble (avoid hidden rows)
    const row = HIDDEN_ROWS + Math.floor(Math.random() * (TOTAL_ROWS - HIDDEN_ROWS));
    
    // Pick two random positions to swap
    const pos1 = Math.floor(Math.random() * COLS);
    let pos2 = Math.floor(Math.random() * COLS);
    
    // Make sure pos2 is different from pos1
    while (pos2 === pos1) {
      pos2 = Math.floor(Math.random() * COLS);
    }
    
    // Only swap if both positions contain blocks
    if (board[row][pos1] !== 0 || board[row][pos2] !== 0) {
      // Swap the blocks
      [board[row][pos1], board[row][pos2]] = [board[row][pos2], board[row][pos1]];
    }
  }
  
  // Redraw the board with scrambled blocks
  drawBoard();
  
  // Reset after a short delay
  scrambleTimer = setTimeout(() => {
    isScrambleActive = false;
    // Optionally restore original board state
    // board = originalBoardState;
    // drawBoard();
  }, 5000);
}

// Scramble the current board
function scrambleCurrentBoard(intensity) {
  console.log(`Scrambling board with intensity ${intensity}`);
  
  // Set the scramble flag
  isScrambleActive = true;
  
  // Store original board state by deep copying
  originalBoardState = board.map(row => [...row]);
  
  // Safer scrambling that won't create floating blocks:
  
  // 1. Identify rows with blocks that we can work with (in the visible area)
  const rowsWithBlocks = [];
  for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
    if (board[r].some(cell => cell !== 0)) {
      rowsWithBlocks.push(r);
    }
  }
  
  // If there aren't enough rows with blocks, don't scramble
  if (rowsWithBlocks.length < 2) {
    console.log("Not enough rows with blocks to scramble");
    isScrambleActive = false;
    return;
  }
  
  // 2. Scramble individual rows by swapping blocks WITHIN THE SAME ROW
  // This preserves the "gravity" of Tetris since no blocks float
  for (let i = 0; i < Math.min(intensity, rowsWithBlocks.length * 3); i++) {
    // Pick a random row that has blocks
    const randomIndex = Math.floor(Math.random() * rowsWithBlocks.length);
    const row = rowsWithBlocks[randomIndex];
    
    // Find positions with blocks in this row
    const blocksInRow = [];
    for (let c = 0; c < COLS; c++) {
      if (board[row][c] !== 0) {
        blocksInRow.push(c);
      }
    }
    
    // If there are at least 2 blocks in this row, swap two random blocks
    if (blocksInRow.length >= 2) {
      const pos1Index = Math.floor(Math.random() * blocksInRow.length);
      let pos2Index = Math.floor(Math.random() * blocksInRow.length);
      
      // Make sure we're swapping different positions
      while (pos2Index === pos1Index) {
        pos2Index = Math.floor(Math.random() * blocksInRow.length);
      }
      
      const pos1 = blocksInRow[pos1Index];
      const pos2 = blocksInRow[pos2Index];
      
      // Swap the blocks
      [board[row][pos1], board[row][pos2]] = [board[row][pos2], board[row][pos1]];
    }
  }
  
  // 3. NEW: Occasionally swap entire rows (that are both occupied)
  // This is more disruptive but still preserves Tetris physics
  if (rowsWithBlocks.length >= 2 && Math.random() < 0.7) {
    for (let i = 0; i < Math.min(3, Math.floor(rowsWithBlocks.length / 2)); i++) {
      const row1Index = Math.floor(Math.random() * rowsWithBlocks.length);
      let row2Index = Math.floor(Math.random() * rowsWithBlocks.length);
      
      // Make sure we're swapping different rows
      while (row2Index === row1Index) {
        row2Index = Math.floor(Math.random() * rowsWithBlocks.length);
      }
      
      const row1 = rowsWithBlocks[row1Index];
      const row2 = rowsWithBlocks[row2Index];
      
      // Swap entire rows
      [board[row1], board[row2]] = [board[row2], board[row1]];
    }
  }
  
  // 4. NEW: Color scrambling - change the color/type of some blocks
  // This adds visual confusion without affecting physics
  for (let i = 0; i < intensity; i++) {
    if (rowsWithBlocks.length > 0) {
      const randomRowIndex = Math.floor(Math.random() * rowsWithBlocks.length);
      const row = rowsWithBlocks[randomRowIndex];
      
      // Find a non-empty cell
      const blocksInRow = [];
      for (let c = 0; c < COLS; c++) {
        if (board[row][c] !== 0) {
          blocksInRow.push(c);
        }
      }
      
      if (blocksInRow.length > 0) {
        const col = blocksInRow[Math.floor(Math.random() * blocksInRow.length)];
        // Change the block to a random tetromino color (1-7)
        const newColor = Math.floor(Math.random() * 7) + 1;
        board[row][col] = newColor;
      }
    }
  }
  
  // 5. Add enhanced visual effects by flashing the board
  const boardBackup = gameCanvas.style.border || 'none';
  const effectDuration = 1500; // Longer effect duration
  
  // Add a shake effect to the canvas
  gameCanvas.classList.add('shake-effect');
  
  // Flashing effect
  gameCanvas.style.border = '4px solid #FF5722'; // Brighter orange border
  
  // Add a brief screen flash
  const flashOverlay = document.createElement('div');
  flashOverlay.style.position = 'fixed';
  flashOverlay.style.top = '0';
  flashOverlay.style.left = '0';
  flashOverlay.style.width = '100%';
  flashOverlay.style.height = '100%';
  flashOverlay.style.backgroundColor = 'rgba(255, 165, 0, 0.2)'; // Semi-transparent orange
  flashOverlay.style.zIndex = '9999';
  flashOverlay.style.pointerEvents = 'none'; // Don't block interaction
  document.body.appendChild(flashOverlay);
  
  // Remove the flash effect after a short time
  setTimeout(() => {
    document.body.removeChild(flashOverlay);
  }, 400);
  
  // Remove effects after the duration
  setTimeout(() => {
    gameCanvas.style.border = boardBackup; // Restore original border
    gameCanvas.classList.remove('shake-effect');
  }, effectDuration);
  
  // Redraw the board with scrambled blocks
  drawBoard();
  
  // Reset scramble active flag after a delay
  scrambleTimer = setTimeout(() => {
    isScrambleActive = false;
  }, effectDuration);
}

// Reset the game for a new match
function resetGame() {
  initGameState();
  initOpponentBoard();
  gameWon = false;
  gameOver = false;
  
  // Initialize or show mobile controls immediately
  if (!mobileControls) {
    mobileControls = new MobileControlsHandler(gameActions);
  } else {
    mobileControls.show();
  }
  
  startGame();
}

// Start the game
function startGame() {
  gameStarted = true;
  gameLoop();
}

// Add a function to cancel match search
function cancelMatchSearch() {
  if (searchingForMatch && ws && ws.readyState === WebSocket.OPEN) {
    sendMessageToServer("cancel_search");
    updateStatus("Match search canceled");
  }
  searchingForMatch = false;
  enableStartScreen();
}

// Last resort method to force button creation for the winner
function forceButtonCreation() {
  console.log("LAST RESORT: Creating button directly in document body");
  
  // Create button with very aggressive styling
  const btn = document.createElement('button');
  btn.textContent = 'Return to Menu';
  btn.id = 'winner-return-btn';
  
  // Set extreme z-index and fixed position
  Object.assign(btn.style, {
    position: 'fixed',
    zIndex: '999999',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#ff4500', // Bright orange to be super visible
    color: 'white',
    fontSize: '24px',
    padding: '20px 40px',
    border: '3px solid white',
    borderRadius: '8px',
    cursor: 'pointer'
  });
  
  // Add click event
  btn.onclick = function() {
    window.location.href = '/';
  };
  
  // First remove any existing button
  const existingBtn = document.getElementById('winner-return-btn');
  if (existingBtn) {
    existingBtn.remove();
  }
  
  // Append directly to body
  document.body.appendChild(btn);
  console.log("Winner return button forcefully added");
  
  // Try to move it to the front
  document.body.appendChild(btn);
}
