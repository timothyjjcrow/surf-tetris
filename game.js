// --- DOM Elements ---
const gameCanvas = document.getElementById("gameCanvas");
const holdCanvas = document.getElementById("holdCanvas");
const nextCanvas = document.getElementById("nextCanvas");
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");
const statusElement = document.getElementById("status");
const startScreenElement = document.getElementById("startScreen");
const gameAreaElement = document.getElementById("gameArea");
const playPublicButton = document.getElementById("playPublicButton");
const createPrivateButton = document.getElementById("createPrivateButton");
const joinPrivateButton = document.getElementById("joinPrivateButton");
const roomCodeInput = document.getElementById("roomCodeInput");
const privateRoomInfo = document.getElementById("privateRoomInfo");

// Touch Controls Elements
const touchControls = document.getElementById('touchControls');
const touchLeft = document.getElementById('touchLeft');
const touchRight = document.getElementById('touchRight');
const touchDown = document.getElementById('touchDown');
const touchRotate = document.getElementById('touchRotate');
const touchDrop = document.getElementById('touchDrop');
const touchHold = document.getElementById('touchHold');

// UI Elements
const opponentCanvas = document.createElement("canvas"); // Create opponent canvas

const gameCtx = gameCanvas.getContext("2d");
const holdCtx = holdCanvas.getContext("2d");
const nextCtx = nextCanvas.getContext("2d");

// --- Game Constants ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 24; // Size of each block in pixels
const HIDDEN_ROWS = 2; // Buffer rows above visible area
const TOTAL_ROWS = ROWS + HIDDEN_ROWS;
const NEXT_QUEUE_SIZE = 4;
const PREVIEW_BOX_SIZE = 4; // Size of next/hold box in blocks (e.g., 4x4)

// Opponent display constants
const OPPONENT_COLS = 10;
const OPPONENT_ROWS = 20;
const OPPONENT_HIDDEN_ROWS = 2; // Match main board's hidden rows
const OPPONENT_TOTAL_ROWS = OPPONENT_ROWS + OPPONENT_HIDDEN_ROWS;
const OPPONENT_BLOCK_SIZE = 12; // Make opponent blocks smaller

// Adjust canvas size based on constants
gameCanvas.width = COLS * BLOCK_SIZE;
gameCanvas.height = ROWS * BLOCK_SIZE;
holdCanvas.width = PREVIEW_BOX_SIZE * BLOCK_SIZE;
holdCanvas.height = PREVIEW_BOX_SIZE * BLOCK_SIZE;
nextCanvas.width = PREVIEW_BOX_SIZE * BLOCK_SIZE;
nextCanvas.height = PREVIEW_BOX_SIZE * BLOCK_SIZE * NEXT_QUEUE_SIZE; // Adjust height for queue

opponentCanvas.width = OPPONENT_COLS * OPPONENT_BLOCK_SIZE;
opponentCanvas.height = OPPONENT_ROWS * OPPONENT_BLOCK_SIZE;

// --- Colors ---
const COLORS = {
  I: "cyan",
  O: "yellow",
  T: "purple",
  S: "lime",
  Z: "red",
  J: "blue",
  L: "orange",
  GHOST: "rgba(200, 200, 200, 0.5)", // Semi-transparent gray
  GRID: "#ddd", // Light gray for grid lines
  GARBAGE: "darkgray",
};

// --- Tetrimino Shapes & Data ---
// Shapes are defined assuming the top-left of the bounding box is (0,0)
// This might differ slightly from spawn calculation which centers.
const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};

// SRS Kick Data (Offsets from original position for wall kicks)
// Format: [ [Test 1 dx, dy], [Test 2 dx, dy], ... ]
// Based on https://tetris.wiki/Super_Rotation_System
const SRS_KICKS = {
  // J, L, S, T, Z kicks (Common)
  JLSTZ: {
    // Rotation state transitions: 0->1, 1->0, 1->2, 2->1, 2->3, 3->2, 3->0, 0->3 (last one is CCW)
    "0->1": [
      [0, 0],
      [-1, 0],
      [-1, +1],
      [0, -2],
      [-1, -2],
    ],
    "1->0": [
      [0, 0],
      [+1, 0],
      [+1, -1],
      [0, +2],
      [+1, +2],
    ], // Reverse of 0->1
    "1->2": [
      [0, 0],
      [+1, 0],
      [+1, -1],
      [0, +2],
      [+1, +2],
    ],
    "2->1": [
      [0, 0],
      [-1, 0],
      [-1, +1],
      [0, -2],
      [-1, -2],
    ], // Reverse of 1->2
    "2->3": [
      [0, 0],
      [+1, 0],
      [+1, +1],
      [0, -2],
      [+1, -2],
    ],
    "3->2": [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, +2],
      [-1, +2],
    ], // Reverse of 2->3
    "3->0": [
      [0, 0],
      [-1, 0],
      [-1, -1],
      [0, +2],
      [-1, +2],
    ],
    "0->3": [
      [0, 0],
      [+1, 0],
      [+1, +1],
      [0, -2],
      [+1, -2],
    ], // Reverse of 3->0 (CCW)
  },
  // I piece kicks
  I: {
    "0->1": [
      [0, 0],
      [-2, 0],
      [+1, 0],
      [-2, -1],
      [+1, +2],
    ],
    "1->0": [
      [0, 0],
      [+2, 0],
      [-1, 0],
      [+2, +1],
      [-1, -2],
    ], // Reverse of 0->1
    "1->2": [
      [0, 0],
      [-1, 0],
      [+2, 0],
      [-1, +2],
      [+2, -1],
    ],
    "2->1": [
      [0, 0],
      [+1, 0],
      [-2, 0],
      [+1, -2],
      [-2, +1],
    ], // Reverse of 1->2
    "2->3": [
      [0, 0],
      [+2, 0],
      [-1, 0],
      [+2, +1],
      [-1, -2],
    ],
    "3->2": [
      [0, 0],
      [-2, 0],
      [+1, 0],
      [-2, -1],
      [+1, +2],
    ], // Reverse of 2->3
    "3->0": [
      [0, 0],
      [+1, 0],
      [-2, 0],
      [+1, -2],
      [-2, +1],
    ],
    "0->3": [
      [0, 0],
      [-1, 0],
      [+2, 0],
      [-1, +2],
      [+2, -1],
    ], // Reverse of 3->0 (CCW)
  },
  // O piece does not rotate / kick
};

// --- Game State Variables ---
let board = []; // Represents the game grid (0 = empty, >0 = filled block color index)
let currentPiece = null;
let currentX = 0;
let currentY = 0;
let score = 0;
let linesCleared = 0;
let level = 1;
let gameOver = false;
let gamePaused = false;
let gameStarted = false; // Flag to prevent interaction before match starts
let playerNumber = null; // 1 or 2, assigned by server
let roomId = null;
let gameWon = false; // Flag for winning

let pieceBag = [];
let nextQueue = [];
let holdPiece = null;
let canHold = true;

let dropCounter = 0;
let dropInterval = 1000; // Milliseconds per downward step (decreases with level)

let lastTime = 0;
let accumulatedTime = 0;
let animationFrameId = null; // To stop the loop

let lockDelayTimer = null;
const LOCK_DELAY = 500; // ms

// Garbage State
let incomingGarbageLines = 0; // Counter for garbage lines to be added on next lock

// Opponent State
let opponentBoard = [];

// --- WebSocket Connection ---
let ws = null;
const SERVER_URL = `ws://${window.location.hostname}:8080`; // Adjust if server is elsewhere

function connectWebSocket() {
  // Determine WebSocket protocol based on page protocol
  let wsUrl;
  if (window.location.protocol === "https:") {
    // Use wss:// and the same hostname, no port needed for standard HTTPS/WSS port 443
    wsUrl = `wss://${window.location.host}`;
  } else {
    // Use ws:// and add the port for local development (e.g., localhost:8080)
    // Assumes server runs on port 8080 locally
    wsUrl = `ws://${window.location.hostname}:8080`;
  }

  console.log(`Attempting to connect WebSocket to: ${wsUrl}`);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connection established");
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
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      break;

    case "opponent_disconnected":
      console.log("Opponent disconnected! You win by default.");
      updateStatus("Opponent disconnected. You Win!");
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
      if (message.payload.roomCode) {
        displayRoomCode(message.payload.roomCode);
        updateStatus(
          `Private room created. Share code: ${message.payload.roomCode}`
        );
      } else {
        updateStatus("Error creating private room.");
        enableStartScreen(); // Re-enable buttons on error
      }
      break;

    case "error":
      console.error("Server error:", message.payload.message);
      updateStatus(`Error: ${message.payload.message}`);
      if (!gameStarted) {
        // If error happens before game start, allow retry
        enableStartScreen();
      }
      break;

    case "status": // General status updates from server
      updateStatus(message.payload.message);
      // Keep start screen enabled unless matchmaking is actively in progress
      // (disableStartScreen is called explicitly when sending match requests)
      if (!gameStarted && startScreenElement.style.display !== "none") {
        // Don't re-enable if we're *already* disabled waiting for match_found
        const anyButtonDisabled =
          playPublicButton.disabled ||
          createPrivateButton.disabled ||
          joinPrivateButton.disabled;
        if (!anyButtonDisabled) {
          enableStartScreen();
        }
      }
      break;

    case "game_over":
      // Handled by checkGameOver sending the message
      break;

    default:
      console.log(`Unknown message type from server: ${message.type}`);
  }
}

// --- Initialization ---
function initDrawingContexts() {
  // Renamed from initGameUI for clarity
  // Add opponent canvas to the DOM
  const gameContainer = document.querySelector(".game-container");
  const rightPanel = document.querySelector(".right-panel");
  opponentCanvas.id = "opponentCanvas";
  opponentCanvas.style.border = "1px solid #ccc";
  opponentCanvas.style.backgroundColor = "#f8f8f8";
  opponentCanvas.style.marginTop = "20px"; // Add some space

  const opponentContainer = document.createElement("div");
  opponentContainer.style.textAlign = "center";
  const opponentTitle = document.createElement("h2");
  opponentTitle.textContent = "Opponent";
  opponentContainer.appendChild(opponentTitle);
  opponentContainer.appendChild(opponentCanvas);

  // Insert opponent display before score/lines in the right panel
  rightPanel.insertBefore(opponentContainer, document.getElementById("score"));

  updateStatus("Connecting to server...");
  connectWebSocket();
}

function initBoard() {
  board = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));
  // Example: Pre-fill some blocks for testing
  // board[TOTAL_ROWS - 1] = Array(COLS).fill(1);
  // board[TOTAL_ROWS - 2] = Array(COLS).fill(2);
  // board[TOTAL_ROWS - 3][5] = 3;
}

function resetGame() {
  initBoard();
  score = 0;
  linesCleared = 0;
  level = 1;
  gameOver = false;
  gamePaused = false;
  gameStarted = true; // Flag to prevent interaction before match starts
  pieceBag = [];
  nextQueue = [];
  holdPiece = null;
  canHold = true;
  dropInterval = 1000; // Reset speed
  scoreElement.textContent = `Score: ${score}`;
  linesElement.textContent = `Lines: ${linesCleared}`;
  fillBag();
  spawnPiece();
  lastTime = 0; // Reset animation timer
  accumulatedTime = 0;
  console.log("Game Reset and Started");
  gameLoop(); // Start the game loop
}

function startGame() {
  resetGame(); // Reset local game state
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
  if (gameOver || gamePaused || gameWon || !gameStarted) return false;
  clearTimeout(lockDelayTimer); // Cancel lock delay on successful move
  lockDelayTimer = null;

  if (!checkCollision(currentX + dx, currentY + dy, currentPiece.shape)) {
    currentX += dx;
    currentY += dy;
    // Reset lock delay if moving downwards wasn't the cause of the check
    if (dy === 0) {
      resetLockDelayIfTouching();
    }
    return true; // Move successful
  } else if (dy > 0) {
    // If moving down caused collision, start lock delay
    startLockDelay();
  }
  return false; // Move failed
}

function softDrop() {
  if (movePiece(0, 1)) {
    dropCounter = 0; // Reset drop counter on manual drop
    // Add score for soft drop (optional)
    // score += 1;
    // scoreElement.textContent = `Score: ${score}`;
  }
}

function hardDrop() {
  if (gameOver || gamePaused || gameWon || !gameStarted) return;
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
    gamePaused ||
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

    const holePosition = Math.floor(Math.random() * COLS);
    const newBoard = Array.from({ length: TOTAL_ROWS }, () =>
      Array(COLS).fill(0)
    );

    // Shift existing rows up in the new board
    for (let r = 0; r < TOTAL_ROWS - incomingGarbageLines; r++) {
      if (
        r + incomingGarbageLines < TOTAL_ROWS &&
        board[r + incomingGarbageLines]
      ) {
        newBoard[r] = board[r + incomingGarbageLines];
      } else {
        newBoard[r] = Array(COLS).fill(0);
      }
    }

    // Add new garbage lines at the bottom
    for (let r = TOTAL_ROWS - incomingGarbageLines; r < TOTAL_ROWS; r++) {
      const line = Array(COLS).fill("GARBAGE");
      line[holePosition] = 0;
      newBoard[r] = line;
    }

    // Replace the old board
    board = newBoard;

    // Reset the counter and update indicator
    incomingGarbageLines = 0;
    drawPendingGarbageIndicator();

    // Check for game over AFTER applying garbage (if any block is in hidden rows)
    if (checkGameOver()) {
      console.log("Game over checked in lockPiece");
      return; // Stop further actions if game over
    }
  }

  // --- Scoring and Leveling (based on lines cleared THIS lock) --- //
  if (clearedLineCount > 0) {
    const points = [0, 100, 300, 500, 800];
    score += points[clearedLineCount] * level;

    linesCleared += clearedLineCount;
    level = Math.floor(linesCleared / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 50);

    scoreElement.textContent = `Score: ${score}`;
    linesElement.textContent = `Lines: ${linesCleared}`;

    console.log(
      `Cleared ${clearedLineCount} lines! Score: ${score}, Lines: ${linesCleared}, Level: ${level}`
    );

    // Inform server about line clears
    sendMessageToServer("line_clear", { lines: clearedLineCount });
  }

  // --- Spawn Next Piece --- //
  spawnPiece();
  drawBoard(); // Update board immediately after locking

  // Send locked piece info to server
  sendMessageToServer("piece_locked", {
    board: board, // Send the entire board state for now (simplest)
    // TODO: Send less data (piece type, rotation, x, y) later for efficiency
  });
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

    return linesToClear.length;
  }
  return 0;
}

// --- Hold Piece ---
function holdCurrentPiece() {
  if (!canHold || gameOver || gamePaused || gameWon || !gameStarted) return;

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
  const indicatorCtx = gameCanvas.getContext("2d"); // Draw on main canvas for simplicity
  const barX = -10; // Position to the left of the board
  const barWidth = 8;
  const barMaxHeight = gameCanvas.height - 20; // Leave some padding
  const barHeight = Math.min(
    barMaxHeight,
    incomingGarbageLines * (BLOCK_SIZE / 2)
  ); // Scale height

  // Clear previous indicator area (crude method)
  indicatorCtx.clearRect(barX - 2, 0, barWidth + 4, gameCanvas.height);

  if (incomingGarbageLines > 0) {
    indicatorCtx.fillStyle = "red";
    indicatorCtx.fillRect(
      barX,
      gameCanvas.height - barHeight,
      barWidth,
      barHeight
    );
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
function drawBlock(ctx, x, y, color, stroke = "black", blockSize = BLOCK_SIZE) {
  ctx.fillStyle = color;
  ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
  ctx.strokeStyle = stroke;
  ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
}

function drawBoard() {
  // Clear only the visible area
  gameCtx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Draw grid lines (optional)
  gameCtx.strokeStyle = COLORS.GRID;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      gameCtx.strokeRect(
        c * BLOCK_SIZE,
        r * BLOCK_SIZE,
        BLOCK_SIZE,
        BLOCK_SIZE
      );
    }
  }

  // Draw locked pieces (only the visible part)
  for (let r = HIDDEN_ROWS; r < TOTAL_ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const color = COLORS[board[r][c]] || "gray"; // Use type to get color
        // Adjust y-coordinate for drawing since board includes hidden rows
        drawBlock(gameCtx, c, r - HIDDEN_ROWS, color);
      }
    }
  }
}

function drawPiece(
  ctx,
  piece,
  drawX,
  drawY,
  isGhost = false,
  isPreview = false,
  previewSize = BLOCK_SIZE
) {
  if (!piece) return;
  const shape = piece.shape;
  const color = isGhost ? COLORS.GHOST : piece.color;
  const blockSize = isPreview ? previewSize : BLOCK_SIZE;
  const stroke = isPreview ? "#ccc" : "black";

  ctx.fillStyle = color;
  ctx.strokeStyle = stroke;

  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (shape[r][c]) {
        const blockX = (drawX + c) * blockSize;
        const blockY = (drawY + r) * blockSize;
        ctx.fillRect(blockX, blockY, blockSize, blockSize);
        ctx.strokeRect(blockX, blockY, blockSize, blockSize);
      }
    }
  }
}

function drawCurrentPiece() {
  if (!currentPiece || gameOver || gameWon) return;

  // Draw Ghost Piece first
  const ghostY = getGhostPieceY();
  // Adjust y-coordinate for drawing ghost piece in visible area
  drawPiece(gameCtx, currentPiece, currentX, ghostY - HIDDEN_ROWS, true);

  // Draw Actual Piece
  // Adjust y-coordinate for drawing current piece in visible area
  drawPiece(gameCtx, currentPiece, currentX, currentY - HIDDEN_ROWS);
}

function drawHoldPiece() {
  holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
  if (holdPiece) {
    const pieceData = {
      shape: SHAPES[holdPiece],
      color: COLORS[holdPiece],
    };
    const previewBlockSize = holdCanvas.width / 5; // Smaller blocks for preview
    const shape = pieceData.shape;
    // Calculate offset to center the piece
    const offsetX = (holdCanvas.width / previewBlockSize - shape[0].length) / 2;
    const offsetY = (holdCanvas.height / previewBlockSize - shape.length) / 2;
    drawPiece(
      holdCtx,
      pieceData,
      offsetX,
      offsetY,
      false,
      true,
      previewBlockSize
    );
  }
}

function drawNextQueue() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const previewBlockSize = nextCanvas.width / 5; // Smaller blocks for preview
  let yOffset = 0.5; // Initial y offset

  for (let i = 0; i < Math.min(nextQueue.length, NEXT_QUEUE_SIZE); i++) {
    // Show up to NEXT_QUEUE_SIZE next pieces
    const pieceType = nextQueue[i];
    const pieceData = {
      shape: SHAPES[pieceType],
      color: COLORS[pieceType],
    };
    const shape = pieceData.shape;
    const offsetX = (nextCanvas.width / previewBlockSize - shape[0].length) / 2;

    drawPiece(
      nextCtx,
      pieceData,
      offsetX,
      yOffset,
      false,
      true,
      previewBlockSize
    );

    // Adjust yOffset for the next piece based on the current piece's height
    const pieceHeight =
      shape.length -
      shape.reduceRight(
        (emptyRows, row) => (row.every((cell) => !cell) ? emptyRows + 1 : 0),
        0
      );
    yOffset += pieceHeight + 0.5; // Add some padding
  }
}

// --- Opponent Board --- TODO: Refactor drawing logic?
function initOpponentBoard() {
  opponentBoard = Array.from({ length: OPPONENT_TOTAL_ROWS }, () =>
    Array(OPPONENT_COLS).fill(0)
  );
  drawOpponentBoard(); // Draw initial empty board
}

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

function drawOpponentBoard() {
  const opponentCtx = opponentCanvas.getContext("2d");
  opponentCtx.clearRect(0, 0, opponentCanvas.width, opponentCanvas.height);

  // Draw grid lines (optional, lighter)
  opponentCtx.strokeStyle = "#eee";
  for (let r = 0; r < OPPONENT_ROWS; r++) {
    for (let c = 0; c < OPPONENT_COLS; c++) {
      opponentCtx.strokeRect(
        c * OPPONENT_BLOCK_SIZE,
        r * OPPONENT_BLOCK_SIZE,
        OPPONENT_BLOCK_SIZE,
        OPPONENT_BLOCK_SIZE
      );
    }
  }

  // Draw locked pieces (visible part)
  for (let r = OPPONENT_HIDDEN_ROWS; r < OPPONENT_TOTAL_ROWS; r++) {
    for (let c = 0; c < OPPONENT_COLS; c++) {
      if (opponentBoard[r] && opponentBoard[r][c]) {
        const color = COLORS[opponentBoard[r][c]] || "gray";
        drawBlock(
          opponentCtx,
          c,
          r - OPPONENT_HIDDEN_ROWS,
          color,
          "#ccc",
          OPPONENT_BLOCK_SIZE
        );
      }
    }
  }
}

// --- UI Updates ---
function updateStatus(text) {
  // Simple status update - replace h1 or add a dedicated status element
  statusElement.textContent = text;
}

// --- Game Loop ---
function gameLoop(timestamp = 0) {
  // Stop loop if game over, paused, or won
  if (gameOver || gamePaused || gameWon) {
    // We might have already cancelled, but belt-and-suspenders
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
    return;
  }

  // Don't run game logic if not started (waiting for opponent)
  if (!gameStarted) {
    requestAnimationFrame(gameLoop);
    return;
  }

  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;
  accumulatedTime += deltaTime;

  // Update game state (automatic downward movement)
  if (accumulatedTime >= dropInterval) {
    movePiece(0, 1);
    accumulatedTime = 0; // Reset accumulator
  }

  // Draw everything
  drawBoard(); // Draw the board first
  drawCurrentPiece(); // Draw the current piece (and ghost) on top
  drawPendingGarbageIndicator(); // Draw garbage indicator on top
  // Side panels are drawn on demand (spawn, hold, next queue update)
  // drawHoldPiece();
  // drawNextQueue();

  animationFrameId = requestAnimationFrame(gameLoop);
}

// --- Input Handling ---
const keyMap = {
  ArrowLeft: () => movePiece(-1, 0),
  ArrowRight: () => movePiece(1, 0),
  ArrowDown: softDrop,
  ArrowUp: rotatePiece, // Rotate
  " ": hardDrop, // Space bar
  KeyC: holdCurrentPiece,
  KeyP: () => {
    // Pause Toggle
    // Disable pause in multiplayer for now?
    // gamePaused = !gamePaused;
    // console.log(gamePaused ? "Game Paused" : "Game Resumed");
    // if (!gamePaused) {
    //     lastTime = performance.now(); // Reset timer on unpause
    //     gameLoop(); // Restart loop if paused
    // } else {
    //     // Optional: Draw a pause overlay
    //     gameCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    //     gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
    //     gameCtx.font = '30px Arial';
    //     gameCtx.fillStyle = 'white';
    //     gameCtx.textAlign = 'center';
    //     gameCtx.fillText('Paused', gameCanvas.width / 2, gameCanvas.height / 2);
    // }
    console.log("Pause (P) disabled in multiplayer mode.");
  },
  KeyR: () => {
    // Reset Game (Disable in multiplayer?)
    // resetGame();
    console.log("Reset (R) disabled in multiplayer mode.");
  },
};

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

document.addEventListener("keydown", (event) => {
  // Ignore input if game not active
  if (gameOver || gamePaused || gameWon || !gameStarted) return;

  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (!moveKeyDown) {
      // Only start movement if not already moving
      startMovement(event.key);
    }
  } else if (keyMap[event.key]) {
    event.preventDefault(); // Prevent default browser actions (like space scrolling)
    keyMap[event.key]();
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    if (moveKeyDown === event.key) {
      stopMovement();
    }
  }
});

// --- Start Screen Flow ---
function showStartScreen() {
  startScreenElement.style.display = "flex"; // Use flex as set in CSS
  gameAreaElement.style.display = "none";
  privateRoomInfo.style.display = "none"; // Hide room code info
  roomCodeInput.value = ""; // Clear input
  enableStartScreen(); // Ensure buttons are enabled
}

function hideStartScreen() {
  startScreenElement.style.display = "none";
}

// Disable buttons/input during connection/matchmaking attempts
function disableStartScreen() {
  playPublicButton.disabled = true;
  createPrivateButton.disabled = true;
  joinPrivateButton.disabled = true;
  roomCodeInput.disabled = true;
}

// Enable buttons/input
function enableStartScreen() {
  playPublicButton.disabled = false;
  createPrivateButton.disabled = false;
  joinPrivateButton.disabled = false;
  roomCodeInput.disabled = false;
}

// Display the generated room code
function displayRoomCode(code) {
  privateRoomInfo.textContent = `Room Code: ${code}`;
  privateRoomInfo.style.display = "block";
}

function showGameArea() {
  hideStartScreen(); // Ensure start screen is hidden
  gameAreaElement.style.display = "flex";
}

// --- New Button Handlers ---
function handlePlayPublic() {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    connectWebSocket(); // Connect first if needed
    // Wait for ws.onopen to enable buttons, then user clicks again
    // Or, queue the action: ws.onopen = () => { ...; sendMessage({ type: 'find_public_match' }); };
    // For simplicity now, just connect and let user click again.
    updateStatus("Connecting... Click Play Public again once connected.");
    return;
  }
  console.log("Requesting public match...");
  sendMessageToServer("find_public_match");
  updateStatus("Finding public match...");
  disableStartScreen(); // Disable buttons while waiting
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
  disableStartScreen();
}

// Initial setup when the script loads
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Loaded. Setting up start screen.");
  initDrawingContexts(); // Set up canvases
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
  // Returns true if game is over, false otherwise
  // Check if the *current* piece (or potential spawn) overlaps
  if (checkCollision(currentX, currentY, currentPiece.shape)) {
    gameOver = true;
    if (ws && ws.readyState === WebSocket.OPEN && gameStarted) {
      // Only send if connected and game has started
      sendMessageToServer("game_over", { score, linesCleared });
      console.log("Sent 'game_over' message to server.");
    }
    updateStatus("Game Over!");
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    return true; // Indicate game is over
  }
  return false; // Indicate game is not over
}

// --- Touch Control Setup ---
let isTouchDevice = false; // Flag for touch device

// --- Touch Control Setup ---
function isTouchSupported() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

function setupTouchControls() {
  isTouchDevice = isTouchSupported();
  console.log("Is touch device?", isTouchDevice);

  if (isTouchDevice && touchControls) {
    touchControls.style.display = "flex"; // Show controls

    // Add touch event listeners (touchstart is generally preferred for responsiveness)
    addTouchEvent(touchLeft, () => movePiece(-1));
    addTouchEvent(touchRight, () => movePiece(1));
    addTouchEvent(touchRotate, rotatePiece);
    addTouchEvent(touchDown, () => movePieceDown(true)); // Soft drop
    addTouchEvent(touchDrop, hardDrop);
    addTouchEvent(touchHold, holdPiece);
  } else if (touchControls) {
    touchControls.style.display = "none"; // Hide controls if not touch
  }
}

// Helper to add touchstart listener and prevent default behavior
function addTouchEvent(element, action) {
  if (element) {
    element.addEventListener("touchstart", (e) => {
      e.preventDefault(); // Prevent scrolling/zooming
      if (!isGameOver && gameActive) {
        // Only allow input if game is active
        action();
      }
    }, { passive: false }); // Need passive: false to call preventDefault
  }
}

// Call setupTouchControls inside the DOMContentLoaded listener
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM Loaded. Setting up start screen.");
  initDrawingContexts(); // Set up canvases
  showStartScreen();
  // New button listeners
  playPublicButton.addEventListener("click", handlePlayPublic);
  createPrivateButton.addEventListener("click", handleCreatePrivate);
  joinPrivateButton.addEventListener("click", handleJoinPrivate);

  // Automatically try to connect WebSocket on load for convenience
  connectWebSocket();
  setupTouchControls(); // Setup touch controls on load
});

// Modify handleKeyDown: Add a check at the beginning. If isTouchDevice is true and touchControls are visible, return immediately to ignore keyboard input.
function handleKeyDown(e) {
  if (isGameOver || !gameActive) return;

  // Ignore keyboard events if touch controls are visible (likely mobile)
  if (isTouchDevice && touchControls && touchControls.style.display !== "none") {
    return;
  }

  switch (e.keyCode) {
    case 37: // Left Arrow
      movePiece(-1);
    case 39: // Right Arrow
      movePiece(1);
    case 40: // Down Arrow
      movePieceDown();
    case 38: // Up Arrow
      rotatePiece();
    case 32: // Space bar
      hardDrop();
    case 67: // C key
      holdCurrentPiece();
    case 80: // P key
      // Pause Toggle
      // Disable pause in multiplayer for now?
      // gamePaused = !gamePaused;
      // console.log(gamePaused ? "Game Paused" : "Game Resumed");
      // if (!gamePaused) {
      //     lastTime = performance.now(); // Reset timer on unpause
      //     gameLoop(); // Restart loop if paused
      // } else {
      //     // Optional: Draw a pause overlay
      //     gameCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      //     gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
      //     gameCtx.font = '30px Arial';
      //     gameCtx.fillStyle = 'white';
      //     gameCtx.textAlign = 'center';
      //     gameCtx.fillText('Paused', gameCanvas.width / 2, gameCanvas.height / 2);
      // }
      console.log("Pause (P) disabled in multiplayer mode.");
    case 82: // R key
      // Reset Game (Disable in multiplayer?)
      // resetGame();
      console.log("Reset (R) disabled in multiplayer mode.");
  }
}
