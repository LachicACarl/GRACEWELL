const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkUsers() {
  console.log('Checking users in Supabase...\n');
  
  const { data: employees, error } = await supabase
    .from('employees')
    .select('employee_code, first_name, last_name, record_status, user_accounts (account_status, roles:role_id(role_name))')
    .order('employee_code');
  
  if (error) {
    console.log('❌ Error:', error.message);
    return;
  }
  
  if (!employees || employees.length === 0) {
    console.log('❌ No users found in database!');
    console.log('\n📋 You need to seed the database with default users.');
    console.log('Run: node database.js to initialize default users');
  } else {
    console.log(`✅ Found ${employees.length} users:`);
    employees.forEach(emp => {
      const account = Array.isArray(emp.user_accounts)
        ? emp.user_accounts[0]
        : emp.user_accounts;
      const roleName = account?.roles?.role_name || 'unknown';
      const accountStatus = account?.account_status || 'UNKNOWN';
      const name = `${emp.first_name} ${emp.last_name}`.trim();
      console.log(`  - ${emp.employee_code}: ${name} (${roleName}) - ${emp.record_status}/${accountStatus}`);
    });
  }
}

checkUsers();
