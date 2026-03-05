const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function inactivateOldAccounts() {
  try {
    console.log('🔒 INACTIVATING OLD ADMIN ACCOUNTS...\n');

    const oldAdminCodes = ['SA001', 'A001', 'M001'];

    for (const code of oldAdminCodes) {
      try {
        // Mark employee as inactive
        const { error: empError } = await supabase
          .from('employees')
          .update({ record_status: 'inactive' })
          .eq('employee_code', code);

        if (empError) {
          console.warn(`⚠️  Could not inactivate employee ${code}:`, empError.message);
        } else {
          console.log(`✅ Inactivated employee: ${code}`);
        }

        // Mark user account as inactive
        const { data: employee } = await supabase
          .from('employees')
          .select('employee_id')
          .eq('employee_code', code)
          .single();

        if (employee) {
          const { error: userError } = await supabase
            .from('user_accounts')
            .update({ account_status: 'inactive' })
            .eq('employee_id', employee.employee_id);

          if (userError) {
            console.warn(`⚠️  Could not inactivate user account for ${code}:`, userError.message);
          } else {
            console.log(`✅ Inactivated user account: ${code}`);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing ${code}:`, error.message);
      }
    }

    console.log('\n✅ OLD ACCOUNTS INACTIVATED (PRESERVED IN DATABASE)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 NOTE: Old accounts are kept for historical/audit purposes');
    console.log('   but they are now INACTIVE and cannot login.\n');

    console.log('🎯 ACTIVE ADMIN ACCOUNTS:');
    console.log('   → GW001 / password123  (Super Admin)');
    console.log('   → GW002 / password123  (Admin)\n');

    // Show status
    const { data: gwAccounts } = await supabase
      .from('employees')
      .select('employee_code, first_name, last_name, position, record_status')
      .in('employee_code', ['GW001', 'GW002', 'SA001', 'A001', 'M001'])
      .order('employee_code');

    console.log('📊 ACCOUNT STATUS:');
    if (gwAccounts) {
      gwAccounts.forEach(acc => {
        const status = acc.record_status === 'active' ? '✅ ACTIVE' : '🔒 INACTIVE';
        console.log(`   ${status}  ${acc.employee_code}: ${acc.first_name} ${acc.last_name}`);
      });
    }
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

inactivateOldAccounts();
