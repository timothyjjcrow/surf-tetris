// Migration script to add APM columns to existing database
const { Pool } = require('pg');
const dbConfig = require('../dbConfig');

async function runMigration() {
  const client = await dbConfig.pool.connect();
  
  try {
    console.log('Starting APM columns migration...');
    
    // Start a transaction
    await client.query('BEGIN');
    
    // Add APM columns to player_stats if they don't exist
    console.log('Adding APM columns to player_stats table...');
    await client.query(`
      DO $$
      BEGIN
        -- Add highest_apm column if it doesn't exist
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'player_stats' AND column_name = 'highest_apm'
        ) THEN
          ALTER TABLE player_stats ADD COLUMN highest_apm INTEGER DEFAULT 0;
          RAISE NOTICE 'Added highest_apm column to player_stats';
        ELSE
          RAISE NOTICE 'highest_apm column already exists in player_stats';
        END IF;

        -- Add avg_apm column if it doesn't exist
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'player_stats' AND column_name = 'avg_apm'
        ) THEN
          ALTER TABLE player_stats ADD COLUMN avg_apm INTEGER DEFAULT 0;
          RAISE NOTICE 'Added avg_apm column to player_stats';
        ELSE
          RAISE NOTICE 'avg_apm column already exists in player_stats';
        END IF;
      END $$;
    `);

    // Add APM columns to match_history if they don't exist
    console.log('Adding APM columns to match_history table...');
    await client.query(`
      DO $$
      BEGIN
        -- Add player1_apm column if it doesn't exist
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'match_history' AND column_name = 'player1_apm'
        ) THEN
          ALTER TABLE match_history ADD COLUMN player1_apm INTEGER DEFAULT 0;
          RAISE NOTICE 'Added player1_apm column to match_history';
        ELSE
          RAISE NOTICE 'player1_apm column already exists in match_history';
        END IF;

        -- Add player2_apm column if it doesn't exist
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'match_history' AND column_name = 'player2_apm'
        ) THEN
          ALTER TABLE match_history ADD COLUMN player2_apm INTEGER DEFAULT 0;
          RAISE NOTICE 'Added player2_apm column to match_history';
        ELSE
          RAISE NOTICE 'player2_apm column already exists in match_history';
        END IF;
      END $$;
    `);

    // Commit the transaction
    await client.query('COMMIT');
    console.log('Migration completed successfully!');
    
    return { success: true, message: 'APM columns added successfully' };
  } catch (error) {
    // Rollback the transaction if there's an error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    return { success: false, error: error.message };
  } finally {
    client.release();
  }
}

// Run the migration if this script is executed directly
if (require.main === module) {
  runMigration()
    .then(result => {
      console.log(result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Unexpected error:', err);
      process.exit(1);
    });
}

module.exports = { runMigration };
