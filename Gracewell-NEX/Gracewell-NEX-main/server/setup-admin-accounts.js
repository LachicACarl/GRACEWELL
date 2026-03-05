const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function setupAdminAccounts() {
  try {
    console.log('Setting up admin accounts...\n');

    // Get IT department ID (create if doesn't exist)
    let { data: dept } = await db
      .from('departments')
      .select('department_id')
      .eq('department_name', 'IT')
      .maybeSingle();

    if (!dept) {
      const { data: newDept } = await db
        .from('departments')
        .insert({ department_name: 'IT' })
        .select('department_id')
        .single();
      dept = newDept;
    }

    const departmentId = dept.department_id;

    // Get role IDs
    const { data: superAdminRole } = await db
      .from('roles')
      .select('role_id')
      .eq('role_name', 'super_admin')
      .single();

    const { data: adminRole } = await db
      .from('roles')
      .select('role_id')
      .eq('role_name', 'admin')
      .single();

    if (!superAdminRole || !adminRole) {
      console.error('✗ Required roles not found in database');
      process.exit(1);
    }

    // ===== GW001 - Super Admin =====
    let { data: gw001Employee } = await db
      .from('employees')
      .select('employee_id')
      .eq('employee_code', 'GW001')
      .maybeSingle();

    if (!gw001Employee) {
      const { data: newEmp } = await db
        .from('employees')
        .insert({
          employee_code: 'GW001',
          first_name: 'Super',
          last_name: 'Admin',
          email_address: 'superadmin@gracewell.com',
          contact_number: '09123456789',
          position: 'Super Administrator',
          department_id: departmentId,
          record_status: 'Active',
          hire_date: new Date().toISOString().split('T')[0],
          email_verified_at: new Date().toISOString()
        })
        .select('employee_id')
        .single();
      gw001Employee = newEmp;
      console.log('✓ Created employee GW001');
    } else {
      console.log('✓ Employee GW001 exists');
    }

    // Update or create GW001 user account as super_admin
    const { data: gw001Account } = await db
      .from('user_accounts')
      .select('user_id')
      .eq('employee_id', gw001Employee.employee_id)
      .maybeSingle();

    const password123Hash = await bcrypt.hash('password123', 10);

    if (gw001Account) {
      await db
        .from('user_accounts')
        .update({
          username: 'GW001',
          role_id: superAdminRole.role_id,
          account_status: 'ACTIVE',
          password_hash: password123Hash
        })
        .eq('user_id', gw001Account.user_id);
      console.log('✓ Updated GW001 account to super_admin');
    } else {
      await db
        .from('user_accounts')
        .insert({
          employee_id: gw001Employee.employee_id,
          username: 'GW001',
          role_id: superAdminRole.role_id,
          account_status: 'ACTIVE',
          password_hash: password123Hash,
          date_created: new Date().toISOString()
        });
      console.log('✓ Created GW001 account as super_admin');
    }

    // ===== GW002 - Admin =====
    let { data: gw002Employee } = await db
      .from('employees')
      .select('employee_id')
      .eq('employee_code', 'GW002')
      .maybeSingle();

    if (!gw002Employee) {
      const { data: newEmp } = await db
        .from('employees')
        .insert({
          employee_code: 'GW002',
          first_name: 'Admin',
          last_name: 'User',
          email_address: 'admin@gracewell.com',
          contact_number: '09123456789',
          position: 'Administrator',
          department_id: departmentId,
          record_status: 'Active',
          hire_date: new Date().toISOString().split('T')[0],
          email_verified_at: new Date().toISOString()
        })
        .select('employee_id')
        .single();
      gw002Employee = newEmp;
      console.log('✓ Created employee GW002');
    } else {
      console.log('✓ Employee GW002 exists');
    }

    // Update or create GW002 user account as admin
    const { data: gw002Account } = await db
      .from('user_accounts')
      .select('user_id')
      .eq('employee_id', gw002Employee.employee_id)
      .maybeSingle();

    if (gw002Account) {
      await db
        .from('user_accounts')
        .update({
          username: 'GW002',
          role_id: adminRole.role_id,
          account_status: 'ACTIVE',
          password_hash: password123Hash
        })
        .eq('user_id', gw002Account.user_id);
      console.log('✓ Updated GW002 account to admin');
    } else {
      await db
        .from('user_accounts')
        .insert({
          employee_id: gw002Employee.employee_id,
          username: 'GW002',
          role_id: adminRole.role_id,
          account_status: 'ACTIVE',
          password_hash: password123Hash,
          date_created: new Date().toISOString()
        });
      console.log('✓ Created GW002 account as admin');
    }

    console.log('\n✅ ADMIN ACCOUNTS CONFIGURED\n');
    console.log('Login credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('GW001 / password123  → Super Admin');
    console.log('GW002 / password123  → Admin');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (err) {
    console.error('✗ Error:', err.message || err);
    process.exit(1);
  }
}

setupAdminAccounts();
