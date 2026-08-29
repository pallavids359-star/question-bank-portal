const { createClient } = require('@supabase/supabase-js');

const MESSAGE =
  'Chemistry 12 Supabase is unavailable. Check SUPABASE_CHEMISTRY_12_URL and SUPABASE_CHEMISTRY_12_SECRET_KEY.';

function unavailableClient(reason) {
  return {
    from() {
      throw new Error(reason);
    },
  };
}

function buildClient() {
  const url = process.env.SUPABASE_CHEMISTRY_12_URL;
  const secretKey = process.env.SUPABASE_CHEMISTRY_12_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn('[chemistry-12]', MESSAGE);
    return unavailableClient(MESSAGE);
  }

  try {
    return createClient(url, secretKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  } catch (error) {
    console.warn(
      '[chemistry-12] Failed to initialize Supabase client:',
      error.message
    );

    return unavailableClient(MESSAGE);
  }
}

module.exports = buildClient();
