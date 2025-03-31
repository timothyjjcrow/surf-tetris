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
  SRS_KICKS
} from './constants.js';
import { MobileControlsHandler } from './mobileControls.js';

// --- DOM Elements ---
const gameCanvas = document.getElementById("gameCanvas");
const holdCanvas = document.getElementById("holdCanvas");
const nextCanvas = document.getElementById("nextCanvas");
const opponentCanvas = document.getElementById("opponentCanvas"); // Get the existing canvas instead of creating a new one
const scoreElement = document.getElementById("score");
const linesElement = document.getElementById("lines");

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
const startScreenElement = document.getElementById("startScreen");
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
    dropInterval = Math.max(100, 1000 - (level - 1) * 50);

    updateScore(score);
    updateLines(linesCleared);

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
  startScreenElement.style.display = "flex"; // Use flex as set in CSS
  gameAreaElement.style.display = "none";
  privateRoomInfo.style.display = "none"; // Hide room code info
  roomCodeInput.value = ""; // Clear input
  enableStartScreen(); // Ensure buttons are enabled
}

function hideStartScreen() {
  startScreenElement.style.display = "none";
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

// Enable buttons/input
function enableStartScreen() {
  playPublicButton.disabled = false;
  createPrivateButton.disabled = false;
  joinPrivateButton.disabled = false;
  roomCodeInput.disabled = false;
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
