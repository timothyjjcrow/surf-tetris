// resetDb.js - Script to reset database tables while preserving schema
const db = require('../dbConfig');
const readline = require('readline');

// Create a readline interface for user confirmation
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Reset specific tables without dropping them
async function resetDatabaseTables() {
  console.log('WARNING: This will delete ALL users and game stats data.');
  
  rl.question('Are you sure you want to continue? (yes/no): ', async (answer) => {
    if (answer.toLowerCase() !== 'yes') {
      console.log('Database reset cancelled.');
      rl.close();
      return;
    }
    
    const client = await db.pool.connect();
    
    try {
      console.log('Starting database reset...');
      
      // Start a transaction
      await client.query('BEGIN');
      
      // Truncate tables with dependencies in the correct order
      await client.query('TRUNCATE match_history CASCADE');
      await client.query('TRUNCATE player_stats CASCADE');
      await client.query('TRUNCATE users CASCADE');
      
      // Reset the autoincrement sequences
      await client.query('ALTER SEQUENCE users_id_seq RESTART WITH 1');
      
      // Create a default admin user
      const adminPassword = 'admin123'; // Change this in production!
      await client.query(
        'INSERT INTO users (username, email, password) VALUES ($1, $2, $3)',
        ['admin', 'admin@example.com', adminPassword]
      );
      
      console.log('Created default admin user (username: admin, password: admin123)');
      
      // Commit the transaction
      await client.query('COMMIT');
      console.log('Database reset completed successfully!');
    } catch (error) {
      // Rollback the transaction if there's an error
      await client.query('ROLLBACK');
      console.error('Error resetting database:', error);
    } finally {
      client.release();
      rl.close();
    }
  });
}

// Run the reset function
resetDatabaseTables();
