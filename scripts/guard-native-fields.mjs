#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΜΙΑ ΠΑΛΕΤΑ. ΤΟ ΛΕΙΤΟΥΡΓΙΚΟ ΔΕΝ ΣΧΕΔΙΑΖΕΙ ΜΑΖΙ ΜΑΣ.
//
// Είκοσι έξι ντόπια <select> ήταν σκορπισμένα σε έντεκα οθόνες, δίπλα σε πεδία
// που ακολουθούν το σύστημα της εφαρμογής. Το <select> δεν στυλάρεται: το
// άνοιγμά του το ζωγραφίζει ο browser και το λειτουργικό, με δικά τους χρώματα,
// δική τους γραμματοσειρά, δική τους γωνία. Στο σκούρο θέμα το αποτέλεσμα ήταν
// λευκή λίστα πάνω σε σκούρα σελίδα· σε ένα ακόμη σημείο το βελάκι ήταν
// καρφωμένο γκρι (#9aa0a6) που δεν άλλαζε ποτέ με το θέμα.
//
// Το CustomSelect κάνει ό,τι χρειάζεται και κρατά την παλέτα: portal ώστε να
// μη κόβεται από modal, πληκτρολόγιο, focus ring, ίδια γεωμετρία με τα
// υπόλοιπα πεδία.
//
// ΚΑΙ ΤΟ ΗΜΕΡΟΛΟΓΙΟ ΤΟΥ ΠΕΡΙΗΓΗΤΗ. Το `<input type="date">` έχει ακριβώς το
// ίδιο πρόβλημα, μεγεθυμένο: δεν είναι μόνο άλλα χρώματα, είναι ΑΛΛΗ ΓΛΩΣΣΑ.
// Στη φόρμα των Δαπανών άνοιγε «August 2026» με «Su Mo Tu We Th Fr Sa»,
// «Clear» και «Today», μέσα σε ολοελληνική οθόνη. Χειρότερα: η γραμμή
// «08/09/2026» δεν λέει καν αν εννοεί 8 Σεπτεμβρίου ή 9 Αυγούστου, γιατί τη
// σειρά την επιλέγει η γλώσσα του περιηγητή και όχι η εφαρμογή.
//
// ΕΞΑΙΡΕΣΗ, ΜΙΑ ΚΑΙ ΤΕΚΜΗΡΙΩΜΕΝΗ: η δημόσια σελίδα άφιξης επισκέπτη. Εκεί ο
// χρήστης είναι ταξιδιώτης με διαβατήριο, όχι Έλληνας ιδιοκτήτης, και το
// ημερολόγιο του ΔΙΚΟΥ ΤΟΥ περιηγητή είναι στη ΔΙΚΗ ΤΟΥ γλώσσα — που είναι
// ό,τι καλύτερο μπορεί να του δοθεί. Ο ελληνικός επιλογέας θα ήταν χειρότερος.
//
// ΑΛΛΗ ΕΞΑΙΡΕΣΗ: καμία. Αν χρειαστεί πραγματικά ντόπιο πεδίο κάποια στιγμή,
// η συζήτηση γίνεται εδώ, στον φύλακα, όχι σιωπηλά σε μία οθόνη.
//
// ΚΑΙ Ο ΤΥΠΟΣ ΜΠΟΡΕΙ ΝΑ ΕΙΝΑΙ ΜΕΤΑΒΛΗΤΗ, ΠΟΥ ΕΙΝΑΙ ΤΟ ΣΗΜΕΙΟ ΠΟΥ ΞΕΦΥΓΕ.
//
// Ο έλεγχος έψαχνε ΜΟΝΟ το κυριολεκτικό `type="date"`. Το DocumentScan.tsx
// έγραφε `<input type={type} …>` και ο πίνακας πεδίων του όριζε `type: 'date'`
// σε ΔΕΚΑΤΕΣΣΕΡΑ πεδία: ημερομηνία έκδοσης, λήξη μισθωτηρίου, λήξη
// ασφαλιστηρίου, ημερομηνία αγοράς. Δεκατέσσερα ντόπια ημερολόγια, με τον
// φύλακα πράσινο από πάνω.
//
// Ο ΚΑΝΟΝΑΣ ΤΩΡΑ. Ενα `<input>` με μη κυριολεκτικό `type` περνά μόνο αν:
//
//   α) το ίδιο το αρχείο δρομολογεί την περίπτωση αλλού (`type === 'date'`),
//      δηλαδή στον DatePicker· ή
//   β) ο τύπος της ιδιότητας είναι ένωση κυριολεκτικών ΧΩΡΙΣ 'date', οπότε ο
//      μεταγλωττιστής το κάνει αδύνατο και δεν χρειάζεται φύλακας· ή
//   γ) η έκφραση είναι τριαδική με δύο κυριολεκτικά, κανένα 'date'
//      (`type={show ? 'text' : 'password'}`).
//
// Το (β) είναι το προτιμότερο: σφάλμα στη μεταγλώττιση αντί για σφάλμα σε
// φύλακα. Τρία κοινά πεδία στένεψαν έτσι.
//
// ΔΕΝ ΤΟΝ ΕΤΡΕΧΕ ΚΑΝΕΝΑ WORKFLOW. Ο φύλακας ήταν γραμμένος και δηλωμένος στο
// package.json, και κανένα workflow δεν τον καλούσε. Ενας φύλακας που δεν
// τρέχει δεν φυλάει τίποτα, απλώς δίνει την εντύπωση ότι φυλάει. Στην ίδια
// κατάσταση βρέθηκαν τρεις φύλακες μαζί, και το ίδιο είχε συμβεί με τη σουίτα
// του confirmBus, που ήταν γραμμένη και δεν την έβρισκε ο εκτελεστής.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, globSync } from 'node:fs';

const FILES = globSync(['app/**/*.tsx', 'components/**/*.tsx'])
  .filter(f => !f.includes('/node_modules/'));

/** Η δημόσια φόρμα άφιξης: ο επισκέπτης δεν είναι Έλληνας, βλ. κεφαλίδα. */
const GUEST_FORM = 'app/checkin/';

/** Σβήνει σχόλια JSX και γραμμής, κρατώντας τις αλλαγές γραμμής. */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
  .replace(/\/\*[\s\S]*?\*\//g, blank)
  .replace(/^[ \t]*\/\/.*$/gm, blank);

/**
 * Καθε ετικέτα `<input …>` ΟΛΟΚΛΗΡΗ, μαζί με τη γραμμή που ανοίγει.
 *
 * ΓΙΑΤΙ ΟΧΙ ΑΝΑ ΓΡΑΜΜΗ. Το DocumentScan.tsx γράφει το `type={type}` σε ΔΙΚΗ ΤΟΥ
 * γραμμή, τρεις γραμμές κάτω από το `<input`. Ενας έλεγχος ανά γραμμή δεν
 * ξέρει ποια ετικέτα κοιτάζει, και ήταν ακριβώς εκεί που ξέφυγαν δεκατέσσερα
 * ντόπια ημερολόγια.
 */
function inputTags(src) {
  const out = [];
  const re = /<input\b/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0, end = -1;
    for (let i = m.index; i < src.length; i++) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    out.push({ text: src.slice(m.index, end + 1), line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

/**
 * ΟΛΕΣ οι πιθανές ΤΙΜΕΣ μιας έκφρασης, όταν είναι κυριολεκτικές· αλλιώς `null`.
 *
 *   'text'                          → ['text']
 *   show ? 'text' : 'password'      → ['text','password']
 *   type                            → null   (μεταβλητή: δεν ξέρουμε)
 *
 * Η ΣΥΝΘΗΚΗ ΔΕΝ ΜΕΤΡΑΕΙ, ΜΟΝΟ ΤΑ ΣΚΕΛΗ. Η πρώτη γραφή απαιτούσε να είναι
 * ΟΛΟΚΛΗΡΗ η έκφραση κυριολεκτικά, οπότε κοκκίνιζε τέσσερα πεδία κωδικού
 * (`show ? 'text' : 'password'`) που δεν έχουν καμία σχέση με ημερομηνίες.
 *
 * Οριο, γραμμένο ρητά: αν μια συμβολοσειρά περιέχει «?» ή «:», η ανάλυση
 * μπερδεύεται και επιστρέφει `null` — δηλαδή ο φύλακας ΡΩΤΑΕΙ αντί να
 * σιωπήσει. Αυτή είναι η ασφαλής κατεύθυνση για έλεγχο.
 */
function valueLiterals(expr) {
  const t = expr.trim();
  const one = /^'([^']*)'$/.exec(t) || /^"([^"]*)"$/.exec(t);
  if (one) return [one[1]];
  const cut = (from, wanted) => {
    let depth = 0, nest = 0;
    for (let i = from; i < t.length; i++) {
      const c = t[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (depth !== 0) continue;
      else if (c === '?') { if (wanted === '?') return i; nest++; }
      else if (c === ':') { if (wanted === ':') { if (nest === 0) return i; nest--; } }
    }
    return -1;
  };
  const q = cut(0, '?');
  if (q < 0) return null;
  const colon = cut(q + 1, ':');
  if (colon < 0) return null;
  const a = valueLiterals(t.slice(q + 1, colon));
  const b = valueLiterals(t.slice(colon + 1));
  return a && b ? [...a, ...b] : null;
}

/** Ο τύπος της ιδιότητας `name` στο αρχείο, ως κείμενο, ή `null`. */
function propTypeOf(src, name) {
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;
  const m = new RegExp(`\\b${name}\\??\\s*:\\s*([^;,)}\\n]+)`).exec(src);
  return m ? m[1].trim() : null;
}

const hits = [];
const dates = [];
const dynamic = [];

for (const file of FILES) {
  const src = strip(readFileSync(file, 'utf8'));
  src.split('\n').forEach((line, i) => {
    if (/<select[\s>]/.test(line)) hits.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
  if (file.startsWith(GUEST_FORM)) continue;

  for (const tag of inputTags(src)) {
    const lit = /type=["']([a-z-]+)["']/.exec(tag.text);
    if (lit) {
      if (lit[1] === 'date') dates.push(`${file}:${tag.line}  type="date"`);
      continue;
    }
    const dyn = /type=\{([^}]*)\}/.exec(tag.text);
    if (!dyn) continue;
    const expr = dyn[1].trim();
    // (γ) Ολα κυριολεκτικά και κανένα 'date': τίποτα δεν μπορεί να γίνει ημερομηνία.
    const lits = valueLiterals(expr);
    if (lits && !lits.includes('date')) continue;
    // (α) Το αρχείο δρομολογεί ρητά την περίπτωση της ημερομηνίας αλλού.
    if (/type === 'date'/.test(src)) continue;
    // (β) Ο τύπος της ιδιότητας είναι ένωση κυριολεκτικών χωρίς 'date'.
    const declared = propTypeOf(src, expr);
    if (declared && declared.includes("'") && !declared.includes("'date'")) continue;
    dynamic.push(`${file}:${tag.line}  type={${expr}}` + (declared ? `   (ο τύπος είναι ${declared})` : ''));
  }
}

if (hits.length) {
  console.error(`✗ ${hits.length} ντόπια <select>. Χρησιμοποίησε το CustomSelect του './UIComponents'.\n`);
  for (const h of hits) console.error('   ' + h);
  console.error('');
  process.exit(1);
}
if (dates.length) {
  console.error(`✗ ${dates.length} ντόπια <input type="date">. Το ημερολόγιο του περιηγητή είναι αγγλικό,\n  και η μορφή «08/09/2026» αλλάζει νόημα με τη γλώσσα του. Χρησιμοποίησε το\n  DatePicker του './UIComponents'.\n`);
  for (const h of dates) console.error('   ' + h);
  console.error('');
  process.exit(1);
}
if (dynamic.length) {
  console.error(`✗ ${dynamic.length} <input> με ΜΕΤΑΒΛΗΤΟ type που μπορεί να γίνει 'date'.\n` +
    `  Το ημερολόγιο του περιηγητή αντιστρέφει ημέρα και μήνα. Διάλεξε ένα:\n` +
    `    · στένεψε τον τύπο της ιδιότητας σε ένωση κυριολεκτικών χωρίς 'date'\n` +
    `      (προτιμότερο: σφάλμα στη μεταγλώττιση, όχι σε φύλακα), ή\n` +
    `    · δρομολόγησε την περίπτωση με «type === 'date' ? <DatePicker …>».\n`);
  for (const h of dynamic) console.error('   ' + h);
  console.error('');
  process.exit(1);
}
console.log(`✅ Πεδία επιλογής και ημερομηνίας: κανένα ντόπιο, μία παλέτα και μία γλώσσα` +
  ` (${FILES.length} αρχεία, μαζί με τον μεταβλητό type).`);
