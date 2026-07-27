/* ═══════════════════════════════════════════════════════════════════════════
 * Service Worker — Property OS
 * ─────────────────────────────────────────────────────────────────────────
 * ΣΚΟΠΟΣ: να μη δείχνει ο browser τον δεινόσαυρο όταν χαθεί το σήμα, και να
 * ανοίγει το κέλυφος της εφαρμογής ακαριαία. ΤΙΠΟΤΑ ΠΕΡΙΣΣΟΤΕΡΟ.
 *
 * ΚΡΙΣΙΜΟΣ ΚΑΝΟΝΑΣ ΑΣΦΑΛΕΙΑΣ — ΔΕΝ ΑΠΟΘΗΚΕΥΕΤΑΙ ΠΟΤΕ ΤΙΠΟΤΑ ΠΡΟΣΩΠΙΚΟ.
 * Η cache περιέχει ΜΟΝΟ στατικά αρχεία της εφαρμογής (γραμματοσειρές,
 * εικονίδια, η σελίδα «χωρίς σύνδεση»). Κάθε αίτημα προς το Supabase, κάθε
 * HTML σελίδα και κάθε /api διαδρομή πάει ΠΑΝΤΑ στο δίκτυο και δεν γράφεται
 * ποτέ στην cache. Ο λόγος είναι απλός: στη συσκευή μπορεί να συνδεθεί άλλος
 * χρήστης, και μια cache με ΑΦΜ ενοικιαστή ή μισθωτήριο θα επιβίωνε της
 * αποσύνδεσης. Αν χρειαστεί ποτέ offline ανάγνωση δεδομένων, γίνεται με
 * ρητή συγκατάθεση και καθαρισμό στο logout — όχι εδώ.
 *
 * Στρατηγική:
 *   navigate  → network-first, με fallback στη σελίδα /offline
 *   στατικά   → stale-while-revalidate (γρήγορα και πάντα φρέσκα την επόμενη)
 *   όλα τα άλλα (API, Supabase, POST) → σκέτο δίκτυο, χωρίς άγγιγμα
 * ═══════════════════════════════════════════════════════════════════════════ */

// Άλλαξε την έκδοση όποτε αλλάξει η λογική: οι παλιές caches σβήνονται στο activate.
const VERSION = 'v1';
const SHELL_CACHE = `pos-shell-${VERSION}`;
const STATIC_CACHE = `pos-static-${VERSION}`;
const OFFLINE_URL = '/offline';

// Το ελάχιστο που πρέπει να υπάρχει για να ανοίξει κάτι χωρίς δίκτυο.
const SHELL_ASSETS = [
  OFFLINE_URL,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/fonts/inter-latin.woff2',
  '/fonts/inter-greek.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll αποτυγχάνει ολόκληρο αν λείπει ΕΝΑ αρχείο· προσθέτουμε ένα-ένα
      // ώστε ένα λάθος όνομα να μη ρίχνει όλη την εγκατάσταση.
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== STATIC_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** Στατικό αρχείο που είναι ασφαλές να αποθηκευτεί; Μόνο δικά μας assets. */
function isCacheableStatic(url) {
  if (url.origin !== self.location.origin) return false;
  return url.pathname.startsWith('/_next/static/')
      || url.pathname.startsWith('/fonts/')
      || url.pathname.startsWith('/icons/')
      || url.pathname === '/favicon.ico';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ποτέ δεδομένα: Supabase, API, οτιδήποτε άλλης προέλευσης.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Πλοήγηση: πάντα δίκτυο πρώτα (ώστε να μη δει ποτέ παλιά σελίδα άλλου
  // χρήστη), με ευγενική πτώση στη σελίδα «χωρίς σύνδεση».
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error()))
    );
    return;
  }

  if (!isCacheableStatic(url)) return;

  // Στατικά: σερβίρουμε αμέσως ό,τι έχουμε και ανανεώνουμε στο παρασκήνιο.
  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => hit);
      return hit || network;
    })
  );
});

// Καθαρισμός κατ' απαίτηση (καλείται στο logout από την εφαρμογή). Δεν
// αποθηκεύουμε προσωπικά δεδομένα, αλλά ο καθαρισμός είναι φθηνός και σωστός.
self.addEventListener('message', (event) => {
  if (event.data !== 'pos-clear-caches') return;
  // ΔΕΝ σβήνουμε το SHELL_CACHE: γεμίζει ΜΟΝΟ στο install, το οποίο δεν ξανατρέχει
  // για ήδη εγκατεστημένο worker. Σβήνοντάς το, η σελίδα «χωρίς σύνδεση» χανόταν
  // οριστικά με την πρώτη αποσύνδεση και ο χρήστης έβλεπε ξανά τον δεινόσαυρο.
  // Καθαρίζουμε τα υπόλοιπα και το ξαναγεμίζουμε για κάθε ενδεχόμενο.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => caches.open(SHELL_CACHE))
      .then((cache) => Promise.allSettled(SHELL_ASSETS.map((u) => cache.add(u))))
  );
});
