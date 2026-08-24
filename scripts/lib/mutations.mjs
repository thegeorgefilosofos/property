// ═══════════════════════════════════════════════════════════════════════════
// Ο ΚΑΤΑΛΟΓΟΣ ΤΩΝ ΜΕΤΑΛΛΑΞΕΩΝ: ΤΟ ΣΦΑΛΜΑ ΚΑΘΕ ΦΥΛΑΚΑ, ΓΡΑΜΜΕΝΟ ΜΙΑ ΦΟΡΑ
// ─────────────────────────────────────────────────────────────────────────
// Κάθε εγγραφή εισάγει ΑΚΡΙΒΩΣ το σφάλμα για το οποίο γράφτηκε ο φύλακας. Ο
// πάγκος (`scripts/verify-guards.mjs`) την εφαρμόζει, τρέχει τον φύλακα και
// απαιτεί κόκκινο· μετά την ξηλώνει.
//
// ΤΡΕΙΣ ΜΟΡΦΕΣ:
//   { add: 'διαδρομή', content: '…' }   νέο αρχείο με την παράβαση μέσα
//   { file: 'διαδρομή', from: '…', to: '…' }   στοχευμένη αλλαγή σε υπαρκτό
//   { remove: 'διαδρομή' }              σβήσιμο αρχείου που ο φύλακας απαιτεί
//
// Πίνακας από εγγραφές σημαίνει «δοκίμασε με τη σειρά ώσπου να κοκκινίσει»:
// χρήσιμο όπου η παράβαση μπορεί να ζήσει σε δύο διαφορετικά σημεία.
//
// ΓΙΑΤΙ ΝΕΟ ΑΡΧΕΙΟ ΟΠΟΥ ΓΙΝΕΤΑΙ. Μια αλλαγή σε υπαρκτό αρχείο κινδυνεύει να
// μείνει πίσω αν ο πάγκος διακοπεί βίαια. Ένα νέο αρχείο απλώς σβήνεται, και
// αν μείνει, το `git status` του πάγκου το φωνάζει αμέσως.
// ═══════════════════════════════════════════════════════════════════════════

/** Σκελετός component οθόνης, για φύλακες που σαρώνουν .tsx. */
const tsx = (body) => `export default function MutationProbe() {\n  return (\n${body}\n  )\n}\n`

export const MUTATIONS = {
  // ── Ελληνικό κείμενο οθόνης ────────────────────────────────────────────
  'ampersand': { add: 'components/__mut__.tsx', content: tsx('    <div>Έσοδα & δαπάνες του ακινήτου σου</div>') },
  'no-arrows': { add: 'components/__mut__.tsx', content: tsx('    <div>Πήγαινε στις Δαπάνες → Κατηγορίες</div>') },
  'em-dash': { add: 'components/__mut__.tsx', content: tsx('    <p>\n      Τα δεδομένα σου είναι ασφαλή — μόλις επανέλθει η σύνδεση\n      εμφανίζονται όλα κανονικά στη θέση τους.\n    </p>') },
  'uppercase-tonos': { add: 'components/__mut__.tsx', content: tsx('    <div>ΈΣΟΔΑ ΑΚΙΝΗΤΟΥ</div>') },
  'greek-case': { add: 'components/__mut__.tsx', content: tsx('    <h2>Καθαρή Απόδοση Ακινήτου</h2>') },
  'decimal-comma': { add: 'components/__mut__.tsx', content: tsx('    <div>Πληρωτέο 1234.50 €</div>') },
  'euro-space': { add: 'components/__mut__.tsx', content: tsx('    <div>Σύνολο 1.234,50€ τον μήνα</div>') },

  // ── Κώδικας που μοιάζει σωστός και δεν είναι ──────────────────────────
  'ascii-boundary': { add: 'lib/core/__mut__.ts', content: "export const RE = /\\bακόμα\\b/\n" },
  'dead-interpolation': { add: 'lib/core/__mut__.ts', content: "export const c = 'χρώμα ${INK_MUTED} εδώ'\n" },
  'style-backtick': { add: 'components/__mut__.tsx', content: tsx("    <style>{`\n      /* το `top` της γραμμής */\n      .x { top: 0 }\n    `}</style>") },
  'style-tags': { add: 'components/__mut__.tsx', content: tsx("    <style>{`\n      /* το <style> της αρχικής */\n      .x { top: 0 }\n    `}</style>") },
  'greek-numbers': { add: 'components/__mut__.tsx', content: tsx('    <div>Απόδοση {(4.25).toFixed(1)}%</div>') },
  'percent-formatter': { add: 'components/__mut__.ts', content: 'export const line = (r: number) => `Απόδοση ${Math.round(r)}% τον χρόνο`\n' },
  'number-font': { add: 'components/__mut__.tsx', content: tsx("    <p style={{ fontFamily: T.font.mono }}>Μια ολόκληρη πρόταση γραμμένη σε γραμματοσειρά στηλών</p>") },

  // ── Φόρμες και οθόνες ──────────────────────────────────────────────────
  'field-name': { add: 'components/__mut__.tsx', content: tsx('    <input type="text" placeholder="Ποσό" />') },
  // Η ΜΕΤΑΛΛΑΞΗ ΧΤΥΠΑΕΙ ΤΟΝ ΔΥΣΚΟΛΟ ΚΛΑΔΟ, ΟΧΙ ΤΟΝ ΕΥΚΟΛΟ. Το ντόπιο
  // `<select>` και το κυριολεκτικό `type="date"` είναι δύο regex· ο μεταβλητός
  // `type={type}` απαιτεί ανάγνωση ΟΛΟΚΛΗΡΗΣ της ετικέτας (το DocumentScan.tsx
  // το γράφει τρεις γραμμές κάτω από το `<input`), αποτίμηση των σκελών μιας
  // τριαδικής, και ανάγνωση του δηλωμένου τύπου της ιδιότητας. Εκεί ξέφυγαν
  // δεκατέσσερα ντόπια ημερολόγια με τον φύλακα πράσινο, άρα εκεί δοκιμάζεται.
  'native-fields': {
    add: 'components/__mut__.tsx',
    content: 'export function MutationProbe({ value, type = \'text\' }: { value: string; type?: string }) {\n'
      + '  return (\n    <input\n      type={type}\n      value={value}\n      readOnly\n    />\n  )\n}\n',
  },
  'number-fields': { add: 'components/__mut__.tsx', content: tsx('    <input type="number" placeholder="1500" />') },
  'empty-states': { add: 'components/__mut__.tsx', content: tsx('    <EmptyState title="Καμιά καταχώρηση / εγγραφή" />') },
  'month-end': { add: 'lib/core/__mut__.ts', content: 'export const d = (y: number) => `${y}-02-31`\n' },
  'month-case': { add: 'lib/core/__mut__.ts', content: "import { monthNom } from '@/lib/core/months'\nexport const d = (i: number) => `Μεταφορά από ${monthNom(i)}`\n" },
  'raw-errors': { add: 'components/__mut__.tsx', content: 'export function P({ setError, err }: { setError: (s: string) => void; err: Error }) {\n  return <button onClick={() => setError(err.message)}>Δοκιμή</button>\n}\n' },
  'rendered-zero': { add: 'components/__mut__.tsx', content: 'export function P({ n }: { n: number }) {\n  return <div>{n && <span>{n}</span>}</div>\n}\n' },
  'terminology': { add: 'components/__mut__.tsx', content: tsx('    <div>Η καταχώριση ολοκληρώθηκε</div>') },
  'assistant-name': { add: 'components/__mut__.tsx', content: tsx('    <div>Ο βοηθός σου προτείνει τρεις κινήσεις</div>') },

  // ── Βάση δεδομένων και ασφάλεια ───────────────────────────────────────
  // Οι μεταναστεύσεις είναι ΠΡΟΣΘΕΤΙΚΕΣ: μια νέα με το σφάλμα μέσα είναι η
  // πιστότερη προσομοίωση του «κάποιος γράφει την επόμενη μετανάστευση».
  'rls-coverage': { add: 'supabase/migrations/29990101000000_mut.sql', content: 'create table if not exists public.mut_probe (\n  id bigint generated always as identity primary key,\n  user_id uuid not null references auth.users(id) on delete cascade\n);\n' },
  'rls-initplan': { add: 'supabase/migrations/29990101000000_mut.sql', content: "create policy mut_probe_own on public.properties using (auth.uid() = user_id);\n" },
  'rls-parent-scope': { add: 'supabase/migrations/29990101000000_mut.sql', content: 'create table if not exists public.mut_probe (\n  id bigint generated always as identity primary key,\n  property_id uuid not null references public.properties(id) on delete cascade\n);\nalter table public.mut_probe enable row level security;\ncreate policy mut_probe_own on public.mut_probe using (true);\n' },
  'idempotent-migrations': { add: 'supabase/migrations/29990101000000_mut.sql', content: 'alter table public.properties add constraint mut_probe_chk check (id is not null);\n' },
  'storage-delete': { add: 'supabase/migrations/29990101000000_mut.sql', content: "create or replace function public.mut_probe() returns void language plpgsql as $$\nbegin\n  delete from storage.objects where owner is null;\nend $$;\n" },
  // Ο ΕΥΚΟΛΟΣ ΚΛΑΔΟΣ ΘΑ ΗΤΑΝ ΝΕΟΣ ΦΑΚΕΛΟΣ ΧΩΡΙΣ ΔΗΛΩΣΗ. Ο δύσκολος, και ο
  // πραγματικός, είναι χρονόμετρο που καλεί συνάρτηση κλειδωμένη με JWT: εκεί
  // όλα φαίνονται σωστά και τίποτα δεν τρέχει ποτέ.
  'cron-reachable': { add: 'supabase/migrations/29990101000000_mut.sql', content: "do $$ begin\n  perform cron.schedule('mut-probe', '0 4 * * *', $cron$\n    select net.http_post(url := 'https://x/functions/v1/smart-suggestions');\n  $cron$);\nend $$;\n" },
  // Η ΜΕΤΑΛΛΑΞΗ ΧΤΥΠΑΕΙ ΤΟ ΚΕΛΥΦΟΣ, ΟΧΙ ΤΟ ΠΑΡΑΓΟΜΕΝΟ. Μια αλλαγή στο
  // παραγόμενο αρχείο είναι το προφανές· η αλλαγή που ΞΕΦΕΥΓΕΙ στην πράξη
  // είναι μια αλλαγή χρώματος στο κοινό κέλυφος, που αφήνει τα τρία πρότυπα
  // να λένε το παλιό χωρίς να το δει κανείς.
  'auth-templates': {
    file: 'supabase/functions/_shared/emailTemplates.ts',
    from: "const ACCENT = '#1a73e8'",
    to: "const ACCENT = '#0b57d0'",
  },
  // Νέο κείμενο επιστολής που δεν το ζητά κανείς: ακριβώς ο τρόπος με τον
  // οποίο μαζεύτηκαν τα δεκαοκτώ ορφανά, ένα κάθε φορά.
  'email-senders': {
    file: 'supabase/functions/_shared/emailCopy.ts',
    from: '  welcome_free: (',
    to: "  orfani_epistoli: (c) => ({ subject: 'Δοκιμή', html: '' }),\n  welcome_free: (",
  },
  'http-bridge': { add: 'supabase/migrations/29990101000000_mut.sql', content: 'create or replace function public.mut_probe_call() returns void language sql as $$ select net.http_post(url => \'https://x\') $$;\ngrant execute on function public.mut_probe_call() to authenticated;\n' },
  'sql-types': { add: 'supabase/migrations/29990101000000_mut.sql', content: 'create or replace function public.mut_probe() returns void language plpgsql as $$\ndeclare v_row record;\nbegin\n  for v_row in select * from public.bills loop\n    if v_row.property_id = some_text then null; end if;\n  end loop;\nend $$;\n' },
  'service-role': { add: 'components/__mut__.ts', content: "export const key = process.env.SUPABASE_SERVICE_ROLE_KEY\n" },
  'csv-injection': { add: 'lib/core/__mut__.ts', content: "export const row = (cells: string[]) => cells.join(';')\n" },
  'password-leak': { add: 'components/__mut__.tsx', content: "import PasswordStrength from '@/components/PasswordStrength'\nexport function P({ v }: { v: string }) {\n  return <PasswordStrength value={v} />\n}\n" },
  'api-auth': { add: 'app/api/__mut__/route.ts', content: "export async function GET() {\n  return new Response('ok')\n}\n" },

  // ── Πηγές αλήθειας και μονά σημεία ────────────────────────────────────
  'data-layer': { add: 'components/__mut__.ts', content: "import { createClient } from '@/lib/supabase/client'\nexport const q = () => createClient().from('bills').select('*')\n" },
  'service-only-tables': { add: 'components/__mut__.ts', content: "import { createClient } from '@/lib/supabase/client'\nexport const q = () => createClient().from('cron_secrets').select('*')\n" },
  'silent-reads': { add: 'lib/core/__mut__.ts', content: "export async function load(sb: { from: (t: string) => { select: (c: string) => Promise<{ data: unknown[] | null }> } }) {\n  const { data } = await sb.from('bills').select('*')\n  return data\n}\n" },
  'download': { add: 'components/__mut__.ts', content: "export const save = (blob: Blob) => {\n  const a = document.createElement('a')\n  a.href = URL.createObjectURL(blob)\n  a.download = 'arxeio.csv'\n  a.click()\n}\n" },
  'official-links': { add: 'components/__mut__.tsx', content: tsx('    <a href="https://www.aade.gr/polites">Ημερολόγιο</a>') },
  'site-url': { add: 'components/__mut__.ts', content: "export const url = 'https://propertyos.gr/imerologio'\n" },
  'security-txt': { file: 'public/.well-known/security.txt', from: 'Expires:', to: 'X-Expires:' },
  'tax-year': { add: 'lib/core/__mut__.ts', content: "import { rentalIncomeTax } from '@/lib/billing/greekTax'\nexport const t = (year: number, taxable: number) => { void year; return rentalIncomeTax(taxable) }\n" },
  'stale-flags': { add: 'lib/core/__mut__.ts', content: "export const CALL = { deadline: '2020-01-12', is_active: true }\n" },

  // ── Ισχυρισμοί, τύποι και κείμενα με πηγή ──────────────────────────────
  'account-deletion': { add: 'app/api/__mut__/route.ts', content: "import { createClient } from '@/lib/supabase/server'\nexport async function POST() {\n  const sb = await createClient()\n  await sb.rpc('delete_my_account')\n  return new Response('ok')\n}\n" },
  'billing-claims': { add: 'lib/core/__mut__.tsx', content: tsx('    <div>Η συνδρομή σου: δεν γίνεται καμία πληρωμή τώρα.</div>') },
  'presumptive-rate': { add: 'lib/core/__mut__.ts', content: 'export const taxable = (gross: number) => gross * 0.95\n' },
  'stay-gross': { add: 'lib/core/__mut__.ts', content: 'export const income = (stay: { total: number }) => { const amount = stay.total; return amount }\n' },
  'local-formatters': { add: 'lib/core/__mut__.ts', content: "export const eur = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 2 })} €`\n" },
  'dashes': { add: 'components/__mut__.tsx', content: tsx('    <td>—</td>') },
  'form-grid': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>\n      <NumberInput label=\"Ποσό\" />\n    </div>") },
  'ical-mirror': { file: 'lib/clients/ical.ts', from: 'function unfold(', to: 'function unfoldLines(' },
  // ΔΥΟ μήνες πίσω, όχι ένας: ο ένας μήνας είναι ρητά προειδοποίηση («το
  // δελτίο δεν βγήκε ακόμη»), και μόνο ο δεύτερος είναι σφάλμα.
  'cpi-freshness': { file: 'lib/market/cpi.ts', from: "  '2026-05': 5.4, '2026-06': 5.2, '2026-07': 4.4, '2026-08': 3.4,", to: "  '2026-05': 5.4, '2026-06': 5.2," },
  'dangling-refs': { add: 'components/__mut__.tsx', content: tsx('    <p>Πάτησε το «Κουμπί που δεν υπάρχει πουθενά» για να συνεχίσεις.</p>') },

  // ── Καστάνιες: η μετάλλαξη πρέπει να περάσει το όριο, όχι απλώς να υπάρξει ──
  'radius-scale': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ borderRadius: 7 }}>Α</div>\n    <div style={{ borderRadius: 11 }}>Β</div>") },
  // Οι τρεις καστάνιες τυποποίησης. Καθεμιά μετρά ΠΛΗΘΟΣ, οπότε η μετάλλαξη
  // είναι μία παράβαση παραπάνω από το όριο: το ελάχιστο που πρέπει να πιάσει.
  'space-scale': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ padding: 3, gap: 9 }}>Α</div>") },
  'z-layers': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ zIndex: 12345 }}>Α</div>") },
  'hand-buttons': { add: 'components/__mut__.tsx', content: tsx("    <button style={{ padding: 4 }}>Α</button>") },
  'surface-scale': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ height: 33, boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>Α</div>") },
  'js-hover': { add: 'components/__mut__.tsx', content: 'export function P() {\n  return <div onMouseEnter={() => {}} onMouseLeave={() => {}}>Α</div>\n}\n' },
  'type-scale': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ fontSize: 17 }}>Κείμενο εκτός κλίμακας</div>") },
  'dead-exports': { add: 'lib/core/__mut__.ts', content: 'export const neverCalledByAnyone = () => 42\n' },
  'schema-drift': { add: 'lib/core/__mut__.ts', content: "import { createClient } from '@/lib/supabase/client'\nexport const q = () => createClient().from('user_properties').select('stili_pou_den_yparxei')\n" },

  // ── Δομή του έργου και δημόσια επιφάνεια ──────────────────────────────
  'filenames': { add: 'lib/core/__mut__.ts', content: "import { downloadCsv } from '@/lib/core/download'\nexport const save = () => downloadCsv('logistiki-katastasi.csv', 'a,b')\n" },
  'page-heading': { add: 'app/__mut__/page.tsx', content: 'export default function P() {\n  return <div>Σελίδα χωρίς επικεφαλίδα</div>\n}\n' },
  'keyboard': { add: 'components/__mut__.tsx', content: 'export function P({ go }: { go: () => void }) {\n  return <div onClick={go}>Άνοιγμα</div>\n}\n' },
  'contrast': { file: 'app/globals.css', from: '--text-secondary:', to: '--text-secondary: #8f8f8f; --text-secondary-unused:' },
  // Δηλώνεται ΜΟΝΟ στο φωτεινό, και κάποιος τη ζητά: στο σκοτεινό είναι κενή.
  'theme-tokens': { steps: [
    { file: 'app/globals.css', from: ':root[data-mode="light"] {', to: ':root[data-mode="light"] {\n  --mut-probe-only-light: #fff;' },
    { add: 'components/__mut__.tsx', content: tsx("    <div style={{ color: 'var(--mut-probe-only-light)' }}>Α</div>") },
  ] },
  'tokens': { add: 'components/__mut__.tsx', content: tsx("    <div style={{ color: 'var(--mut-probe-den-yparxei)' }}>Α</div>") },
  'csp-connect': { add: 'components/__mut__.ts', content: "export const load = () => fetch('https://mut-probe.example.com/data')\n" },
  'export-name': { add: 'components/__mut__.tsx', content: tsx('    <button>Λήψη σε CSV</button>') },
  'test-tail': { file: 'lib/core/csv.test.ts', from: "console.log('όλα πέρασαν');", to: "console.log('όλα πέρασαν');\nok(true, 'ισχυρισμός μετά τη γραμμή αναφοράς');" },

  // ── Οι τελευταίοι: μητρώα, CI και δημόσιες διαδρομές ──────────────────
  'single-source': { add: 'lib/core/__mut__.ts', content: 'export const parseAmount = (v: string) => Number(v.replace(",", "."))\n' },
  'landing-stats': { file: 'app/page.tsx', from: "{ n: '11', u: 'πάροχοι ρεύματος'", to: "{ n: '12', u: 'πάροχοι ρεύματος'" },
  'public-routes': { file: 'proxy.ts', from: '"/kathari-apodosi",', to: '' },
  'ci-minutes': { file: '.github/workflows/health.yml', from: 'cron:', to: "cron: '*/5 * * * *'   # μετάλλαξη\n    # cron:" },
  // Ένα npm script που δείχνει σε αρχείο του scripts/ και δεν το καλεί κανένα
  // workflow: ακριβώς το «γραμμένος και μη συνδεδεμένος».
  'ci-coverage': { steps: [
    { add: 'scripts/mut-probe.mjs', content: 'process.exit(0)\n' },
    { file: 'package.json', from: '"guards":', to: '"mut:probe": "node scripts/mut-probe.mjs",\n    "guards":' },
  ] },
  // Παραπομπή σε νόμο μέσα στον κώδικα, χωρίς εγγραφή στο μητρώο πηγών.
  'accounting-sources': { add: 'lib/core/__mut__.ts', content: "// Κατά το ν.9999/2020, το τεκμαρτό ποσοστό αλλάζει.\nexport const rate = 0.05\n" },
  'landing-theme': { file: 'app/page.tsx', from: '          --bg-base: var(--mkt-bg-base);', to: '          --bg-base: #101418;' },
}
