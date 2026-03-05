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

async function setupTestData() {
  try {
    console.log('🔧 Setting up test data and accounts...\n');

    const testUsers = [
      {
        employeeCode: 'GW001',
        firstName: 'Grace',
        lastName: 'Wells',
        email: 'grace@gracewell.com',
        role: 'super_admin',
        password: 'GW@123456',
        department: 'IT',
        position: 'Super Admin'
      },
      {
        employeeCode: 'GW002',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@gracewell.com',
        role: 'admin',
        password: 'Admin@123',
        department: 'IT',
        position: 'Administrator'
      },
      {
        employeeCode: 'M001',
        firstName: 'Manager',
        lastName: 'User',
        email: 'manager@gracewell.com',
        role: 'manager',
        password: 'manager12',
        department: 'Operations',
        position: 'Operations Manager'
      },
      {
        employeeCode: 'GW003',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@gracewell.com',
        role: 'employee',
        password: 'Employee@123',
        department: 'Operations',
        position: 'Staff'
      },
      {
        employeeCode: 'GW004',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@gracewell.com',
        role: 'employee',
        password: 'Employee@123',
        department: 'Finance',
        position: 'Finance Staff'
      },
      {
        employeeCode: 'GW011',
        firstName: 'Scanner',
        lastName: 'Test',
        email: 'scanner.test@gracewell.com',
        role: 'employee',
        password: 'Employee@123',
        department: 'Operations',
        position: 'Staff'
      }
    ];

    for (const user of testUsers) {
      try {
        // Check if employee exists
        const { data: existingEmployees, error: empCheckError } = await supabase
          .from('employees')
          .select('employee_id, record_status')
          .eq('employee_code', user.employeeCode)
          .limit(1);

        if (empCheckError) throw empCheckError;

        let employeeId;
        
        if (existingEmployees && existingEmployees.length > 0) {
          employeeId = existingEmployees[0].employee_id;
          console.log(`✅ Employee ${user.employeeCode} already exists`);
          
          // Ensure record is Active
          if (existingEmployees[0].record_status !== 'Active') {
            await supabase
              .from('employees')
              .update({ record_status: 'Active' })
              .eq('employee_id', employeeId);
            console.log(`   ✓ Activated ${user.employeeCode}`);
          }
        } else {
          // Create new employee
          const { data: deptRows } = await supabase
            .from('departments')
            .select('department_id')
            .eq('department_name', user.department)
            .limit(1);

          let departmentId;
          if (deptRows && deptRows.length > 0) {
            departmentId = deptRows[0].department_id;
          } else {
            const { data: newDept } = await supabase
              .from('departments')
              .insert({ department_name: user.department })
              .select('department_id')
              .single();
            departmentId = newDept.department_id;
          }

          const { data: newEmployee, error: empInsertError } = await supabase
            .from('employees')
            .insert({
              employee_code: user.employeeCode,
              first_name: user.firstName,
              last_name: user.lastName,
              email_address: user.email,
              position: user.position,
              department_id: departmentId,
              record_status: 'Active',
              employment_type: 'Full-time'
            })
            .select('employee_id')
            .single();

          if (empInsertError) throw empInsertError;
          employeeId = newEmployee.employee_id;
          console.log(`✅ Created employee ${user.employeeCode}`);
        }

        // Get or create role
        const { data: roleRows } = await supabase
          .from('roles')
          .select('role_id')
          .eq('role_name', user.role)
          .limit(1);

        let roleId;
        if (roleRows && roleRows.length > 0) {
          roleId = roleRows[0].role_id;
        } else {
          const { data: newRole } = await supabase
            .from('roles')
            .insert({ role_name: user.role })
            .select('role_id')
            .single();
          roleId = newRole.role_id;
        }

        // Check if user account exists
        const { data: existingAccount } = await supabase
          .from('user_accounts')
          .select('user_id, account_status')
          .eq('employee_id', employeeId)
          .limit(1);

        const hashedPassword = bcrypt.hashSync(user.password, 10);

        if (existingAccount && existingAccount.length > 0) {
          // Update existing account
          const { error: updateError } = await supabase
            .from('user_accounts')
            .update({
              username: user.employeeCode,
              password_hash: hashedPassword,
              role_id: roleId,
              account_status: 'Active'
            })
            .eq('user_id', existingAccount[0].user_id);

          if (updateError) throw updateError;
          console.log(`   ✓ Updated user account for ${user.employeeCode}`);
        } else {
          // Create new account
          const { error: accountInsertError } = await supabase
            .from('user_accounts')
            .insert({
              employee_id: employeeId,
              username: user.employeeCode,
              password_hash: hashedPassword,
              role_id: roleId,
              account_status: 'Active'
            });

          if (accountInsertError) throw accountInsertError;
          console.log(`   ✓ Created user account for ${user.employeeCode}`);
        }

      } catch (error) {
        console.error(`❌ Error setting up ${user.employeeCode}:`, error.message);
      }
    }

    console.log('\n═════════════════════════════════════════');
    console.log('✅ Test Data Setup Complete!\n');
    console.log('📋 Test Accounts Available:');
    console.log('───────────────────────────────────────');
    testUsers.forEach(user => {
      console.log(`\n${user.employeeCode} (${user.role.toUpperCase()})`);
      console.log(`  Username: ${user.employeeCode}`);
      console.log(`  Password: ${user.password}`);
    });
    console.log('\n───────────────────────────────────────');
    console.log('═════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Setup Error:', error.message);
    process.exit(1);
  }
}

setupTestData();
