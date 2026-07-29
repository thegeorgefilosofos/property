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
 *   navigate           → network-first, με fallback στη σελίδα /offline
 *   /_next/static/     → NETWORK-FIRST (δες παρακάτω γιατί), cache μόνο ως δίχτυ
 *   fonts/icons        → stale-while-revalidate
 *   όλα τα άλλα (API, Supabase, POST) → σκέτο δίκτυο, χωρίς άγγιγμα
 *
 * ═══ ΓΙΑΤΙ ΤΑ ΑΡΧΕΙΑ ΤΟΥ BUILD ΔΕΝ ΕΙΝΑΙ STALE-WHILE-REVALIDATE ═══════════
 *
 * ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΕΚΛΕΙΣΕ ΤΗΝ ΕΦΑΡΜΟΓΗ:
 * Η προηγούμενη έκδοση σέρβιρε τα `/_next/static/` με stale-while-revalidate,
 * δηλαδή ΠΡΩΤΑ ό,τι είχε αποθηκευμένο και ανανέωνε στο παρασκήνιο. Αυτό είναι
 * σωστό ΜΟΝΟ όταν το όνομα του αρχείου αλλάζει μαζί με το περιεχόμενό του.
 *
 * Με το Turbopack ΔΕΝ ισχύει. Τα ονόματα των chunk βγαίνουν από τη διαδρομή του
 * module και όχι από hash περιεχομένου: `08ij7tla2f_q_.js` μένει `08ij7tla2f_q_.js`
 * σε κάθε build, με ΑΛΛΟ περιεχόμενο μέσα.
 *
 * Το αποτέλεσμα ήταν θανατηφόρο και σιωπηλό:
 *   • Η σελίδα (navigate) ερχόταν ΚΑΙΝΟΥΡΓΙΑ, γιατί είναι network-first.
 *   • Τα chunk έρχονταν ΠΑΛΙΑ, από την cache, με το ίδιο όνομα.
 *   • Το νέο HTML ζητούσε modules που το παλιό chunk δεν είχε.
 *   • React error boundary: «Κάτι πήγε στραβά».
 *
 * Η αρχική σελίδα επιβίωνε επειδή έχει ελάχιστα chunk. Το dashboard, με δεκάδες,
 * έσπαγε πάντα. Και δεν υπήρχε διέξοδος: ο χρήστης δεν μπορούσε να φτάσει καν
 * στην αποσύνδεση που καθαρίζει τις caches.
 *
 * ΤΟ ΚΟΣΤΟΣ ΤΗΣ ΔΙΟΡΘΩΣΗΣ ΕΙΝΑΙ ΣΧΕΔΟΝ ΜΗΔΕΝ: τα αρχεία του build σερβίρονται με
 * `immutable` cache headers, οπότε το network-first χτυπά τη ΔΙΚΗ ΤΟΥ HTTP cache
 * του browser και δεν κατεβάζει τίποτα ξανά. Η cache του service worker μένει
 * μόνο ως δίχτυ για όταν πέσει το δίκτυο.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Άλλαξε την έκδοση όποτε αλλάξει η λογική: οι παλιές caches σβήνονται στο
// activate. Το v2 είναι αυτό που ΞΕΚΛΕΙΔΩΝΕΙ τις ήδη χαλασμένες εγκαταστάσεις:
// σβήνει το δηλητηριασμένο pos-static-v1 με τα ασύμβατα chunk.
const VERSION = 'v2';
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

/**
 * Αρχείο του build (JavaScript, CSS). Το όνομά του ΞΑΝΑΧΡΗΣΙΜΟΠΟΙΕΙΤΑΙ σε
 * επόμενο build με άλλο περιεχόμενο, άρα δεν επιτρέπεται να σερβιριστεί παλιό.
 */
function isBuildAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

/**
 * Αρχείο με σταθερό όνομα ΚΑΙ σταθερό περιεχόμενο, δικό μας. Γραμματοσειρές και
 * εικονίδια αλλάζουν σχεδόν ποτέ, και όταν αλλάξουν, αλλάζει και το όνομα.
 */
function isStableAsset(url) {
  return url.pathname.startsWith('/fonts/')
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

  // Αρχεία του build: ΠΑΝΤΑ δίκτυο πρώτα. Η cache είναι μόνο δίχτυ για offline.
  // Ένα παλιό chunk με το ίδιο όνομα και άλλο περιεχόμενο κλειδώνει την
  // εφαρμογή σε «Κάτι πήγε στραβά», χωρίς τρόπο διαφυγής για τον χρήστη.
  if (isBuildAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          const hit = await cache.match(req);
          return hit || Response.error();
        }
      })
    );
    return;
  }

  if (!isStableAsset(url)) return;

  // Σταθερά αρχεία: σερβίρουμε αμέσως ό,τι έχουμε και ανανεώνουμε στο παρασκήνιο.
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
