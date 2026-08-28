const { createClient } = require('@supabase/supabase-js');

const supabasePhysics12Url = process.env.SUPABASE_PHYSICS_12_URL;
const supabasePhysics12SecretKey = process.env.SUPABASE_PHYSICS_12_SECRET_KEY;

if (!supabasePhysics12Url || !supabasePhysics12SecretKey) {
    throw new Error(
        'Missing SUPABASE_PHYSICS_12_URL or SUPABASE_PHYSICS_12_SECRET_KEY.'
    );
}

const supabasePhysics12 = createClient(
    supabasePhysics12Url,
    supabasePhysics12SecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
        },
    }
);

module.exports = supabasePhysics12;
