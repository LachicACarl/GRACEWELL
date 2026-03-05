const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const db = require('./database');

const pickAccount = (employee) => {
  if (!employee) return null;
  if (Array.isArray(employee.user_accounts)) {
    return employee.user_accounts[0] || null;
  }
  return employee.user_accounts || null;
};

const getEmployeeByCode = async (employeeCode) => {
  const normalizedCode = String(employeeCode || '').trim();
  if (!normalizedCode) {
    return { employee: null, account: null, roleName: null, departmentName: null };
  }

  const { data, error } = await db
    .from('employees')
    .select('employee_id, employee_code, first_name, middle_name, last_name, email_address, contact_number, profile_image_url, position, record_status, department_id, departments:department_id(department_name), user_accounts (user_id, username, password_hash, role_id, account_status, last_login, roles:role_id(role_name))')
    .ilike('employee_code', normalizedCode)
    .single();

  if (error || !data) {
    console.log('❌ Query error:', error);
    return { employee: null, account: null, roleName: null, departmentName: null };
  }

  console.log('✅ Employee data found:', {
    employee_code: data.employee_code,
    record_status: data.record_status,
    user_accounts: data.user_accounts
  });

  const account = pickAccount(data);
  const roleName = account?.roles?.role_name || null;
  const departmentName = data.departments?.department_name || null;

  console.log('✅ Account info:', {
    account_status: account?.account_status,
    role: roleName,
    has_password_hash: !!account?.password_hash
  });

  return { employee: data, account, roleName, departmentName };
};

async function testLoginFlow() {
  console.log('Testing login flow for GW001...\n');
  
  const { employee, account, roleName } = await getEmployeeByCode('GW001');
  
  if (!employee || !account || !roleName) {
    console.log('❌ Login would fail: Missing employee/account/role');
    return;
  }

  if (account.account_status && account.account_status.toUpperCase() !== 'ACTIVE') {
    console.log('❌ Login would fail: Account not ACTIVE, status is:', account.account_status);
    return;
  }

  console.log('\n✅ Pre-checks pass, now testing password...');
  
  const password = 'admin123';
  const passwordValid = await bcrypt.compare(password, account.password_hash);
  
  console.log('Password valid:', passwordValid);
  
  if (passwordValid && roleName !== 'employee') {
    console.log('✅ Login should succeed!');
    console.log('Would return token for:', { employee_code: employee.employee_code, role: roleName });
  }
}

testLoginFlow();
