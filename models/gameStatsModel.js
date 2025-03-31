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
    let client;
    try {
      console.log('==== RECORDING MATCH RESULT ====');
      console.log(`Player 1 ID: ${player1Id}`);
      console.log(`Player 2 ID: ${player2Id}`);
      console.log(`Winner ID: ${winnerId}`);
      console.log('Match data:', matchData);
      
      client = await db.pool.connect();
      console.log('Connected to database');
      
      await client.query('BEGIN');
      console.log('Transaction started');
      
      // Check if player stats exist and create them if they don't
      // Player 1
      const player1CheckResult = await client.query(
        'SELECT COUNT(*) FROM player_stats WHERE user_id = $1',
        [player1Id]
      );
      
      if (parseInt(player1CheckResult.rows[0].count) === 0) {
        console.log(`Creating new stats record for player ${player1Id}`);
        await client.query(
          'INSERT INTO player_stats (user_id, elo_rating, wins, losses) VALUES ($1, 1200, 0, 0)',
          [player1Id]
        );
      }
      
      // Player 2
      const player2CheckResult = await client.query(
        'SELECT COUNT(*) FROM player_stats WHERE user_id = $1',
        [player2Id]
      );
      
      if (parseInt(player2CheckResult.rows[0].count) === 0) {
        console.log(`Creating new stats record for player ${player2Id}`);
        await client.query(
          'INSERT INTO player_stats (user_id, elo_rating, wins, losses) VALUES ($1, 1200, 0, 0)',
          [player2Id]
        );
      }
      
      // Now get the current stats
      const player1StatsResult = await client.query(
        'SELECT elo_rating, wins, losses FROM player_stats WHERE user_id = $1',
        [player1Id]
      );
      console.log('Player 1 stats retrieved:', player1StatsResult.rows[0]);
      
      const player2StatsResult = await client.query(
        'SELECT elo_rating, wins, losses FROM player_stats WHERE user_id = $1',
        [player2Id]
      );
      console.log('Player 2 stats retrieved:', player2StatsResult.rows[0]);
      
      const player1Stats = player1StatsResult.rows[0];
      const player2Stats = player2StatsResult.rows[0];
      
      // Calculate ELO changes
      let player1EloChange, player2EloChange;
      
      if (winnerId === player1Id) {
        const eloChanges = this.calculateEloChange(player1Stats.elo_rating, player2Stats.elo_rating);
        player1EloChange = eloChanges.winnerChange;
        player2EloChange = eloChanges.loserChange;
        console.log(`Player 1 won. ELO change: +${player1EloChange}, Player 2: ${player2EloChange}`);
      } else {
        const eloChanges = this.calculateEloChange(player2Stats.elo_rating, player1Stats.elo_rating);
        player1EloChange = eloChanges.loserChange;
        player2EloChange = eloChanges.winnerChange;
        console.log(`Player 2 won. ELO change: Player 1: ${player1EloChange}, Player 2: +${player2EloChange}`);
      }
      
      // Update player1 stats
      await client.query(
        'UPDATE player_stats SET elo_rating = $1, wins = $2, losses = $3 WHERE user_id = $4',
        [
          player1Stats.elo_rating + player1EloChange,
          winnerId === player1Id ? player1Stats.wins + 1 : player1Stats.wins,
          winnerId !== player1Id ? player1Stats.losses + 1 : player1Stats.losses,
          player1Id
        ]
      );
      console.log('Player 1 stats updated');
      
      // Update player2 stats
      await client.query(
        'UPDATE player_stats SET elo_rating = $1, wins = $2, losses = $3 WHERE user_id = $4',
        [
          player2Stats.elo_rating + player2EloChange,
          winnerId === player2Id ? player2Stats.wins + 1 : player2Stats.wins,
          winnerId !== player2Id ? player2Stats.losses + 1 : player2Stats.losses,
          player2Id
        ]
      );
      console.log('Player 2 stats updated');
      
      // Record the match in match_history
      await client.query(
        `INSERT INTO match_history 
         (winner_id, loser_id, winner_score, loser_score, winner_lines, loser_lines, winner_elo_change, loser_elo_change, match_date) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          winnerId,
          winnerId === player1Id ? player2Id : player1Id,
          matchData.winnerScore,
          matchData.loserScore,
          matchData.winnerLines,
          matchData.loserLines,
          winnerId === player1Id ? player1EloChange : player2EloChange,
          winnerId === player1Id ? player2EloChange : player1EloChange
        ]
      );
      console.log('Match recorded in history');
      
      await client.query('COMMIT');
      console.log('Transaction committed successfully');
      
      return { success: true };
    } catch (error) {
      console.error('Error recording match result:', error);
      try {
        if (client) await client.query('ROLLBACK');
        console.log('Transaction rolled back due to error');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
      return { success: false, error: error.message };
    } finally {
      if (client) client.release();
      console.log('Database client released');
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
