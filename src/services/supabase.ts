import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
export const EMAIL_DOMAIN = (import.meta.env.VITE_USERNAME_EMAIL_DOMAIN as string) || 'jogadores.fazenda.invalid';
export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;

if (!url || !key) console.error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env');

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sitio-mutirao-auth' },
  realtime: { params: { eventsPerSecond: 20 } },
});
