const path = require('path');
const fs = require('fs');
const db = require('./database');

async function runMigration() {
  console.log('Running email_verified_at column migration...');
  
  try {
    // Read the SQL file
    const sql = fs.readFileSync(path.join(__dirname, 'add-email-verified-column.sql'), 'utf8');
    
    // Execute using Supabase rpc or direct SQL
    const { data, error } = await db.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('Migration error:', error);
      console.log('\nPlease run this SQL manually in Supabase SQL Editor:');
      console.log(sql);
      process.exit(1);
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('email_verified_at column added to employees table');
    
  } catch (err) {
    console.error('Migration failed:', err.message);
    console.log('\n📋 Please run this SQL manually in your Supabase Dashboard > SQL Editor:');
    console.log('\n' + fs.readFileSync(path.join(__dirname, 'add-email-verified-column.sql'), 'utf8'));
  }
  
  process.exit(0);
}

runMigration();
