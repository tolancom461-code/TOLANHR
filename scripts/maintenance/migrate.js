import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Connect to the database
const dbPath = join(__dirname, 'workforce.db');
console.log('Connecting to database:', dbPath);

const db = new Database(dbPath);

try {
  console.log('Running migration: Add flexible schedule columns to groups table');
  
  // Add is_flexible_schedule column
  db.exec(`
    ALTER TABLE groups ADD COLUMN is_flexible_schedule BOOLEAN DEFAULT 0;
  `);
  console.log('✓ Added is_flexible_schedule column');
  
  // Add required_hours column
  db.exec(`
    ALTER TABLE groups ADD COLUMN required_hours REAL;
  `);
  console.log('✓ Added required_hours column');
  
  console.log('Migration completed successfully!');
  
  // Verify the columns were added
  const tableInfo = db.prepare('PRAGMA table_info(groups)').all();
  console.log('\nCurrent groups table structure:');
  tableInfo.forEach(col => {
    console.log(`  - ${col.name} (${col.type})`);
  });
  
} catch (error) {
  if (error.message.includes('duplicate column name')) {
    console.log('⚠ Columns already exist, migration not needed');
  } else {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
} finally {
  db.close();
}
