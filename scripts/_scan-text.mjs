// Απογραφή ποιότητας λεκτικών. Βοηθητικό, δεν μένει στο δέντρο.
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { projectFiles } from './lib/git-files.mjs';

const files = projectFiles("'app/**' 'components/**' 'lib/**' 'supabase/functions/**'")
  .filter(f => /\.(tsx?)$/.test(f) && !f.includes('.test.'));
const GREEK = /[Ά-ώ]/;
const strings = [];
for (const f of files) {
  let src; try { src = readFileSync(f, 'utf8'); } catch { continue; }
  if (!GREEK.test(src)) continue;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, /\.tsx$/.test(f) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const at = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const push = (n, t) => { if (GREEK.test(t)) strings.push({ f, line: at(n), t }); };
  const inStyleTag = (n) => { for (let a = n.parent; a; a = a.parent) if (ts.isJsxElement(a) && a.openingElement.tagName.getText(sf) === 'style') return true; return false; };
  const walk = (n) => {
    if (inStyleTag(n)) { n.forEachChild(walk); return; }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const p = n.parent;
      if (!(ts.isJsxAttribute(p) && ['className','style','href','id','key','type','name'].includes(p.name.getText(sf)))) push(n, n.text);
    } else if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g,' ').trim(); if (t) push(n, t); }
    else if (ts.isTemplateExpression(n)) { for (const q of [n.head, ...n.templateSpans.map(s=>s.literal)]) if (q.text.trim()) push(n, q.text); }
    n.forEachChild(walk);
  };
  walk(sf);
}

// ΟΙ ΟΔΗΓΙΕΣ ΠΡΟΣ ΤΟ ΜΟΝΤΕΛΟ ΔΕΝ ΕΙΝΑΙ ΚΕΙΜΕΝΟ ΠΡΟΪΟΝΤΟΣ. Είναι κώδικας
// γραμμένος σε ελληνικά: τα εισαγωγικά τους είναι σύνταξη JSON, οι τελείες
// τους δομή. Κρίνονται με άλλα μέτρα, οπότε βγαίνουν έξω.
const PROMPT = /Είσαι |Επέστρεψε |ΜΝΗΜΗ |JSON|\{"|"\}/;
// Ούτε το HTML των εκτυπώσεων: τα διπλά κενά εκεί είναι μορφοποίηση πηγαίου.
const MARKUP = /<(table|thead|tr|th|td|div|span|p|br)\b/i;
const RULES = [
  ['διπλό κενό',            /[^\n] {2,}[^\n ]/],
  ['τρεις τελείες αντί για …', /\.\.\./],
  // Το «·» με κενά είναι ΙΔΙΩΜΑ ΔΙΑΧΩΡΙΣΜΟΥ της σχεδίασης, όχι στίξη σε
  // πρόταση. Μένουν μόνο τα σημεία που κολλάνε στη λέξη πριν από αυτά.
  ['κενό πριν από στίξη',   /[Ά-ώ]\s+[.,;:!](\s|$)/],
  ['λατινικό ; ως ερωτηματικό', /[Ά-ώ]\?/],
];
const hits = new Map();
for (const s of strings) {
  if (PROMPT.test(s.t) || MARKUP.test(s.t)) continue;
  for (const [name, re] of RULES)
    if (re.test(s.t)) { if (!hits.has(name)) hits.set(name, []); hits.get(name).push(s); }
}
console.log(`══ ${strings.length} λεκτικά ελέγχθηκαν\n`);
for (const [name, rows] of [...hits].sort((a,b)=>b[1].length-a[1].length)) {
  console.log(`── ${name}  ×${rows.length}`);
  for (const r of rows.slice(0, 5)) console.log(`     ${r.f}:${r.line}  «${r.t.replace(/\s+/g,' ').slice(0,78)}»`);
  if (rows.length > 5) console.log(`     … και ${rows.length - 5}`);
  console.log();
}

// ── ΕΠΑΝΑΛΗΨΕΙΣ: η ίδια φράση σε δύο σημεία ──
const byText = new Map();
for (const s of strings) {
  if (PROMPT.test(s.t) || MARKUP.test(s.t)) continue;
  const k = s.t.replace(/\s+/g,' ').trim();
  if (k.length < 34) continue;
  if (!byText.has(k)) byText.set(k, []);
  byText.get(k).push(`${s.f}:${s.line}`);
}
const dups = [...byText].filter(([, v]) => new Set(v.map(x=>x.split(':')[0])).size > 1);
console.log(`── ΙΔΙΑ ΦΡΑΣΗ ΣΕ ΠΑΝΩ ΑΠΟ ΕΝΑ ΑΡΧΕΙΟ: ${dups.length}`);
for (const [t, where] of dups) console.log(`     «${t.slice(0,70)}»\n        ${[...new Set(where)].join('  ')}`);

