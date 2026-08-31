#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΘΕ ΕΞΟΔΟΣ ΚΑΘΑΡΙΖΕΙ ΤΗ ΣΥΣΚΕΥΗ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ: ο καθαρισμός ΓΡΑΦΟΤΑΝ σε ένα σημείο, αλλά ΚΑΛΟΥΝΤΑΝ σε ένα από τα
// πέντε. Πέντε δρόμοι βγάζουν τον χρήστη έξω και μόνο η απλή «Αποσύνδεση»
// έσβηνε τα τοπικά προσωπικά:
//
//   ✓ Επισκόπηση → Αποσύνδεση
//   ✗ Ασφάλεια → «Αποσύνδεση από όλες τις συσκευές», ο ΙΣΧΥΡΟΤΕΡΟΣ διακόπτης
//   ✗ Ρυθμίσεις → Οριστική διαγραφή λογαριασμού
//   ✗ /login και /signup → «είσαι ήδη συνδεδεμένος ως …, αποσύνδεση»
//
// Σε κοινό υπολογιστή, ο χρήστης πατούσε τον πιο δυνατό διακόπτη που υπάρχει
// και στο μηχάνημα έμεναν ονόματα ενοικιαστών, ΑΦΜ συνιδιοκτητών και ποσά. Και
// μετά τη ΔΙΑΓΡΑΦΗ του λογαριασμού, ο διακομιστής έσβηνε τα πάντα ενώ ο
// περιηγητής τα κρατούσε.
//
// ── ΤΙ ΕΛΕΓΧΕΙ ─────────────────────────────────────────────────────────────
// 1. Οποιο αρχείο καλεί `auth.signOut(` καλεί και `leaveDevice(`.
// 2. Κανείς δεν ξαναγράφει τα δύο βήματα με το χέρι: ούτε σκέτο
//    `clearLocalPersonalData(` ούτε σκέτο μήνυμα καθαρισμού caches, έξω από
//    το ίδιο το lib/localPrivacy.ts.
// 3. Το μήνυμα που στέλνει η εφαρμογή είναι αυτό που ακούει ο service worker.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'node:fs';
import { findSources } from './lib/find-tests.mjs';

const OWNER = 'lib/localPrivacy.ts';
const SW = 'public/sw.js';
const findings = [];

for (const file of findSources()) {
  if (file === OWNER || file.includes('.test.') || file.startsWith('scripts/')) continue;
  if (!/\.tsx?$/.test(file)) continue;
  const src = readFileSync(file, 'utf8');

  if (/auth\.signOut\s*\(/.test(src) && !/\bleaveDevice\s*\(/.test(src)) {
    const line = src.slice(0, src.search(/auth\.signOut\s*\(/)).split('\n').length;
    findings.push(`${file}:${line}  βγάζει τον χρήστη έξω χωρίς leaveDevice()`);
  }
  if (/\bclearLocalPersonalData\s*\(/.test(src)) {
    const line = src.slice(0, src.search(/\bclearLocalPersonalData\s*\(/)).split('\n').length;
    findings.push(`${file}:${line}  καλεί το μισό βήμα· το ολόκληρο λέγεται leaveDevice()`);
  }
  if (/pos-clear-caches/.test(src)) {
    const line = src.slice(0, src.indexOf('pos-clear-caches')).split('\n').length;
    findings.push(`${file}:${line}  στέλνει μόνο του το μήνυμα caches· το κάνει το leaveDevice()`);
  }
}

// Το μήνυμα ταξιδεύει σε δύο κόσμους που δεν μοιράζονται εισαγωγές.
const owner = readFileSync(OWNER, 'utf8');
const msg = owner.match(/CACHE_CLEAR_MESSAGE\s*=\s*'([^']+)'/)?.[1];
if (!msg) findings.push(`${OWNER}  λείπει το CACHE_CLEAR_MESSAGE`);
else if (!readFileSync(SW, 'utf8').includes(`'${msg}'`)) {
  findings.push(`${SW}  δεν ακούει το «${msg}» που στέλνει το ${OWNER}`);
}

if (findings.length) {
  console.error(`\n✗ ${findings.length} έξοδοι αφήνουν προσωπικά στη συσκευή:\n`);
  for (const f of findings) console.error('  ' + f);
  console.error(`
  Καλεσε \`leaveDevice()\` από το ${OWNER}. Σβήνει τα τοπικά κλειδιά με προσωπικά
  δεδομένα ΤΡΙΤΩΝ (ονόματα ενοικιαστών, ΑΦΜ συνιδιοκτητών, ποσά) και λέει στον
  service worker να πετάξει τις caches του. Ενα βήμα, όχι δύο που ξεχνιούνται.`);
  process.exit(1);
}

const exits = findSources().filter(f => /\.tsx?$/.test(f) && !f.includes('.test.') && /auth\.signOut\s*\(/.test(readFileSync(f, 'utf8')));
console.log(`✓ και οι ${exits.length} έξοδοι από τον λογαριασμό καθαρίζουν τη συσκευή`);
