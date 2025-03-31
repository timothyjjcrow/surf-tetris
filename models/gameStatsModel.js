// gameStatsModel.js - Handle game statistics and ELO calculations
const db = require('../dbConfig');

// ELO rating calculation constants
const K_FACTOR = 32; // Standard K-factor for ELO calculations
const BASE_RATING = 1200; // Starting rating for new players

const gameStatsModel = {
  // Calculate ELO rating changes
  calculateEloChange(winnerRating, loserRating) {
    // Calculate expected outcomes based on current ratings
    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));
    
    // Calculate rating changes
    const winnerChange = Math.round(K_FACTOR * (1 - expectedWinner));
    const loserChange = Math.round(K_FACTOR * (0 - expectedLoser));
    
    return { winnerChange, loserChange };
  },
  
  // Record match results and update player stats
  async recordMatchResult(player1Id, player2Id, winnerId, matchData) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current player stats
      const player1StatsResult = await client.query(
        'SELECT elo_rating, wins, losses FROM player_stats WHERE user_id = $1',
        [player1Id]
      );
      
      const player2StatsResult = await client.query(
        'SELECT elo_rating, wins, losses FROM player_stats WHERE user_id = $1',
        [player2Id]
      );
      
      // Initialize player stats if they don't exist
      if (player1StatsResult.rows.length === 0) {
        console.log(`Creating new player stats for player1 (${player1Id})`);
        await client.query(
          'INSERT INTO player_stats (user_id, elo_rating, wins, losses) VALUES ($1, 1200, 0, 0)',
          [player1Id]
        );
        player1StatsResult.rows = [{ elo_rating: 1200, wins: 0, losses: 0 }];
      }
      
      if (player2StatsResult.rows.length === 0) {
        console.log(`Creating new player stats for player2 (${player2Id})`);
        await client.query(
          'INSERT INTO player_stats (user_id, elo_rating, wins, losses) VALUES ($1, 1200, 0, 0)',
          [player2Id]
        );
        player2StatsResult.rows = [{ elo_rating: 1200, wins: 0, losses: 0 }];
      }
      
      const player1Stats = player1StatsResult.rows[0];
      const player2Stats = player2StatsResult.rows[0];
      
      // Calculate ELO changes
      let player1EloChange, player2EloChange;
      
      if (winnerId === player1Id) {
        const eloChanges = this.calculateEloChange(player1Stats.elo_rating, player2Stats.elo_rating);
        player1EloChange = eloChanges.winnerChange;
        player2EloChange = eloChanges.loserChange;
      } else {
        const eloChanges = this.calculateEloChange(player2Stats.elo_rating, player1Stats.elo_rating);
        player1EloChange = eloChanges.loserChange;
        player2EloChange = eloChanges.winnerChange;
      }
      
      // Update player1 stats
      await client.query(
        `UPDATE player_stats SET 
          elo_rating = elo_rating + $1,
          wins = CASE WHEN $2 = $3 THEN wins + 1 ELSE wins END,
          losses = CASE WHEN $2 != $3 THEN losses + 1 ELSE losses END,
          games_played = games_played + 1,
          highest_score = GREATEST(highest_score, $4),
          most_lines_cleared = GREATEST(most_lines_cleared, $5)
        WHERE user_id = $2`,
        [player1EloChange, player1Id, winnerId, matchData.player1_score, matchData.player1_lines]
      );
      
      // Update player2 stats
      await client.query(
        `UPDATE player_stats SET 
          elo_rating = elo_rating + $1,
          wins = CASE WHEN $2 = $3 THEN wins + 1 ELSE wins END,
          losses = CASE WHEN $2 != $3 THEN losses + 1 ELSE losses END,
          games_played = games_played + 1,
          highest_score = GREATEST(highest_score, $4),
          most_lines_cleared = GREATEST(most_lines_cleared, $5)
        WHERE user_id = $2`,
        [player2EloChange, player2Id, winnerId, matchData.player2_score, matchData.player2_lines]
      );
      
      // Record match in history
      await client.query(
        `INSERT INTO match_history (
          player1_id, player2_id, winner_id, 
          player1_score, player2_score, 
          player1_lines, player2_lines,
          player1_elo_change, player2_elo_change,
          match_duration, room_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          player1Id, player2Id, winnerId,
          matchData.player1_score, matchData.player2_score,
          matchData.player1_lines, matchData.player2_lines,
          player1EloChange, player2EloChange,
          matchData.duration, matchData.room_id
        ]
      );
      
      await client.query('COMMIT');
      
      return { 
        success: true, 
        player1EloChange, 
        player2EloChange 
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error recording match result:', error);
      return { success: false, error: 'Failed to record match result' };
    } finally {
      client.release();
    }
  },
  
  // Get leaderboard data
  async getLeaderboard(limit = 10, offset = 0) {
    try {
      const result = await db.query(
        `SELECT 
          u.id, u.username, 
          ps.elo_rating, ps.wins, ps.losses, ps.games_played,
          CASE WHEN ps.games_played > 0 THEN
            ROUND((ps.wins::FLOAT / ps.games_played) * 100)
          ELSE 0 END as win_percentage
        FROM player_stats ps
        JOIN users u ON ps.user_id = u.id
        ORDER BY ps.elo_rating DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      
      return { success: true, leaderboard: result.rows };
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      return { success: false, error: 'Failed to fetch leaderboard' };
    }
  },
  
  // Get player match history
  async getPlayerMatchHistory(userId, limit = 10, offset = 0) {
    try {
      const result = await db.query(
        `SELECT 
          mh.id, mh.match_date, mh.player1_score, mh.player2_score,
          mh.player1_lines, mh.player2_lines, mh.player1_elo_change, mh.player2_elo_change,
          u1.username as player1_username, u2.username as player2_username,
          CASE WHEN mh.winner_id = $1 THEN true ELSE false END as player_won
        FROM match_history mh
        JOIN users u1 ON mh.player1_id = u1.id
        JOIN users u2 ON mh.player2_id = u2.id
        WHERE mh.player1_id = $1 OR mh.player2_id = $1
        ORDER BY mh.match_date DESC
        LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      
      return { success: true, matches: result.rows };
    } catch (error) {
      console.error('Error fetching match history:', error);
      return { success: false, error: 'Failed to fetch match history' };
    }
  }
};

module.exports = gameStatsModel;
