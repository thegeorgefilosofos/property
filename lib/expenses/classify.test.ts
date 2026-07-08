// npx tsx lib/expenses/classify.test.ts
import { classifyExpense } from './classify';

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; } else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`); }
}

eq('ρεύμα', classifyExpense('Λογαριασμός ρεύματος ΔΕΗ'), { group: 'fixed', category: 'Ρεύμα', deductible: true });
eq('νερό', classifyExpense('πλήρωσα το νερό'), { group: 'fixed', category: 'Νερό', deductible: true });
eq('internet', classifyExpense('ίντερνετ Cosmote'), { group: 'fixed', category: 'Internet', deductible: true });
eq('ΕΝΦΙΑ', classifyExpense('ΕΝΦΙΑ 2026'), { group: 'fixed', category: 'ΕΝΦΙΑ', deductible: true });
eq('λογιστής', classifyExpense('αμοιβή λογιστή'), { group: 'fixed', category: 'Λογιστής/Φοροτεχνικός', deductible: true });
eq('υδραυλικός', classifyExpense('πλήρωσα τον υδραυλικό για τη διαρροή'), { group: 'maintenance', category: 'Υδραυλικός', deductible: true });
eq('ηλεκτρολόγος', classifyExpense('ηλεκτρολόγος'), { group: 'maintenance', category: 'Ηλεκτρολόγος', deductible: true });
eq('καθαριότητα', classifyExpense('συνεργείο καθαριότητας'), { group: 'maintenance', category: 'Καθαριότητα', deductible: true });
eq('βαφή', classifyExpense('βάψιμο σαλονιού'), { group: 'renovation', category: 'Βαφές & Χρώματα', deductible: false });
eq('παρκέ', classifyExpense('τοποθέτηση παρκέ'), { group: 'renovation', category: 'Πατώματα (γενικά)', deductible: false });
eq('ψυγείο', classifyExpense('αγόρασα ψυγείο'), { group: 'appliances', category: 'Ψυγείο', deductible: false });
eq('κλιματιστικό', classifyExpense('νέο κλιματιστικό'), { group: 'appliances', category: 'Κλιματιστικό', deductible: false });
eq('δικηγόρος', classifyExpense('αμοιβή δικηγόρου'), { group: 'legal', category: 'Δικηγόρος', deductible: true });
eq('μεσίτης', classifyExpense('μεσιτικά ενοικίασης'), { group: 'broker', category: 'Μεσιτεία Ενοικίασης', deductible: true });
eq('άγνωστο → other', classifyExpense('κάτι τυχαίο'), { group: 'other', category: 'Άλλο', deductible: false });
eq('κενό → other', classifyExpense(''), { group: 'other', category: 'Άλλο', deductible: false });

console.log(`\nclassifyExpense: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
