const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDatabase() {
  try {
    console.log('🔍 Checking database for GW001...\n');

    // Get employee
    const { data: empData, error: empError } = await supabase
      .from('employees')
      .select('*')
      .eq('employee_code', 'GW001')
      .single();

    if (empError) {
      console.error('❌ Employee Error:', empError);
    } else {
      console.log('✅ Employee Found:');
      console.log(`   ID: ${empData.employee_id}`);
      console.log(`   Code: ${empData.employee_code}`);
      console.log(`   Name: ${empData.first_name} ${empData.last_name}`);
      console.log(`   Status: ${empData.record_status}`);
    }

    console.log('');

    // Get user account
    const{ data: acctData, error: acctError } = await supabase
      .from('user_accounts')
      .select('*')
      .eq('username', 'GW001')
      .single();

    if (acctError) {
      console.error('❌ Account Error:', acctError);
    } else {
      console.log('✅ Account Found:');
      console.log(`   ID: ${acctData.user_id}`);
      console.log(`   Username: ${acctData.username}`);
      console.log(`   Status: ${acctData.account_status}`);
      console.log(`   Password Hash: ${acctData.password_hash.substring(0, 30)}...`);
      console.log(`   Role ID: ${acctData.role_id}`);
    }

    console.log('');

    // Get role
    if (acctData) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('*')
        .eq('role_id', acctData.role_id)
        .single();

      if (roleError) {
        console.error('❌ Role Error:', roleError);
      } else {
        console.log('✅ Role Found:');
        console.log(`   ID: ${roleData.role_id}`);
        console.log(`   Name: ${roleData.role_name}`);
      }
    }

    // Test password hash
    console.log('\n🔐 Testing Password Hash:');
    const bcrypt = require('bcryptjs');
    const testPassword = 'GW@123456';
    if (acctData) {
      try {
        const match = bcrypt.compareSync(testPassword, acctData.password_hash);
        console.log(`   Password "${testPassword}" matches hash: ${match ? '✅ YES' : '❌ NO'}`);
      } catch (err) {
        console.error('   Error comparing password:', err.message);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkDatabase();
