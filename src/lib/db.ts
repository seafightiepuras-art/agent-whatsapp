import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Client cu cheia de serviciu: doar pe server. Tabelele agent_* nu au politici RLS, deci doar așa se pot folosi. */
export function db() {
  const url = process.env.SUPABASE_URL;
  const cheie = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !cheie) throw new Error("Lipsesc SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, cheie, { auth: { persistSession: false } });
}
