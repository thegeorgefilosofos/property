// ═══════════════════════════════════════════════════════════════════════════
// ΤΟ ΠΕΡΑΣΜΑ ΔΟΚΙΜΑΖΕΤΑΙ ΧΩΡΙΣ ΝΑ ΠΕΣΕΙ Η ΕΚΤ
// ─────────────────────────────────────────────────────────────────────────
// Δύο συμπεριφορές που δεν φαίνονται με το μάτι και κοστίζουν όταν λείπουν:
// η σειρά των υποψηφίων (ημερήσιο πρώτα, μηνιαίο δεύτερο) και η απομόνωση —
// μία σειρά που σκάει δεν παίρνει μαζί της τις άλλες επτά.
// ═══════════════════════════════════════════════════════════════════════════
import { fetchLatest, ECB_SERIES } from '@/lib/market/ecb';

let pass = 0; const fail: string[] = [];
const eq = (what: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fail.push(`${what}\n    περίμενα: ${JSON.stringify(want)}\n    πήρα:     ${JSON.stringify(got)}`);
};

const NOW = '2026-09-01T08:00:00Z';
const ok = (value: number, period: string) => ({
  ok: true, status: 200, json: async () => ({
    dataSets: [{ series: { s: { observations: { '0': [value] } } } }],
    structure: { dimensions: { observation: [{ values: [{ id: period }] }] } },
  }),
});
const bad = (status: number) => ({ ok: false, status, json: async () => ({}) });

// Το tsx μεταγλωττίζει σε cjs, όπου το `await` στο ανώτατο επίπεδο δεν
// επιτρέπεται. Ολο το πέρασμα ζει σε μία `main`, που καλείται στο τέλος.
async function main() {
  // ── Η ΤΑΥΤΟΤΗΤΑ ΓΡΑΦΕΤΑΙ ΟΠΩΣ ΕΙΝΑΙ, ΟΧΙ ΟΠΩΣ ΘΑ ΘΕΛΑΜΕ ──────────────────
  // Το Euribor το δημοσιεύει η ΕΚΤ ΜΟΝΟ μηνιαία: ρωτήθηκε ο κατάλογος του Data
  // Portal με μπαλαντέρ στη συχνότητα και απάντησε «A | M | Q». Δεν υπάρχει
  // ημερήσιο κλείσιμο να πάρουμε. Αρα η βάση πρέπει να λέει «μέσος όρος μήνα»
  // και ο σύνδεσμος να δείχνει στη μηνιαία σειρά — αλλιώς η οθόνη παρουσιάζει
  // τον μέσο όρο ενός μήνα ως τη σημερινή τιμή.
  const monthly = async () => ok(2.3397, '2026-06');
  const r1 = await fetchLatest(NOW, monthly as never);
  eq('η μηνιαία τιμή διαβάζεται',            r1.fresh.euribor_3m?.value, 2.3397);
  eq('και η βάση μέτρησης λέει την αλήθεια', r1.fresh.euribor_3m?.basis, 'μέσος όρος μήνα');
  eq('με την περίοδο της παρατήρησης',       r1.fresh.euribor_3m?.asOf, '2026-06-01');
  eq('και σύνδεσμο στη ΣΩΣΤΗ σειρά',
    r1.fresh.euribor_3m?.url, 'https://data.ecb.europa.eu/data/datasets/FM/FM.M.U2.EUR.RT.MM.EURIBOR3MD_.HSTA');

  // ── Η ΑΠΟΜΟΝΩΣΗ ──────────────────────────────────────────────────────────
  const oneBroken = async (url: string) =>
    url.includes('EURIBOR3MD_') ? (() => { throw new Error('δίκτυο') })() : ok(2.15, '2026-08-31');
  const r2 = await fetchLatest(NOW, oneBroken as never);
  eq('οι υπόλοιπες επτά ήρθαν', Object.keys(r2.fresh).length, ECB_SERIES.length - 1);
  eq('η σπασμένη λείπει',       r2.fresh.euribor_3m, undefined);
  eq('και αναφέρεται με το όνομά της', r2.problems.length, 1);
  eq('με λόγο, όχι σιωπή', /Euribor τριμήνου/.test(r2.problems[0]) && /δίκτυο/.test(r2.problems[0]), true);

  // ── ΤΙΠΟΤΑ ΔΕΝ ΓΡΑΦΕΤΑΙ ΟΤΑΝ Η ΠΗΓΗ ΕΧΕΙ ΠΕΣΕΙ ───────────────────────────
  const allDown = async () => bad(503);
  const r3 = await fetchLatest(NOW, allDown as never);
  eq('πεσμένη πηγή δεν δίνει καμία τιμή', Object.keys(r3.fresh).length, 0);
  eq('και αναφέρει κάθε μία',             r3.problems.length, ECB_SERIES.length);

  // ── ΟΛΑ ΚΑΛΑ ─────────────────────────────────────────────────────────────
  const allOk = async () => ok(2.15, '2026-08-31');
  const r4 = await fetchLatest(NOW, allOk as never);
  eq('όλες οι σειρές ήρθαν',   Object.keys(r4.fresh).length, ECB_SERIES.length);
  eq('χωρίς κανένα πρόβλημα',  r4.problems, []);
  eq('με κοινή στιγμή λήψης',  r4.fresh.ecb_rate?.fetchedAt, NOW);

  if (fail.length) { console.error(`\n✗ ecb πέρασμα: ${fail.length} αποτυχίες\n`); for (const f of fail) console.error('  ' + f); process.exit(1); }
  console.log(`✓ ecb πέρασμα: ${pass} έλεγχοι πέρασαν`);
}

main()
