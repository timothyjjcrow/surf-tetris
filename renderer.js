// renderer.js - Handles all game rendering

import { 
  BLOCK_SIZE, 
  HIDDEN_ROWS, 
  ROWS, 
  COLS,
  COLORS, 
  SHAPES,
  OPPONENT_BLOCK_SIZE,
  OPPONENT_ROWS, 
  OPPONENT_COLS,
  OPPONENT_HIDDEN_ROWS,
  OPPONENT_TOTAL_ROWS
} from './constants.js';

export class GameRenderer {
  constructor(gameCanvas, holdCanvas, nextCanvas, opponentCanvas) {
    this.gameCanvas = gameCanvas;
    this.holdCanvas = holdCanvas;
    this.nextCanvas = nextCanvas;
    this.opponentCanvas = opponentCanvas;
    
    this.gameCtx = gameCanvas.getContext("2d");
    this.holdCtx = holdCanvas.getContext("2d");
    this.nextCtx = nextCanvas.getContext("2d");
    this.opponentCtx = opponentCanvas.getContext("2d");
  }

  // Draw a single block (shared between all draw methods)
  drawBlock(ctx, x, y, color, stroke = "black", blockSize = BLOCK_SIZE) {
    ctx.fillStyle = color;
    ctx.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
    ctx.strokeStyle = stroke;
    ctx.strokeRect(x * blockSize, y * blockSize, blockSize, blockSize);
  }

  // Draw the main game board
  drawBoard(board) {
    // Clear only the visible area
    this.gameCtx.clearRect(0, 0, this.gameCanvas.width, this.gameCanvas.height);

    // Draw grid lines (optional)
    this.gameCtx.strokeStyle = COLORS.GRID;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.gameCtx.strokeRect(
          c * BLOCK_SIZE,
          r * BLOCK_SIZE,
          BLOCK_SIZE,
          BLOCK_SIZE
        );
      }
    }

    // Draw locked pieces (only the visible part)
    for (let r = HIDDEN_ROWS; r < board.length; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          const color = COLORS[board[r][c]] || "gray"; // Use type to get color
          // Adjust y-coordinate for drawing since board includes hidden rows
          this.drawBlock(this.gameCtx, c, r - HIDDEN_ROWS, color);
        }
      }
    }
  }

  // Draw a piece (used for current piece, ghost piece, next pieces, and hold piece)
  drawPiece(
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

  // Draw the currently active piece
  drawCurrentPiece(currentPiece, currentX, currentY, ghostY) {
    if (!currentPiece) return;

    // Draw Ghost Piece first
    // Adjust y-coordinate for drawing ghost piece in visible area
    this.drawPiece(this.gameCtx, currentPiece, currentX, ghostY - HIDDEN_ROWS, true);

    // Draw Actual Piece
    // Adjust y-coordinate for drawing current piece in visible area
    this.drawPiece(this.gameCtx, currentPiece, currentX, currentY - HIDDEN_ROWS);
  }

  // Draw the hold piece display
  drawHoldPiece(holdPiece) {
    this.holdCtx.clearRect(0, 0, this.holdCanvas.width, this.holdCanvas.height);
    if (holdPiece) {
      const pieceData = {
        shape: SHAPES[holdPiece],
        color: COLORS[holdPiece],
      };
      const previewBlockSize = this.holdCanvas.width / 5; // Smaller blocks for preview
      const shape = pieceData.shape;
      // Calculate offset to center the piece
      const offsetX = (this.holdCanvas.width / previewBlockSize - shape[0].length) / 2;
      const offsetY = (this.holdCanvas.height / previewBlockSize - shape.length) / 2;
      this.drawPiece(
        this.holdCtx,
        pieceData,
        offsetX,
        offsetY,
        false,
        true,
        previewBlockSize
      );
    }
  }

  // Draw the next pieces queue
  drawNextQueue(nextQueue, nextQueueSize) {
    this.nextCtx.clearRect(0, 0, this.nextCanvas.width, this.nextCanvas.height);
    const previewBlockSize = this.nextCanvas.width / 5; // Smaller blocks for preview
    let yOffset = 0.5; // Initial y offset

    for (let i = 0; i < Math.min(nextQueue.length, nextQueueSize); i++) {
      // Show up to nextQueueSize next pieces
      const pieceType = nextQueue[i];
      const pieceData = {
        shape: SHAPES[pieceType],
        color: COLORS[pieceType],
      };
      const shape = pieceData.shape;
      const offsetX = (this.nextCanvas.width / previewBlockSize - shape[0].length) / 2;

      this.drawPiece(
        this.nextCtx,
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

  // Draw the opponent's board
  drawOpponentBoard(opponentBoard) {
    this.opponentCtx.clearRect(0, 0, this.opponentCanvas.width, this.opponentCanvas.height);

    // Draw grid lines (optional, lighter)
    this.opponentCtx.strokeStyle = "#eee";
    for (let r = 0; r < OPPONENT_ROWS; r++) {
      for (let c = 0; c < OPPONENT_COLS; c++) {
        this.opponentCtx.strokeRect(
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
          this.drawBlock(
            this.opponentCtx,
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

  // Draw the pending garbage indicator
  drawPendingGarbageIndicator(incomingGarbageLines) {
    const barX = -10; // Position to the left of the board
    const barWidth = 8;
    const barMaxHeight = this.gameCanvas.height - 20; // Leave some padding
    const barHeight = Math.min(
      barMaxHeight,
      incomingGarbageLines * (BLOCK_SIZE / 2)
    ); // Scale height

    // Clear previous indicator area
    this.gameCtx.clearRect(barX - 2, 0, barWidth + 4, this.gameCanvas.height);

    if (incomingGarbageLines > 0) {
      this.gameCtx.fillStyle = "red";
      this.gameCtx.fillRect(
        barX,
        this.gameCanvas.height - barHeight,
        barWidth,
        barHeight
      );
    }
  }
}
