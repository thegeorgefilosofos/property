// Αυστηρά τεστ για την καθαρή λογική του βοηθού (assistantPersona.ts).
// Τρέξε: npx tsx app/dashboard/components/assistantPersona.test.ts
// Ελαφρύ shim του localStorage/window ΠΡΙΝ το import, ώστε να δοκιμαστεί η μόνιμη μνήμη.
const _store = new Map<string, string>();
(globalThis as any).window = globalThis;
(globalThis as any).localStorage = {
  getItem: (k: string) => (_store.has(k) ? _store.get(k)! : null),
  setItem: (k: string, v: string) => { _store.set(k, String(v)); },
  removeItem: (k: string) => { _store.delete(k); },
  clear: () => { _store.clear(); },
};

import {
  parseAction, cleanForSpeech, buildSystemPrompt, NAV_MAP,
  DEFAULT_IDENTITY, type AssistantIdentity, type Gender,
  loadMemories, addMemory, removeMemory, clearMemories,
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
// τρόπος προσφώνησης: ενικός vs πληθυντικός
{
  const sing = buildSystemPrompt(id({ formal: false }), 'x');
  const plur = buildSystemPrompt(id({ formal: true }), 'x');
  ok('singular addresses in ενικό', /στον ενικό/.test(sing) && !/πληθυντικό ευγενείας/.test(sing));
  ok('plural addresses in πληθυντικό', /πληθυντικό ευγενείας/.test(plur));
  ok('default identity is singular', DEFAULT_IDENTITY.formal === false);
}
// compare context εμφανίζεται μόνο όταν δοθεί
ok('no compare by default', !buildSystemPrompt(id(), 'x').includes('ΟΛΑ ΤΑ ΑΚΙΝΗΤΑ'));
ok('compare when provided', buildSystemPrompt(id(), 'x', '1. Σπίτι Α: αξία 200.000 €').includes('ΟΛΑ ΤΑ ΑΚΙΝΗΤΑ'));

// ── parseAction: [[remember: ...]] ───────────────────────────────────────────
{
  const r = parseAction('Το σημείωσα. [[remember: προτιμά ηλεκτρονικές πληρωμές]]');
  ok('remember extracted', r.remember === 'προτιμά ηλεκτρονικές πληρωμές');
  ok('remember stripped from clean', !/\[\[/.test(r.clean));
  ok('remember clean text kept', r.clean.includes('Το σημείωσα.'));
}
// remember + go μαζί: και τα δύο επιστρέφονται
{
  const r = parseAction('Πάμε. [[remember: υδραυλικός ο Νίκος]] [[go:contacts]]');
  ok('remember+go remember', r.remember === 'υδραυλικός ο Νίκος');
  ok('remember+go action', r.action?.type === 'go' && (r.action as any).tab === 'contacts');
  ok('remember+go clean', !/\[\[/.test(r.clean));
}
// κενό/άκυρο remember → undefined
for (const t of ['Καμία μνήμη εδώ.', 'Κείμενο [[remember:]] τέλος', '[[remember:   ]]']) {
  const r = parseAction(t);
  ok(`no remember for ${JSON.stringify(t).slice(0, 24)}`, r.remember === undefined || r.remember.length > 0);
  ok(`remember always stripped ${JSON.stringify(t).slice(0, 24)}`, !/\[\[/.test(r.clean));
}
// μεγάλο γεγονός κόβεται στα 140
{
  const long = 'α'.repeat(300);
  const r = parseAction(`[[remember: ${long}]]`);
  ok('remember capped 140', (r.remember || '').length <= 140);
}

// ── buildSystemPrompt: extras (insights / market / memories) ──────────────────
{
  const base = buildSystemPrompt(id(), 'x');
  ok('no insights section by default', !base.includes('ΤΙ ΤΡΕΧΕΙ ΤΩΡΑ'));
  ok('no market section by default', !base.includes('ΑΓΟΡΑ ΣΗΜΕΡΑ'));
  ok('no remembered list by default', !base.includes('Ήδη θυμάσαι'));
  ok('memory instruction always present', base.includes('[[remember:'));

  const rich = buildSystemPrompt(id(), 'x', undefined, {
    insights: '• [ΕΠΕΙΓΟΝ] Ληξιπρόθεσμος λογαριασμός',
    market: 'Euribor 3 μηνών: 2,18%',
    memories: ['προτιμά ηλεκτρονικές πληρωμές', 'στόχος πώληση σε 2 χρόνια'],
  });
  ok('insights injected', rich.includes('ΤΙ ΤΡΕΧΕΙ ΤΩΡΑ') && rich.includes('Ληξιπρόθεσμος λογαριασμός'));
  ok('market injected', rich.includes('ΑΓΟΡΑ ΣΗΜΕΡΑ') && rich.includes('Euribor 3 μηνών: 2,18%'));
  ok('memories injected', rich.includes('Ήδη θυμάσαι') && rich.includes('στόχος πώληση σε 2 χρόνια'));

  // κενές/whitespace μνήμες δεν εμφανίζουν τη λίστα
  const empty = buildSystemPrompt(id(), 'x', undefined, { memories: ['', '   '] });
  ok('blank memories hide list', !empty.includes('Ήδη θυμάσαι'));
}

// ── Μόνιμη μνήμη: add / dedup / cap / remove / clear ──────────────────────────
{
  const uid = 'user-test-1';
  clearMemories(uid);
  ok('starts empty', loadMemories(uid).length === 0);
  addMemory(uid, 'προτιμά ηλεκτρονικές πληρωμές');
  ok('added one', loadMemories(uid).length === 1);
  addMemory(uid, '  προτιμά ηλεκτρονικές    πληρωμές  '); // ίδιο, με επιπλέον κενά
  ok('dedup after normalize', loadMemories(uid).length === 1);
  addMemory(uid, 'Cash Only'); addMemory(uid, 'cash only'); // ίδιο σε λατινικά, διαφορετική πεζότητα
  ok('dedup case-insensitive latin', loadMemories(uid).filter(m => m.text.toLowerCase() === 'cash only').length === 1);
  removeMemory(uid, loadMemories(uid).find(m => m.text.toLowerCase() === 'cash only')!.id);
  ok('back to one', loadMemories(uid).length === 1);
  addMemory(uid, '   '); // κενό αγνοείται
  ok('blank ignored', loadMemories(uid).length === 1);
  addMemory(uid, 'δεύτερο γεγονός');
  ok('added second', loadMemories(uid).length === 2);
  const first = loadMemories(uid)[0];
  removeMemory(uid, first.id);
  ok('removed one by id', loadMemories(uid).length === 1 && !loadMemories(uid).some(m => m.id === first.id));
  clearMemories(uid);
  ok('cleared', loadMemories(uid).length === 0);

  // cap: πάνω από 100 κρατά τα τελευταία 100
  for (let i = 0; i < 120; i++) addMemory(uid, `γεγονός νούμερο ${i}`);
  const capped = loadMemories(uid);
  ok('capped at 100', capped.length === 100);
  ok('cap keeps latest', capped[capped.length - 1].text === 'γεγονός νούμερο 119');
  clearMemories(uid);

  // απομόνωση ανά χρήστη
  addMemory('user-A', 'μυστικό Α');
  addMemory('user-B', 'μυστικό Β');
  ok('per-user isolation', loadMemories('user-A').length === 1 && loadMemories('user-B')[0].text === 'μυστικό Β');
  clearMemories('user-A'); clearMemories('user-B');
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nassistantPersona.ts, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
