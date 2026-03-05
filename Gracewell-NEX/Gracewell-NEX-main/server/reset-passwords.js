const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function resetPasswords() {
  try {
    console.log('🔧 Resetting test user passwords...\n');

    const users = [
      { code: 'GW001', password: 'GW@123456' },
      { code: 'GW002', password: 'Admin@123' },
      { code: 'GW003', password: 'Manager@123' },
      { code: 'GW004', password: 'Employee@123' },
      { code: 'GW005', password: 'Employee@123' },
      { code: 'QR001', password: 'QR@Scanner123!' }
    ];

    for (const user of users) {
      try {
        // Get user account
        const { data: account, error: getError } = await supabase
          .from('user_accounts')
          .select('user_id')
          .eq('username', user.code)
          .single();

        if (getError || !account) {
          console.log(`⚠️  User ${user.code} not found`);
          continue;
        }

        // Hash password
        const hashedPassword = bcrypt.hashSync(user.password, 10);

        // Update password
        const { error: updateError } = await supabase
          .from('user_accounts')
          .update({ password_hash: hashedPassword })
          .eq('user_id', account.user_id);

        if (updateError) {
          console.error(`❌ Error updating ${user.code}:`, updateError.message);
        } else {
          console.log(`✅ Password reset for ${user.code}`);
        }
      } catch (error) {
        console.error(`❌ Error processing ${user.code}:`, error.message);
      }
    }

    console.log('\n═════════════════════════════════════════');
    console.log('✅ Password Reset Complete!\n');
    console.log('📋 Test Credentials:');
    console.log('───────────────────────────────────────');
    users.forEach(u => {
      console.log(`${u.code}: ${u.password}`);
    });
    console.log('───────────────────────────────────────\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

resetPasswords();
