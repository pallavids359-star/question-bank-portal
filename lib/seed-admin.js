'use strict';
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

/**
 * Called once at server startup.
 * Seeds the default admin user ONLY if no users exist yet.
 */
async function seedAdmin() {
  try {
    const email = String(process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
    const password = String(process.env.INITIAL_ADMIN_PASSWORD || '');
    const name = String(process.env.INITIAL_ADMIN_NAME || 'Administrator').trim();
    if (!email || !password) {
      console.log('[seed] Skipped — INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD are not configured.');
      return;
    }
    if (password.length < 12) {
      console.error('[seed] Skipped — INITIAL_ADMIN_PASSWORD must contain at least 12 characters.');
      return;
    }
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

    const passwordHash = await bcrypt.hash(password, 12);

    const { error: insertError } = await supabase.from('users').insert({
      name,
      email,
      password_hash: passwordHash,
      role:          'admin',
      status:        'active',
      is_active:     true,
    });

    if (insertError) {
      console.error('[seed] Failed to create default admin:', insertError.message);
    } else {
      console.log('✓ Initial admin created:', email);
    }
  } catch (err) {
    console.error('[seed] Unexpected error:', err.message);
  }
}

module.exports = seedAdmin;
