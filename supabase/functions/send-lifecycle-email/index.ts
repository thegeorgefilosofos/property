// ─────────────────────────────────────────────────────────────────────────
// send-lifecycle-email — η «μηχανή» των lifecycle/marketing emails. Δέχεται ένα
// event + παραλήπτη (email/όνομα/πλάνο/params), επιλέγει το τυποποιημένο template
// από το κοινό _shared/emailTemplates.ts και στέλνει ένα καθαρό, branded email
// μέσω Resend. Έτσι ΟΛΑ τα emails του κύκλου ζωής βγαίνουν από μία πηγή, ομοιόμορφα.
//
// Καλείται server-to-server (DB triggers / cron / thin app route). Αυθεντικοποίηση
// zero-config: service-role bearer, x-cron-secret env, ή cron_secrets (DB).
//
// Events: welcome | plan_upgraded | plan_downgraded | new_property | feedback |
//         mobile_launch | referral_invite | upsell | legislation | seasonal
//
// Deploy (μόλις υπάρχει verified domain): supabase functions deploy send-lifecycle-email
// (verify_jwt=false). Χρειάζεται RESEND_API_KEY + RESEND_FROM (branded αποστολέας).
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { APP_URL } from '../_shared/site.ts'
import {
  welcomeEmail, planUpgradedEmail, planDowngradedEmail, newPropertyEmail,
  feedbackRequestEmail, mobileLaunchEmail, referralInviteEmail, upsellEmail,
  legislationUpdateEmail, seasonalCampaignEmail, type Plan, type Season, type Ctx, type Personal,
} from '../_shared/emailTemplates.ts'
import { CATALOG, DIGESTS } from '../_shared/emailCopy.ts'
import { guessGender } from '../_shared/gender.ts'
import { authorizeCron } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET    = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'PROPERWISE <onboarding@resend.dev>'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })
}

// ═══════════════════════════════════════════════════════════════════════════
// ΕΜΠΟΡΙΚΟ Η ΣΥΝΑΛΛΑΚΤΙΚΟ: Η ΔΙΑΚΡΙΣΗ ΠΟΥ ΔΕΝ ΥΠΗΡΧΕ
//
// Η συνάρτηση έστελνε ΚΑΘΕ email το ίδιο: ούτε ρωτούσε αν ο παραλήπτης έχει
// απεγγραφεί, ούτε έβαζε σύνδεσμο απεγγραφής. Η απεγγραφή υπήρχε, δούλευε, και
// την τηρούσε ΜΟΝΟ το newsletter — δηλαδή ο χρήστης πατούσε «απεγγραφή», η βάση
// το κατέγραφε, και τα υπόλοιπα εμπορικά μηνύματα συνέχιζαν να φτάνουν.
//
// Ο νόμος δεν ζητά απεγγραφή από ΟΛΑ τα μηνύματα. Το «ο κωδικός σου άλλαξε» και
// το «η συνδρομή σου ανανεώθηκε» είναι συναλλακτικά: ο χρήστης ΠΡΕΠΕΙ να τα
// λάβει, και ένας σύνδεσμος απεγγραφής εκεί είναι επικίνδυνος.
//
// Άρα η διάκριση γράφεται ρητά, μία φορά, εδώ:
//   ΣΥΝΑΛΛΑΚΤΙΚΟ  → φεύγει πάντα, χωρίς σύνδεσμο απεγγραφής.
//   ΕΜΠΟΡΙΚΟ      → φεύγει ΜΟΝΟ σε όποιον δεν έχει απεγγραφεί, ΠΑΝΤΑ με
//                    σύνδεσμο απεγγραφής.
//
// ΚΑΙ Η ΚΑΤΕΥΘΥΝΣΗ ΤΗΣ ΑΠΟΤΥΧΙΑΣ. Αν η ανάγνωση των προτιμήσεων αποτύχει, το
// συναλλακτικό φεύγει (η σιωπή θα ήταν χειρότερη: κανείς δεν παίρνει τον κωδικό
// του) και το εμπορικό ΔΕΝ φεύγει. Το λάθος προς τα εκεί κοστίζει ένα χαμένο
// διαφημιστικό· προς την άλλη κατεύθυνση κοστίζει παραβίαση.
// ═══════════════════════════════════════════════════════════════════════════
const COMMERCIAL = new Set([
  'upsell', 'seasonal', 'legislation', 'feedback', 'referral_invite', 'mobile_launch',
]);

/** Εμπορικό είναι και κάθε ενοποιημένη ενημέρωση (digest) του καταλόγου. */
const isCommercial = (event: string, copyId: string): boolean =>
  COMMERCIAL.has(event) || (!!copyId && copyId in DIGESTS);

/**
 * Οι προτιμήσεις του παραλήπτη από τη διεύθυνσή του.
 *
 * Επιστρέφει `null` όταν δεν βρεθεί χρήστης ή αποτύχει η ανάγνωση: ο καλών
 * αποφασίζει τι σημαίνει αυτό ανά είδος μηνύματος.
 */
async function marketingPrefs(email: string): Promise<{ optedIn: boolean; unsubUrl: string } | null> {
  try {
    const { data, error } = await supabase.rpc('marketing_prefs_for_email', { p_email: email });
    if (error || !data) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.unsubscribe_token) return null;
    return { optedIn: row.product_news !== false, unsubUrl: `${APP_URL}/unsubscribe/${row.unsubscribe_token}` };
  } catch { return null; }
}

// Επιλογή template από το event. Επιστρέφει { subject, html } ή null αν άγνωστο.
// Οι παράμετροι έρχονται από τη βάση ως jsonb: το σχήμα τους δεν ζει στον
// τύπο. `unknown` αντί για `any` — κάθε ανάγνωση περνά ήδη από ρητή μετατροπή
// («as Plan», «String(...)»), οπότε τίποτα δεν χάνεται και ο έλεγχος μένει.
function render(event: string, ctx: Ctx, params: Record<string, unknown>): { subject: string; html: string } | null {
  const plan = (params.plan as Plan) || 'free'
  switch (event) {
    case 'welcome':          return welcomeEmail({ ...ctx, plan })
    case 'plan_upgraded':    return planUpgradedEmail({ ...ctx, plan })
    case 'plan_downgraded':  return planDowngradedEmail({ ...ctx, plan })
    case 'new_property':     return newPropertyEmail({ ...ctx, propertyName: String(params.propertyName || 'Ακίνητο') })
    case 'feedback':         return feedbackRequestEmail(ctx)
    case 'mobile_launch':    return mobileLaunchEmail(ctx)
    case 'referral_invite':  return referralInviteEmail(ctx)
    case 'upsell':           return upsellEmail({ ...ctx, toPlan: params.toPlan as Plan, discountPct: Number(params.discountPct) || 0, seasonLabel: params.seasonLabel == null ? undefined : String(params.seasonLabel) })
    case 'legislation':      return legislationUpdateEmail({ ...ctx, headline: String(params.headline || ''), summaryHtml: String(params.summaryHtml || '') })
    case 'seasonal':         return seasonalCampaignEmail({ ...ctx, season: params.season as Season, toPlan: params.toPlan as Plan, discountPct: Number(params.discountPct) || undefined })
    default:                 return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)
  if (!RESEND_API_KEY) return json({ error: 'no_resend_key' }, 500)

  let event = '', copyId = '', email = '', name = '', params: Record<string, unknown> = {}
  try {
    const b = await req.json()
    event = String(b?.event || '').trim()
    copyId = String(b?.copyId || '').trim()   // κλειδί από το email catalog (emailCopy.CATALOG)
    email = String(b?.email || '').trim().toLowerCase()
    name = b?.name ? String(b.name).trim() : ''
    params = (b?.params && typeof b.params === 'object') ? b.params : {}
  } catch { return json({ error: 'bad_body' }, 400) }

  if (!event && !copyId) return json({ error: 'no_event' }, 400)
  if (!isEmail(email)) return json({ error: 'bad_email' }, 400)

  // Πλούσιο πλαίσιο εξατομίκευσης: όλα τα params περνούν ζωντανά στο κείμενο
  // (amount, deadlineDate, period, tenantName, cardLast4, digestItems, κ.λπ.),
  // με το appUrl/όνομα να υπερισχύουν από τον φάκελο.
  // ── Η ΑΠΕΓΓΡΑΦΗ, ΠΡΙΝ ΑΠΟ ΟΤΙΔΗΠΟΤΕ ΑΛΛΟ ────────────────────────────────
  const commercial = isCommercial(event, copyId);
  const prefs = commercial ? await marketingPrefs(email) : null;
  if (commercial) {
    if (!prefs) return json({ skipped: 'no_prefs', event, copyId }, 200);
    if (!prefs.optedIn) return json({ skipped: 'unsubscribed', event, copyId }, 200);
  }

  const recipientName = name || (params.name as string) || undefined
  const personal: Personal = {
    ...(params as Personal),
    name: recipientName,
    appUrl: APP_URL,
    // Ο σύνδεσμος απεγγραφής δεν εξαρτάται από το τι θυμήθηκε να στείλει ο
    // καλών: στο εμπορικό μπαίνει πάντα, από τη βάση.
    unsubUrl: prefs?.unsubUrl ?? (params.unsubUrl == null ? undefined : String(params.unsubUrl)),
    // Φύλο από το όνομα, αν δεν δόθηκε ρητά — για σωστή προσφώνηση.
    gender: (params.gender as Personal['gender']) || guessGender(recipientName),
    tenantGender: (params.tenantGender as Personal['tenantGender']) || guessGender(params.tenantName as string),
  }

  // Προτεραιότητα στο επιμελημένο catalog (copyId), μετά τα ενοποιημένα (DIGESTS),
  // αλλιώς τα lifecycle templates (event).
  const byCopyId = { ...CATALOG, ...DIGESTS }
  const tpl = (copyId && byCopyId[copyId]) ? byCopyId[copyId](personal) : render(event, personal, params)
  if (!tpl) return json({ error: 'unknown_email', event, copyId }, 400)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject: tpl.subject, html: tpl.html }),
    })
    if (!res.ok) { const detail = await res.text().catch(() => ''); return json({ error: 'send_failed', detail: detail.slice(0, 300) }, 502) }
    return json({ sent: true, event })
  } catch (err) {
    return json({ error: 'send_error', detail: String(err).slice(0, 300) }, 500)
  }
})
