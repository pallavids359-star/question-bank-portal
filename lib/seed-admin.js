'use strict';
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

const DEFAULT_ADMIN = {
  name:  'Manchester Technologies',
  email: 'manchestertechnologiess@gmail.com',
  password: 'Bery0218',
  role: 'admin',
};

/**
 * Called once at server startup.
 * Seeds the default admin user ONLY if no users exist yet.
 */
async function seedAdmin() {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.error('[seed] Could not query users table:', error.message);
      console.error('[seed] Make sure you have run auth-schema.sql in the Supabase SQL Editor first.');
      return;
    }

    if (count && count > 0) {
      console.log(`[seed] Skipped — ${count} user(s) already exist.`);
      return;
    }

    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN.password, 12);

    const { error: insertError } = await supabase.from('users').insert({
      name:          DEFAULT_ADMIN.name,
      email:         DEFAULT_ADMIN.email,
      password_hash: passwordHash,
      role:          DEFAULT_ADMIN.role,
      status:        'active',
      is_active:     true,
    });

    if (insertError) {
      console.error('[seed] Failed to create default admin:', insertError.message);
    } else {
      console.log('✓ Default admin created:', DEFAULT_ADMIN.email);
    }
  } catch (err) {
    console.error('[seed] Unexpected error:', err.message);
  }
}

module.exports = seedAdmin;
