const { createClient } = require('@supabase/supabase-js');

const MESSAGE =
  'Mathematics 11 Supabase is unavailable. Check SUPABASE_MATHEMATICS_11_URL and SUPABASE_MATHEMATICS_11_SECRET_KEY.';

function unavailableClient(reason) {
  return {
    from() {
      throw new Error(reason);
    },
  };
}

function buildClient() {
  const url = process.env.SUPABASE_MATHEMATICS_11_URL;
  const secretKey = process.env.SUPABASE_MATHEMATICS_11_SECRET_KEY;

  if (!url || !secretKey) {
    console.warn('[mathematics-11]', MESSAGE);
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
      '[mathematics-11] Failed to initialize Supabase client:',
      error.message
    );

    return unavailableClient(MESSAGE);
  }
}

module.exports = buildClient();
