// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΟΡΙΣΜΟΣ ΤΟΥ «Η ΠΑΡΑΓΩΓΗ ΕΙΝΑΙ ΟΡΘΙΑ», ΓΙΑ ΔΥΟ ΧΡΟΝΟΥΣ ΕΚΤΕΛΕΣΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΜΕΣΑ ΣΤΟ ΚΑΘΕΝΑ. Ο έλεγχος υγείας τρέχει πλέον από δύο
// μεριές: από τον δρομέα του GitHub μετά από κάθε deploy (Node) και από την
// Postgres κάθε τέταρτο (Deno, edge function). Αν ο κατάλογος διαδρομών ή ο
// κανόνας «τι θεωρείται υγιές» γραφτεί δύο φορές, μέσα σε έναν μήνα οι δύο
// έλεγχοι θα διαφωνούν — και ο ένας θα λέει «όλα καλά» για το ίδιο πράγμα που
// ο άλλος θα λέει «έπεσε». Το αρχείο είναι σκέτο `.mjs` χωρίς εξαρτήσεις
// ακριβώς για να το διαβάζουν και οι δύο.
//
// ΤΟ ΚΡΙΣΙΜΟ ΣΗΜΕΙΟ ΟΛΟΥ ΤΟΥ ΕΛΕΓΧΟΥ. Η σελίδα σφάλματος του Next
// (app/error.tsx) γυρίζει ΚΑΝΟΝΙΚΟ status 200 — είναι error boundary, όχι HTTP
// σφάλμα. Στη διακοπή των 27-28/07/2026 κάθε δημόσια διεύθυνση απαντούσε
// 200 OK ενώ ο επισκέπτης έβλεπε «Κάτι πήγε στραβά», για 24 ώρες, με πράσινο
// CI. Ελεγχος μόνο στον κωδικό status ΔΕΝ θα την είχε πιάσει. Γι' αυτό η
// επιτυχία απαιτεί 200 ΚΑΙ σώμα που δεν περιέχει αυτό το μήνυμα.
//
// Αν το κείμενο της σελίδας σφάλματος αλλάξει ποτέ, ΠΡΕΠΕΙ να αλλάξει και εδώ,
// αλλιώς ο έλεγχος γίνεται πάλι τυφλός. Ο guard-health-marker το επιβάλλει.
// ═══════════════════════════════════════════════════════════════════════════

export const ERROR_MARKER = 'Κάτι πήγε στραβά';

// Οι δημόσιες διαδρομές: ό,τι βλέπει κάποιος χωρίς λογαριασμό. Ακριβώς αυτές
// έπεσαν και ακριβώς αυτές είναι η πρώτη εντύπωση ενός υποψήφιου πελάτη.
//
// Το `must` είναι αναμενόμενο περιεχόμενο. Χωρίς αυτό, μια απάντηση 200 με
// άδειο ή ακρωτηριασμένο σώμα (μισοτελειωμένο stream, λάθος rewrite,
// σελίδα-φάντασμα του CDN) θα περνούσε για υγιής. Το ζητάμε στην αρχική, που
// είναι και η σελίδα με το μεγαλύτερο ρίσκο: η μόνη δημόσια που αγγίζει
// Supabase στο SSR.
export const ROUTES = [
  { path: '/', must: 'PROPERWISE' },
  { path: '/login', must: null },
  { path: '/signup', must: null },
  { path: '/trust', must: null },
  { path: '/privacy', must: null },
  { path: '/terms', must: null },
  { path: '/offline', must: null },
];

// Τρεις προσπάθειες με 5 δευτερόλεπτα αναμονή: μια στιγμιαία αστοχία δικτύου,
// ένα cold start ή ένα φευγαλέο 502 του CDN ΔΕΝ επιτρέπεται να σημάνει
// συναγερμό. Ενα ειδοποιητικό που χτυπά για ψέματα το αγνοεί ο άνθρωπος — και
// τότε δεν χτυπά ούτε για την αληθινή διακοπή.
export const ATTEMPTS = 3;
export const RETRY_MS = 5000;

// Χρονικό όριο ανά αίτημα: χωρίς αυτό, ένα αίτημα που κρεμάει μπλοκάρει τον
// έλεγχο για πάντα και τερματίζει χωρίς να πει ποια σελίδα φταίει.
export const TIMEOUT_MS = 20000;

// Κάτω από αυτό το μέγεθος η απάντηση δεν είναι σελίδα, ό,τι κι αν λέει ο κωδικός.
export const MIN_CHARS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ενα χτύπημα σε μία διαδρομή. Επιστρέφει την ετυμηγορία, ποτέ δεν πετάει. */
export async function probe(base, route) {
  const url = base + route.path;
  const started = Date.now();
  let res;
  try {
    // redirect: 'follow' — μας ενδιαφέρει τι βλέπει τελικά ο επισκέπτης, όχι
    // πόσα άλματα έκανε στον δρόμο. Κανένα ειδικό header: χτυπάμε την παραγωγή
    // ακριβώς όπως ένας browser, ώστε να ελέγχεται η ΙΔΙΑ απάντηση (μαζί με
    // τυχόν cache του CDN) που παίρνει και ο κόσμος.
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'properwise-health-check', accept: 'text/html' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const why = err?.name === 'TimeoutError'
      ? `καμία απάντηση σε ${TIMEOUT_MS / 1000}s`
      : (err?.message || String(err));
    return { ok: false, status: '—', ms: Date.now() - started, why: `δίκτυο: ${why}` };
  }

  const body = await res.text().catch(() => '');
  const ms = Date.now() - started;

  if (res.status !== 200) return { ok: false, status: res.status, ms, why: `κωδικός ${res.status}` };
  if (body.includes(ERROR_MARKER)) return { ok: false, status: 200, ms, why: `200 αλλά σελίδα σφάλματος («${ERROR_MARKER}»)` };
  if (body.length < MIN_CHARS) return { ok: false, status: 200, ms, why: `200 αλλά σχεδόν άδειο σώμα (${body.length} χαρακτήρες)` };
  if (route.must && !body.includes(route.must)) return { ok: false, status: 200, ms, why: `200 αλλά λείπει το αναμενόμενο «${route.must}»` };

  return { ok: true, status: 200, ms, why: '' };
}

/** Μία διαδρομή, με τις επαναλήψεις της. */
export async function checkRoute(base, route) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await probe(base, route);
    last.tries = attempt;
    if (last.ok) return last;
    if (attempt < ATTEMPTS) await sleep(RETRY_MS);
  }
  return last;
}

/**
 * Ολος ο έλεγχος. Σειριακά και όχι παράλληλα: επτά ταυτόχρονα αιτήματα κάθε
 * τέταρτο μοιάζουν με μικρό burst και μπορούν να πυροδοτήσουν rate limiting
 * του CDN — δηλαδή ο ίδιος ο έλεγχος να παράγει την αποτυχία που υποτίθεται
 * ότι ανιχνεύει.
 */
export async function runHealth(base) {
  const results = [];
  for (const route of ROUTES) results.push({ route, res: await checkRoute(base, route) });
  return results;
}

/**
 * Η ΔΙΑΓΝΩΣΗ: ξεχωρίζει «σπασμένη εφαρμογή» από «κοιτάς λάθος διεύθυνση».
 *
 * ΓΙΑΤΙ ΥΠΑΡΧΕΙ. Την πρώτη μέρα λειτουργίας του ελέγχου, μια μαντεμένη
 * διεύθυνση γύρισε 404 σε ΟΛΕΣ τις διαδρομές και σήμανε συναγερμό ενώ η
 * παραγωγή ήταν μια χαρά. Ενας συναγερμός που δεν ξεχωρίζει «το site έπεσε»
 * από «κοιτάς αλλού» εκπαιδεύει τον αναγνώστη να τον αγνοεί.
 *
 * Η υπογραφή είναι καθαρή: όταν ΚΑΘΕ διαδρομή γυρίζει 404, ούτε μία δεν
 * υπάρχει. Καμία πραγματική βλάβη δεν το κάνει αυτό — ένα σπασμένο deploy
 * δίνει 500 ή τη σελίδα σφάλματος με 200, μια πεσμένη βάση αφήνει τις στατικές
 * σελίδες όρθιες.
 */
export function diagnose(results) {
  const failed = results.filter((r) => !r.res.ok);
  if (!failed.length) return { kind: 'ok', failed };
  if (failed.length === results.length && failed.every(({ res }) => res.status === 404)) {
    return { kind: 'wrong-address', failed };
  }
  if (failed.length === results.length && failed.every(({ res }) => res.status === '—')) {
    return { kind: 'no-network', failed };
  }
  return { kind: 'broken', failed };
}
