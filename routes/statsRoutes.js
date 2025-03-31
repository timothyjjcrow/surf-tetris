// statsRoutes.js - Routes for game statistics and leaderboard
const express = require('express');
const gameStatsModel = require('../models/gameStatsModel');
const { authenticateToken } = require('./authRoutes');

const router = express.Router();

// Get leaderboard
router.get('/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await gameStatsModel.getLeaderboard(limit, offset);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result.leaderboard);
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Get player match history
router.get('/match-history', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    const result = await gameStatsModel.getPlayerMatchHistory(userId, limit, offset);
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json(result.matches);
  } catch (error) {
    console.error('Match history fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch match history' });
  }
});

// Record match result (internal API - not directly exposed)
// This will be called from the game server when a match ends
router.post('/record-match', async (req, res) => {
  try {
    const { 
      player1Id, player2Id, winnerId,
      player1Score, player2Score,
      player1Lines, player2Lines,
      duration, roomId
    } = req.body;
    
    // Basic validation
    if (!player1Id || !player2Id || !winnerId) {
      return res.status(400).json({ error: 'Missing required player information' });
    }
    
    const matchData = {
      player1_score: player1Score || 0,
      player2_score: player2Score || 0,
      player1_lines: player1Lines || 0,
      player2_lines: player2Lines || 0,
      duration: duration || 0,
      room_id: roomId
    };
    
    const result = await gameStatsModel.recordMatchResult(
      player1Id, player2Id, winnerId, matchData
    );
    
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    
    res.json({ 
      message: 'Match recorded successfully',
      player1EloChange: result.player1EloChange,
      player2EloChange: result.player2EloChange
    });
  } catch (error) {
    console.error('Match recording error:', error);
    res.status(500).json({ error: 'Failed to record match' });
  }
});

module.exports = router;
