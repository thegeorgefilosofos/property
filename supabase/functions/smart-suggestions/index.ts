import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { reportEdgeError } from '../_shared/report.ts'

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!

// Service client is used ONLY after we have verified, from the caller's JWT, that
// the requested property belongs to them. Identity always comes from the token —
// never from the request body (which an attacker controls).
const service = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 1. Authenticate the caller from their JWT ─────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'unauthorized' }, 401)
    const authClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userErr } = await authClient.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
    const userId = userData.user.id

    // ── 2. The property_id must belong to the authenticated user ──────────────
    const { property_id } = await req.json().catch(() => ({}))
    if (!property_id) return json({ error: 'Missing property_id' }, 400)
    const { data: owned } = await service
      .from('user_properties')
      .select('id, name, prop_type, sqm, value, target_rent, address, heating, pea_class')
      .eq('id', property_id)
      .eq('user_id', userId)
      .maybeSingle()
    if (!owned) return json({ error: 'forbidden' }, 403)

    // ── 3. Read only this user's data for this property ───────────────────────
    const [eventsRes, billsRes, expensesRes] = await Promise.all([
      service.from('calendar_events').select('title,category,amount,event_time,recurring,status').eq('property_id', property_id).eq('user_id', userId),
      service.from('bills').select('name,amount,category,paid,due_date').eq('property_id', property_id).eq('user_id', userId),
      service.from('expenses').select('description,amount,category,date').eq('property_id', property_id).eq('user_id', userId).order('date', { ascending: false }).limit(30),
    ])
    const events   = eventsRes.data || []
    const bills    = billsRes.data || []
    const expenses = expensesRes.data || []

    // ── 4. Ask the model for missing calendar obligations ─────────────────────
    const prompt = `Είσαι expert σύμβουλος διαχείρισης ακινήτων στην Ελλάδα. Ανάλυσε τα παρακάτω δεδομένα και πρότεινε 4-6 γεγονότα ημερολογίου που λείπουν ή χρειάζονται προσοχή.

ΣΤΟΙΧΕΙΑ ΑΚΙΝΗΤΟΥ:
${JSON.stringify(owned, null, 2)}

ΥΠΑΡΧΟΝΤΑ ΓΕΓΟΝΟΤΑ ΗΜΕΡΟΛΟΓΙΟΥ (${events.length}):
${JSON.stringify(events.slice(0, 20), null, 2)}

ΛΟΓΑΡΙΑΣΜΟΙ (${bills.length}):
${JSON.stringify(bills, null, 2)}

ΔΑΠΑΝΕΣ ΤΕΛΕΥΤΑΙΟΙ 30 (${expenses.length}):
${JSON.stringify(expenses, null, 2)}

ΚΑΝΟΝΕΣ:
1. Προτεινε ΜΟΝΟ γεγονότα που ΔΕΝ υπάρχουν ήδη στο ημερολόγιο
2. Βασίσου στα πραγματικά δεδομένα — π.χ. αν έχει κλιματιστικό στα bills/expenses, πρότεινε service
3. Λάβε υπόψη ελληνική νομοθεσία (ΕΝΦΙΑ, ΤΑΠ, πιστοποιητικά)
4. Αν το ακίνητο έχει ενοικιαστή, πρότεινε σχετικά γεγονότα
5. Λάβε υπόψη εποχικότητα (καλοκαίρι=κλιματιστικά, χειμώνας=θέρμανση)

Απάντησε ΜΟΝΟ με valid JSON array, χωρίς markdown, χωρίς εξηγήσεις:
[
  {
    "title": "τίτλος γεγονότος στα ελληνικά",
    "category": "financial|bills|maintenance|contract|tenant|reminder",
    "amount": 150,
    "recurring": true,
    "recurring_interval": "monthly|annual|quarterly|biannual",
    "priority": "low|medium|high|critical",
    "reason": "σύντομη εξήγηση γιατί είναι σημαντικό (max 10 λέξεις)"
  }
]`

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!aiRes.ok) {
      const err = await aiRes.text()
      console.error('Claude API error status', aiRes.status)
      return json({ error: 'AI error', details: err }, 500)
    }

    const aiData = await aiRes.json()
    const text   = aiData.content?.[0]?.text || '[]'
    const clean  = text.replace(/```json|```/g, '').trim()

    let suggestions = []
    try { suggestions = JSON.parse(clean) } catch { suggestions = [] }

    return json({ suggestions }, 200)
  } catch (err) {
    reportEdgeError('smart-suggestions', err)
    return json({ error: 'internal error' }, 500)
  }
})
