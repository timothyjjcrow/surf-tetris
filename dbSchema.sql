-- Database Schema for Tetris Game

-- Users table for authentication and profile information
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP WITH TIME ZONE
);

-- Player stats table for tracking game performance and ELO
CREATE TABLE IF NOT EXISTS player_stats (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  elo_rating INTEGER DEFAULT 1200,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  highest_score INTEGER DEFAULT 0,
  most_lines_cleared INTEGER DEFAULT 0,
  PRIMARY KEY (user_id)
);

-- Game matches history
CREATE TABLE IF NOT EXISTS match_history (
  id SERIAL PRIMARY KEY,
  player1_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  player2_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  player1_score INTEGER DEFAULT 0,
  player2_score INTEGER DEFAULT 0,
  player1_lines INTEGER DEFAULT 0,
  player2_lines INTEGER DEFAULT 0,
  player1_elo_change INTEGER DEFAULT 0,
  player2_elo_change INTEGER DEFAULT 0,
  match_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  match_duration INTEGER, -- in seconds
  room_id VARCHAR(50)
);

-- Create index for faster leaderboard queries
CREATE INDEX IF NOT EXISTS idx_elo_rating ON player_stats(elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_match_date ON match_history(match_date DESC);
