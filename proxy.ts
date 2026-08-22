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
    // ΠΡΟΣΟΧΗ — αυτό ΔΕΝ καλύπτει τα εκτυπώσιμα έγγραφα. Οι γεννήτριες αναφορών
    // ανοίγουν `window.open('')` και γράφουν HTML σε έγγραφο `about:blank`: δεν
    // υπάρχει HTTP απόκριση, άρα δεν υπάρχει CSP header να εφαρμοστεί. Ακριβώς
    // γι' αυτό τέσσερις αναφορές φόρτωναν επί μήνες γραμματοσειρές από τη Google
    // ενώ αυτή η γραμμή έλεγε 'self' — και η IP του χρήστη έφευγε σε κάθε PDF.
    // Η άμυνα εκεί είναι ο κώδικας, όχι η κεφαλίδα: lib/print/fonts.ts.
    "font-src 'self' data:",
    "img-src 'self' data: blob: https:",
    // Nominatim (OpenStreetMap): πρόταση διευθύνσεων χωρίς κλειδί στη φόρμα επαφής.
    //
    // pwnedpasswords: έλεγχος διαρρευσάντων κωδικών με k-anonymity. Φεύγουν
    // ΜΟΝΟ πέντε δεκαεξαδικά ψηφία του SHA-1 — ποτέ ο κωδικός, ποτέ ο πλήρης
    // κατακερματισμός. ΧΩΡΙΣ αυτή τη γραμμή η κλήση μπλοκάρεται μόνο στην
    // ΠΑΡΑΓΩΓΗ (η CSP μπαίνει μόνο εκεί), ο έλεγχος αποτυγχάνει ανοιχτά όπως
    // σχεδιάστηκε, και το χαρακτηριστικό δεν δουλεύει ποτέ χωρίς να το πει
    // κανείς — ενώ τοπικά δουλεύει μια χαρά.
    //
    // Sentry: η αναφορά σφαλμάτων (lib/observability/report.ts) στέλνει με σκέτο
    // fetch στο `*.ingest.sentry.io`. ΧΩΡΙΣ αυτή τη γραμμή, η αναφορά
    // μπλοκάρεται ΜΟΝΟ στην παραγωγή — δηλαδή ακριβώς εκεί που τη χρειάζεσαι —
    // και ο ίδιος ο reporter καταπίνει το σφάλμα («ο reporter δεν επιτρέπεται να
    // σπάσει τον καλούντα»). Θα φαινόταν ρυθμισμένος και δεν θα έφτανε ποτέ ούτε
    // ένα σφάλμα. Ίδια οικογένεια σιωπηλής αποτυχίας με το pwnedpasswords.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://nominatim.openstreetmap.org https://api.pwnedpasswords.com https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
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
  // Το /ypologismos-forou-enoikion είναι δωρεάν εργαλείο χωρίς εγγραφή: αν
  // ζητούσε σύνδεση, θα ακύρωνε ολόκληρο τον λόγο ύπαρξής του — απαντά σε
  // ερώτηση που ο ιδιοκτήτης κάνει ΠΡΙΝ μας ξέρει.
  const PUBLIC = new Set([
    "/", "/login", "/signup", "/privacy", "/terms", "/trust", "/offline",
    // ΚΑΙ ΤΑ ΤΕΣΣΕΡΑ ΕΡΓΑΛΕΙΑ. Το «Βραχυχρόνια ή μακροχρόνια;»
    // προστέθηκε στον ιστότοπο και ΞΕΧΑΣΤΗΚΕ από αυτόν τον κατάλογο: ζητούσε
    // σύνδεση, ενώ είναι συνδεδεμένο από το υποσέλιδο κάθε σελίδας και από τα
    // άλλα δύο εργαλεία. Κανένα σφάλμα πουθενά — απλώς μια σελίδα που υπάρχει
    // για να απαντά ΠΡΙΝ μας ξέρει κανείς, και δεν απαντούσε σε κανέναν.
    "/ypologismos-forou-enoikion", "/ypologismos-enfia", "/vraxyxronia-i-makroxronia",
    "/kathari-apodosi",
    // ΤΟ /reset-password ΕΛΕΙΠΕ, ΚΑΙ Η ΕΠΑΝΑΦΟΡΑ ΚΩΔΙΚΟΥ ΗΤΑΝ ΝΕΚΡΗ.
    // Η σελίδα είναι συνδεδεμένη από το «Ξέχασες τον κωδικό;» της εισόδου, και
    // ο σύνδεσμος του email γυρίζει ΕΚΕΙ. Και στις δύο περιπτώσεις ο χρήστης
    // δεν έχει cookie συνεδρίας — αυτός είναι όλος ο λόγος που βρίσκεται εκεί —
    // οπότε ο έλεγχος τον έστελνε πίσω στο /login. Ο μόνος δρόμος επαναφοράς
    // γινόταν η υποστήριξη, δηλαδή ακριβώς η επιφάνεια που εκμεταλλεύεται η
    // κοινωνική μηχανική.
    "/reset-password",
    // ── Η ΕΠΙΣΤΡΟΦΗ ΑΠΟ ΤΟ EMAIL ΕΠΙΒΕΒΑΙΩΣΗΣ ────────────────────────────
    // Ιδιος κανόνας με το /reset-password, και για τον ίδιο ακριβώς λόγο: ο
    // σύνδεσμος φτάνει ΠΡΙΝ υπάρξει συνεδρία — η διαδρομή είναι εκείνη που τη
    // γεννά, ανταλλάσσοντας το διακριτικό. Χωρίς αυτή τη γραμμή ο νέος
    // χρήστης ανακατευθυνόταν στη σύνδεση κρατώντας το διακριτικό στη
    // διεύθυνση, δηλαδή κατέληγε σε φόρμα εισόδου αντί για την εφαρμογή του.
    "/auth/callback",
  ]);
  // Σελίδες με capability-token (/portal, /accountant, /checkin, /verify) είναι
  // δημόσιες by-design — η πρόσβαση ελέγχεται από το ίδιο το token, όχι από login.
  const isPublic = PUBLIC.has(pathname)
    || pathname.startsWith("/portal/") || pathname.startsWith("/accountant/")
    || pathname.startsWith("/checkin/") || pathname.startsWith("/verify/")
    || pathname.startsWith("/unsubscribe/")
    // Η διπλή συναίνεση της διεύθυνσης υπενθυμίσεων φτάνει σε ΤΡΙΤΟ πρόσωπο που
    // δεν έχει λογαριασμό. Χωρίς αυτή τη γραμμή ο σύνδεσμος επιβεβαίωσης
    // γυρνούσε σε οθόνη εισόδου, και ο έλεγχος που μπήκε για να προστατεύει
    // εκείνον τον τρίτο δεν λειτουργούσε ποτέ.
    || pathname.startsWith("/epivevaiosi-email/")
    // ── Η ΣΥΝΔΡΟΜΗ ΗΜΕΡΟΛΟΓΙΟΥ ─────────────────────────────────────────
    // Ο πελάτης εδώ δεν είναι περιηγητής με cookie: είναι το Google Calendar ή
    // το Ημερολόγιο του iPhone, που ζητά τη διεύθυνση κάθε λίγες ώρες χωρίς
    // άνθρωπο μπροστά. Μια ανακατεύθυνση σε φόρμα εισόδου θα του έδινε HTML
    // αντί για ημερολόγιο, και μετά από λίγες αποτυχίες σβήνει τη συνδρομή
    // μόνος του — δηλαδή η λειτουργία θα «δούλευε» και θα έπαυε σιωπηλά.
    || pathname.startsWith("/imerologio/")
    // ── ΤΑ ΑΙΤΗΜΑΤΑ ΔΙΕΠΑΦΗΣ ΑΠΑΝΤΟΥΝ ΜΟΝΑ ΤΟΥΣ ─────────────────────────
    // Το /api/** ΔΕΝ κρίνεται από cookie εδώ, για δύο λόγους.
    //
    // Ο ΠΡΩΤΟΣ ΕΙΝΑΙ ΤΟ WEBHOOK ΤΟΥ ΕΜΠΟΡΟΥ. Φτάνει από άλλον διακομιστή,
    // χωρίς καμία συνεδρία, και έπαιρνε 307 προς μια σελίδα εισόδου: κάθε
    // πληρωμή θα καταγραφόταν ως αποτυχία στον πίνακα της Lemon Squeezy και
    // καμία συνδρομή δεν θα ενεργοποιούνταν ποτέ. Ο έλεγχός του δεν είναι
    // cookie — είναι η υπογραφή του σώματος, και τη διαβάζει η ίδια η διαδρομή.
    //
    // Ο ΔΕΥΤΕΡΟΣ ΕΙΝΑΙ ΟΤΙ ΜΙΑ ΑΝΑΚΑΤΕΥΘΥΝΣΗ ΣΕ HTML ΔΕΝ ΕΙΝΑΙ ΑΠΑΝΤΗΣΗ ΣΕ
    // ΑΙΤΗΜΑ ΠΟΥ ΠΕΡΙΜΕΝΕΙ JSON. Το σωστό «δεν έχεις δικαίωμα» είναι 401, και
    // το λέει η διαδρομή που ξέρει τι ζητήθηκε. Κάθε μία ζητά τη συνεδρία μόνη
    // της· ο φύλακας scripts/guard-api-auth.mjs δεν αφήνει καμία να ξεχαστεί.
    || pathname.startsWith("/api/");

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
    //
    // ── ΤΟ ΙΔΙΟ ΙΣΧΥΕ ΓΙΑ ΟΛΗ ΤΗΝ ΕΠΙΦΑΝΕΙΑ ΤΩΝ ΜΗΧΑΝΩΝ ΑΝΑΖΗΤΗΣΗΣ ────────
    // Τα `robots.txt`, `sitemap.xml` και `opengraph-image` είναι γραμμένα,
    // σωστά, και δεν έβγαιναν ΠΟΤΕ έξω: δεν ήταν στον κατάλογο PUBLIC και δεν
    // εξαιρούνταν εδώ, οπότε κάθε ανώνυμο αίτημα —δηλαδή ΚΑΘΕ αίτημα μηχανής
    // αναζήτησης και κάθε προεπισκόπηση συνδέσμου σε μήνυμα— έπαιρνε 307 προς
    // το /login. Το Google δεν διάβασε ποτέ τον χάρτη του ιστότοπου και καμία
    // κοινοποίηση δεν έδειξε ποτέ εικόνα.
    //
    // Εξαιρούνται εδώ και όχι στο PUBLIC επίτηδες: δεν χρειάζονται ούτε
    // συνεδρία ούτε κεφαλίδες ασφαλείας — είναι στατικά αρχεία για μηχανές —
    // και έτσι δεν ξοδεύουν εκτέλεση middleware σε κάθε ανίχνευση.
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|opengraph-image|icon\\.svg|icons/|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
