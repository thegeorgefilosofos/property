// npx tsx lib/contacts/roles.test.ts
import { inferRole } from './roles';

let pass = 0, fail = 0;
const eq = (name: string, got: string, want: string) => {
  if (got === want) pass++; else { fail++; console.error(`✗ ${name}: got ${got}, want ${want}`); }
};

eq('υδραυλικός', inferRole('τον υδραυλικό τον Νίκο'), 'plumber');
eq('ηλεκτρολόγος', inferRole('ηλεκτρολόγος'), 'electrician');
eq('κλιματισμός', inferRole('τεχνικός κλιματισμού'), 'hvac');
eq('ξυλουργός', inferRole('μαραγκός'), 'carpenter');
eq('ελαιοχρωματιστής', inferRole('μπογιατζής'), 'painter');
eq('πλακάς', inferRole('πλακάς / μαρμαράς'), 'tiles');
eq('κλειδαράς', inferRole('κλειδαράς'), 'locksmith');
eq('ασανσέρ', inferRole('συντηρητής ανελκυστήρα'), 'elevator');
eq('κηπουρός', inferRole('κηπουρός'), 'gardener');
eq('πισίνα', inferRole('συντηρητής πισίνας'), 'pool');
eq('απεντόμωση', inferRole('απεντόμωση'), 'pest');
eq('καθαρισμός', inferRole('συνεργείο καθαρισμού'), 'cleaning');
eq('μάστορας → γενικός', inferRole('ένας μάστορας'), 'general_tech');
eq('άγνωστο → other', inferRole('κάποιος τύπος'), 'other');
eq('κενό → other', inferRole(''), 'other');

console.log(`\ninferRole: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
