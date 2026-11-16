import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key';

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const BUCKET = 'photos';

/** "QAinline" -> qainline@thv.com ; email giữ nguyên */
export function loginEmail(input: string) {
  const v = input.trim().toLowerCase();
  return v.includes('@') ? v : `${v}@thv.com`;
}
