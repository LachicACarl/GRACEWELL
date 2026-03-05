const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function createTestEmployee() {
  try {
    // Check if GW001 already exists
    const { data: existing } = await supabase
      .from('employees')
      .select('employee_id')
      .eq('employee_code', 'GW001')
      .maybeSingle();

    if (existing) {
      console.log('✓ GW001 already exists');
      process.exit(0);
    }

    // Get or create IT department
    const { data: deptData } = await supabase
      .from('departments')
      .select('department_id')
      .eq('department_name', 'IT')
      .maybeSingle();

    let departmentId = deptData?.department_id;
    if (!departmentId) {
      const { data: newDept } = await supabase
        .from('departments')
        .insert([{ department_name: 'IT' }])
        .select()
        .single();
      departmentId = newDept.department_id;
      console.log('✓ Created IT department');
    }

    // Create test employee
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .insert([{
        employee_code: 'GW001',
        first_name: 'Test',
        last_name: 'Admin',
        email_address: 'test@gracewell.com',
        contact_number: '09123456789',
        position: 'System Administrator',
        department_id: departmentId,
        record_status: 'Active',
        hire_date: new Date().toISOString().split('T')[0]
      }])
      .select()
      .single();

    if (empError) {
      console.error('✗ Error creating employee:', empError.message);
      process.exit(1);
    }

    console.log('✓ Created employee GW001');

    // Get admin role
    const { data: adminRole } = await supabase
      .from('roles')
      .select('role_id')
      .eq('role_name', 'admin')
      .maybeSingle();

    if (!adminRole) {
      console.error('✗ Admin role not found');
      process.exit(1);
    }

    // Create user account
    const hashedPassword = crypto.createHash('sha256').update('password123').digest('hex');
    const { data: userAccount, error: userError } = await supabase
      .from('user_accounts')
      .insert([{
        employee_id: employee.employee_id,
        username: 'GW001',
        password_hash: hashedPassword,
        role_id: adminRole.role_id,
        account_status: 'ACTIVE',
        date_created: new Date().toISOString()
      }])
      .select()
      .single();

    if (userError) {
      console.error('✗ Error creating user account:', userError.message);
      process.exit(1);
    }

    console.log('✓ Created user account for GW001');
    console.log('\n✅ TEST EMPLOYEE CREATED\n');
    console.log('Login with:');
    console.log('  Employee ID: GW001');
    console.log('  Password: password123');
    console.log('\nRole: Admin\n');

  } catch (err) {
    console.error('✗ Error:', err.message);
    process.exit(1);
  }

  process.exit(0);
}

createTestEmployee();
