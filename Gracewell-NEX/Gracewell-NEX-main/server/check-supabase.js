const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkTables() {
  console.log('Checking Supabase tables...\n');

  const tables = [
    'departments',
    'roles',
    'employees',
    'user_accounts',
    'qr_codes',
    'attendance_scans',
    'attendance',
    'attendance_issues',
    'salary_records',
    'salary_receipts',
    'audit_logs'
  ];

  let hasError = false;

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .select('*')
      .limit(1);

    if (error) {
      hasError = true;
      console.log(`❌ ${table} table error:`, error.message);
    } else {
      console.log(`✅ ${table} table exists`);
    }
  }

  console.log('\n📋 Next steps:');
  if (hasError) {
    console.log('1. Go to your Supabase dashboard: https://tthysazhswsmgcebeubg.supabase.co');
    console.log('2. Click on "SQL Editor" in the left sidebar');
    console.log('3. Copy and paste the contents of supabase-schema.sql');
    console.log('4. Click "Run" to create the tables');
  } else {
    console.log('✅ All tables exist! You can proceed with the seed and server start.');
  }
}

checkTables();
