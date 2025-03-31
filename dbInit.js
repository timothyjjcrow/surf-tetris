// dbInit.js - Script to initialize the database
const fs = require('fs');
const path = require('path');
const { pool } = require('./dbConfig');

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Setting up database tables...');
    
    // Read SQL schema file
    const schemaPath = path.join(__dirname, 'dbSchema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema SQL
    await client.query(schemaSql);
    
    console.log('Database tables created successfully.');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { initializeDatabase };
