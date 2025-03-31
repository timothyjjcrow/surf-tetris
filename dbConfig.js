// dbConfig.js - PostgreSQL configuration 
const { Pool } = require('pg');

// Load environment variables
try {
  require('dotenv').config();
} catch (err) {
  console.log('No .env file found, using environment variables directly');
}

// Database connection configuration
// These values will be replaced with the PostgreSQL credentials from Render
const pool = new Pool({
  user: process.env.DB_USER || 'tetris_db_qyqp_user',
  host: process.env.DB_HOST || 'dpg-cvlgii49c44c73e2jal0-a',
  database: process.env.DB_NAME || 'tetris_db_qyqp',
  password: process.env.DB_PASSWORD, // This should be set in environment variables on Render
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test the connection
pool.connect((err, client, done) => {
  if (err) {
    console.error('Error connecting to the database:', err);
  } else {
    console.log('Successfully connected to PostgreSQL database');
    done();
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
