import { createClient } from '@supabase/supabase-js';
// Publishable key only: authorization is enforced in PostgreSQL, never by this key.
export const supabase=createClient(import.meta.env.VITE_SUPABASE_URL||'https://wseewiaaygyzkalpslee.supabase.co',import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_1iZmfQuTCvGOX1Cyjoutdw_4_VZm23k',{auth:{storageKey:'dipsy-caisse-auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});

// Separate anonymous transport: a remembered private login never changes public access.
// This is still the publishable key; no service_role or shared password exists in the app.
export const publicSupabase=createClient(import.meta.env.VITE_SUPABASE_URL||'https://wseewiaaygyzkalpslee.supabase.co',import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_1iZmfQuTCvGOX1Cyjoutdw_4_VZm23k',{auth:{storageKey:'dipsy-caisse-public',persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
