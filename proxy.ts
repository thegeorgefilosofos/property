import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy με per-request nonce (μόνο production). Έτσι φεύγει το
// 'unsafe-inline' από το script-src: κάθε inline script (και του Next και το δικό
// μας theme-init) εμπιστεύεται μόνο μέσω του nonce + 'strict-dynamic'. Σε
// development δεν στέλνουμε CSP (το Next dev χρειάζεται eval/ws/blob).
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    // Nominatim (OpenStreetMap): πρόταση διευθύνσεων χωρίς κλειδί στη φόρμα επαφής.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org",
    // Επιτρέπει τον ενσωματωμένο χάρτη Google (keyless embed) στο ντοσιέ επαφής
    // και την προεπισκόπηση PDF (Supabase storage) στο Αρχείο.
    "frame-src 'self' https://www.google.com https://maps.google.com https://*.supabase.co",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // PWA: ο service worker και το manifest είναι δικά μας και μόνο δικά μας.
    // Χωρίς αυτά, το 'strict-dynamic' του script-src μπλοκάρει την καταχώριση.
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  // Νonce με Web Crypto (δουλεύει σε edge & node runtime, χωρίς Buffer).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const nonce = btoa(bin);
  const csp = isProd ? buildCsp(nonce) : "";

  // Περνάμε το nonce + το CSP στα request headers ώστε το Next να «περάσει» το
  // nonce στα δικά του inline scripts κατά το render.
  const requestHeaders = new Headers(request.headers);
  if (isProd) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", csp);
  }

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  // Άγγιξε το Supabase auth ΜΟΝΟ αν το αίτημα κουβαλά auth cookie (sb-*). Χωρίς
  // cookie ο χρήστης είναι σίγουρα ασύνδετος, οπότε γλιτώνουμε ένα round-trip στο
  // auth σε κάθε ανώνυμη επίσκεψη (π.χ. στη landing). Η λογική redirect μένει ίδια.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  let user = null;
  if (hasAuthCookie) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );
    user = (await supabase.auth.getUser()).data.user;
  }

  const { pathname } = request.nextUrl;
  // Δημόσιες σελίδες — προσβάσιμες ΧΩΡΙΣ σύνδεση (landing + νομικά + auth).
  // Το /privacy & /terms ΠΡΕΠΕΙ να είναι δημόσια (απαίτηση GDPR).
  // Το /trust («Ποιοι είμαστε») είναι σελίδα εμπιστοσύνης: πρέπει να διαβάζεται
  // ΠΡΙΝ ο χρήστης αποφασίσει να εγγραφεί, άρα δημόσια. Το /offline είναι η
  // στατική σελίδα του service worker όταν δεν υπάρχει δίκτυο.
  const PUBLIC = new Set(["/", "/login", "/signup", "/privacy", "/terms", "/trust", "/offline"]);
  // Σελίδες με capability-token (/portal, /accountant, /checkin, /verify) είναι
  // δημόσιες by-design — η πρόσβαση ελέγχεται από το ίδιο το token, όχι από login.
  const isPublic = PUBLIC.has(pathname)
    || pathname.startsWith("/portal/") || pathname.startsWith("/accountant/")
    || pathname.startsWith("/checkin/") || pathname.startsWith("/verify/")
    || pathname.startsWith("/unsubscribe/");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Σημείωση: ΔΕΝ ανακατευθύνουμε πλέον αυτόματα τον συνδεδεμένο χρήστη από τις
  // σελίδες σύνδεσης/εγγραφής. Οι ίδιες οι σελίδες δείχνουν ευγενικά ότι είναι ήδη
  // συνδεδεμένος και προσφέρουν «Μετάβαση στον πίνακα» ή «Αποσύνδεση» (αλλαγή λογαριασμού).

  if (isProd) supabaseResponse.headers.set("Content-Security-Policy", csp);
  return supabaseResponse;
}

export const config = {
  matcher: [
    // Το sw.js και το manifest ΠΡΕΠΕΙ να σερβίρονται χωρίς έλεγχο σύνδεσης:
    // ο browser τα ζητά και σε ανώνυμη επίσκεψη, και μια ανακατεύθυνση στο
    // /login θα ακύρωνε σιωπηλά την εγκατάσταση της εφαρμογής.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
