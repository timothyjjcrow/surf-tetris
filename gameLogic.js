// gameLogic.js - Core tetris game mechanics and logic

import {
  COLS,
  TOTAL_ROWS,
  HIDDEN_ROWS,
  SHAPES,
  COLORS,
  SRS_KICKS,
} from './constants.js';

export class GameBoard {
  constructor() {
    this.board = [];
    this.initBoard();
  }

  initBoard() {
    this.board = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));
  }

  // Check if piece collides with walls or existing blocks
  checkCollision(x, y, shape) {
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
          if (boardY >= 0 && this.board[boardY] && this.board[boardY][boardX]) {
            return true; // Collision with another piece
          }
        }
      }
    }
    return false; // No collision
  }

  // Lock a piece into the board
  lockPiece(piece, x, y) {
    const shape = piece.shape;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          const boardX = x + c;
          const boardY = y + r;
          // Only lock blocks within the board bounds
          if (
            boardY >= 0 &&
            boardY < TOTAL_ROWS &&
            boardX >= 0 &&
            boardX < COLS
          ) {
            this.board[boardY][boardX] = piece.type;
          }
        }
      }
    }
  }

  // Clear completed lines and return count
  clearLines() {
    let linesToClear = [];
    for (let r = TOTAL_ROWS - 1; r >= 0; r--) {
      if (this.board[r].every((cell) => cell !== 0)) {
        linesToClear.push(r);
      }
    }

    if (linesToClear.length > 0) {
      // Remove lines from bottom up
      for (const rowIndex of linesToClear) {
        this.board.splice(rowIndex, 1);
      }
      // Add new empty lines at the top
      for (let i = 0; i < linesToClear.length; i++) {
        this.board.unshift(Array(COLS).fill(0));
      }

      return linesToClear.length;
    }
    return 0;
  }

  // Add garbage lines to the board
  addGarbageLines(lineCount) {
    if (lineCount <= 0) return;
    
    const holePosition = Math.floor(Math.random() * COLS);
    const newBoard = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));

    // Shift existing rows up in the new board
    for (let r = 0; r < TOTAL_ROWS - lineCount; r++) {
      if (r + lineCount < TOTAL_ROWS && this.board[r + lineCount]) {
        newBoard[r] = this.board[r + lineCount];
      } else {
        newBoard[r] = Array(COLS).fill(0);
      }
    }

    // Add new garbage lines at the bottom
    for (let r = TOTAL_ROWS - lineCount; r < TOTAL_ROWS; r++) {
      const line = Array(COLS).fill("GARBAGE");
      line[holePosition] = 0;
      newBoard[r] = line;
    }

    this.board = newBoard;
  }

  // Check if game is over (blocks in the hidden area)
  checkGameOver(currentPiece, x, y) {
    return this.checkCollision(x, y, currentPiece.shape);
  }
}

export class PieceManager {
  constructor() {
    this.pieceBag = [];
    this.nextQueue = [];
    this.holdPiece = null;
    this.canHold = true;
  }

  // Generate a new bag of 7 randomized pieces
  generateBag() {
    const pieces = Object.keys(SHAPES);
    // Fisher-Yates Shuffle
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
    }
    return pieces;
  }

  // Ensure the bag and next queue are filled
  fillBag(nextQueueSize) {
    if (this.pieceBag.length < 7) {
      this.pieceBag.push(...this.generateBag());
    }
    
    while (this.nextQueue.length < nextQueueSize) {
      this.nextQueue.push(this.pieceBag.shift());
      if (this.pieceBag.length === 0) {
        this.pieceBag.push(...this.generateBag());
      }
    }
  }

  // Create a new piece of the specified type with proper position
  createPiece(pieceType) {
    const shape = SHAPES[pieceType];
    const color = COLORS[pieceType];

    const piece = {
      type: pieceType,
      shape: shape,
      color: color,
      x: Math.floor(COLS / 2) - Math.ceil(shape[0].length / 2), // Center horizontally
      y: HIDDEN_ROWS - shape.length + 
         shape.findIndex((row) => row.some((cell) => cell)), // Start above visible area
      rotation: 0, // Initial rotation state
    };

    // Special positioning adjustments
    if (pieceType === "I") piece.y += 1; // I piece adjustment
    if (pieceType === "O") piece.x -= 1; // O piece adjustment

    return piece;
  }

  // Get the next piece from the queue
  getNextPiece(nextQueueSize) {
    this.fillBag(nextQueueSize);
    const pieceType = this.nextQueue.shift();
    return this.createPiece(pieceType);
  }

  // Hold the current piece and return the held piece if available
  holdPiece(currentPiece) {
    if (!this.canHold) return null;
    
    const pieceToHold = currentPiece.type;
    let pieceToSpawn = null;
    
    if (this.holdPiece) {
      pieceToSpawn = this.holdPiece;
      this.holdPiece = pieceToHold;
    } else {
      this.holdPiece = pieceToHold;
      pieceToSpawn = null; // Will need to get from next queue
    }
    
    this.canHold = false; // Can only hold once per piece
    return pieceToSpawn;
  }

  // Calculate the rotated shape of a piece
  getRotatedShape(shape) {
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

  // Try to rotate a piece using SRS kicks
  rotatePiece(piece, x, y, boardChecker) {
    if (piece.type === "O") return { success: false }; // O piece doesn't rotate
    
    const originalShape = piece.shape;
    const rotatedShape = this.getRotatedShape(originalShape);
    const currentRotation = piece.rotation;
    const nextRotation = (currentRotation + 1) % 4;
    
    const kickTable = piece.type === "I" ? SRS_KICKS.I : SRS_KICKS.JLSTZ;
    const rotationKey = `${currentRotation}->${nextRotation}`;
    const kicks = kickTable[rotationKey] || [[0, 0]]; // Default to [0,0] if key missing
    
    // Try each kick offset
    for (const [dx, dy] of kicks) {
      const newX = x + dx;
      // SRS dy is often inverted compared to typical screen coordinates
      const newY = y - dy; // SUBTRACT dy for SRS kicks
      
      if (!boardChecker(newX, newY, rotatedShape)) {
        // Valid rotation found!
        return {
          success: true,
          x: newX,
          y: newY,
          shape: rotatedShape,
          rotation: nextRotation
        };
      }
    }
    
    return { success: false };
  }

  // Calculate the shadow/ghost piece position
  getGhostPieceY(piece, x, y, boardChecker) {
    let ghostY = y;
    while (!boardChecker(x, ghostY + 1, piece.shape)) {
      ghostY++;
    }
    return ghostY;
  }
}
