// Τεστ για τις παραγόμενες εκκρεμότητες και τον φύλακα του παραστατικού
// (lib/checklist/obligationTasks.ts). Τρέξε με:
//   npx tsx lib/checklist/obligationTasks.test.ts
import { readFileSync, readdirSync } from 'node:fs'
import {
  taxTaskDrafts, lawTaskDrafts, obligationDrafts, pendingDrafts, audiencesFor,
  expenseFromReceipt, actualCostFromReceipt, costVariance,
  isTaxTaskRef, isLawTaskRef, isGeneratedRef, taxTaskRef, TAX_REF_PREFIX,
  type ReceiptEntry,
} from './obligationTasks'
import { UPDATE_ACTIONS, actionableUpdatesFor, REGULATORY_UPDATES_2026 } from '@/lib/accounting/updates2026'
import { taxEventSource, TAX_SOURCE_PREFIX } from '@/lib/tax/greekTaxCalendar'
import type { FieldContext } from '@/lib/property/fields'

let passed = 0, failed = 0;
function ok(name: string, cond: boolean) { if (cond) { passed++; } else { failed++; console.log('  ✗ ' + name); } }
function eq<T>(name: string, a: T, b: T) { ok(`${name} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, JSON.stringify(a) === JSON.stringify(b)); }

const TODAY = '2026-07-30';
const ctx = (o: Partial<FieldContext>): FieldContext =>
  ({ status: 'vacant', business: false, doubleEntry: false, propertyCount: 1, ...o });

// ═══════════════════════════════════════════════════════════════════════════
// 1) ΤΟ ΤΡΙΤΟ ΗΜΕΡΟΛΟΓΙΟ ΕΦΥΓΕ — καμία ημερομηνία δεν γεννιέται εδώ
// ═══════════════════════════════════════════════════════════════════════════
{
  const owner = taxTaskDrafts(TODAY, 'owner')
  ok('ο ιδιοκτήτης παίρνει φορολογικές υποχρεώσεις', owner.length > 0);
  ok('καμία προθεσμία στο παρελθόν', owner.every(d => !!d.due_date && d.due_date >= TODAY));
  ok('καμία προθεσμία «1η του μήνα»', owner.every(d => !d.due_date!.endsWith('-01')));
  ok('όλες έχουν επίσημη πηγή', owner.every(d => (d.sourceUrl || '').startsWith('https://')));
  ok('όλες είναι κρίσιμες για συμμόρφωση', owner.every(d => d.critical));
  ok('όλες λένε ποιος το κάνει', owner.every(d => /Ποιος το κάνει:/.test(d.note)));
  ok('όλες λένε πόσο σίγουρη είναι η ημερομηνία', owner.every(d => /(ορίζει ο νόμος|επιβεβαίωσέ την)/.test(d.note)));
  ok('μοναδικά κλειδιά', new Set(owner.map(d => d.ref)).size === owner.length);
  ok('κάθε κλειδί είναι φορολογικό', owner.every(d => isTaxTaskRef(d.ref) && isGeneratedRef(d.ref)));
  ok('κανένα εκτιμώμενο κόστος στο σχέδιο', owner.every(d => !('estimated_cost' in d)));
}

// Μία γραμμή ανά υποχρέωση: η βραχυχρόνια έχει 12 μηνιαίες δηλώσεις + 12
// αποδόσεις τέλους ανά έτος. Δεν γίνονται τριάντα εκκρεμότητες.
{
  const short = taxTaskDrafts(TODAY, 'short_term')
  const owner = taxTaskDrafts(TODAY, 'owner')
  ok('η βραχυχρόνια έχει παραπάνω από τον ιδιοκτήτη', short.length > owner.length);
  ok('η βραχυχρόνια μένει σύντομη λίστα', short.length <= 8);
  ok('μία μόνο δήλωση βραχυχρόνιας διαμονής', short.filter(d => /βραχυχρόνιας διαμονής/.test(d.description)).length === 1);
  ok('μία μόνο απόδοση τέλους ανθεκτικότητας', short.filter(d => /ανθεκτικότητας/.test(d.description)).length === 1);
  ok('ο ιδιοκτήτης δεν βλέπει δήλωση βραχυχρόνιας', !owner.some(d => /βραχυχρόνια/i.test(d.description)));
  ok('οι πληρωμές πάνε στα Οικονομικά', short.some(d => d.category === 'financial'));
  ok('οι δηλώσεις πάνε στα Νομικά', short.some(d => d.category === 'legal'));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) ΑΛΛΑΓΕΣ ΝΟΜΟΘΕΣΙΑΣ → ΕΚΚΡΕΜΟΤΗΤΑ, με φιλτράρισμα κατά επιλογή
// ═══════════════════════════════════════════════════════════════════════════
eq('κενό ακίνητο, καμία ακροατηρία', audiencesFor(ctx({ status: 'vacant' })), []);
eq('μακροχρόνια → long_term', audiencesFor(ctx({ status: 'rent_long' })), ['long_term']);
eq('βραχυχρόνια → short_term', audiencesFor(ctx({ status: 'rent_short' })), ['short_term']);
eq('επιχείρηση με δάνειο', audiencesFor(ctx({ status: 'rent_long', business: true, hasLoan: true })), ['long_term', 'business', 'borrower']);

{
  const vacant = lawTaskDrafts(ctx({ status: 'vacant' }))
  eq('κενό ακίνητο: καμία εκκρεμότητα νομοθεσίας', vacant.length, 0);

  const long = lawTaskDrafts(ctx({ status: 'rent_long' }))
  ok('η μακροχρόνια παίρνει εκκρεμότητες', long.length > 0);
  ok('υπάρχει η εκκρεμότητα του IBAN/IRIS', long.some(d => /IRIS/.test(d.description)));
  ok('λέει τι χάνει αν δεν γίνει', long.some(d => /5%/.test(d.note)));
  ok('χωρίς προθεσμία, γιατί ο νόμος δεν έχει καταληκτική', long.every(d => d.due_date === null));
  ok('όλες έχουν σύνδεσμο πηγής ή ρητή βάση', long.every(d => !!d.sourceUrl || /Βάση:/.test(d.note)));
  ok('όλες λένε ποιος το κάνει', long.every(d => /Ποιος το κάνει:/.test(d.note)));
  ok('κλειδιά νομοθεσίας', long.every(d => isLawTaskRef(d.ref) && isGeneratedRef(d.ref)));
  ok('η μακροχρόνια δεν βλέπει προδιαγραφές βραχυχρόνιας', !long.some(d => /βραχυχρόνιας/.test(d.description)));

  const short = lawTaskDrafts(ctx({ status: 'rent_short' }))
  ok('η βραχυχρόνια βλέπει τα δικαιολογητικά καταλληλότητας', short.some(d => /καταλληλότητας/.test(d.description)));
  ok('η βραχυχρόνια δεν βλέπει το πλαφόν εμπορικών', !short.some(d => /3%/.test(d.description)));
}

// Μόνο action/warning γίνονται εργασίες. Η ενημέρωση δεν είναι υποχρέωση.
{
  const infoIds = REGULATORY_UPDATES_2026.filter(u => u.severity === 'info').map(u => u.id)
  ok('καμία ενημερωτική δεν έχει καταγραμμένη ενέργεια', infoIds.every(id => !UPDATE_ACTIONS[id]));
  ok('κάθε ενέργεια αντιστοιχεί σε υπαρκτό κανόνα', Object.keys(UPDATE_ACTIONS).every(id => REGULATORY_UPDATES_2026.some(u => u.id === id)));
  ok('κάθε ενέργεια είναι προστακτική χωρίς ορολογία', Object.values(UPDATE_ACTIONS).every(a => a.action.length > 20 && a.cost.length > 20));
  ok('κάθε ενέργεια λέει ποιος', Object.values(UPDATE_ACTIONS).every(a => ['app', 'owner', 'accountant'].includes(a.who)));
  const acts = actionableUpdatesFor('long_term')
  ok('actionableUpdatesFor δίνει μόνο action/warning', acts.every(a => a.update.severity !== 'info'));
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) ΤΑΥΤΟΤΗΤΑ: δεύτερο πάτημα δεν διπλασιάζει τη λίστα
// ═══════════════════════════════════════════════════════════════════════════
{
  const all = obligationDrafts(TODAY, 'long_term', ctx({ status: 'rent_long' }))
  ok('περιέχει και φορολογικές και νομοθετικές', all.some(d => isTaxTaskRef(d.ref)) && all.some(d => isLawTaskRef(d.ref)));
  eq('χωρίς υπάρχουσες, όλες είναι νέες', pendingDrafts(all, []).length, all.length);
  eq('με όλες υπάρχουσες, καμία νέα', pendingDrafts(all, all.map(d => d.ref)).length, 0);

  // ═══ ΤΟ ΚΛΕΙΔΙ ΕΙΝΑΙ ΤΟ ΙΔΙΟ ΣΕ ΔΥΟ ΠΙΝΑΚΕΣ, ΚΑΙ ΠΡΕΠΕΙ ΝΑ ΜΕΙΝΕΙ ═════════
  // Την ίδια θεσμική προθεσμία τη γράφουν δύο οθόνες: το Ημερολόγιο σε
  // `calendar_events.source` και οι Εκκρεμότητες σε `checklist_items` ως `ref`.
  // Οι Εκκρεμότητες σταματούν να προτείνουν ό,τι έχει ήδη το ημερολόγιο — αλλά
  // ΜΟΝΟ αν τα δύο κλειδιά γράφονται ολόγραφα ίδια. Αν αποκλίνουν (πρόθεμα που
  // κόπηκε, μορφή που άλλαξε), η αντιπαραβολή αποτυγχάνει ΣΙΩΠΗΛΑ και ο χρήστης
  // ξαναβλέπει τις ίδιες τέσσερις ημερομηνίες σε δύο οθόνες.
  ok('το κλειδί της εκκρεμότητας και του γεγονότος είναι το ίδιο αλφαριθμητικό',
     taxTaskRef('enfia_2026_1') === taxEventSource('enfia_2026_1'));
  ok('τα δύο προθέματα δεν έχουν αποκλίνει', TAX_REF_PREFIX === TAX_SOURCE_PREFIX);
  eq('γεγονός ημερολογίου αναγνωρίζεται ως υπάρχουσα υποχρέωση',
     pendingDrafts(all, all.map(d => taxEventSource(d.ref.slice(TAX_REF_PREFIX.length))))
       .filter(d => d.ref.startsWith(TAX_REF_PREFIX)).length, 0);
  eq('μερική επικάλυψη', pendingDrafts(all, [all[0].ref]).length, all.length - 1);
  ok('άγνωστο κλειδί δεν μπερδεύεται', pendingDrafts(all, [taxTaskRef('δεν-υπάρχει')]).length === all.length);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4) Ο ΦΥΛΑΚΑΣ: καμία δαπάνη χωρίς παραστατικό
// ═══════════════════════════════════════════════════════════════════════════
const receipt = (o: Partial<ReceiptEntry>): ReceiptEntry => ({
  amount: 143, date: '2026-07-14', description: 'Υδραυλικός, αλλαγή μπαταρίας',
  category: 'Συντήρηση & Επισκευές', group: 'maintenance',
  evidence: { path: 'u/p/document/1_inv.jpg', name: 'inv.jpg' }, ...o,
});

ok('με παραστατικό γράφεται δαπάνη', expenseFromReceipt(receipt({})) !== null);
eq('χωρίς παραστατικό, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ evidence: null })), null);
eq('κενή διαδρομή αρχείου, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ evidence: { path: '   ', name: 'x' } })), null);
eq('μηδενικό ποσό, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ amount: 0 })), null);
eq('αρνητικό ποσό, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ amount: -50 })), null);
eq('NaN ποσό, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ amount: Number.NaN })), null);
eq('χωρίς ημερομηνία, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ date: '' })), null);
eq('κακή ημερομηνία, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ date: '14/07/2026' })), null);
eq('κενή περιγραφή, ΤΙΠΟΤΑ', expenseFromReceipt(receipt({ description: '  ' })), null);

{
  const row = expenseFromReceipt(receipt({ provider: 'Υδραυλικές ΕΠΕ' }))!
  eq('η δαπάνη με παραστατικό είναι ΠΛΗΡΩΜΕΝΗ', row.paid, true);
  eq('κρατά το ποσό του χαρτιού', row.amount, 143);
  eq('κρατά την ημερομηνία του χαρτιού', row.date, '2026-07-14');
  eq('κρατά τον πάροχο', row.store_vendor, 'Υδραυλικές ΕΠΕ');
  ok('η σημείωση δείχνει στο Αρχείο', /Αρχείο: inv\.jpg/.test(row.notes));
  ok('καμία «προγραμματισμένη εκκρεμότητα»', !/Προγραμματισμέν/.test(row.notes));
  eq('actual_cost = ποσό παραστατικού', actualCostFromReceipt(receipt({})), 143);
  eq('actual_cost χωρίς παραστατικό', actualCostFromReceipt(receipt({ evidence: null })), null);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5) Η ΑΠΟΚΛΙΣΗ ΔΕΝ ΕΙΝΑΙ ΠΛΕΟΝ −(ΕΚΤΙΜΗΣΗ)
// ═══════════════════════════════════════════════════════════════════════════
eq('εκτίμηση χωρίς πραγματικό: άγνωστο, όχι απόκλιση', costVariance(1850, 0), null);
eq('πραγματικό χωρίς εκτίμηση: άγνωστο', costVariance(0, 143), null);
eq('τίποτα από τα δύο: άγνωστο', costVariance(0, 0), null);
eq('και τα δύο: πραγματική απόκλιση', costVariance(120, 143), 23);
eq('υπέρ του χρήστη', costVariance(200, 143), -57);

// ═══════════════════════════════════════════════════════════════════════════
// 6) ΦΡΟΥΡΟΣ ΠΗΓΑΙΟΥ ΚΩΔΙΚΑ — ό,τι σβήστηκε να μην επιστρέψει σιωπηλά
// ═══════════════════════════════════════════════════════════════════════════
{
  // Ο ΦΡΟΥΡΟΣ ΔΙΑΒΑΖΕΙ ΟΛΕΣ ΤΙΣ ΟΘΟΝΕΣ ΤΩΝ ΕΚΚΡΕΜΟΤΗΤΩΝ, ΟΧΙ ΜΙΑ. Όσο ο κώδικας
  // ζούσε σε ένα αρχείο, το όνομα του αρχείου ήταν αρκετό. Τώρα ζει σε οκτώ, και
  // ένας φρουρός που κοιτάζει μόνο το πρώτο θα άφηνε ό,τι σβήστηκε να επιστρέψει
  // σε οποιοδήποτε από τα υπόλοιπα εφτά — σιωπηλά, που είναι ακριβώς ο λόγος που
  // γράφτηκε.
  const dir = 'app/dashboard/components/checklist'
  const raw = [
    readFileSync('app/dashboard/components/TabChecklist.tsx', 'utf8'),
    ...readdirSync(dir).sort().map(f => readFileSync(`${dir}/${f}`, 'utf8')),
  ].join('\n')
  // Τα σχόλια ΕΞΑΙΡΟΥΝΤΑΙ: το αρχείο τεκμηριώνει ρητά τι σβήστηκε και γιατί, και
  // αυτή η τεκμηρίωση δεν πρέπει να πέφτει πάνω στον φρουρό. Ελέγχεται ο κώδικας.
  const src = raw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n')

  // Ο κεντρικός κανόνας: ΜΙΑ εγγραφή δαπάνης, και περνά από τον φύλακα.
  // Ο πίνακας έχει πλέον στρώμα (lib/data/expenses.ts): η καρτέλα δεν τον
  // αγγίζει απευθείας, οπότε ο φρουρός μετρά τις κλήσεις του στρώματος.
  const inserts = src.match(/expenses\.(addRow|insert|insertReturning|add)\(/g) || []
  eq('μία και μόνο εγγραφή στα expenses', inserts.length, 1);
  ok('η εγγραφή δαπάνης περνά από το expenseFromReceipt',
    /expenseFromReceipt\(/.test(src) && /expenses\.addRow\(supabase, \{ \.\.\.expenseRow/.test(src))
  ok('σβήστηκε το makeTaskExpense', !/makeTaskExpense/.test(src));
  ok('σβήστηκε η «Προγραμματισμένη εκκρεμότητα»', !/Προγραμματισμένη εκκρεμότητα/.test(src));

  // Το τρίτο ημερολόγιο και οι ημερομηνίες «1η του μήνα».
  ok('σβήστηκε το AADE_CALENDAR', !/AADE_CALENDAR\b/.test(src));
  ok('σβήστηκε το loadAADECalendar', !/loadAADECalendar/.test(src));
  ok('καμία ημερομηνία -MM-01 από πρότυπο', !/-01'\s*,\s*note:/.test(src));
  ok('καταναλώνει το ένα ημερολόγιο', /from '@\/lib\/checklist\/obligationTasks'/.test(src));

  // Τα 24 επινοημένα κόστη.
  ok('κανένα σταθερό κόστος στα πρότυπα', !/estimated_cost:\s*[1-9]/.test(src));
  ok('τα πρότυπα δεν διαφημίζουν σύνολο κόστους', !/~\$\{cost\}/.test(src));

  // Οι δύο editors που ορίζονταν και δεν χρησιμοποιούνταν.
  ok('το SubTaskEditor χρησιμοποιείται', (src.match(/SubTaskEditor/g) || []).length >= 2);
  ok('το CommentsEditor χρησιμοποιείται', (src.match(/CommentsEditor/g) || []).length >= 2);

  // Το actual_cost δεν γράφεται πια σταθερά 0 από τη φόρμα.
  ok('το actual_cost δεν είναι σταθερό 0 στη φόρμα', !/actual_cost:\s*parseFloat\(form\.actual_cost\)/.test(src));
}

console.log(`obligationTasks.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed > 0) process.exit(1)
