import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
    }})
  }

  try {
    const { property_id, user_id } = await req.json()
    if (!property_id || !user_id) {
      return new Response(JSON.stringify({ error: 'Missing property_id or user_id' }), { status: 400 })
    }

    // ── Τράβα πραγματικά δεδομένα ────────────────────────────────────────

    const [eventsRes, billsRes, expensesRes, propertyRes] = await Promise.all([
      supabase.from('calendar_events').select('title,category,amount,event_date,recurring,recurring_interval,status').eq('property_id', property_id).eq('user_id', user_id),
      supabase.from('bills').select('name,amount,category,paid,due_date').eq('property_id', property_id),
      supabase.from('expenses').select('description,amount,category,date').eq('property_id', property_id).order('date', { ascending: false }).limit(30),
      supabase.from('properties').select('property_type,size_sqm,year_built,monthly_rent,address').eq('id', property_id).maybeSingle(),
    ])

    const events    = eventsRes.data || []
    const bills     = billsRes.data || []
    const expenses  = expensesRes.data || []
    const property  = propertyRes.data || {}

    // ── Prompt για Claude ─────────────────────────────────────────────────

    const prompt = `Είσαι expert σύμβουλος διαχείρισης ακινήτων στην Ελλάδα. Ανάλυσε τα παρακάτω δεδομένα και πρότεινε 4-6 γεγονότα ημερολογίου που λείπουν ή χρειάζονται προσοχή.

ΣΤΟΙΧΕΙΑ ΑΚΙΝΗΤΟΥ:
${JSON.stringify(property, null, 2)}

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

    // ── Κλήση Claude API ──────────────────────────────────────────────────

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
      console.error('Claude API error:', err)
      return new Response(JSON.stringify({ error: 'AI error', details: err }), { status: 500 })
    }

    const aiData = await aiRes.json()
    const text   = aiData.content?.[0]?.text || '[]'
    const clean  = text.replace(/```json|```/g, '').trim()

    let suggestions = []
    try {
      suggestions = JSON.parse(clean)
    } catch {
      console.error('JSON parse error:', clean)
      suggestions = []
    }

    return new Response(JSON.stringify({ suggestions }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    })

  } catch (err) {
    console.error('Function error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})