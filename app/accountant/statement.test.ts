// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΦΥΛΑΕΙ ΑΥΤΟ ΤΟ ΑΡΧΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Η πρόταση «Κανένα ακίνητο χωρίς καταχωρημένη είσπραξη: Α, Β» έφτασε ζωντανή
// σε οθόνη που τη διαβάζει επαγγελματίας. Λέει το ΑΝΤΙΘΕΤΟ από ό,τι εννοεί, και
// από κάτω παραθέτει τη λίστα που την αναιρεί. Κανένας τύπος και κανένας
// φύλακας δεν πιάνει πρόταση που διαβάζεται ανάποδα — μόνο ένας έλεγχος που τη
// γράφει ολόκληρη και τη συγκρίνει.
//
// Και δεύτερο: το ποσό της οθόνης και το ποσό του αρχείου βγαίνουν από την ΙΔΙΑ
// συνάρτηση. Ο έλεγχος το κρατά έτσι, γιατί η απόκλιση δεν θα φαινόταν πουθενά
// μέχρι να την υποβάλει κάποιος.
// ═══════════════════════════════════════════════════════════════════════════
import {
  propertyLines, statementTotals, statementGaps, statementSheets,
  type PortalProperty,
} from './statement';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => {
  if (cond) passed++; else { failed++; fails.push(name); }
};
const eq = <T>(name: string, got: T, want: T) =>
  ok(`${name} (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`, JSON.stringify(got) === JSON.stringify(want));

const prop = (over: Partial<PortalProperty> = {}): PortalProperty => ({
  name: 'Ακίνητο', atak: '01234567890', address: 'Οδός 1, Αθήνα', prop_type: 'Κατοικία',
  sqm: 60, ownership: 100,
  rent_collected: 0, rent_months: 0, rent_monthly: null,
  expenses: [], stays: [], ...over,
});

// ── Η ΠΡΟΤΑΣΗ ΠΟΥ ΔΙΑΒΑΖΟΤΑΝ ΑΝΑΠΟΔΑ ─────────────────────────────────────
{
  const lines = propertyLines([prop({ name: 'Παγκράτι' }), prop({ name: 'Κουκάκι' })]);
  const g = statementGaps(lines).find(x => x.key === 'income');
  eq('όλα χωρίς είσπραξη', g?.text, 'Κανένα ακίνητο δεν έχει καταχωρημένη είσπραξη: Παγκράτι, Κουκάκι');
  ok('η παλιά, ανάποδη διατύπωση δεν επανέρχεται', !(g?.text || '').startsWith('Κανένα ακίνητο χωρίς'));
}
{
  const lines = propertyLines([
    prop({ name: 'Παγκράτι', rent_collected: 4800, rent_months: 12 }),
    prop({ name: 'Κουκάκι' }),
  ]);
  const g = statementGaps(lines).find(x => x.key === 'income');
  eq('μερικά χωρίς είσπραξη', g?.text, '1 από 2 ακίνητα χωρίς καταχωρημένη είσπραξη: Κουκάκι');
}

// ── ΤΙ ΕΜΠΟΔΙΖΕΙ ΤΟ ΚΛΕΙΣΙΜΟ ──────────────────────────────────────────────
{
  const lines = propertyLines([prop({
    sqm: 0, rent_collected: 1200, rent_months: 3,
    expenses: [{ category: 'ΔΕΗ', amount: 90, date: '2025-03-04' }],
  })]);
  const g = statementGaps(lines).find(x => x.key === 'sqm');
  ok('το εμβαδόν που λείπει εμποδίζει τη γραμμή του Ε2', g?.blocking === true);
  ok('όσα ακίνητα έχουν ΑΤΑΚ δεν παράγουν εκκρεμότητα', !statementGaps(lines).some(x => x.key === 'atak'));
}

// ── ΤΟ ΩΜΟ TOTAL ΔΕΝ ΑΘΡΟΙΖΕΤΑΙ ───────────────────────────────────────────
{
  const lines = propertyLines([prop({
    stays: [{ check_in: '2025-07-01', check_out: '2025-07-05', nights: 4, total: 500,
              gross_guest_paid: 500, climate_levy: 40, platform_fee: 75, amount_basis: 'gross' }],
  })]);
  // 500 πλήρωσε ο επισκέπτης· τα 40 είναι τέλος ανθεκτικότητας του Δημοσίου.
  eq('δηλωτέο ακαθάριστο χωρίς το τέλος', lines[0].shortGross, 460);
  eq('η γραμμή δηλώνει βάση, άρα δεν είναι εκκρεμής', lines[0].staysUnresolved, 0);
}
{
  const lines = propertyLines([prop({
    stays: [{ check_in: '2025-07-01', check_out: '2025-07-05', nights: 4, total: 300 }],
  })]);
  eq('χωρίς ανάλυση μπαίνει το total', lines[0].shortGross, 300);
  eq('και μετριέται ως εκκρεμές', lines[0].staysUnresolved, 1);
}

// ── ΚΕΝΗ ΧΡΗΣΗ ────────────────────────────────────────────────────────────
{
  const t = statementTotals(propertyLines([prop(), prop()]));
  eq('κενή χρήση δεν έχει καταχωρήσεις', t.hasEntries, false);
  eq('και κανένα έσοδο', t.income, 0);
}

// ── ΟΘΟΝΗ ΚΑΙ ΑΡΧΕΙΟ ΛΕΝΕ ΤΟ ΙΔΙΟ ─────────────────────────────────────────
{
  const lines = propertyLines([
    prop({ name: 'Α', rent_collected: 4800, rent_months: 12, expenses: [{ category: 'ΔΕΗ', amount: 120, date: '2025-02-01' }] }),
    prop({ name: 'Β', stays: [{ check_in: '2025-08-01', check_out: '2025-08-04', nights: 3, total: 400, gross_guest_paid: 400, climate_levy: 30, amount_basis: 'gross' }] }),
  ]);
  const t = statementTotals(lines);
  const sheets = statementSheets({ owner: 'Ιδιοκτήτης', year: 2025, issued: '18/08/2026', lines });
  const cols = sheets[0].columns.map(c => c.header);
  const fromFile = sheets[0].rows.reduce((s, r) => s + Number(r[cols.indexOf('Σύνολο εσόδων')] || 0), 0);
  eq('το σύνολο του αρχείου ισούται με το σύνολο της οθόνης', fromFile, t.income);
  eq('και είναι το σωστό σύνολο', t.income, 4800 + 370);
}
{
  const lines = propertyLines([prop({ ownership: 50, rent_collected: 4800, rent_months: 12 })]);
  const sheets = statementSheets({ owner: 'Ιδιοκτήτης', year: 2025, issued: '18/08/2026', lines });
  const cols = sheets[0].columns.map(c => c.header);
  eq('η αναλογία ακολουθεί το ποσοστό συνιδιοκτησίας',
     sheets[0].rows[0][cols.indexOf('Αναλογία ιδιοκτήτη')], 2400);
}

// ── ΚΑΝΕΝΑ ΑΔΕΙΟ ΦΥΛΛΟ ────────────────────────────────────────────────────
{
  const bare = statementSheets({ owner: 'Ι', year: 2025, issued: '18/08/2026', lines: propertyLines([prop()]) });
  eq('χωρίς δαπάνες και διαμονές μένουν δύο φύλλα', bare.map(s => s.name).join('|'), 'Ανά ακίνητο|Τι λείπει');

  const full = statementSheets({ owner: 'Ι', year: 2025, issued: '18/08/2026', lines: propertyLines([prop({
    expenses: [{ category: 'ΔΕΗ', amount: 10, date: '2025-01-01' }],
    stays: [{ check_in: '2025-01-01', check_out: '2025-01-02', nights: 1, total: 80 }],
  })]) });
  eq('με δεδομένα μπαίνουν και τα τέσσερα', full.map(s => s.name).join('|'), 'Ανά ακίνητο|Δαπάνες|Διαμονές|Τι λείπει');
}

// ── Η ΥΠΟΣΧΕΣΗ ΠΡΟΣ ΤΟΝ ΙΔΙΟΚΤΗΤΗ ─────────────────────────────────────────
// «Ο λογιστής δεν βλέπει πελατολόγιο ούτε στοιχεία τρίτων». Το αρχείο που
// φεύγει από την πύλη είναι ο ευκολότερος τρόπος να σπάσει αυτή η πρόταση
// χωρίς να το προσέξει κανείς.
{
  const sheets = statementSheets({ owner: 'Ι', year: 2025, issued: '18/08/2026', lines: propertyLines([prop({
    expenses: [{ category: 'ΔΕΗ', amount: 10, date: '2025-01-01' }],
    stays: [{ check_in: '2025-01-01', check_out: '2025-01-02', nights: 1, total: 80 }],
  })]) });
  const headers = sheets.flatMap(s => s.columns.map(c => c.header)).join(' ');
  for (const forbidden of ['ΑΦΜ', 'Μισθωτ', 'Επισκέπτ', 'Προμηθευτ', 'Ονοματεπώνυμο']) {
    ok(`το αρχείο δεν μεταφέρει «${forbidden}»`, !headers.includes(forbidden));
  }
}

console.log(`\nstatement.ts — ${passed} passed, ${failed} failed`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('✓ όλα πέρασαν');
