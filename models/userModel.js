// userModel.js - Database operations for user management
const db = require('../dbConfig');
const bcrypt = require('bcrypt');

const saltRounds = 10;

// User management functions
const userModel = {
  // Create a new user
  async createUser(username, email, password) {
    try {
      // Hash the password
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Insert user into the database
      const userResult = await db.query(
        'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [username, email, passwordHash]
      );
      
      const userId = userResult.rows[0].id;
      
      // Initialize player stats
      await db.query(
        'INSERT INTO player_stats (user_id) VALUES ($1)',
        [userId]
      );
      
      return { success: true, userId };
    } catch (error) {
      console.error('Error creating user:', error);
      
      // Handle duplicate username/email errors
      if (error.code === '23505') { // PostgreSQL unique violation code
        if (error.constraint.includes('username')) {
          return { success: false, error: 'Username already exists' };
        } else if (error.constraint.includes('email')) {
          return { success: false, error: 'Email already in use' };
        }
      }
      
      return { success: false, error: 'Failed to create user' };
    }
  },
  
  // Verify login credentials
  async loginUser(username, password) {
    try {
      const result = await db.query(
        'SELECT id, username, password_hash FROM users WHERE username = $1',
        [username]
      );
      
      if (result.rows.length === 0) {
        return { success: false, error: 'User not found' };
      }
      
      const user = result.rows[0];
      const passwordMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!passwordMatch) {
        return { success: false, error: 'Invalid password' };
      }
      
      // Update last login time
      await db.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );
      
      return { 
        success: true, 
        userId: user.id,
        username: user.username 
      };
    } catch (error) {
      console.error('Error logging in:', error);
      return { success: false, error: 'Login failed' };
    }
  },
  
  // Get user profile with stats
  async getUserProfile(userId) {
    try {
      const result = await db.query(
        `SELECT 
          u.username, u.email, u.created_at,
          ps.elo_rating, ps.wins, ps.losses, ps.games_played,
          ps.highest_score, ps.most_lines_cleared
        FROM users u
        JOIN player_stats ps ON u.id = ps.user_id
        WHERE u.id = $1`,
        [userId]
      );
      
      if (result.rows.length === 0) {
        return { success: false, error: 'User not found' };
      }
      
      return { success: true, profile: result.rows[0] };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return { success: false, error: 'Failed to fetch profile' };
    }
  }
};

module.exports = userModel;
