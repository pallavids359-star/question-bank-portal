const { createClient } = require('@supabase/supabase-js');

const supabaseControlUrl = process.env.SUPABASE_CONTROL_URL;
const supabaseControlSecretKey =
  process.env.SUPABASE_CONTROL_SECRET_KEY;

if (!supabaseControlUrl || !supabaseControlSecretKey) {
  throw new Error(
    'Missing SUPABASE_CONTROL_URL or SUPABASE_CONTROL_SECRET_KEY. ' +
    'Use the qbp-control server-side secret key.'
  );
}

const supabaseControl = createClient(
  supabaseControlUrl,
  supabaseControlSecretKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  }
);

module.exports = supabaseControl;
