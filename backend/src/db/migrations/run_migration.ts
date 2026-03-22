import fs from 'fs';
import path from 'path';
import pool from '../../config/database.js';

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Starting migration...');
    
    // Read the migration file
    const migrationPath = path.join(process.cwd(), 'src', 'db', 'migrations', 'create_resumes_table.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Begin transaction
    await client.query('BEGIN');

    // Execute the migration
    await client.query(migrationSQL);

    // Commit transaction
    await client.query('COMMIT');
    
    console.log('Migration completed successfully!');
  } catch (error) {
    // Rollback in case of error
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration process completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration process failed:', error);
    process.exit(1);
  }); 