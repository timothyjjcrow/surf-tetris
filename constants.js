// constants.js - Game constants and configuration

// --- Game Constants ---
export const COLS = 10;
export const ROWS = 20;
export const BLOCK_SIZE = 24; // Size of each block in pixels
export const HIDDEN_ROWS = 2; // Buffer rows above visible area
export const TOTAL_ROWS = ROWS + HIDDEN_ROWS;
export const NEXT_QUEUE_SIZE = 4;
export const PREVIEW_BOX_SIZE = 4; // Size of next/hold box in blocks (e.g., 4x4)

// Opponent display constants
export const OPPONENT_COLS = 10;
export const OPPONENT_ROWS = 20;
export const OPPONENT_HIDDEN_ROWS = 2; // Match main board's hidden rows
export const OPPONENT_TOTAL_ROWS = OPPONENT_ROWS + OPPONENT_HIDDEN_ROWS;
export const OPPONENT_BLOCK_SIZE = 12; // Make opponent blocks smaller

// Game timing constants
export const LOCK_DELAY = 500; // ms
export const INITIAL_DROP_INTERVAL = 1000; // Milliseconds per downward step

// --- Colors ---
export const COLORS = {
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
export const SHAPES = {
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
export const SRS_KICKS = {
  // J, L, S, T, Z kicks (Common)
  JLSTZ: {
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
    ], 
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
    ],
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
    ],
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
    ],
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
    ],
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
    ],
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
    ],
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
    ],
  },
  // O piece does not rotate / kick
};

// Scoring system
export const SCORING = {
  LINES: [0, 100, 300, 500, 800],
  SOFT_DROP: 1,
  HARD_DROP: 2
};

// Power-up attack constants
export const SPEEDUP_LINES_THRESHOLD = 4; // Number of lines needed to trigger speed up attack
export const SPEEDUP_DURATION = 12000; // Increased from 10000 - Speed up duration in milliseconds
export const SPEEDUP_FACTOR = 2.5; // Increased from 2.0 - How much faster opponent's pieces drop
export const SPEEDUP_NOTIFICATION_DURATION = 3000; // How long the notification displays

// Scramble attack constants
export const SCRAMBLE_INTENSITY = 20; // Increased from 15 for more powerful effect
export const SCRAMBLE_NOTIFICATION_DURATION = 3000; // How long the notification displays
