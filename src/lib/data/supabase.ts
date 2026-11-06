import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 환경 변수가 없으면 null → 앱은 로컬 모드로 동작한다. */
export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;
