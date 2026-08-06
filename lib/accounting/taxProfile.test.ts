// npx tsx lib/accounting/taxProfile.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Η ΑΝΤΙΣΤΟΙΧΙΣΗ ΝΟΜΙΚΗΣ ΜΟΡΦΗΣ ΣΕ ΦΟΡΟ, ΜΕ ΟΛΕΣ ΤΙΣ ΤΙΜΕΣ.
//
// Το κενό που κλείνει: η αντιστοίχιση ήταν έκφραση μέσα σε δύο components και
// κανένα τεστ δεν την άγγιζε. Και οι δύο εκδοχές ήταν λάθος, με διαφορετικό
// τρόπο, και οι διαφορές έφταναν τα οκτώ χιλιάδες ευρώ φόρου.
//
// Ο έλεγχος διατρέχει ΚΑΘΕ τιμή του τύπου, οπότε μια πέμπτη νομική μορφή που
// θα προστεθεί αύριο δεν μπορεί να ξεχαστεί: θα πέσει εδώ.
// ═══════════════════════════════════════════════════════════════════════════
import { businessFormOf } from './taxProfile';
import { LEGAL_FORMS, HAS_BUSINESS, type LegalForm } from './dossier';
import { CORPORATE_TAX_RATE_2026 } from '../billing/greekTax';

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`); } };

// ── Η ρητή αντιστοίχιση ────────────────────────────────────────────────────
const EXPECTED: Record<LegalForm, 'sole' | 'company'> = {
  individual:  'sole',
  sole_trader: 'sole',
  // Ο.Ε. και Ε.Ε.: νομικά πρόσωπα με 22%, όπως τα ονομάζει το ίδιο το
  // CORPORATE_TAX_RATE_2026. Εδώ ακριβώς έπεφτε η Λογιστική.
  partnership: 'company',
  company:     'company',
};

for (const form of LEGAL_FORMS) {
  ok(`«${form}» → ${EXPECTED[form]}`, businessFormOf(form) === EXPECTED[form]);
}

// ── Καμία μορφή δεν ξεχνιέται ─────────────────────────────────────────────
ok('ο κατάλογος καλύπτει όλες τις μορφές του τύπου',
   LEGAL_FORMS.length === Object.keys(EXPECTED).length);

// ── Η σχέση με το HAS_BUSINESS είναι συνεπής ──────────────────────────────
// Το `individual` είναι η ΜΟΝΗ μορφή χωρίς επιχείρηση. Κάθε άλλη έχει, και
// γι' αυτό η δυαδική περίληψη δεν αρκεί για φορολογία: συμπτύσσει την ατομική
// με το νομικό πρόσωπο, που φορολογούνται εντελώς διαφορετικά.
ok('μόνο το φυσικό πρόσωπο δεν έχει επιχείρηση',
   LEGAL_FORMS.filter(f => !HAS_BUSINESS.has(f)).join() === 'individual');
ok('η δυαδική περίληψη ΔΕΝ αρκεί: ατομική και νομικό πρόσωπο διαφέρουν',
   businessFormOf('sole_trader') !== businessFormOf('company')
   && HAS_BUSINESS.has('sole_trader') && HAS_BUSINESS.has('company'));

// ── Ο συντελεστής υπάρχει και είναι αυτός που περιμένουν τα παραπάνω ──────
ok('ο εταιρικός συντελεστής είναι 22%', CORPORATE_TAX_RATE_2026 === 0.22);

console.log(fail === 0
  ? `taxProfile: ✓ ${pass}`
  : `taxProfile: ✓ ${pass} · ✗ ${fail}`);
if (fail > 0) process.exit(1);
