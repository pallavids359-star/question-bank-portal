const { createClient } = require('@supabase/supabase-js');

const MESSAGE =
  'Biology 11 Supabase is unavailable. Check SUPABASE_BIOLOGY_11_URL and SUPABASE_BIOLOGY_11_SECRET_KEY.';

function unavailableClient(reason) {
  return {
    from() {
      throw new Error(reason);
    },
  };
}

function buildClient() {
  const url = process.env.SUPABASE_BIOLOGY_11_URL;
  const secretKey = process.env.SUPABASE_BIOLOGY_11_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn('[biology-11]', MESSAGE);
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
      '[biology-11] Failed to initialize Supabase client:',
      error.message
    );

    return unavailableClient(MESSAGE);
  }
}

module.exports = buildClient();
