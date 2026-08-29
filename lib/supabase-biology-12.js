const { createClient } = require('@supabase/supabase-js');

const MESSAGE =
  'Biology 12 Supabase is unavailable. Check SUPABASE_BIOLOGY_12_URL and SUPABASE_BIOLOGY_12_SECRET_KEY.';

function unavailableClient(reason) {
  return {
    from() {
      throw new Error(reason);
    },
  };
}

function buildClient() {
  const url = process.env.SUPABASE_BIOLOGY_12_URL;
  const secretKey = process.env.SUPABASE_BIOLOGY_12_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn('[biology-12]', MESSAGE);
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
      '[biology-12] Failed to initialize Supabase client:',
      error.message
    );

    return unavailableClient(MESSAGE);
  }
}

module.exports = buildClient();
