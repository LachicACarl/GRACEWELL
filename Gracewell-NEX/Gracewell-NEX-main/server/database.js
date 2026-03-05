const path = require('path');
const { createClient } = require('@supabase/supabase-js');

require('dotenv').config({ path: path.join(__dirname, '.env') });
const bcrypt = require('bcryptjs');

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'your-anon-key';

const supabase = createClient(supabaseUrl, supabaseKey);

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn('SUPABASE_SERVICE_KEY is not set. Writes may fail due to RLS policies.');
}

// Test connection
async function testConnection() {
  try {
    const { error } = await supabase.from('employees').select('employee_id').limit(1);
    if (error && error.code !== 'PGRST116') { // PGRST116 = table doesn't exist yet
      console.error('Supabase connection error:', error);
    } else {
      console.log('Connected to Supabase database');
    }
  } catch (err) {
    console.error('Database connection error:', err);
  }
}

testConnection();
// Don't call initializeDatabase() during require - let server.js call it

async function initializeDatabase() {
  try {
    // Note: Tables should be created via Supabase Dashboard SQL Editor
    // This function will seed default users if needed
    console.log('Checking database tables...');
    await seedDefaultUsers();
  } catch (error) {
    console.error('Database initialization error:', error);
  }
}

async function seedDefaultUsers() {
  const users = [
    {
      employeeCode: 'SA001',
      firstName: 'Super',
      lastName: 'Admin',
      role: 'super_admin',
      password: 'admin123',
      email: 'superadmin@gracewell.com',
      department: 'IT',
      position: 'Super Admin'
    },
    {
      employeeCode: 'A001',
      firstName: 'Admin',
      lastName: 'User',
      role: 'admin',
      password: 'admin123',
      email: 'admin@gracewell.com',
      department: 'IT',
      position: 'Administrator'
    },
    {
      employeeCode: 'M001',
      firstName: 'Manager',
      lastName: 'User',
      role: 'manager',
      password: 'manager12',
      email: 'manager@gracewell.com',
      department: 'Operations',
      position: 'Operations Manager'
    },
    {
      employeeCode: 'E001',
      firstName: 'John',
      lastName: 'Smith',
      role: 'employee',
      password: 'emp123',
      email: 'john@gracewell.com',
      department: 'Operations',
      position: 'Trucker'
    },
    {
      employeeCode: 'E002',
      firstName: 'Sarah',
      lastName: 'Johnson',
      role: 'employee',
      password: 'emp123',
      email: 'sarah@gracewell.com',
      department: 'Finance',
      position: 'Finance Head'
    }
  ];

  for (const user of users) {
    try {
      const { data: existingEmployees } = await supabase
        .from('employees')
        .select('employee_id')
        .eq('employee_code', user.employeeCode)
        .limit(1);

      let employeeId = existingEmployees && existingEmployees.length > 0
        ? existingEmployees[0].employee_id
        : null;

      const { data: roleRows, error: roleError } = await supabase
        .from('roles')
        .select('role_id')
        .eq('role_name', user.role)
        .limit(1);

      if (roleError) {
        console.error(`Error looking up role ${user.role}:`, roleError.message);
        continue;
      }

      let roleId = roleRows && roleRows.length > 0 ? roleRows[0].role_id : null;
      if (!roleId) {
        const { data: roleInsert, error: roleInsertError } = await supabase
          .from('roles')
          .insert({ role_name: user.role })
          .select('role_id')
          .single();

        if (roleInsertError) {
          console.error(`Error creating role ${user.role}:`, roleInsertError.message);
          continue;
        }

        roleId = roleInsert.role_id;
      }

      if (!employeeId) {
        const { data: deptRows, error: deptError } = await supabase
          .from('departments')
          .select('department_id')
          .eq('department_name', user.department)
          .limit(1);

        if (deptError) {
          console.error(`Error looking up department ${user.department}:`, deptError.message);
          continue;
        }

        let departmentId = deptRows && deptRows.length > 0 ? deptRows[0].department_id : null;
        if (!departmentId) {
          const { data: deptInsert, error: deptInsertError } = await supabase
            .from('departments')
            .insert({ department_name: user.department })
            .select('department_id')
            .single();

          if (deptInsertError) {
            console.error(`Error creating department ${user.department}:`, deptInsertError.message);
            continue;
          }

          departmentId = deptInsert.department_id;
        }

        const { data: employeeInsert, error: employeeError } = await supabase
          .from('employees')
          .insert({
            employee_code: user.employeeCode,
            first_name: user.firstName,
            last_name: user.lastName,
            email_address: user.email,
            position: user.position || null,
            department_id: departmentId,
            record_status: 'Active',
            employment_type: 'Full-time'
          })
          .select('employee_id')
          .single();

        if (employeeError) {
          console.error(`Error creating employee ${user.employeeCode}:`, employeeError.message);
          continue;
        }

        employeeId = employeeInsert.employee_id;
      }

      const { data: accountRows, error: accountCheckError } = await supabase
        .from('user_accounts')
        .select('user_id')
        .eq('employee_id', employeeId)
        .limit(1);

      if (accountCheckError) {
        console.error(`Error checking account ${user.employeeCode}:`, accountCheckError.message);
        continue;
      }

      if (!accountRows || accountRows.length === 0) {
        const hashedPassword = await bcrypt.hash(user.password, 10);
        const { error: accountError } = await supabase
          .from('user_accounts')
          .insert({
            employee_id: employeeId,
            username: user.employeeCode,
            password_hash: hashedPassword,
            role_id: roleId,
            account_status: 'ACTIVE'
          });

        if (accountError) {
          console.error(`Error creating account ${user.employeeCode}:`, accountError.message);
          continue;
        }
      }

      const { data: qrRows, error: qrError } = await supabase
        .from('qr_codes')
        .select('qrcode_id')
        .eq('employee_id', employeeId)
        .limit(1);

      if (qrError) {
        console.error(`Error checking QR for ${user.employeeCode}:`, qrError.message);
        continue;
      }

      if (!qrRows || qrRows.length === 0) {
        const { error: qrInsertError } = await supabase
          .from('qr_codes')
          .insert({
            employee_id: employeeId,
            qr_value: user.employeeCode,
            status: 'ACTIVE'
          });

        if (qrInsertError) {
          console.error(`Error creating QR for ${user.employeeCode}:`, qrInsertError.message);
        }
      }
    } catch (error) {
      console.error(`Error checking/seeding user ${user.employeeCode}:`, error);
    }
  }
}

// Export both the client and initialization function
module.exports = supabase;
module.exports.initialize = initializeDatabase;
module.exports.seedUsers = seedDefaultUsers;
