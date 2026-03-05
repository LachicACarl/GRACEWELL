const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./database');
const bcrypt = require('bcryptjs');

async function checkPasswords() {
  try {
    const { data, error } = await db
      .from('user_accounts')
      .select('user_id, username, password_hash, role_id, roles(role_name)')
      .order('username');

    if (error) {
      console.error('Error fetching users:', error);
      return;
    }

    console.log('\n📋 User Account Password Hashes:\n');
    for (const user of data) {
      console.log(`${user.username} (${user.roles?.role_name || 'unknown'})`);
      console.log(`  Hash: ${user.password_hash}`);
      
      // Test common passwords
      const testPasswords = ['admin123', 'manager12', 'emp123'];
      for (const pwd of testPasswords) {
        const valid = await bcrypt.compare(pwd, user.password_hash);
        if (valid) {
          console.log(`  ✅ Password matches: "${pwd}"`);
        }
      }
      console.log();
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

checkPasswords();
