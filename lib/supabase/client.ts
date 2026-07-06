import { createBrowserClient } from "@supabase/ssr";

// Σε build/prerender χωρίς .env.local (π.χ. CI) οι μεταβλητές λείπουν και
// ο browser client θα πετούσε σφάλμα, ρίχνοντας το build. Δίνουμε ασφαλή
// placeholders ώστε το prerender να περνά· στον browser (runtime) οι
// πραγματικές NEXT_PUBLIC_* τιμές είναι ενσωματωμένες και χρησιμοποιούνται
// κανονικά. Οι κλήσεις auth/data τρέχουν μόνο client-side (useEffect).
const URL_FALLBACK = "https://placeholder.supabase.co";
const KEY_FALLBACK = "public-anon-key-placeholder";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || URL_FALLBACK,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || KEY_FALLBACK
  );
}
