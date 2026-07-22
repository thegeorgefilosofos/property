// supabase/functions/bank-rates-updater/index.ts
// Ενημερώνει τα στεγαστικά επιτόκια τραπεζών (bank_rates) με έρευνα web μέσω του
// Anthropic Messages API (server tool web_search) — δεν υπάρχει δημόσιο feed, οπότε
// το μοντέλο ψάχνει τρέχουσες τιμές και επιστρέφει δομημένο JSON. Αμυντικό: γράφει
// ΜΟΝΟ έγκυρες γραμμές· σε αποτυχία/λίγα αποτελέσματα κρατά τα υπάρχοντα δεδομένα.
//
// Deploy: supabase functions deploy bank-rates-updater --no-verify-jwt
// Secret:  supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."
// Τρέχει μηνιαία μέσω pg_cron (βλ. migration 20260715130000_bank_rates_pg_cron.sql).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCron } from '../_shared/auth.ts'

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
function pctStr(v: unknown): string | null { const x = sanePct(v); return x === null ? null : x.toFixed(2) }

const SYSTEM = `Είσαι αναλυτής στεγαστικών δανείων στην Ελλάδα. Χρησιμοποίησε αναζήτηση στο web για να βρεις τα ΤΡΕΧΟΝΤΑ στεγαστικά επιτόκια των ελληνικών τραπεζών (επίσημες σελίδες τραπεζών, vresdaneio.gr, e-stegastiko.gr, Τράπεζα Ελλάδος).
Για κάθε τράπεζα βρες: το χαμηλότερο («από») σταθερό επιτόκιο ανά διάρκεια 3/5/10/15/20 ετών, το περιθώριο (spread) πάνω από Euribor για κυμαινόμενο, το ανώτατο δάνειο προς αξία (LTV %), και αν συμμετέχει στο πρόγραμμα «Σπίτι μου ΙΙ».
Τράπεζες: Εθνική, Alpha Bank, Eurobank, Τράπεζα Πειραιώς, Optima Bank, CrediaBank, Attica Bank.
Επίστρεψε ΑΠΟΚΛΕΙΣΤΙΚΑ έγκυρο JSON, χωρίς κείμενο εκτός JSON:
{"banks":[{"bank":"Εθνική","fixed_3yr":2.9,"fixed_5yr":3.3,"fixed_10yr":3.8,"fixed_15yr":4.1,"fixed_20yr":4.2,"variable_spread_min":1.6,"variable_spread_max":2.8,"max_ltv":90,"spiti_mou":true}]}
Παρέλειψε όποιο πεδίο δεν βρίσκεις με ασφάλεια. Αριθμοί με τελεία δεκαδικό, χωρίς σύμβολα.`

async function callAnthropic(): Promise<any[]> {
  const messages: any[] = [{ role: 'user', content: 'Βρες τα τρέχοντα στεγαστικά επιτόκια και επίστρεψε μόνο το JSON.' }]
  let text = ''
  // Βρόχος για server-tool (web_search): συνέχισε σε pause_turn.
  for (let i = 0; i < 5; i++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
        messages,
      }),
    })
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${await res.text()}`)
    const data = await res.json()
    text += (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n')
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue }
    break
  }
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('no JSON in model output')
  const parsed = JSON.parse(m[0])
  return Array.isArray(parsed?.banks) ? parsed.banks : []
}

// CORS επιτρέπει preflight, αλλά αυτή η function είναι ΑΠΟΚΛΕΙΣΤΙΚΑ server/cron:
// το `authorized()` δέχεται μόνο service-role bearer ή το κοινό cron secret — κανένα
// από τα δύο ΔΕΝ επιτρέπεται να ζει σε browser. Μη φτιάξεις «κουμπί διαχειριστή» που
// καλεί απευθείας αυτό το endpoint· αν χρειαστεί admin trigger, πέρασέ τον μέσα από
// ξεχωριστή, με-JWT function που ελέγχει ρόλο admin και μετά καλεί εσωτερικά αυτήν.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

// Authorization gate: this function burns the Anthropic quota and overwrites the
// public bank_rates sheet — it must never be callable anonymously. Accepts the
// service-role bearer, an optional env secret, or the shared cron secret from
// public.cron_secrets (the zero-config path pg_cron uses).
const CRON_SECRET = Deno.env.get('BANK_RATES_CRON_SECRET') || ''
async function authorized(req: Request, sb: ReturnType<typeof createClient>): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SUPABASE_SERVICE_KEY, envSecret: CRON_SECRET, supabase: sb })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  if (!(await authorized(req, supabase))) return json({ error: 'unauthorized' }, 401)
  try {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')
    const raw = await callAnthropic()

    // Κανονικοποίηση + επικύρωση: κράτα μόνο τράπεζες με έγκυρο id και ≥1 επιτόκιο.
    const updates: { id: string; row: Record<string, unknown> }[] = []
    for (const b of raw) {
      const id = resolveBankId(b?.bank || b?.bank_id || '')
      if (!id) continue
      const row: Record<string, unknown> = {}
      const f3 = pctStr(b.fixed_3yr), f5 = pctStr(b.fixed_5yr), f10 = pctStr(b.fixed_10yr), f15 = pctStr(b.fixed_15yr), f20 = pctStr(b.fixed_20yr)
      if (f3) row.fixed_3yr = f3
      if (f5) row.fixed_5yr = f5
      if (f10) row.fixed_10yr = f10
      if (f15) row.fixed_15yr = f15
      if (f20) row.fixed_20yr = f20
      const sMin = sanePct(b.variable_spread_min), sMax = sanePct(b.variable_spread_max)
      if (sMin !== null) row.variable_spread_min = sMin
      if (sMax !== null) row.variable_spread_max = sMax
      const fixedMin = [f3, f5, f10, f15, f20].map(Number).filter((x) => Number.isFinite(x))
      if (fixedMin.length) row.fixed_min = Math.min(...fixedMin)
      const ltv = Number(b.max_ltv); if (ltv >= 50 && ltv <= 95) row.max_ltv = Math.round(ltv)
      if (typeof b.spiti_mou === 'boolean') row.spiti_mou = b.spiti_mou
      // Χρειάζεται τουλάχιστον ένα σταθερό επιτόκιο για να θεωρηθεί έγκυρη ενημέρωση.
      if (f3 || f5 || f10 || f15 || f20) updates.push({ id, row })
    }

    // Αμυντικό: αν βρέθηκαν λίγες έγκυρες τράπεζες, ΜΗΝ γράψεις (κράτα τα υπάρχοντα).
    if (updates.length < 3) {
      console.log(`bank-rates-updater: only ${updates.length} valid banks — keeping existing data`)
      return json({ ok: false, reason: 'insufficient_valid_rows', found: updates.length })
    }

    const today = new Date().toISOString().slice(0, 10)
    let written = 0
    for (const u of updates) {
      const { error } = await supabase
        .from('bank_rates')
        .update({ ...u.row, verified_at: today, source_url: 'web_search (ενημέρωση AI)' })
        .eq('bank_id', u.id)
      if (!error) written++
      else console.error(`update ${u.id}:`, error.message)
    }
    console.log(`bank-rates-updater: updated ${written}/${updates.length} banks (${today})`)
    return json({ ok: true, updated: written, verified_at: today })
  } catch (e) {
    console.error('bank-rates-updater error:', (e as Error).message)
    // Κράτα τα υπάρχοντα δεδομένα σε οποιαδήποτε αποτυχία.
    return json({ ok: false, error: (e as Error).message })
  }
})
