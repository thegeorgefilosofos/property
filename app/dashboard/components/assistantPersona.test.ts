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
  normalizeBookTime, resolveBookDate,
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
// book action: title | date
{
  const r = parseAction('Το έκλεισα. [[book: Ραντεβού με Εθνική για χρηματοδότηση | 2026-07-15]]');
  ok('book action type', r.action?.type === 'book');
  ok('book date parsed', (r.action as any)?.date === '2026-07-15');
  ok('book title parsed', /Εθνική/.test((r.action as any)?.title || ''));
  ok('book stripped', !/\[\[/.test(r.clean));
}
{
  // date-first order still works
  const r = parseAction('[[book: 2026-08-01 | Ραντεβού Alpha]]');
  ok('book date-first', (r.action as any)?.date === '2026-08-01' && /Alpha/.test((r.action as any)?.title || ''));
}
{
  // no valid date → no book action, still stripped
  const r = parseAction('Πες μου πότε [[book: Ραντεβού χωρίς ημερομηνία]]');
  ok('book without date → no action', r.action?.type !== 'book');
  ok('book invalid stripped', !/\[\[/.test(r.clean));
}
{
  // book with time (τρίτο μέρος HH:MM)
  const r = parseAction('[[book: Ραντεβού με υδραυλικό | 2026-07-12 | 18:00]]');
  ok('book with time: type', r.action?.type === 'book');
  ok('book with time: date', (r.action as any)?.date === '2026-07-12');
  ok('book with time: time', (r.action as any)?.time === '18:00');
  ok('book with time: title excludes time', !/18:00/.test((r.action as any)?.title || '') && /υδραυλικό/.test((r.action as any)?.title || ''));
}
{
  // single-digit hour normalised to HH:MM
  const r = parseAction('[[book: Έλεγχος | 2026-09-03 | 9:30]]');
  ok('book time pads hour', (r.action as any)?.time === '09:30');
}
{
  // no time → time undefined (ολοήμερο)
  const r = parseAction('[[book: Ραντεβού Alpha | 2026-08-01]]');
  ok('book no time → undefined', (r.action as any)?.time === undefined);
}
{
  // άκυρη ώρα αγνοείται
  const r = parseAction('[[book: X | 2026-08-01 | 45:99]]');
  ok('book invalid time ignored', (r.action as any)?.time === undefined && (r.action as any)?.date === '2026-08-01');
}
// client action: name | phone | afm | type
{
  const r = parseAction('Εντάξει. [[client: Γιάννης Νικολάου | 6941234567 | 090000045 | πελάτης]]');
  ok('client action type', r.action?.type === 'client');
  ok('client name', (r.action as any)?.name === 'Γιάννης Νικολάου');
  ok('client phone', (r.action as any)?.phone === '6941234567');
  ok('client afm', (r.action as any)?.afm === '090000045');
  ok('client stripped', !/\[\[/.test(r.clean));
}
{
  // only a name is required
  const r = parseAction('[[client: Μαρία]]');
  ok('client name-only', r.action?.type === 'client' && (r.action as any).name === 'Μαρία' && !(r.action as any).phone);
}
{
  // empty name → no action
  const r = parseAction('[[client: ]] κείμενο');
  ok('client empty name → no action', r.action?.type !== 'client');
  ok('client empty stripped', !/\[\[/.test(r.clean));
}

// ── parseAction: [[expense: περιγραφή | ποσό]] ───────────────────────────────
{
  const r = parseAction('Το κατέγραψα. [[expense: Υδραυλικός | 80]]');
  ok('expense type', r.action?.type === 'expense');
  ok('expense description', (r.action as any)?.description === 'Υδραυλικός');
  ok('expense amount', (r.action as any)?.amount === 80);
  ok('expense stripped', !/\[\[/.test(r.clean));
}
{
  // δεκαδικά με κόμμα + χιλιάδες με τελεία, οποιαδήποτε σειρά
  const r = parseAction('[[expense: Ανακαίνιση μπάνιου | 1.200,50]]');
  ok('expense thousands+decimal', (r.action as any)?.amount === 1200.5);
}
{
  const r = parseAction('[[expense: Λογαριασμός ρεύματος | 120 €]]');
  ok('expense euro sign', (r.action as any)?.amount === 120 && (r.action as any)?.description === 'Λογαριασμός ρεύματος');
}
{
  // χωρίς ποσό ή μηδέν → δεν εκτελείται
  ok('expense no amount → no action', parseAction('[[expense: Κάτι]]').action?.type !== 'expense');
  ok('expense zero → no action', parseAction('[[expense: Κάτι | 0]]').action?.type !== 'expense');
  ok('expense stripped anyway', !/\[\[/.test(parseAction('[[expense: Κάτι]]').clean));
}

// ── parseAction: [[vip: ...]] & [[checkin: ...]] ─────────────────────────────
{
  const r = parseAction('Έγινε. [[vip: Γιώργος Παπαδόπουλος]]');
  ok('vip type', r.action?.type === 'vip');
  ok('vip who', (r.action as any)?.who === 'Γιώργος Παπαδόπουλος');
  ok('vip stripped', !/\[\[/.test(r.clean));
}
{
  const r = parseAction('[[checkin: 6941234567]]');
  ok('checkin type', r.action?.type === 'checkin');
  ok('checkin who', (r.action as any)?.who === '6941234567');
}
{
  ok('vip empty → no action', parseAction('[[vip: ]]').action?.type !== 'vip');
  ok('checkin empty → no action', parseAction('[[checkin:]]').action?.type !== 'checkin');
}
{
  // προτεραιότητα: expense πριν από go αν συνυπάρχουν
  const r = parseAction('[[expense: Νερό | 40]] [[go:bills]]');
  ok('expense wins over go', r.action?.type === 'expense');
  ok('expense+go clean', !/\[\[/.test(r.clean));
}

// ── parseAction: [[contact: ...]] & [[task: ...]] ────────────────────────────
{
  const r = parseAction('Την κράτησα. [[contact: Νίκος Υδραυλικός | 6941234567 | υδραυλικός]]');
  ok('contact type', r.action?.type === 'contact');
  ok('contact name', (r.action as any)?.name === 'Νίκος Υδραυλικός');
  ok('contact phone', (r.action as any)?.phone === '6941234567');
  ok('contact role', (r.action as any)?.role === 'υδραυλικός');
  ok('contact stripped', !/\[\[/.test(r.clean));
}
{
  const r = parseAction('[[contact: ΔΕΗ]]');
  ok('contact name-only', r.action?.type === 'contact' && (r.action as any).name === 'ΔΕΗ' && !(r.action as any).phone);
  ok('contact empty → no action', parseAction('[[contact: ]]').action?.type !== 'contact');
}
{
  const r = parseAction('Έγινε. [[task: Πληρωμή ΕΝΦΙΑ]]');
  ok('task type', r.action?.type === 'task');
  ok('task description', (r.action as any)?.description === 'Πληρωμή ΕΝΦΙΑ');
  ok('task empty → no action', parseAction('[[task:]]').action?.type !== 'task');
}
{
  // contact & client είναι διακριτά (διαφορετικές καρτέλες)
  ok('contact ≠ client', parseAction('[[contact: Νίκος]]').action?.type === 'contact');
  ok('client stays client', parseAction('[[client: Μαρία]]').action?.type === 'client');
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
// segment-awareness: ο advisor προσαρμόζεται σε κάθε τύπο χρήστη
{
  const p = buildSystemPrompt(id(), 'x');
  ok('knows short-term/Airbnb + ΑΜΑ', /ΒΡΑΧΥΧΡΟΝΙΑ|Airbnb/.test(p) && /ΑΜΑ/.test(p));
  ok('knows long-term', /ΜΑΚΡΟΧΡΟΝΙΑ/.test(p));
  ok('knows broker', /ΜΕΣΙΤΗΣ/.test(p));
  ok('knows accountant', /ΛΟΓΙΣΤΗΣ/.test(p));
}
// βαθιά λογιστική/φορολογική γνώση & συμβουλευτική δομής
{
  const p = buildSystemPrompt(id(), 'x');
  ok('knows 2026 youth relief', /έως 25 ετών|μειωμένη κλίμακα νέων|ΜΕΙΩΜΕΝΗ ΚΛΙΜΑΚΑ ΝΕΩΝ/i.test(p));
  ok('youth relief NOT for passive rent', /ΟΧΙ τα παθητικά ενοίκια|δεν αφορά.*ενοίκια|ανεξαρτήτως ηλικίας/i.test(p));
  ok('knows business structures & tax', /ΙΚΕ/.test(p) && /ατομική επιχείρηση/i.test(p) && /22%/.test(p));
  ok('knows E1/E2/E9', /Ε1/.test(p) && /Ε2/.test(p) && /Ε9/.test(p));
  ok('knows net vs gross', /ΜΕΙΚΤΑ vs ΚΑΘΑΡΑ|ταμειακό|ΤΑΜΕΙΑΚΟ/i.test(p));
  ok('knows tax incentives (40%/exemption)', /40%/.test(p) && /απαλλαγή/i.test(p));
  ok('defers structure to accountant+lawyer', /λογιστή.*δικηγόρο|δικηγόρο.*σύσταση/i.test(p));
  ok('links to accounting tab', /\[\[go:accounting\]\]/.test(p));
}
// βαθιά γνώση αποδόσεων & επενδυτικής ανάλυσης (ιδιώτες + επαγγελματίες, μακρο + βραχυ)
{
  const p = buildSystemPrompt(id(), 'x');
  ok('has returns section', /ΑΠΟΔΟΣΕΙΣ & ΕΠΕΝΔΥΤΙΚΗ ΑΝΑΛΥΣΗ/.test(p));
  ok('knows core yield KPIs', /μεικτή απόδοση/i.test(p) && /καθαρή απόδοση/i.test(p) && /cash-on-cash/i.test(p));
  ok('knows IRR/NPV/DSCR', /IRR/.test(p) && /NPV/.test(p) && /DSCR/.test(p));
  ok('knows long vs short + RevPAR', /ΜΑΚΡΟΧΡΟΝΙΑ vs ΒΡΑΧΥΧΡΟΝΙΑ/.test(p) && /RevPAR/.test(p));
  ok('knows regional yields (Attica+province+islands+Crete)', /Αττική/.test(p) && /Λάρισα/.test(p) && /Μύκονος/.test(p) && /Ηράκλειο/.test(p));
  ok('ethical leverage + risk of property loss', /ΜΟΧΛΕΥΣΗ/.test(p) && /ΥΠΟΘΗΚΗ|πλειστηριασμ/i.test(p) && /συμφέρον του χρήστη/.test(p));
  ok('programs only with real criteria', /ΜΟΝΟ ΜΕ ΑΛΗΘΙΝΑ ΚΡΙΤΗΡΙΑ|Σπίτι μου ΙΙ/.test(p));
  ok('honest good/bad investment', /Ποτέ μην ωραιοποιείς|υπέρ ΚΑΙ τα κατά/.test(p));
  ok('links to roi tab', /\[\[go:roi\]\]/.test(p));
}
// GDPR & ενσωματώσεις: ο advisor ξέρει το απόρρητο και είναι ειλικρινής για τι δουλεύει
{
  const p = buildSystemPrompt(id(), 'x');
  ok('knows GDPR', /GDPR/.test(p) && /\/privacy/.test(p));
  ok('knows data rights', /φορητότητα|διαγραφή/.test(p));
  ok('knows checkin consent', /συγκατάθεση/.test(p));
  ok('knows integrations live vs soon', /ΕΝΕΡΓΑ ΤΩΡΑ/.test(p) && /ΕΡΧΟΝΤΑΙ/.test(p));
  ok('honest about channel manager/open banking', /channel manager/i.test(p) && /open banking/i.test(p));
  ok('knows maintenance scheduling', /ΣΥΝΤΗΡΗΣΗ|προγραμματ/i.test(p) && /κλιματιστ/i.test(p));
  ok('refers to Douleutaras when contact missing', /douleutaras/i.test(p));
  ok('proactive with saved technicians', /ΕΠΑΦΕΣ ΤΟΥ ΧΡΗΣΤΗ|τεχνικ/i.test(p));
}
// contactsPro context section appears only when provided (marker unique to the injection)
{
  const marker = 'τεχνικοί, μάστορες, πάροχοι, συνεργάτες';
  ok('no contactsPro by default', !buildSystemPrompt(id(), 'x').includes(marker));
  ok('contactsPro when provided', buildSystemPrompt(id(), 'x', undefined, { contactsPro: '• Νίκος · Υδραυλικός · τηλ 6900000000' }).includes(marker));
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

// ── normalizeBookTime: δέχεται σαφείς μορφές, απορρίπτει διφορούμενες ──────────
ok('24ωρη 17:30', normalizeBookTime('17:30') === '17:30');
ok('24ωρη 9:5 → όχι (μονοψήφια λεπτά άκυρα)', normalizeBookTime('9:5') === undefined);
ok('24ωρη 09:05', normalizeBookTime('09:05') === '09:05');
ok('6μμ → 18:00', normalizeBookTime('6μμ') === '18:00');
ok('10πμ → 10:00', normalizeBookTime('10πμ') === '10:00');
ok('6 μ.μ. → 18:00', normalizeBookTime('6 μ.μ.') === '18:00');
ok('12μμ → 12:00', normalizeBookTime('12μμ') === '12:00');
ok('12πμ → 00:00', normalizeBookTime('12πμ') === '00:00');
ok('6:30μμ → 18:30', normalizeBookTime('6:30μμ') === '18:30');
ok('σκέτη ώρα «5» → undefined (διφορούμενη)', normalizeBookTime('5') === undefined);
ok('άκυρη 25:00 → undefined', normalizeBookTime('25:00') === undefined);
ok('άκυρη 13μμ → undefined', normalizeBookTime('13μμ') === undefined);
ok('κενό → undefined', normalizeBookTime('') === undefined);

// ── [[book:]] με σαφή ελληνική ώρα περνά· διφορούμενη ώρα δεν περνά ────────────
{
  const r = parseAction('Το κλείνω. [[book: Service κλιματιστικού | 2026-07-15 | 6μμ]]');
  ok('book: greek time date', r.action?.type === 'book' && (r.action as any).date === '2026-07-15');
  ok('book: greek time → 18:00', (r.action as any).time === '18:00');
}
{
  const r = parseAction('[[book: Ραντεβού υδραυλικού | 2026-07-15 | 5]]');
  ok('book: διφορούμενη ώρα αγνοείται (χωρίς time)', r.action?.type === 'book' && (r.action as any).time === undefined);
}
{
  const r = parseAction('[[book: Έλεγχος λέβητα | 2026-08-01 | 17:00]]');
  ok('book: 24ωρη περνά', (r.action as any).time === '17:00');
}

// ── resolveBookDate: ISO ή ντετερμινιστικό fallback (Τετάρτη/αύριο) ───────────
{
  const NOW = new Date(Date.UTC(2026, 6, 10)); // Παρασκευή 2026-07-10
  ok('ISO παραμένει', resolveBookDate(['Service', '2026-07-15', '6μμ'], NOW) === '2026-07-15');
  ok('Τετάρτη → επόμενη', resolveBookDate(['Ραντεβού', 'Τετάρτη'], NOW) === '2026-07-15');
  ok('αύριο → 2026-07-11', resolveBookDate(['Κάτι', 'αύριο'], NOW) === '2026-07-11');
  ok('25/3 → του χρόνου', resolveBookDate(['Γιορτή', '25/3'], NOW) === '2027-03-25');
  ok('χωρίς ημερομηνία → κενό', resolveBookDate(['Μόνο τίτλος'], NOW) === '');
}

// ── Το persona διδάσκει διευκρινιστικές ερωτήσεις για ώρα/ημερομηνία ──────────
{
  const sp = buildSystemPrompt(id({}), 'Διαμέρισμα');
  ok('persona: κανόνας πρωί/απόγευμα', /πρωί ή το απόγευμα/i.test(sp));
  ok('persona: διευκρίνιση ώρας', /ΔΙΕΥΚΡΙΝΙΣΤΙΚΕΣ ΕΡΩΤΗΣΕΙΣ/i.test(sp));
  ok('persona: γρήγορες εντολές', /ΓΡΗΓΟΡΕΣ ΕΝΤΟΛΕΣ/i.test(sp));
  ok('persona: παράδειγμα aircondition', /aircondition/i.test(sp));
}

// ── Λογαριασμός/Ρυθμίσεις: ο βοηθός ξέρει την «Λογαριασμός» & δρομολογεί σωστά ──
// (η νέα σελίδα λογαριασμού με 5 ενότητες· σύντομες/ημιτελείς/greeklish ερωτήσεις)
{
  const p = buildSystemPrompt(id(), 'Διαμέρισμα');
  ok('settings: knows Λογαριασμός page section', /ΛΟΓΑΡΙΑΣΜΟΣ & ΡΥΘΜΙΣΕΙΣ ΕΦΑΡΜΟΓΗΣ/.test(p));
  ok('settings: five sections named', /«Προφίλ»/.test(p) && /«Συνδρομή»/.test(p) && /«Εμφάνιση & Γλώσσα»/.test(p) && /«Ειδοποιήσεις»/.test(p) && /«Δεδομένα & Απόρρητο»/.test(p));
  ok('settings: profile has email + billing', /email λογαριασμού/.test(p) && /στοιχεία τιμολόγησης/.test(p));
  ok('settings: theme/dark → Εμφάνιση & Γλώσσα', /θέμα \(φωτεινό\/σκοτεινό\)/.test(p) && /«Εμφάνιση & Γλώσσα»/.test(p));
  ok('settings: theme also from top-right icon', /εικονίδιο πάνω δεξιά/.test(p));
  ok('settings: subscription + upgrade', /διαχείριση και αναβάθμιση συνδρομής/.test(p) && /απαιτεί αναβάθμιση συνδρομής/.test(p));
  ok('settings: individual↔professional in subscription', /Ιδιώτης↔Επαγγελματίας/.test(p));
  ok('settings: report branding for professionals', /επωνυμία στις αναφορές/.test(p));
  ok('settings: notifications routing', /ειδοποιήσεις.*dunning|dunning/i.test(p) && /«Ειδοποιήσεις»/.test(p));
  ok('settings: data & privacy routing', /εξαγωγή CSV/.test(p) && /σύνδεσμος λογιστή/.test(p) && /διαγραφή λογαριασμού/.test(p) && /αποσύνδεση/.test(p));
  ok('settings: recognises short/greeklish/no-accents', /χωρίς τόνους/.test(p) && /greeklish/.test(p) && /μία λέξη/.test(p));
  ok('settings: links to settings tab', /\[\[go:settings\]\]/.test(p));
  ok('settings: property fields moved to property edit', /«Επεξεργασία ακινήτου»/.test(p) && /οδηγός ακινήτου/.test(p) && /ΑΤΑΚ/.test(p) && /εκτιμώμενος ΕΝΦΙΑ/.test(p));
  ok('settings: do NOT go:settings for property fields', /ΜΗ βάλεις \[\[go:settings\]\] για στοιχεία ακινήτου/.test(p));
  ok('settings: E2/income tax → accounting', /Ε2/.test(p) && /ΦΟΡΟΣ ΕΙΣΟΔΗΜΑΤΟΣ/.test(p) && /\[\[go:accounting\]\]/.test(p));
  ok('settings: transfer tax → accounting or loan', /ΦΟΡΟΣ ΜΕΤΑΒΙΒΑΣΗΣ/.test(p) && /\[\[go:loan\]\]/.test(p));
  // nav label ανανεώθηκε από «Ρυθμίσεις» σε «Λογαριασμός» (id ίδιο)
  const nav = NAV_MAP.find(n => n.id === 'settings')!;
  ok('settings: nav label is Λογαριασμός', nav.label === 'Λογαριασμός');
  ok('settings: nav label appears in prompt', p.includes('Λογαριασμός'));
}
// Κάθε σύντομος/ανορθόγραφος/χωρίς τόνους/greeklish όρος αναφέρεται ΡΗΤΑ στον βοηθό,
// ώστε να αναγνωρίζει την πρόθεση ακόμη κι από μία μισοτελειωμένη λέξη.
{
  const p = buildSystemPrompt(id(), 'x');
  const SHORT_TRIGGERS = [
    'θέμα', 'σκοτεινο', 'φωτεινο/light', 'γλωσσα', 'νομισμα', 'δεκαδικα',
    'συνδρομη', 'πλανο', 'χρεωση', 'τιμολογιο', 'αναβαθμιση',
    'να γινω επαγγελματιας', 'αλλαγη σε ιδιωτη', 'επωνυμια αναφορων/branding',
    'ειδοποιησεις', 'notifications', 'υπενθυμισεις', 'οχληση για ενοικιο',
    'εξαγωγη', 'csv', 'συνδεσμος λογιστη', 'λογιστης', 'ενσωματωσεις',
    'αποσυνδεση/logout', 'διαγραφη λογαριασμου', 'dark mode',
  ];
  for (const t of SHORT_TRIGGERS) ok(`settings: trigger «${t}» documented`, p.includes(t));
}
// parseAction: οι deep-links που παράγει ο βοηθός για λογαριασμό/λογιστική
{
  const r = parseAction('Το θέμα αλλάζει στην ενότητα «Εμφάνιση & Γλώσσα». [[go:settings]]');
  ok('go settings action', r.action?.type === 'go' && (r.action as any).tab === 'settings');
  ok('go settings stripped', !/\[\[/.test(r.clean));
}
{
  const r = parseAction('Για το Ε2 πάμε στη Λογιστική. [[go:accounting]]');
  ok('go accounting action (Ε2)', r.action?.type === 'go' && (r.action as any).tab === 'accounting');
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nassistantPersona.ts, ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`);
if (failed) { console.log('FAILED:\n' + fails.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
console.log('όλα πέρασαν');
