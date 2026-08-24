#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// Έλεγχος υγείας παραγωγής — χτυπά τις δημόσιες σελίδες όπως ένας επισκέπτης.
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ — ΜΙΑ ΠΡΑΓΜΑΤΙΚΗ ΔΙΑΚΟΠΗ 24 ΩΡΩΝ:
// Στις 27–28/07/2026 ολόκληρη η δημόσια σελίδα ήταν κάτω περίπου μία μέρα και
// το έμαθε ο ιδιοκτήτης με το μάτι του — κανένας αυτοματισμός δεν φώναξε. Σε
// όλη τη διάρκεια το CI ήταν ΠΡΑΣΙΝΟ: το `npm run build` περνούσε καθαρά και
// τα 74 test suites περνούσαν. Η αιτία ήταν σφάλμα στην ΑΠΟΔΟΣΗ (SSR), όχι στη
// μεταγλώττιση: Server Components διάβαζαν τιμή από module `'use client'` και
// έπαιρναν `undefined`.
//
// ΤΟ ΜΑΘΗΜΑ: ΤΟ ΠΡΑΣΙΝΟ CI ΔΕΝ ΣΗΜΑΙΝΕΙ ΟΤΙ Η ΣΕΛΙΔΑ ΑΝΟΙΓΕΙ. Το μόνο που το
// αποδεικνύει είναι ένα πραγματικό αίτημα προς την παραγωγή, στο οποίο
// διαβάζουμε το σώμα της απάντησης. Αυτό κάνει αυτό το script.
//
// Τρέχει με σκέτο node (global fetch) — καμία εξάρτηση, ώστε να μπορεί να
// τρέξει σε runner χωρίς `npm ci` και να μη σπάσει ποτέ από αναβάθμιση πακέτου.
// ═══════════════════════════════════════════════════════════════════════════

// Η βάση URL έρχεται από το HEALTH_BASE_URL· το πρώτο όρισμα γραμμής εντολών
// υπερισχύει, για να δοκιμάζεται εύκολα άλλο περιβάλλον (preview, staging,
// localhost) χωρίς να πειραχθεί η μεταβλητή. ΔΕΝ μαντεύουμε διεύθυνση εδώ: ένας
// έλεγχος που χτυπά σιωπηλά λάθος site είναι χειρότερος από κανέναν έλεγχο,
// γιατί δίνει ψεύτικη ησυχία. Το default το βάζει ρητά το workflow, με warning.
const BASE = (process.argv[2] || process.env.HEALTH_BASE_URL || '').trim().replace(/\/+$/, '');
if (!BASE) {
  console.error('❌ Λείπει η βάση URL.');
  console.error('   Δώσε HEALTH_BASE_URL=https://… ή πέρασέ την ως πρώτο όρισμα:');
  console.error('   node scripts/health-check.mjs https://property-tan-gamma.vercel.app');
  process.exit(1);
}

// ── ΤΟ ΚΡΙΣΙΜΟ ΣΗΜΕΙΟ ΟΛΟΥ ΤΟΥ ΕΛΕΓΧΟΥ ──────────────────────────────────────
// Η σελίδα σφάλματος του Next (app/error.tsx, app/global-error.tsx) γυρίζει
// ΚΑΝΟΝΙΚΟ status 200 — είναι error boundary, όχι HTTP σφάλμα. Δηλαδή στη
// διακοπή που μόλις ζήσαμε κάθε δημόσια διεύθυνση απαντούσε 200 OK ενώ ο
// επισκέπτης έβλεπε «Κάτι πήγε στραβά».
//
// ΑΡΑ: έλεγχος ΜΟΝΟ στον κωδικό status ΔΕΝ θα είχε πιάσει τη διακοπή. Θα ήταν
// πράσινος και τις 24 ώρες. Γι' αυτό η επιτυχία απαιτεί 200 ΚΑΙ σώμα που δεν
// περιέχει αυτό το μήνυμα. Αν το κείμενο της σελίδας σφάλματος αλλάξει ποτέ,
// ΠΡΕΠΕΙ να αλλάξει και εδώ — αλλιώς ο έλεγχος γίνεται πάλι τυφλός.
const ERROR_MARKER = 'Κάτι πήγε στραβά';

// Οι δημόσιες διαδρομές: ό,τι βλέπει κάποιος χωρίς λογαριασμό. Ακριβώς αυτές
// έπεσαν, και ακριβώς αυτές είναι η πρώτη εντύπωση ενός υποψήφιου πελάτη.
//
// Το `must` είναι αναμενόμενο περιεχόμενο. Χωρίς αυτό, μια απάντηση 200 με άδειο
// ή ακρωτηριασμένο σώμα (μισοτελειωμένο stream, λάθος rewrite, σελίδα-φάντασμα
// του CDN) θα περνούσε για υγιής. Το ζητάμε στην αρχική, που είναι και η σελίδα
// με το μεγαλύτερο ρίσκο: είναι η μόνη δημόσια που αγγίζει Supabase στο SSR.
const ROUTES = [
  { path: '/', must: 'PROPERWISE' },
  { path: '/login', must: null },
  { path: '/signup', must: null },
  { path: '/trust', must: null },
  { path: '/privacy', must: null },
  { path: '/terms', must: null },
  { path: '/offline', must: null },
];

// Τρεις προσπάθειες με 5 δευτερόλεπτα αναμονή: μια στιγμιαία αστοχία δικτύου,
// ένα cold start ή ένα φευγαλέο 502 του CDN ΔΕΝ επιτρέπεται να σημάνει συναγερμό.
// Ένα ειδοποιητικό που χτυπά για ψέματα το αγνοεί ο άνθρωπος — και τότε δεν
// χτυπά ούτε για την αληθινή διακοπή.
const ATTEMPTS = 3;
const RETRY_MS = 5000;

// Χρονικό όριο ανά αίτημα: χωρίς αυτό, ένα αίτημα που κρεμάει μπλοκάρει τον
// έλεγχο για πάντα και το job σκάει σε timeout χωρίς να πει ποια σελίδα φταίει.
const TIMEOUT_MS = 20000;

// Κάτω από αυτό το μέγεθος η απάντηση δεν είναι σελίδα, ό,τι κι αν λέει ο κωδικός.
const MIN_CHARS = 500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe(route) {
  const url = BASE + route.path;
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
    const why = err?.name === 'TimeoutError' ? `καμία απάντηση σε ${TIMEOUT_MS / 1000}s` : (err?.message || String(err));
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

async function checkRoute(route) {
  let last;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    last = await probe(route);
    last.tries = attempt;
    if (last.ok) return last;
    if (attempt < ATTEMPTS) await sleep(RETRY_MS);
  }
  return last;
}

const pad = (v, n) => {
  const s = String(v);
  return s + ' '.repeat(Math.max(0, n - s.length));
};

console.log('Έλεγχος υγείας παραγωγής');
console.log(`Βάση: ${BASE}`);
console.log(`Ώρα:  ${new Date().toISOString()}`);
console.log('');

// Σειριακά και όχι παράλληλα: επτά ταυτόχρονα αιτήματα κάθε 15 λεπτά μοιάζουν
// με μικρό burst και μπορούν να πυροδοτήσουν rate limiting του CDN — δηλαδή ο
// ίδιος ο έλεγχος να παράγει την αποτυχία που υποτίθεται ότι ανιχνεύει.
const results = [];
for (const route of ROUTES) results.push({ route, res: await checkRoute(route) });

const wPath = Math.max(10, ...ROUTES.map((r) => r.path.length + 1));
console.log(`${pad('Διαδρομή', wPath)}${pad('Κωδ.', 7)}${pad('Χρόνος', 9)}${pad('Προσπ.', 8)}Αποτέλεσμα`);
console.log(`${'─'.repeat(wPath - 1)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(7)} ${'─'.repeat(40)}`);
for (const { route, res } of results) {
  const verdict = res.ok ? '✅ ΟΚ' : `❌ ${res.why}`;
  console.log(`${pad(route.path, wPath)}${pad(res.status, 7)}${pad(res.ms + 'ms', 9)}${pad(`${res.tries}/${ATTEMPTS}`, 8)}${verdict}`);
}
console.log('');

const failed = results.filter((r) => !r.res.ok);
if (!failed.length) {
  console.log(`✅ Και οι ${results.length} δημόσιες διαδρομές απαντούν σωστά.`);
  process.exit(0);
}

console.log(`❌ ${failed.length} από ${results.length} διαδρομές ΑΠΕΤΥΧΑΝ μετά από ${ATTEMPTS} προσπάθειες:`);
for (const { route, res } of failed) {
  console.log(`   ${route.path} → ${res.why}`);
  // Annotation ώστε η αποτυχία να φαίνεται στην περίληψη του run και όχι μόνο
  // βαθιά μέσα στο log, όπου κανείς δεν σκρολάρει.
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${route.path} → ${res.why}`);
}
console.log('');

// ── ΔΙΑΓΝΩΣΗ: διάκριση «σπασμένη εφαρμογή» από «λάθος διεύθυνση» ────────────
//
// ΓΙΑΤΙ ΥΠΑΡΧΕΙ: την πρώτη μέρα λειτουργίας του ελέγχου, μια μαντεμένη διεύθυνση
// γύρισε 404 σε ΟΛΕΣ τις διαδρομές και άνοιξε issue «η παραγωγή δεν απαντά» ενώ
// η παραγωγή ήταν μια χαρά. Ένας συναγερμός που δεν ξεχωρίζει «το site έπεσε»
// από «κοιτάς αλλού» εκπαιδεύει τον αναγνώστη να τον αγνοεί — και τότε είναι
// χειρότερος από το τίποτα.
//
// Η υπογραφή είναι καθαρή: όταν ΚΑΘΕ διαδρομή γυρίζει 404, ούτε μία δεν υπάρχει.
// Καμία πραγματική βλάβη δεν το κάνει αυτό: ένα σπασμένο deploy δίνει 500 ή τη
// σελίδα σφάλματος με 200, μια πεσμένη βάση αφήνει τις στατικές σελίδες όρθιες.
// Το «τίποτα δεν υπάρχει εδώ» σημαίνει σχεδόν πάντα ότι το «εδώ» είναι λάθος.
const all404 = failed.length === results.length && failed.every(({ res }) => res.status === 404);
const allNetwork = failed.length === results.length && failed.every(({ res }) => res.status === '—');

if (all404) {
  console.log('⚠  ΟΛΕΣ οι διαδρομές γύρισαν 404. Αυτό ΔΕΝ μοιάζει με βλάβη της εφαρμογής:');
  console.log('   μια σπασμένη έκδοση δίνει 500 ή σελίδα σφάλματος, όχι «δεν υπάρχει».');
  console.log(`   Πιθανότερη αιτία: η διεύθυνση ${BASE} δεν είναι η παραγωγή.`);
  console.log('   Έλεγξε το secret HEALTH_BASE_URL (βλ. docs/dev/health.md).');
} else if (allNetwork) {
  console.log('⚠  Καμία διαδρομή δεν απάντησε καθόλου (σφάλμα δικτύου/DNS).');
  console.log(`   Είτε το ${BASE} δεν αναλύεται, είτε υπάρχει ολική διακοπή.`);
} else {
  console.log('Αν η «σελίδα σφάλματος» εμφανίζεται σε ΠΟΛΛΕΣ διαδρομές μαζί, πρώτος ύποπτος');
  console.log('είναι το σύνορο server/πελάτη: node scripts/check-server-imports.mjs');
}
process.exit(1);
