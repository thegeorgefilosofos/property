import {
  SUBSCRIPTION_CATEGORY, expensePct, subscriptionCharges, bookableTotal,
  reverseChargeTotal, missingCountry, chargeDate, toExpenses,
} from './subscriptionBooking';
import { budgetBucket } from './taxonomy';

let fails = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
};
const eq = (msg: string, got: unknown, want: unknown) =>
  ok(got === want, `${msg}${got === want ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);

const entry = (over: Record<string, unknown> = {}) => ({
  service: 'netflix', planId: 'n_standard', customPrice: '',
  splitPeople: 2, splitActive: false, renewalDate: '', ...over,
});

console.log('Ποσοστό');
eq('άγνωστο σημαίνει ολόκληρη', expensePct(undefined), 100);
eq('κείμενο που δεν είναι αριθμός σημαίνει ολόκληρη', expensePct('χ'), 100);
eq('πάνω από εκατό κόβεται', expensePct(140), 100);
eq('αρνητικό γίνεται μηδέν', expensePct(-20), 0);
eq('το μηδέν μένει μηδέν', expensePct(0), 0);
eq('δεκαδικό περνά', expensePct(62.5), 62.5);

console.log('\nΧρεώσεις');
const one = subscriptionCharges({ activeStreaming: [entry()] });
eq('μία χρέωση', one.length, 1);
eq('όνομα υπηρεσίας', one[0].label, 'Netflix');
eq('όνομα πακέτου', one[0].plan, 'Standard');
eq('μηνιαίο κόστος', one[0].monthly, 12.49);
eq('ολόκληρο στις δαπάνες', one[0].amount, 12.49);
eq('χωρίς χώρα, χωρίς κατάταξη', one[0].supply, null);
eq('χωρίς κατάταξη, χωρίς φόρο', one[0].reverseChargeVat, 0);

const partial = subscriptionCharges({ activeCloud: [entry({ service: 'microsoft365', planId: 'ms_fam', expensePct: 60 })] });
ok(Math.abs(partial[0].amount - 9.99 * 0.6) < 1e-9, 'το ποσοστό κόβει το ποσό της δαπάνης');
eq('το μηνιαίο μένει ολόκληρο', partial[0].monthly, 9.99);

const shared = subscriptionCharges({ activeStreaming: [entry({ splitActive: true, splitPeople: 2 })] });
ok(Math.abs(shared[0].monthly - 6.245) < 1e-9, 'ο διαμοιρασμός προηγείται του ποσοστού');

// ΜΕΝΟΥΝ ΣΤΗ ΛΙΣΤΑ ΟΙ ΜΗΔΕΝΙΚΕΣ: η οθόνη πρέπει να τις δείχνει για να αλλάξει
// ο χρήστης το ποσοστό. Το φιλτράρισμα γίνεται στην εγγραφή.
const zero = subscriptionCharges({ activeStreaming: [entry({ expensePct: 0 })] });
eq('η μηδενική μένει στη λίστα', zero.length, 1);
eq('με ποσό μηδέν', zero[0].amount, 0);

eq('άγνωστο σχήμα δεν σκάει', subscriptionCharges(null).length, 0);
eq('ρυθμίσεις χωρίς συνδρομές', subscriptionCharges({}).length, 0);
eq('υπηρεσία εκτός καταλόγου αγνοείται', subscriptionCharges({ activeStreaming: [entry({ service: 'ξψζ' })] }).length, 0);

console.log('\nΤόπος παροχής');
const mixed = subscriptionCharges({
  activeStreaming: [entry({ service: 'skroutz_plus', planId: 'sk_month', supplierCountry: 'GR' })],
  activeCloud: [
    entry({ service: 'microsoft365', planId: 'ms_pers', supplierCountry: 'IE' }),
    entry({ service: 'claude', planId: 'cl_pro', supplierCountry: 'US' }),
  ],
});
const bySvc = (s: string) => mixed.find(c => c.service === s)!;
eq('ελληνικός πάροχος', bySvc('skroutz_plus').supply, 'domestic');
eq('εγχώρια: κανένας φόρος αντίστροφης χρέωσης', bySvc('skroutz_plus').reverseChargeVat, 0);
eq('πάροχος κράτους μέλους', bySvc('microsoft365').supply, 'intra_eu');
ok(Math.abs(bySvc('microsoft365').reverseChargeVat - 6.99 * 0.24) < 1e-9, 'ενδοκοινοτική: ΦΠΑ 24% στην αξία');
eq('πάροχος εκτός Ένωσης', bySvc('claude').supply, 'third_country');
ok(Math.abs(bySvc('claude').reverseChargeVat - 22.32 * 0.24) < 1e-9, 'τρίτη χώρα: ΦΠΑ 24% στην αξία');

ok(Math.abs(bookableTotal(mixed) - (4 + 6.99 + 22.32)) < 1e-9, 'σύνολο δαπανών');
ok(Math.abs(reverseChargeTotal(mixed) - (6.99 + 22.32) * 0.24) < 1e-9, 'σύνολο αντίστροφης χρέωσης');

console.log('\nΤι λείπει');
const missing = missingCountry(subscriptionCharges({
  activeStreaming: [entry({ supplierCountry: '' }), entry({ service: 'spotify', planId: 's_duo', supplierCountry: 'SE' })],
}));
eq('μία χωρίς χώρα', missing.length, 1);
eq('και είναι η σωστή', missing[0].service, 'netflix');
eq('η μηδενική δεν ζητά χώρα', missingCountry(zero).length, 0);

console.log('\nΗμερομηνία χρέωσης');
eq('χωρίς ανανέωση, η πρώτη του μήνα', chargeDate('2026-08', ''), '2026-08-01');
eq('με ανανέωση, η ίδια ημέρα', chargeDate('2026-08', '2026-03-17'), '2026-08-17');
eq('η 31η σε μήνα με 30 ημέρες πέφτει στην 30ή', chargeDate('2026-09', '2026-01-31'), '2026-09-30');
eq('ο Φεβρουάριος δεν βγάζει 30ή', chargeDate('2026-02', '2026-01-30'), '2026-02-28');
eq('δίσεκτο έτος', chargeDate('2028-02', '2028-01-30'), '2028-02-29');

console.log('\nΓραμμές δαπάνης');
const rows = toExpenses(mixed, { month: '2026-08' });
eq('τρεις γραμμές', rows.length, 3);
eq('κατηγορία', rows[0].category, SUBSCRIPTION_CATEGORY);
eq('η κατηγορία οδηγεί στον κουβά των συνδρομών', budgetBucket(SUBSCRIPTION_CATEGORY), 'subscriptions');
eq('περιγραφή με το πακέτο', rows.find(r => r.store_vendor === 'claude')!.description, 'Claude, Pro');
eq('πάγια μηνιαία', rows[0].recurring_frequency, 'monthly');
ok(rows.every(r => r.paid === true), 'γράφονται ως πληρωμένες');
ok(rows.every(r => Math.round(r.amount * 100) === r.amount * 100), 'δύο δεκαδικά, χωρίς ουρές');

// ΤΟ ΔΙΠΛΟ ΠΑΤΗΜΑ ΔΕΝ ΓΡΑΦΕΙ ΔΕΥΤΕΡΗ ΦΟΡΑ. Δύο σωστές γραμμές για τον ίδιο
// μήνα δίνουν διπλάσιο κόστος και καμία από τις δύο δεν φαίνεται λάθος.
const again = toExpenses(mixed, { month: '2026-08', recorded: new Set(['skroutz_plus', 'microsoft365', 'claude']) });
eq('ό,τι έχει γραφτεί δεν ξαναγράφεται', again.length, 0);
eq('όσα λείπουν γράφονται', toExpenses(mixed, { month: '2026-08', recorded: new Set(['claude']) }).length, 2);
eq('η μηδενική δεν γράφεται καθόλου', toExpenses(zero, { month: '2026-08' }).length, 0);

console.log('\nΣημειώσεις');
const noteOf = (s: string) => rows.find(r => r.store_vendor === s)!.notes;
eq('πλήρης εγχώρια δεν χρειάζεται σημείωση', noteOf('skroutz_plus'), '');
ok(noteOf('microsoft365').includes('Ενδοκοινοτική') && noteOf('microsoft365').includes('αντίστροφη χρέωση'),
  'η ενδοκοινοτική εξηγείται στη γραμμή');
ok(noteOf('claude').includes('τρίτη χώρα'), 'η τρίτη χώρα εξηγείται στη γραμμή');
const partialRow = toExpenses(partial, { month: '2026-08' })[0];
ok(partialRow.notes.includes('60,00%') && partialRow.notes.includes('9,99'),
  'η μερική χρήση γράφει ποσοστό και πλήρες ποσό');
eq('και κρατά το ποσοστό σε δικό του πεδίο', partialRow.share_percent, 60);
eq('η πλήρης δεν γράφει ποσοστό', rows[0].share_percent, null);

// ── ΟΙ ΔΥΟ ΣΤΗΛΕΣ ΤΑΞΙΔΕΥΟΥΝ ΩΣ ΔΕΔΟΜΕΝΑ ─────────────────────────────────────
// Η σημείωση είναι για τον άνθρωπο. Η Λογιστική και το Excel θέλουν πεδία.
{
  const rows2 = toExpenses(mixed, { month: '2026-08' });
  const of = (s: string) => rows2.find(r => r.store_vendor === s)!;
  eq('η χώρα γράφεται σε δική της στήλη', of('microsoft365').supplier_country, 'IE');
  eq('και ο τόπος παροχής σε δική του', of('microsoft365').supply, 'intra_eu');
  eq('εγχώρια', of('skroutz_plus').supply, 'domestic');
  eq('τρίτη χώρα', of('claude').supply, 'third_country');
  // ΤΟ ΑΓΝΩΣΤΟ ΜΕΝΕΙ NULL, ΠΟΤΕ «εγχώρια»: αλλιώς κάθε συνδρομή που δεν
  // ρωτήθηκε θα περνούσε σιωπηλά για ελληνικό τιμολόγιο σε δήλωση ΦΠΑ.
  const blind = toExpenses(subscriptionCharges({ activeStreaming: [entry()] }), { month: '2026-08' })[0];
  eq('χωρίς χώρα, κενή στήλη', blind.supplier_country, null);
  eq('χωρίς χώρα, κανένα συμπέρασμα', blind.supply, null);
}

console.log(`\nsubscriptionBooking: ${fails === 0 ? '✓ όλα' : `✗ ${fails}`}`);
if (fails) process.exit(1);

