#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// ΚΑΝΕΝΑ ΚΟΜΜΑ ΠΡΙΝ ΑΠΟ ΤΟ «ΚΑΙ»
// ─────────────────────────────────────────────────────────────────────────
// Ο κανόνας είναι ρητός και αφορά ό,τι διαβάζει ο χρήστης: γράφουμε «και»,
// ποτέ «, και». Το ίδιο ισχύει για το «κι».
//
// ΤΙ ΜΕΤΡΗΘΗΚΕ. 207 λεκτικά σε 64 αρχεία, και 61 από αυτά έφταναν στην οθόνη
// σε δέκα δημόσιες σελίδες και οκτώ οθόνες του πίνακα. Τα υπόλοιπα ζούσαν σε
// μηνύματα email, σε τίτλους PDF και σε κείμενα που εμφανίζονται υπό συνθήκη.
//
// ΓΙΑΤΙ ΜΟΝΟ ΤΑ ΛΕΚΤΙΚΑ, ΚΑΙ ΟΧΙ ΤΑ ΣΧΟΛΙΑ. Στον κώδικα υπάρχουν πάνω από δύο
// χιλιάδες εμφανίσεις, και η συντριπτική πλειονότητα ζει σε σχόλια που κανείς
// δεν βλέπει στην εφαρμογή. Ο κανόνας είναι για το κείμενο του προϊόντος, άρα
// η απογραφή γίνεται από το AST: εκεί το σχόλιο δεν είναι συμβολοσειρά.
//
// ΚΑΙ ΟΙ ΕΝΩΜΕΝΕΣ ΣΥΜΒΟΛΟΣΕΙΡΕΣ, ΓΙΑΤΙ ΕΚΕΙ ΚΡΥΦΤΗΚΕ Η ΤΕΛΕΥΤΑΙΑ. Στη σελίδα
// του ΕΝΦΙΑ το κόμμα έκλεινε το ένα κομμάτι και το «και» άνοιγε το επόμενο:
//
//     '… περιουσιακά όρια, '
//   + 'και έκπτωση 20% …'
//
// Κανένα λεκτικό μόνο του δεν περιείχε «, και», και η οθόνη το έδειχνε
// κανονικά. Οι ενώσεις με «+» εξετάζονται πλέον και ΕΝΩΜΕΝΕΣ.
//
// ΤΙ ΔΕΝ ΠΙΑΝΕΤΑΙ: το περιεχόμενο ενός <style> (είναι CSS) και οι τεχνικές
// ιδιότητες JSX (className, style, href, id, key, type, name).
// ═══════════════════════════════════════════════════════════════════════════
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const files = projectFiles("'app/**' 'components/**' 'lib/**' 'supabase/functions/**'")
  .filter(f => /\.(tsx?)$/.test(f));

// Το «\b» δεν δουλεύει μετά από ελληνικό γράμμα: το «ι» δεν είναι χαρακτήρας
// λέξης κατά ASCII, οπότε το όριο δεν βρίσκεται ποτέ και ο έλεγχος θα ήταν
// σιωπηλά κενός. Το αρνητικό lookahead το λέει σωστά.
const RE = /,\s*(και|κι)(?![α-ωΑ-Ωά-ώΆ-Ώ])/u;
const GREEK = /[Ά-ώ]/;

const hits = [];
for (const f of files) {
  let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  if (!GREEK.test(src)) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, /\.tsx$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const push = (n, t) => { if (GREEK.test(t) && RE.test(t)) hits.push({ f, line: at(n), t: t.replace(/\s+/g, ' ').trim() }); };
  const inStyleTag = (n) => {
    for (let a = n.parent; a; a = a.parent)
      if (ts.isJsxElement(a) && a.openingElement.tagName.getText(sf) === 'style') return true;
    return false;
  };
  const walk = (n) => {
    if (inStyleTag(n)) { n.forEachChild(walk); return; }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (!(ts.isJsxAttribute(p) && ['className', 'style', 'href', 'id', 'key', 'type', 'name'].includes(p.name.getText(sf)))) push(n, n.text);
    } else if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g, ' ').trim(); if (t) push(n, t); }
    else if (ts.isTemplateExpression(n)) { for (const q of [n.head, ...n.templateSpans.map(s => s.literal)]) if (q.text.trim()) push(n, q.text); }
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      // Ολα τα φύλλα της ένωσης, στη σειρά. Ο,τι δεν είναι συμβολοσειρά μπαίνει
      // ως κενό: μια μεταβλητή στη μέση δεν φέρνει ούτε κόμμα ούτε «και».
      const parts = [];
      const flat = (x) => {
        if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) { flat(x.left); flat(x.right); return; }
        parts.push(ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x) ? x.text : '');
      };
      flat(n);
      push(n, parts.join(''));
    }
    n.forEachChild(walk);
  };
  walk(sf);
}

if (hits.length) {
  console.error(`✗ ${hits.length} λεκτικά με κόμμα πριν από το «και», σε ${new Set(hits.map(h => h.f)).size} αρχεία:\n`);
  for (const h of hits.slice(0, 12)) {
    const m = RE.exec(h.t);
    const i = Math.max(0, h.t.indexOf(m[0]) - 40);
    console.error(`  ${h.f}:${h.line}\n     …${h.t.slice(i, i + 96)}…`);
  }
  if (hits.length > 12) console.error(`  … και ${hits.length - 12}`);
  console.error(`
  Γράφουμε «και», όχι «, και». Το ίδιο και για το «κι».
`);
  process.exit(1);
}
console.log(`✓ κανένα κόμμα πριν από το «και» σε ${files.length} αρχεία`);
