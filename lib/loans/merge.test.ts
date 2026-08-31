// ═══════════════════════════════════════════════════════════════════════════
// Η ΖΩΝΤΑΝΗ ΓΡΑΜΜΗ ΣΥΜΠΛΗΡΩΝΕΙ, ΔΕΝ ΣΒΗΝΕΙ
// ─────────────────────────────────────────────────────────────────────────
// Η καρτέλα έγραφε «ζωντανά ή εφεδρικά», δηλαδή ΟΛΟ ή ΤΙΠΟΤΑ. Η γραμμή της
// βάσης για το «Σπίτι μου ΙΙ» δεν είχε `application_deadline`, οπότε το
// ζωντανό αντίγραφο έσβηνε την 31/05/2026 που ο κατάλογος γνώριζε — και η
// μηχανή πήρε την προθεσμία ΥΠΟΓΡΑΦΗΣ (31/08) στη θέση της προθεσμίας
// ΑΙΤΗΣΗΣ. Στις 31/08/2026 ο χρήστης διάβαζε «οι αιτήσεις κλείνουν σε
// λιγότερο από μία μέρα» για κάτι που είχε κλείσει τρεις μήνες πριν.
// ═══════════════════════════════════════════════════════════════════════════
import { mergePrograms, mergeBanks, PROGRAMS_NORM, BANKS_NORM } from '@/app/dashboard/components/TabLoanData';

let pass = 0; const fail: string[] = [];
const eq = (what: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; return; }
  fail.push(`${what}\n    περίμενα: ${JSON.stringify(want)}\n    πήρα:     ${JSON.stringify(got)}`);
};

const staticSpiti = PROGRAMS_NORM.find(p => p.id === 'spiti_mou_2')!;

eq('ο κατάλογος έχει την προθεσμία αίτησης', staticSpiti.applicationDeadline, '31/05/2026');

// Γραμμή βάσης χωρίς `application_deadline`, όπως η πραγματική.
const [merged] = mergePrograms([{ id: 'spiti_mou_2', name: 'Σπίτι μου ΙΙ', deadline: '31/08/2026' }]);
eq('η ζωντανή γραμμή δανείζεται την προθεσμία αίτησης', merged.applicationDeadline, '31/05/2026');
eq('και κρατά τη δική της προθεσμία υπογραφής', merged.deadline, '31/08/2026');
eq('και τα κριτήρια που δεν έστειλε', merged.criteria.length > 0, true);

// Οπου η βάση ΕΧΕΙ τιμή, αυτή νικά: η ενημέρωση πρέπει να φτάνει στην οθόνη.
const [fresh] = mergePrograms([{ id: 'spiti_mou_2', name: 'Σπίτι μου ΙΙ',
  application_deadline: '30/09/2026', deadline: '31/12/2026' }]);
eq('νέα προθεσμία αίτησης από τη βάση νικά', fresh.applicationDeadline, '30/09/2026');
eq('νέα προθεσμία υπογραφής από τη βάση νικά', fresh.deadline, '31/12/2026');

// Πρόγραμμα που ο κατάλογος δεν ξέρει περνά ως έχει, χωρίς εφεύρεση.
const [unknown] = mergePrograms([{ id: 'kainourgio', name: 'Νέο πρόγραμμα' }]);
eq('άγνωστο πρόγραμμα δεν δανείζεται από κανέναν', unknown.applicationDeadline, '');

// Το ίδιο για τις τράπεζες.
const staticBank = BANKS_NORM[0];
const [b] = mergeBanks([{ id: staticBank.id, name: staticBank.name }]);
eq('η ζωντανή τράπεζα κρατά ό,τι ξέρει ο κατάλογος', b.name, staticBank.name);
eq('και δεν χάνει το επιτόκιό της', b.fixed_5yr, staticBank.fixed_5yr);

if (fail.length) { console.error(`\n✗ merge: ${fail.length} αποτυχίες\n`); for (const f of fail) console.error('  ' + f); process.exit(1); }
console.log(`✓ merge: ${pass} έλεγχοι πέρασαν`);
