// supabase/functions/bank-rates-updater/index.ts
// ═══════════════════════════════════════════════════════════════════════════
// Η ΤΡΟΦΟΔΟΣΙΑ ΤΩΝ ΣΤΕΓΑΣΤΙΚΩΝ ΕΠΙΤΟΚΙΩΝ: ΚΑΘΕ ΜΕΡΑ, ΜΕ ΔΙΑΣΤΑΥΡΩΣΗ, ΜΕ ΙΧΝΟΣ
// ─────────────────────────────────────────────────────────────────────────
// Δεν υπάρχει δημόσιο feed επιτοκίων τραπεζών. Το μοντέλο ψάχνει στο web
// (server tool web_search) τις τρέχουσες τιμές και επιστρέφει δομημένο JSON.
// Ο,τι επιστρέφει είναι ΠΡΟΤΑΣΗ, όχι γεγονός — και έτσι αντιμετωπίζεται:
//
//   • Συγκρίνεται με τη γραμμή που ισχύει (lib/loans/rateFeed.ts). Μικρή
//     μεταβολή εφαρμόζεται. Μεγάλη μεταβολή κρατιέται, γράφεται στο
//     `bank_rate_changes` και εφαρμόζεται μόνο αν το επόμενο, ανεξάρτητο
//     πέρασμα επιστρέψει την ίδια τιμή.
//   • Κάθε πέρασμα, πετυχημένο ή όχι, γράφει γραμμή στο `bank_rate_checks`.
//     Το «ελέγχθηκε σήμερα, αμετάβλητα» στην οθόνη βγαίνει από εκεί.
//   • Οι τράπεζες που βρέθηκαν παίρνουν `verified_at` σήμερα, ακόμη κι αν
//     τίποτα δεν άλλαξε: επιβεβαίωση είναι και το «ίδιο με χθες».
//
// Deploy: supabase functions deploy bank-rates-updater --no-verify-jwt
// Secret:  supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."
// Τρέχει καθημερινά μέσω pg_cron (migration 20260902120000).
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { authorizeCron, type MinimalSupabaseClient } from '../_shared/auth.ts'
import {
  diffBank, decide, changeKey, MIN_BANKS,
  type CurrentBank, type ProposedBank, type Change, type CheckedField,
} from '../../../lib/loans/rateFeed.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const MODEL = 'claude-sonnet-5'

// Χάρτης ονομάτων → bank_id (όπως στον πίνακα bank_rates).
const BANK_IDS: Record<string, string> = {
  'εθνικη': 'ethniki', 'national': 'ethniki', 'nbg': 'ethniki',
  'alpha': 'alpha',
  'eurobank': 'eurobank',
  'πειραιως': 'piraeus', 'piraeus': 'piraeus', 'peiraios': 'piraeus',
  'optima': 'optima',
  'credia': 'credia', 'crediabank': 'credia', 'παγκρητια': 'credia',
  'attica': 'attica', 'αττικης': 'attica',
}

function resolveBankId(name: string): string | null {
  const n = (name || '').toLowerCase()
  for (const key of Object.keys(BANK_IDS)) if (n.includes(key)) return BANK_IDS[key]
  return null
}

// Δεκαδικός σε λογικά όρια στεγαστικού επιτοκίου (%).
function sanePct(v: unknown): number | null {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(x) && x >= 0.3 && x <= 8 ? Math.round(x * 100) / 100 : null
}
function saneUrl(v: unknown): string | null {
  return typeof v === 'string' && /^https:\/\/[^\s]+$/.test(v) ? v.slice(0, 300) : null
}

const SYSTEM = `Είσαι αναλυτής στεγαστικών δανείων στην Ελλάδα. Χρησιμοποίησε αναζήτηση στο web για να βρεις τα ΤΡΕΧΟΝΤΑ στεγαστικά επιτόκια των ελληνικών τραπεζών (επίσημες σελίδες τραπεζών, vresdaneio.gr, e-stegastiko.gr, Τράπεζα Ελλάδος).
Για κάθε τράπεζα βρες: το χαμηλότερο («από») σταθερό επιτόκιο ανά διάρκεια 3/5/10/15/20 ετών, το περιθώριο (spread) πάνω από Euribor για κυμαινόμενο, το ανώτατο δάνειο προς αξία (LTV %), αν συμμετέχει στο πρόγραμμα «Σπίτι μου ΙΙ» και τη σελίδα (URL) από την οποία πήρες τις τιμές.
Τράπεζες: Εθνική, Alpha Bank, Eurobank, Τράπεζα Πειραιώς, Optima Bank, CrediaBank, Attica Bank.
Επίστρεψε ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON, χωρίς κείμενο εκτός JSON:
{"banks":[{"bank":"Εθνική","fixed_3yr":2.9,"fixed_5yr":3.3,"fixed_10yr":3.8,"fixed_15yr":4.1,"fixed_20yr":4.2,"variable_spread_min":1.6,"variable_spread_max":2.8,"max_ltv":90,"spiti_mou":true,"source_url":"https://..."}]}
Παρέλειψε όποιο πεδίο δεν βρίσκεις με ασφάλεια. Ποτέ μην μαντεύεις αριθμό. Αριθμοί με τελεία δεκαδικό, χωρίς σύμβολα.`

type RateRow = Record<string, unknown>

async function callAnthropic(): Promise<RateRow[]> {
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: 'Βρες τα τρέχοντα στεγαστικά επιτόκια και επίστρεψε μόνο το JSON.' }]
  let text = ''
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL, max_tokens: 4000, system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
        messages,
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`)
    const data = await res.json()
    text += ((data.content || []) as { type: string; text?: string }[]).filter(c => c.type === 'text').map(c => c.text ?? '').join('\n')
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue }
    break
  }
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('no JSON in model output')
  const parsed = JSON.parse(m[0])
  return Array.isArray(parsed?.banks) ? parsed.banks : []
}

/** Η πρόταση του μοντέλου, στενεμένη σε αριθμούς που έχουν νόημα. */
function narrow(b: RateRow): { id: string; proposed: ProposedBank; spiti?: boolean; url: string | null } | null {
  const nameOf = (v: unknown): string => (typeof v === 'string' ? v : '')
  const id = resolveBankId(nameOf(b?.bank) || nameOf(b?.bank_id))
  if (!id) return null
  const proposed: ProposedBank = {}
  for (const f of ['fixed_3yr', 'fixed_5yr', 'fixed_10yr', 'fixed_15yr', 'fixed_20yr', 'variable_spread_min', 'variable_spread_max'] as const) {
    const v = sanePct(b[f]); if (v !== null) proposed[f] = v
  }
  const ltv = Number(b.max_ltv); if (ltv >= 50 && ltv <= 95) proposed.max_ltv = Math.round(ltv)
  // Χρειάζεται τουλάχιστον ένα σταθερό επιτόκιο για να μετρήσει ως εύρημα.
  if (!['fixed_3yr', 'fixed_5yr', 'fixed_10yr', 'fixed_15yr', 'fixed_20yr'].some(f => f in proposed)) return null
  return { id, proposed, spiti: typeof b.spiti_mou === 'boolean' ? b.spiti_mou : undefined, url: saneUrl(b.source_url) }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const CRON_SECRET = Deno.env.get('BANK_RATES_CRON_SECRET') || ''
async function authorized(req: Request, sb: MinimalSupabaseClient): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SUPABASE_SERVICE_KEY, envSecret: CRON_SECRET, supabase: sb })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  if (!(await authorized(req, supabase))) return json({ error: 'unauthorized' }, 401)

  // ΤΟ ΙΧΝΟΣ ΓΡΑΦΕΤΑΙ ΣΕ ΚΑΘΕ ΕΞΟΔΟ. Ενα πέρασμα που απέτυχε και δεν το είπε
  // είναι ίδιο με πέρασμα που δεν έγινε — και αυτή ακριβώς η σιωπή κράτησε την
  // οθόνη στο «56 ημέρες».
  // ΚΑΙ ΟΤΑΝ ΑΠΟΤΥΧΕΙ Η ΙΔΙΑ Η ΚΑΤΑΓΡΑΦΗ, ΤΟ ΛΕΕΙ ΔΥΝΑΤΑ. Το πρώτο πέρασμα που
  // έτρεξε ποτέ στην παραγωγή (03/09/2026 06:24) δεν άφησε γραμμή: οι πίνακες
  // είχαν γεννηθεί δευτερόλεπτα πριν και το PostgREST κρατούσε ακόμη το παλιό
  // σχήμα, οπότε το `insert` γύρισε σφάλμα. Το σφάλμα πήγαινε ΜΟΝΟ στην
  // κονσόλα, δηλαδή ένα σύστημα φτιαγμένο για να μην υπάρχει σιωπή απέτυχε
  // σιωπηλά — και μάλιστα στην πρώτη του εγγραφή.
  let logFailure: string | null = null
  const log = async (ok: boolean, reason: string, extra: Record<string, unknown> = {}) => {
    const { error } = await supabase.from('bank_rate_checks').insert({
      ok, reason, banks_found: Number(extra.found ?? 0), banks_applied: Number(extra.applied ?? 0),
      banks_held: Number(extra.held ?? 0), details: extra,
    })
    if (error) {
      logFailure = error.message
      console.error('bank_rate_checks insert:', error.message)
    }
  }

  try {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    const raw = await callAnthropic()
    const found = raw.map(narrow).filter((x): x is NonNullable<typeof x> => !!x)

    // Αμυντικό: λίγες τράπεζες σημαίνει κακή αναζήτηση, όχι κακή αγορά.
    if (found.length < MIN_BANKS) {
      await log(false, `insufficient_valid_rows: ${found.length} από ${MIN_BANKS}`, { found: found.length })
      return json({ ok: false, reason: 'insufficient_valid_rows', found: found.length, logFailure })
    }

    // ── Ο,τι ισχύει σήμερα, για σύγκριση ─────────────────────────────────
    const { data: rows, error: readErr } = await supabase.from('bank_rates').select('*')
    if (readErr) throw new Error(`read bank_rates: ${readErr.message}`)
    const current = new Map<string, CurrentBank>((rows ?? []).map((r: CurrentBank) => [r.bank_id, r]))

    // ── Οι κρατημένες προτάσεις των τελευταίων ημερών, για δεύτερη επιβεβαίωση ──
    const since = new Date(Date.now() - 3 * 86400000).toISOString()
    const { data: held } = await supabase.from('bank_rate_changes')
      .select('bank_id,field,new_value').eq('applied', false).gte('ran_at', since)
    const confirmed = new Set<string>((held ?? []).map((h: { bank_id: string; field: string; new_value: number }) =>
      changeKey({ bank_id: h.bank_id, field: h.field, next: Number(h.new_value) })))

    const today = new Date().toISOString().slice(0, 10)
    let applied = 0, heldNow = 0, unchanged = 0
    const changeRows: Record<string, unknown>[] = []
    const perBank: Record<string, string> = {}

    for (const f of found) {
      const cur = current.get(f.id)
      if (!cur) { perBank[f.id] = 'άγνωστη τράπεζα στον πίνακα'; continue }
      const changes: Change[] = diffBank(cur, f.proposed)
      const { apply, hold } = decide(changes, confirmed)

      const patch: Record<string, unknown> = { verified_at: today }
      if (f.url) patch.source_url = f.url
      if (f.spiti !== undefined) patch.spiti_mou = f.spiti
      for (const c of apply) {
        // Τα σταθερά ζουν ως κείμενο στον πίνακα, τα περιθώρια και το LTV ως αριθμοί.
        patch[c.field] = (c.field as CheckedField).startsWith('fixed_') ? c.next.toFixed(2) : c.next
        changeRows.push({ bank_id: c.bank_id, field: c.field, old_value: c.old, new_value: c.next, applied: true,
          reason: c.delta == null ? 'πρώτη τιμή σε κενό πεδίο' : confirmed.has(changeKey(c)) ? 'επιβεβαιώθηκε από δεύτερο πέρασμα' : `μεταβολή ${c.delta > 0 ? '+' : ''}${c.delta}` })
      }
      for (const c of hold) {
        changeRows.push({ bank_id: c.bank_id, field: c.field, old_value: c.old, new_value: c.next, applied: false,
          reason: `μεταβολή ${c.delta! > 0 ? '+' : ''}${c.delta}: περιμένει δεύτερη επιβεβαίωση` })
      }
      const fixed = ['fixed_3yr', 'fixed_5yr', 'fixed_10yr', 'fixed_15yr', 'fixed_20yr']
        .map(k => parseFloat(String(patch[k] ?? cur[k as keyof CurrentBank] ?? '')))
        .filter(x => Number.isFinite(x))
      if (fixed.length) patch.fixed_min = Math.min(...fixed)

      const { error } = await supabase.from('bank_rates').update(patch).eq('bank_id', f.id)
      if (error) { perBank[f.id] = `σφάλμα εγγραφής: ${error.message}`; continue }
      if (apply.length) applied++
      if (hold.length) heldNow++
      if (!apply.length && !hold.length) unchanged++
      perBank[f.id] = `${apply.length} εφαρμόστηκαν, ${hold.length} κρατήθηκαν`
    }

    if (changeRows.length) {
      const { error } = await supabase.from('bank_rate_changes').insert(changeRows)
      if (error) console.error('bank_rate_changes insert:', error.message)
    }

    const summary = { found: found.length, applied, held: heldNow, unchanged, banks: perBank, verified_at: today }
    await log(true, 'εντάξει', summary)
    console.log('bank-rates-updater:', JSON.stringify(summary))
    return json({ ok: true, ...summary, logFailure })
  } catch (e) {
    const msg = (e as Error).message
    console.error('bank-rates-updater error:', msg)
    await log(false, msg.slice(0, 300))
    // Κράτα τα υπάρχοντα δεδομένα σε οποιαδήποτε αποτυχία.
    return json({ ok: false, error: msg, logFailure })
  }
})
