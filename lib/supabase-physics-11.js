const { createClient } = require('@supabase/supabase-js');

const supabasePhysics11Url = process.env.SUPABASE_PHYSICS_11_URL;
const supabasePhysics11SecretKey = process.env.SUPABASE_PHYSICS_11_SECRET_KEY;

if (!supabasePhysics11Url || !supabasePhysics11SecretKey) {
    throw new Error(
        'Missing SUPABASE_PHYSICS_11_URL or SUPABASE_PHYSICS_11_SECRET_KEY.'
    );
}

const supabasePhysics11 = createClient(
    supabasePhysics11Url,
    supabasePhysics11SecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    }
);

module.exports = supabasePhysics11;