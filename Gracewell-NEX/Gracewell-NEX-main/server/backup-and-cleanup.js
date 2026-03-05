const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

async function backupAndCleanup() {
  try {
    console.log('📦 BACKING UP OLD ACCOUNTS AND CLEANING DATABASE...\n');

    // Fetch all users for backup
    const { data: allUsers, error: fetchError } = await supabase
      .from('employees')
      .select('employee_id, employee_code, first_name, last_name, email_address, position, record_status');

    if (fetchError) {
      console.error('❌ Error fetching users:', fetchError);
      return;
    }

    // Create backup file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `backup_employees_${timestamp}.json`;
    fs.writeFileSync(backupFile, JSON.stringify(allUsers, null, 2));
    console.log(`✅ Backup created: ${backupFile}`);
    console.log(`   Total accounts backed up: ${allUsers.length}\n`);

    // Display accounts to be deleted
    const oldAdminCodes = ['SA001', 'A001', 'M001'];
    const accountsToDelete = allUsers.filter(u => 
      oldAdminCodes.includes(u.employee_code)
    );

    if (accountsToDelete.length > 0) {
      console.log('🗑️  OLD ADMIN ACCOUNTS TO DELETE:');
      accountsToDelete.forEach(acc => {
        console.log(`   - ${acc.employee_code}: ${acc.first_name} ${acc.last_name} (${acc.position})`);
      });
      console.log('');
    }

    // Delete old admin accounts
    for (const account of accountsToDelete) {
      try {
        // Delete user account first
        const { error: userError } = await supabase
          .from('user_accounts')
          .delete()
          .eq('employee_id', account.employee_id);

        if (userError) {
          console.warn(`⚠️  Could not delete user account for ${account.employee_code}:`, userError.message);
        }

        // Delete employee record
        const { error: empError } = await supabase
          .from('employees')
          .delete()
          .eq('employee_id', account.employee_id);

        if (empError) {
          console.warn(`⚠️  Could not delete employee ${account.employee_code}:`, empError.message);
        } else {
          console.log(`✅ Deleted: ${account.employee_code}`);
        }
      } catch (error) {
        console.error(`❌ Error deleting ${account.employee_code}:`, error.message);
      }
    }

    console.log('\n✅ CLEANUP COMPLETE');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 REMAINING ACCOUNTS:');
    const { data: remaining } = await supabase
      .from('employees')
      .select('employee_code, first_name, last_name, position')
      .order('employee_code');
    
    if (remaining) {
      remaining.forEach(user => {
        console.log(`   ✓ ${user.employee_code}: ${user.first_name} ${user.last_name}`);
      });
      console.log(`\n   Total: ${remaining.length} accounts`);
    }

    console.log('\n🎯 READY TO USE:');
    console.log('   GW001 / password123  → Super Admin');
    console.log('   GW002 / password123  → Admin');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the backup and cleanup
backupAndCleanup();
