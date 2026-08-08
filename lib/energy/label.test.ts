// npx tsx lib/energy/label.test.ts
//
// Η ετικέτα ημερομηνίας που βλέπει ο χρήστης στη σύγκριση παρόχων ζει μέσα στο
// component, ως σκέτη σταθερά. Η πηγή αλήθειας για το πότε ελέγχθηκαν πραγματικά
// οι τιμές ζει στο data/price-sources.json, που το διαβάζει το προγραμματισμένο
// workflow. Δύο σημεία, μία αλήθεια: αν αποκλίνουν, ο χρήστης βλέπει ημερομηνία
// που δεν αντιστοιχεί σε κανέναν έλεγχο.
//
// Ο συσχετισμός δεν γίνεται με import του JSON μέσα στο component επίτηδες: ένα
// σφάλμα interop σε module scope δεν χαλάει μία οθόνη, δεν αφήνει να φορτώσει
// ΟΛΗ η εφαρμογή. Η συνέπεια φυλάσσεται εδώ αντί να αγοραστεί με τέτοιο ρίσκο.

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}
function ok(name: string, cond: boolean) {
  if (cond) { pass++; } else { fail++; console.error(`✗ ${name}`); }
}

const sources = JSON.parse(readFileSync('data/price-sources.json', 'utf8')) as {
  electricity: { label: string; checkedAt: string; maxAgeDays: number; sources: { name: string; url: string }[] };
  gas: { label: string; checkedAt: string };
  insurance: { label: string; checkedAt: string; maxAgeDays: number; registryVerifiedAt: string | null };
};

const component = readFileSync('app/dashboard/components/BillsElectricity.tsx', 'utf8');
const m = /const LAST_UPDATED = '([^']+)'/.exec(component);

ok('η ετικέτα υπάρχει στο component', m !== null);
eq('η ετικέτα συμφωνεί με το data/price-sources.json', m?.[1], sources.electricity.label);

// ── Η ΔΕΥΤΕΡΗ ΗΜΕΡΟΜΗΝΙΑ, ΠΟΥ ΔΕΝ ΤΗΝ ΦΥΛΑΓΕ ΤΙΠΟΤΑ ──────────────────────
// Το `TARIFFS_VERIFIED` προστέθηκε στο component για την πύλη φρεσκάδας και
// μπήκε ως '2026-07-08' ενώ το `checkedAt` έλεγε '2026-07-29': απόκλιση είκοσι
// μιας ημερών, σιωπηλή, γιατί ο έλεγχος εδώ κοίταζε ΜΟΝΟ την ετικέτα. Δύο
// ημερομηνίες για το ίδιο γεγονός, και η μία κρίνει αν η οθόνη ανακηρύσσει
// νικητή τιμολογίου.
const v = /const TARIFFS_VERIFIED = '([^']+)'/.exec(component);
ok('η ημερομηνία επαλήθευσης υπάρχει στο component', v !== null);
eq('και συμφωνεί με το checkedAt του data/price-sources.json', v?.[1], sources.electricity.checkedAt);

// Και το ΚΑΤΩΦΛΙ: το JSON το ορίζει ανά κατηγορία με γραμμένη αιτιολογία, οπότε
// ένας αριθμός καρφωμένος στο component που δεν συμφωνεί ακυρώνει την αιτιολογία.
const ma = /const TARIFFS_MAX_AGE_DAYS = (\d+)/.exec(component);
eq('το κατώφλι παλαιότητας συμφωνεί με το maxAgeDays', Number(ma?.[1]), sources.electricity.maxAgeDays);

// ── ΤΟ ΙΔΙΟ ΓΙΑ ΤΗΝ ΑΣΦΑΛΕΙΑ ────────────────────────────────────────────
// Σαράντα οκτώ ασφάλιστρα παρουσιάζονταν χωρίς καμία ημερομηνία, ενώ η οθόνη
// ανακήρυσσε «ΠΡΟΤΕΙΝΟΜΕΝΟ ΓΙΑ ΕΣΕΝΑ». Τρεις κατάλογοι, τρία πρότυπα.
const ins = readFileSync('app/dashboard/components/BillsInsurance.tsx', 'utf8');
const iv = /const INSURANCE_VERIFIED = '([^']+)'/.exec(ins);
const im = /const INSURANCE_MAX_AGE_DAYS = (\d+)/.exec(ins);
eq('η ημερομηνία της ασφάλειας συμφωνεί με το checkedAt', iv?.[1], sources.insurance.checkedAt);
eq('και το κατώφλι της με το maxAgeDays', Number(im?.[1]), sources.insurance.maxAgeDays);

// Η ημερομηνία ελέγχου πρέπει να είναι πραγματική ημερομηνία, όχι κείμενο.
for (const key of ['electricity', 'gas', 'insurance'] as const) {
  const iso = sources[key].checkedAt;
  ok(`${key}: έγκυρη ημερομηνία ελέγχου`, /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(Date.parse(iso)));
  ok(`${key}: μη κενή ετικέτα`, sources[key].label.trim().length > 3);
}

ok('το ρεύμα έχει καταγεγραμμένες πηγές', sources.electricity.sources.length >= 3);
ok('κάθε πηγή έχει διεύθυνση', sources.electricity.sources.every(s => /^https:\/\//.test(s.url)));

// Δεν δηλώνουμε επαλήθευση μητρώου που δεν έγινε. Όταν γίνει από άνθρωπο,
// μπαίνει ημερομηνία και αυτός ο έλεγχος τη δέχεται.
ok('η επαλήθευση μητρώου ασφαλιστικών είναι είτε κενή είτε πραγματική ημερομηνία',
  sources.insurance.registryVerifiedAt === null
  || /^\d{4}-\d{2}-\d{2}$/.test(sources.insurance.registryVerifiedAt));

console.log(fail === 0 ? `✓ label: ${pass} έλεγχοι πέρασαν` : `✗ label: ${fail} απέτυχαν από ${pass + fail}`);
if (fail > 0) process.exit(1);
