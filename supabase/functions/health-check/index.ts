// ═══════════════════════════════════════════════════════════════════════════
// health-check — ο έλεγχος υγείας φεύγει από τους runners
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΜΕΤΡΗΘΗΚΕ (04/09/2026). Το workflow `health` έτρεχε ωριαία και έκαιγε 730
// από τα 840 προγραμματισμένα λεπτά Actions του μήνα — το 87% όλου του
// προγράμματος, το 37% ολόκληρου του δωρεάν ορίου των 2.000. Ταυτόχρονα το CI
// μετρήθηκε στα 64 λεπτά ανά εκτέλεση (όχι 45, όπως νόμιζε ο φύλακας), δηλαδή
// 16 εκτελέσεις τον μήνα: ΗΔΗ κάτω από το δάπεδο των 20, πριν προστεθεί
// οτιδήποτε. Ο έλεγχος που φυλάει την παραγωγή έτρωγε τον αγωγό που τη χτίζει.
//
// ΤΟ ΙΔΙΟ ΤΟ health.yml ΕΓΡΑΦΕ ΤΗ ΛΥΣΗ ΑΠΟ ΤΟΝ ΑΥΓΟΥΣΤΟ: «όταν χρειαστεί
// λεπτότερη ανάλυση, ο σωστός δρόμος ΔΕΝ είναι να ξανανέβει η συχνότητα εδώ,
// αλλά να φύγει ο έλεγχος από τους runners· pg_cron και pg_net υπάρχουν στο
// δωρεάν επίπεδο της Supabase». Αυτό κάνει αυτή η συνάρτηση.
//
// ΚΑΙ ΓΙΝΕΤΑΙ ΚΑΛΥΤΕΡΟΣ, ΟΧΙ ΦΤΗΝΟΤΕΡΟΣ. Το παράθυρο άγνοιας πέφτει από μία
// ώρα σε ένα τέταρτο — τέσσερις φορές πυκνότερα, με κόστος μηδέν. Και για
// πρώτη φορά υπάρχει ΙΣΤΟΡΙΚΟ: ο πίνακας `health_checks` κρατά κάθε πέρασμα,
// οπότε το «πόσο συχνά πέφτει» και το «πόσο κράτησε» γίνονται ερωτήσεις με
// απάντηση. Το GitHub Actions δεν έδινε ποτέ τίποτα από τα δύο.
//
// ΤΙ ΕΜΕΙΝΕ ΣΤΟ GITHUB. Ο έλεγχος ΜΕΤΑ ΑΠΟ DEPLOY στο main — η στιγμή με τη
// μεγαλύτερη αξία, όπως γράφει το ίδιο το workflow, γιατί εκεί γεννιούνται οι
// διακοπές. Είναι γεγονός, όχι πρόγραμμα: κοστίζει όσα τα pushes στο main.
// Ο ΣΥΝΕΧΗΣ έλεγχος είναι εδώ.
//
// Deploy: supabase functions deploy health-check
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { authorizeCron } from '../_shared/auth.ts'
import { runHealth, diagnose } from '../_shared/probe.mjs'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
// ΤΟ ΟΝΟΜΑ ΤΗΣ ΜΕΤΑΒΛΗΤΗΣ ΕΙΝΑΙ ΑΥΤΟ ΠΟΥ ΧΡΗΣΙΜΟΠΟΙΟΥΝ ΟΙ ΑΛΛΕΣ ΕΝΝΙΑ. Ειχα
// γράψει `FROM_EMAIL` και θα ήταν πάντα κενό: καμία άλλη function δεν το λέει
// έτσι, άρα δεν υπάρχει στα secrets. Η ειδοποίηση διακοπής δεν θα έφευγε ποτέ
// και το μόνο σημάδι θα ήταν ένα «δεν έχει ρυθμιστεί παραλήπτης» που κανείς
// δεν διαβάζει. Ενα monitor που δεν ειδοποιεί είναι χειρότερο από κανένα.
const FROM_EMAIL = Deno.env.get('RESEND_FROM') || ''
const ALERT_EMAIL = Deno.env.get('HEALTH_ALERT_EMAIL') || ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

type Verdict = { ok: boolean; status: number | string; ms: number; why: string; tries?: number }
type Outcome = { route: { path: string }; res: Verdict }

/**
 * Η ΔΙΕΥΘΥΝΣΗ ΔΕΝ ΜΑΝΤΕΥΕΤΑΙ ΠΟΤΕ.
 *
 * Ενας έλεγχος που χτυπά σιωπηλά λάθος site είναι χειρότερος από κανέναν: δίνει
 * ψεύτικη ησυχία όταν όλα καλά, ψεύτικο συναγερμό όταν όχι — και ο δεύτερος
 * μαθαίνει τον άνθρωπο να αγνοεί την ειδοποίηση. Συνέβη ήδη μια φορά.
 */
const baseUrl = () => (Deno.env.get('HEALTH_BASE_URL') || '').trim().replace(/\/+$/, '')

/**
 * ΕΝΑ ΜΗΝΥΜΑ ΑΝΑ ΜΕΤΑΒΑΣΗ, ΟΧΙ ΑΝΑ ΠΕΡΑΣΜΑ.
 *
 * Με έλεγχο κάθε τέταρτο, μια διακοπή δώδεκα ωρών θα έστελνε 48 μηνύματα. Ο
 * παραλήπτης θα σταματούσε να τα διαβάζει την πρώτη ώρα — δηλαδή η πυκνότητα
 * που κερδίσαμε θα κατέστρεφε την ειδοποίηση. Στέλνουμε μόνο όταν ΑΛΛΑΖΕΙ η
 * κατάσταση: όρθιο → πεσμένο και πεσμένο → όρθιο.
 */
async function alertOnTransition(wasOk: boolean | null, isOk: boolean, results: Outcome[], kind: string) {
  if (wasOk === isOk) return 'χωρίς μεταβολή'
  if (wasOk === null && isOk) return 'πρώτη μέτρηση, υγιής'
  if (!RESEND_API_KEY || !FROM_EMAIL || !ALERT_EMAIL) return 'δεν έχει ρυθμιστεί παραλήπτης'

  const failed = results.filter(r => !r.res.ok)
  const subject = isOk
    ? 'PROPERWISE · η παραγωγή απαντά ξανά'
    : `PROPERWISE · η παραγωγή ΔΕΝ απαντά (${failed.length} από ${results.length})`
  const lines = isOk
    ? ['Οι δημόσιες σελίδες απαντούν ξανά σωστά.']
    : [
        'Ο αυτόματος έλεγχος υγείας βρήκε ότι δημόσιες σελίδες δεν απαντούν σωστά.',
        '',
        ...failed.map(f => `${f.route.path}: ${f.res.why}`),
        '',
        kind === 'wrong-address'
          ? 'ΟΛΕΣ οι διαδρομές γύρισαν 404: πιθανότερη αιτία είναι λάθος HEALTH_BASE_URL, όχι βλάβη.'
          : kind === 'no-network'
            ? 'Καμία διαδρομή δεν απάντησε: σφάλμα δικτύου ή DNS, ή ολική διακοπή.'
            : 'Πρώτος ύποπτος το σύνορο server/πελάτη· δες τα Runtime Logs του Vercel.',
      ]

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM_EMAIL, to: ALERT_EMAIL, subject,
        html: `<pre style="font:14px ui-monospace,monospace">${lines.join('\n')}</pre>`,
      }),
    })
    return res.ok ? 'στάλθηκε' : `απέτυχε ${res.status}`
  } catch (err) {
    return `απέτυχε: ${String(err)}`
  }
}

Deno.serve(async (req) => {
  if (!(await authorizeCron(req, {
    serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase,
    dbSecretName: ['lifecycle_cron', 'email_cron'],
  }))) return json({ error: 'unauthorized' }, 401)

  const base = baseUrl()
  // ΠΑΡΑΛΕΙΠΕΤΑΙ ΘΟΡΥΒΩΔΩΣ, ΔΕΝ ΤΡΕΧΕΙ ΣΤΑ ΤΥΦΛΑ. Και δεν γράφει γραμμή: μια
  // ψεύτικη αποτυχία στο ιστορικό είναι χειρότερη από ένα κενό στο ιστορικό.
  if (!base) return json({ skipped: 'λείπει το HEALTH_BASE_URL' }, 200)

  const results = (await runHealth(base)) as Outcome[]
  const { kind, failed } = diagnose(results) as { kind: string; failed: Outcome[] }
  const ok = kind === 'ok'

  const { data: prev } = await supabase
    .from('health_checks').select('ok').order('ran_at', { ascending: false }).limit(1)
  const wasOk = prev && prev.length ? Boolean(prev[0].ok) : null

  const alert = await alertOnTransition(wasOk, ok, results, kind)

  const { error } = await supabase.from('health_checks').insert({
    ok, kind, base,
    routes_count: results.length,
    failed_count: failed.length,
    details: results.map(r => ({ path: r.route.path, ok: r.res.ok, status: r.res.status, ms: r.res.ms, why: r.res.why })),
  })
  if (error) return json({ ok, kind, alert, write_error: error.message }, 502)

  return json({ ok, kind, checked: results.length, failed: failed.length, alert })
})
