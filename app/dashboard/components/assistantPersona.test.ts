// Αυστηρά τεστ για την καθαρή λογική του βοηθού (assistantPersona.ts).
// Τρέξε: npx tsx app/dashboard/components/assistantPersona.test.ts
import {
  parseAction, cleanForSpeech, buildSystemPrompt, NAV_MAP,
  DEFAULT_IDENTITY, type AssistantIdentity, type Gender,
} from './assistantPersona';

let passed = 0, failed = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 60) fails.push(name); } };

const NAV_IDS = NAV_MAP.map(n => n.id);
const GENDERS: Gender[] = ['female', 'male', 'nonbinary', 'neutral'];
const id = (o: Partial<AssistantIdentity> = {}): AssistantIdentity => ({ ...DEFAULT_IDENTITY, ...o });

// ── parseAction: κάθε έγκυρο tab, σε πολλές θέσεις/μορφές (χιλιάδες) ──────────
const WRAPPERS = [
  (t: string) => `Δες εδώ. ${t}`,
  (t: string) => `${t}`,
  (t: string) => `Μια πρόταση.\nΆλλη πρόταση.\n${t}`,
  (t: string) => `Κείμενο ${t} και συνέχεια`,
  (t: string) => `  ${t}  `,
  (t: string) => `Απάντηση με **bold** και ${t}`,
];
for (const navId of NAV_IDS) {
  for (const w of WRAPPERS) {
    for (const cse of [navId, navId.toUpperCase(), navId[0].toUpperCase() + navId.slice(1)]) {
      const text = w(`[[go:${cse}]]`);
      const r = parseAction(text);
      ok(`go ${navId} via ${cse}`, r.action?.type === 'go' && (r.action as any).tab === navId);
      ok(`go ${navId} strip`, !/\[\[/.test(r.clean));
      ok(`go ${navId} clean non-empty when text existed`, r.clean.length >= 0);
    }
  }
}
// scan
for (const w of WRAPPERS) {
  const r = parseAction(w('[[scan]]'));
  ok('scan action', r.action?.type === 'scan');
  ok('scan strip', !/\[\[/.test(r.clean));
}
// invalid tab → no action, but stripped
for (const bad of ['xxx', 'foobar', 'overviewz', '', 'go', '123']) {
  const r = parseAction(`Κείμενο [[go:${bad}]] τέλος`);
  ok(`invalid ${bad} no action`, !r.action || r.action.type !== 'go' || NAV_IDS.includes((r.action as any).tab));
  ok(`invalid ${bad} stripped`, !/\[\[go:/.test(r.clean));
}
// no directive
for (const t of ['Καλημέρα!', 'Πλήρωσες τη ΔΕΗ;', 'Η απόδοση είναι 4,2%.', '']) {
  const r = parseAction(t);
  ok('no action', !r.action);
  ok('clean equals trimmed', r.clean === t.trim());
}

// ── cleanForSpeech: markdown/bullets/arrows/newlines ─────────────────────────
const speechCases: [string, (s: string) => boolean][] = [
  ['**Έντονο** κείμενο', s => s === 'Έντονο κείμενο'],
  ['Λίστα:\n• Ένα\n• Δύο', s => !s.includes('•')],
  ['Πήγαινε εδώ → Δαπάνες', s => !s.includes('→')],
  ['Κώδικας `x=1` μέσα', s => s === 'Κώδικας x=1 μέσα'],
  ['Οδηγία [[go:expenses]] μέσα', s => !s.includes('[[')],
  ['Γραμμή ένα\nΓραμμή δύο', s => !s.includes('\n')],
  ['Πολλά    κενά', s => !/\s{2,}/.test(s)],
  ['## Τίτλος', s => !s.includes('#')],
  ['- Στοιχείο', s => !s.trimStart().startsWith('-')],
  ['Τελεία ...πολλαπλή', s => !s.includes('...')],
  ['', s => s === ''],
];
for (const [inp, check] of speechCases) ok(`speech: ${JSON.stringify(inp).slice(0, 30)}`, check(cleanForSpeech(inp)));
// fuzz: cleanForSpeech ποτέ δεν αφήνει σύμβολα-θόρυβο
const noise = ['**', '`', '→', '←', '•', '##', '[[go:bills]]', '[[scan]]', '|', '>'];
for (let i = 0; i < 400; i++) {
  const parts = Array.from({ length: 5 }, (_, k) => (k % 2 ? noise[(i + k) % noise.length] : `λέξη${i}${k}`));
  const out = cleanForSpeech(parts.join(' '));
  ok(`fuzz no [[ ${i}`, !out.includes('[['));
  ok(`fuzz no ** ${i}`, !out.includes('**'));
  ok(`fuzz no arrows ${i}`, !/[→←]/.test(out));
  ok(`fuzz no double space ${i}`, !/\s{2,}/.test(out));
}

// ── buildSystemPrompt: περιεχόμενο & γένος ───────────────────────────────────
for (const g of GENDERS) {
  const p = buildSystemPrompt(id({ name: 'Νόα', gender: g }), 'Ενοίκιο: 600 €');
  ok(`prompt name ${g}`, p.includes('Νόα'));
  ok(`prompt context ${g}`, p.includes('Ενοίκιο: 600 €'));
  ok(`prompt nav ${g}`, NAV_MAP.every(n => p.includes(n.label)));
  ok(`prompt greek-life ${g}`, /Παναθηναϊκός|Ολυμπιακός/.test(p));
  ok(`prompt referral ${g}`, /δικηγόρος|λογιστ/.test(p));
}
// σωστό γραμματικό γένος (self-reference)
ok('female self', /σίγουρη|θηλυκ/i.test(buildSystemPrompt(id({ gender: 'female' }), 'x')));
ok('male self', /σίγουρος|αρσενικ/i.test(buildSystemPrompt(id({ gender: 'male' }), 'x')));
ok('neutral self', /ουδετερ|Ουδέτερ|ουδέτερ/i.test(buildSystemPrompt(id({ gender: 'neutral' }), 'x')));
// default όνομα όταν κενό
ok('empty name → default', buildSystemPrompt(id({ name: '' }), 'x').includes(DEFAULT_IDENTITY.name));
// compare context εμφανίζεται μόνο όταν δοθεί
ok('no compare by default', !buildSystemPrompt(id(), 'x').includes('ΟΛΑ ΤΑ ΑΚΙΝΗΤΑ'));
ok('compare when provided', buildSystemPrompt(id(), 'x', '1. Σπίτι Α: αξία 200.000 €').includes('ΟΛΑ ΤΑ ΑΚΙΝΗΤΑ'));

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nassistantPersona.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
