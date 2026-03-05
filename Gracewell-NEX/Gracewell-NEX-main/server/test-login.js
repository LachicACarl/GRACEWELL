const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testLogin() {
  console.log('Testing login for SA001...\n');
  
  const { data: employee, error } = await supabase
    .from('employees')
    .select('employee_id, employee_code, first_name, last_name, record_status, user_accounts (user_id, username, password_hash, account_status, roles:role_id(role_name))')
    .eq('employee_code', 'SA001')
    .single();
  
  if (error) {
    console.log('❌ Error:', error);
    return;
  }
  
  if (!employee) {
    console.log('❌ User not found');
    return;
  }
  
  const account = Array.isArray(employee.user_accounts)
    ? employee.user_accounts[0]
    : employee.user_accounts;
  console.log('✅ User found:', {
    employee_id: employee.employee_code,
    name: `${employee.first_name} ${employee.last_name}`.trim(),
    role: account?.roles?.role_name,
    record_status: employee.record_status,
    account_status: account?.account_status,
    has_password_hash: !!account?.password_hash
  });
  
  // Test password
  const password = 'admin123';
  const passwordValid = account?.password_hash
    ? await bcrypt.compare(password, account.password_hash)
    : false;
  
  console.log('\n🔑 Password test:');
  console.log('  Password provided: admin123');
  console.log('  Password valid:', passwordValid);
  
  if (!passwordValid) {
    console.log('\n⚠️  The password hash in the database might be incorrect.');
    console.log('  Generating correct hash for "admin123":');
    const correctHash = await bcrypt.hash('admin123', 10);
    console.log('  Hash:', correctHash);
  }
}

testLogin();
