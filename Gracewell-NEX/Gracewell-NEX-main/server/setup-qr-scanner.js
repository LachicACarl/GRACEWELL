const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupQRScanner() {
  try {
    console.log('🔧 Setting up QR Scanner role and credentials...\n');

    // 1. Create QR_Scanner role if it doesn't exist
    console.log('1️⃣  Checking QR_Scanner role...');
    const { data: existingRole, error: roleCheckError } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .eq('role_name', 'qr_scanner')
      .limit(1);

    if (roleCheckError) throw roleCheckError;

    let roleId;
    if (existingRole && existingRole.length > 0) {
      roleId = existingRole[0].role_id;
      console.log(`✅ QR_Scanner role already exists (ID: ${roleId})\n`);
    } else {
      const { data: newRole, error: roleInsertError } = await supabase
        .from('roles')
        .insert({ role_name: 'qr_scanner' })
        .select('role_id')
        .single();

      if (roleInsertError) throw roleInsertError;
      roleId = newRole.role_id;
      console.log(`✅ Created QR_Scanner role (ID: ${roleId})\n`);
    }

    // 2. Create QR001 employee if it doesn't exist
    console.log('2️⃣  Checking QR001 employee...');
    const { data: existingEmployee, error: empCheckError } = await supabase
      .from('employees')
      .select('employee_id, employee_code')
      .eq('employee_code', 'QR001')
      .limit(1);

    if (empCheckError) throw empCheckError;

    let employeeId;
    if (existingEmployee && existingEmployee.length > 0) {
      employeeId = existingEmployee[0].employee_id;
      console.log(`✅ QR001 employee already exists (ID: ${employeeId})\n`);
    } else {
      // Get or create IT department
      const { data: deptRows, error: deptError } = await supabase
        .from('departments')
        .select('department_id')
        .eq('department_name', 'IT')
        .limit(1);

      if (deptError) throw deptError;

      let departmentId;
      if (deptRows && deptRows.length > 0) {
        departmentId = deptRows[0].department_id;
      } else {
        const { data: newDept, error: deptInsertError } = await supabase
          .from('departments')
          .insert({ department_name: 'IT' })
          .select('department_id')
          .single();

        if (deptInsertError) throw deptInsertError;
        departmentId = newDept.department_id;
      }

      const { data: newEmployee, error: empInsertError } = await supabase
        .from('employees')
        .insert({
          employee_code: 'QR001',
          first_name: 'QR',
          last_name: 'Scanner',
          email_address: 'qr-scanner@gracewell.com',
          position: 'QR Scanner Admin',
          department_id: departmentId,
          record_status: 'Active',
          employment_type: 'Full-time'
        })
        .select('employee_id')
        .single();

      if (empInsertError) throw empInsertError;
      employeeId = newEmployee.employee_id;
      console.log(`✅ Created QR001 employee (ID: ${employeeId})\n`);
    }

    // 3. Create or update user account for QR001
    console.log('3️⃣  Setting up QR001 user account...');
    
    // Check if user account exists
    const { data: existingAccount, error: accountCheckError } = await supabase
      .from('user_accounts')
      .select('user_id, username, account_status')
      .eq('employee_id', employeeId)
      .limit(1);

    if (accountCheckError) throw accountCheckError;

    const qrPassword = process.env.QR_SCANNER_PASSWORD || 'qr123';
    const hashedPassword = bcrypt.hashSync(qrPassword, 10);

    if (existingAccount && existingAccount.length > 0) {
      const accountId = existingAccount[0].user_id;
      // Update existing account
      const { error: updateError } = await supabase
        .from('user_accounts')
        .update({
          username: 'QR001',
          password_hash: hashedPassword,
          role_id: roleId,
          account_status: 'Active'
        })
        .eq('user_id', accountId);

      if (updateError) throw updateError;
      console.log(`✅ Updated QR001 user account (ID: ${accountId})\n`);
    } else {
      // Create new account
      const { data: newAccount, error: accountInsertError } = await supabase
        .from('user_accounts')
        .insert({
          employee_id: employeeId,
          username: 'QR001',
          password_hash: hashedPassword,
          role_id: roleId,
          account_status: 'Active'
        })
        .select('user_id')
        .single();

      if (accountInsertError) throw accountInsertError;
      console.log(`✅ Created QR001 user account (ID: ${newAccount.user_id})\n`);
    }

    console.log('═════════════════════════════════════════');
    console.log('✅ QR Scanner Setup Complete!\n');
    console.log('📋 QR Scanner Login Credentials:');
    console.log('───────────────────────────────────────');
    console.log(`Username: QR001`);
    console.log(`Password: ${qrPassword}`);
    console.log('───────────────────────────────────────');
    console.log('\n🔗 Access URL: http://localhost:3000/qr-scanner-login');
    console.log('═════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Setup Error:', error.message);
    process.exit(1);
  }
}

setupQRScanner();
