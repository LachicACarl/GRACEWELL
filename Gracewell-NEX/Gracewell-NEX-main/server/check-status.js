const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkStatus() {
  const { data: employees, error } = await supabase
    .from('employees')
    .select('employee_code, record_status, user_accounts (account_status)')
    .limit(5);

  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }

  console.log('Employee statuses:');
  employees.forEach(emp => {
    const accountStatus = emp.user_accounts?.account_status || 'UNKNOWN';
    console.log(`  ${emp.employee_code}: record="${emp.record_status}" account="${accountStatus}"`);
  });
}

checkStatus();
