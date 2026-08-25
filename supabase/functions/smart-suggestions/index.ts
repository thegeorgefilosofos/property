import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { reportEdgeError } from '../_shared/report.ts'

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY      = Deno.env.get('SUPABASE_ANON_KEY')!

// Service client is used ONLY after we have verified, from the caller's JWT, that
// the requested property belongs to them. Identity always comes from the token —
// never from the request body (which an attacker controls).
const service = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Τα όρια AI, όπως τα περιμένει η bump_ai_usage ────────────────────────────
// ΚΑΘΡΕΦΤΗΣ του lib/billing/aiLimits.ts — ΟΧΙ δεύτερη απόφαση. Οι σειρές είναι
// [δωρεάν, ιδιοκτήτης, επαγγελματίας, γραφείο], δηλαδή δείκτης = user_plan_rank.
//
// Γιατί αντιγράφονται αντί να εισαχθούν: το Deno δεν φτάνει στο lib/ (καμία
// edge function δεν το κάνει — βλ. _shared/report.ts, καθρέφτης κι αυτός) και
// το supabase-deploy.yml ξανα-ανεβάζει functions ΜΟΝΟ σε αλλαγή του supabase/**.
// Ένα import θα έδειχνε ενιαία πηγή αλλά το ανεβασμένο bundle θα κρατούσε σιωπηλά
// τα παλιά νούμερα σε κάθε αλλαγή του aiLimits.ts — χειρότερο από φανερή αντιγραφή.
// Την απόκλιση την πιάνει το index.test.ts, που συγκρίνει αυτά εδώ με την πηγή.
const AI_LIMITS = {
  perMinute: 20,
  // Σειρά = user_plan_rank: 0 χωρίς συνδρομή, 1 Ιδιοκτήτης, 2 Ιδιοκτήτης+,
  // 3 Επαγγελματίας, 4 Επαγγελματίας+.
  //
  // ΤΑ ΝΟΥΜΕΡΑ ΔΕΝ ΕΠΙΛΕΓΟΝΤΑΙ ΕΔΩ. Παράγονται στο lib/billing/aiLimits.ts από
  // τον κανόνα «ο βοηθός δεν τρώει πάνω από το 20% της συνδρομής» και το
  // index.test.ts τα συγκρίνει γραμμή προς γραμμή: αν αποκλίνουν, η συνάρτηση
  // άκρου θα έδινε άλλα όρια από την εφαρμογή, στον ίδιο χρήστη.
  perDayByRank: [5, 8, 20, 50, 161],
  perMonthByRank: [10, 23, 59, 150, 483],
  freePoolPerMonth: 1000,
  // Το πακέτο κάθε ανυψωμένου αλλά ΜΗ πληρωμένου λογαριασμού (δοκιμή, δωρεάν
  // μήνες, Συνεργάτης). Το `least` της bump_ai_usage δεν το αφήνει να ξεπεραστεί.
  trialPerDay: 7,
  trialPerMonth: 20,
  // Το πακέτο του ΔΟΚΙΜΑΣΤΗ. Δεν είναι ανυψωμένο επίπεδο: είναι λογαριασμός
  // που κρατά αληθινό πακέτο χωρίς να το πληρώνει, οπότε το `least` πρέπει να
  // κόψει και πάνω από πληρωμένο επίπεδο.
  testerPerDay: 30,
  testerPerMonth: 30,
}

// ── Το «σήμερα» της Ελλάδας, μέσα σε Deno ───────────────────────────────────
// ΚΑΘΡΕΦΤΗΣ του lib/core/time.ts, για τον ίδιο λόγο με τα όρια AI: το Deno δεν
// φτάνει στο lib/. Το `toISOString().slice(0,10)` του τώρα γυρίζει UTC και
// στην Ελλάδα από τα μεσάνυχτα ως τις 02:00/03:00 δείχνει ΧΘΕΣ. Εδώ κοστίζει
// διπλά: με λάθος αφετηρία το μοντέλο δίνει και λάθος ημερομηνίες γεγονότων.
const athensToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

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

    // ── 3. Το ΙΔΙΟ ταβάνι κόστους AI με την κύρια διαδρομή ────────────────────
    // ΤΙ ΕΚΑΝΕ ΛΑΘΟΣ ΠΡΙΝ: αυτή η function καλούσε το Anthropic κατευθείαν, χωρίς
    // να περάσει ποτέ από την bump_ai_usage. Ήταν δεύτερος δρόμος προς το ΙΔΙΟ
    // κλειδί, χωρίς κανένα ταβάνι: ένας χρήστης που είχε εξαντλήσει το μηνιαίο
    // του πακέτο στη συνομιλία συνέχιζε να παράγει προτάσεις απεριόριστα και η
    // κοινή δεξαμενή των 340 αιτημάτων — η ΜΟΝΗ σκληρή εγγύηση ότι οι δωρεάν
    // χρήστες δεν ξεπερνούν τα ~18 $/μήνα — δεν μετρούσε τίποτα από εδώ. Το
    // ταβάνι που υπόσχεται το lib/billing/aiLimits.ts απλώς δεν ίσχυε.
    //
    // Ο μετρητής είναι ΚΟΙΝΟΣ επίτηδες: μια πρόταση χρεώνεται στο ίδιο κλειδί με
    // μια ερώτηση στη Νόα, άρα μετράει στο ίδιο πακέτο. Ένα ταβάνι, ένας μετρητής.
    //
    // Καλείται με το authClient, ΟΧΙ με το service: η bump_ai_usage διαβάζει
    // auth.uid(), που με service_role είναι null — θα γύριζε πάντα reason 'auth'
    // και θα έκοβε τους πάντες.
    const { data: usage, error: usageErr } = await authClient.rpc('bump_ai_usage', {
      p_max_min: AI_LIMITS.perMinute,
      p_day:     AI_LIMITS.perDayByRank,
      p_month:   AI_LIMITS.perMonthByRank,
      p_pool:    AI_LIMITS.freePoolPerMonth,
      p_trial_day:   AI_LIMITS.trialPerDay,
      p_trial_month: AI_LIMITS.trialPerMonth,
      p_tester_day:   AI_LIMITS.testerPerDay,
      p_tester_month: AI_LIMITS.testerPerMonth,
    })
    // Ο μετρητής είναι ΓΡΑΨΙΜΟ: αν δεν αυξήθηκε, δεν ξέρουμε πόσα έχει ξοδέψει ο
    // χρήστης. Το app/api/anthropic αφήνει να περάσει σε σφάλμα RPC, αλλά μόνο
    // επειδή από πίσω του υπάρχει και το in-memory φράγμα του route. Εδώ δεν
    // υπάρχει τίποτα άλλο· «άσ' το να περάσει» σημαίνει ξανά απεριόριστη χρέωση.
    if (usageErr) {
      return json({ error: 'Ο έλεγχος ορίου AI δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο.' }, 503)
    }
    const u = usage as { allowed?: boolean; reason?: string } | null
    if (u?.allowed === false) {
      // Το ακριβές νούμερο του πλάνου το λέει η συνομιλία (εκεί ζουν τα μηνύματα
      // του aiLimits.ts). Εδώ λέμε την αιτία χωρίς να ξαναγράψουμε τη λογική τους.
      return json({
        error: 'Έφτασες το όριο ερωτήσεων AI· οι προτάσεις μετρούν στο ίδιο πακέτο με τη Νόα. '
             + 'Ρώτησέ τη στη συνομιλία για το όριο του πλάνου σου και πότε ανανεώνεται.',
        reason: u.reason,
      }, 429)
    }

    // ── 4. Read only this user's data for this property ───────────────────────
    const [eventsRes, billsRes, expensesRes] = await Promise.all([
      service.from('calendar_events').select('title,category,amount,event_time,recurring,status').eq('property_id', property_id).eq('user_id', userId),
      service.from('bills').select('name,amount,category,paid,due_date').eq('property_id', property_id).eq('user_id', userId),
      service.from('expenses').select('description,amount,category,date').eq('property_id', property_id).eq('user_id', userId).order('date', { ascending: false }).limit(30),
    ])
    const events   = eventsRes.data || []
    const bills    = billsRes.data || []
    const expenses = expensesRes.data || []

    // ── 5. Ask the model for missing calendar obligations ─────────────────────
    // Η ΑΓΚΥΡΑ ΧΡΟΝΟΥ ΕΛΕΙΠΕ ΕΝΤΕΛΩΣ. Το prompt ζητούσε «εποχικότητα» και
    // «ελληνική νομοθεσία» χωρίς να λέει ποια μέρα είναι σήμερα: το μοντέλο
    // υπέθετε και ο πελάτης πετούσε ούτως ή άλλως ό,τι έβγαινε, γιατί το
    // σχήμα δεν είχε πεδίο ημερομηνίας να γεμίσει.
    const todayIso = athensToday()
    const prompt = `Είσαι expert σύμβουλος διαχείρισης ακινήτων στην Ελλάδα. Ανάλυσε τα παρακάτω δεδομένα και πρότεινε 4-6 γεγονότα ημερολογίου που λείπουν ή χρειάζονται προσοχή.

ΣΗΜΕΡΑ: ${todayIso}

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
6. Κάθε γεγονός παίρνει τη ΔΙΚΗ ΤΟΥ ημερομηνία, μέσα στους επόμενους 12 μήνες από το ΣΗΜΕΡΑ. Μη δίνεις σε δύο γεγονότα την ίδια, εκτός αν όντως συμπίπτουν.

Απάντησε ΜΟΝΟ με valid JSON array, χωρίς markdown, χωρίς εξηγήσεις:
[
  {
    "title": "τίτλος γεγονότος στα ελληνικά",
    "category": "financial|bills|maintenance|contract|tenant|reminder",
    "event_date": "YYYY-MM-DD, η πραγματική ημερομηνία της υποχρέωσης μέσα στους επόμενους 12 μήνες",
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
        // 1024 ήταν σφιχτό ήδη με έξι προτάσεις. Η ημερομηνία προσθέτει ~10
        // tokens σε καθεμία: με κομμένη απάντηση το `JSON.parse` αποτυγχάνει,
        // το `catch` γυρίζει άδειο array και ο χρήστης διαβάζει «δεν κατάφερα
        // να διαβάσω το ακίνητο» για ένα όριο, όχι για σφάλμα.
        max_tokens: 1536,
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
    // Το μοντέλο μπορεί να απαντήσει με αντικείμενο αντί για array. Ο πελάτης
    // διάβαζε `data.suggestions?.length` και έβγαζε undefined, δηλαδή σφάλμα
    // χωρίς αιτία· και ο έλεγχος από κάτω θα έσκαγε σε 500.
    if (!Array.isArray(suggestions)) suggestions = []

    // ── 6. Η ημερομηνία του μοντέλου είναι είσοδος, όχι μέτρηση ───────────────
    // Ο ίδιος έλεγχος που κάνει ήδη ο πελάτης στην κατηγορία και στην
    // προτεραιότητα (canonicalCategory, eventPriority στο lib/data/calendar.ts).
    // Ο,τι δεν είναι πραγματική μέρα μέσα στους επόμενους 18 μήνες σβήνεται
    // εδώ, ώστε ο πελάτης να πέσει στην εφεδρική του ημερομηνία αντί να γράψει
    // στο ημερολόγιο μέρα που έχει περάσει, ή μέρα που δεν υπάρχει και ρίχνει
    // ολόκληρη την εγγραφή. Το ταβάνι είναι 18 μήνες και όχι 12: ο κανόνας 6
    // ζητά δωδεκάμηνο, αλλά μια υποχρέωση στην άκρη του δεν πρέπει να κόβεται
    // επειδή το μοντέλο μέτρησε τον μήνα με μισή διαφορά.
    const [ty, tm, td] = todayIso.split('-').map(Number)
    const limitIso = new Date(Date.UTC(ty, tm - 1 + 18, td)).toISOString().slice(0, 10)
    for (const s of suggestions) {
      if (!s || typeof s !== 'object') continue
      const d = typeof s.event_date === 'string' ? s.event_date.trim() : ''
      // Ο γύρος από `Date.UTC` κανονικοποιεί: η 31η Φεβρουαρίου γυρίζει 3
      // Μαρτίου και δεν ισούται με την είσοδο. Το `new Date('2027-02-31T…')`
      // θα ήταν Invalid Date και το `toISOString()` του πετάει RangeError,
      // δηλαδή 500 αντί για μία σβησμένη ημερομηνία.
      const [y, mo, day] = d.split('-').map(Number)
      const realDay = /^\d{4}-\d{2}-\d{2}$/.test(d)
        && new Date(Date.UTC(y, mo - 1, day)).toISOString().slice(0, 10) === d
      if (realDay && d >= todayIso && d <= limitIso) s.event_date = d
      else delete s.event_date
    }

    return json({ suggestions }, 200)
  } catch (err) {
    reportEdgeError('smart-suggestions', err)
    return json({ error: 'internal error' }, 500)
  }
})
