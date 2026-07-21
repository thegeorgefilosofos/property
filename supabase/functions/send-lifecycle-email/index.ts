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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  welcomeEmail, planUpgradedEmail, planDowngradedEmail, newPropertyEmail,
  feedbackRequestEmail, mobileLaunchEmail, referralInviteEmail, upsellEmail,
  legislationUpdateEmail, seasonalCampaignEmail, type Plan, type Season, type Ctx,
} from '../_shared/emailTemplates.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET    = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'
const APP_URL        = Deno.env.get('APP_URL') || 'https://propertyos.gr'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

async function authorized(req: Request): Promise<boolean> {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (SERVICE_KEY && bearer === SERVICE_KEY) return true
  const header = req.headers.get('x-cron-secret') || ''
  if (CRON_SECRET && header === CRON_SECRET) return true
  if (header) {
    const { data } = await supabase.from('cron_secrets').select('secret').eq('name', 'email_cron').maybeSingle()
    if (data?.secret && header === data.secret) return true
  }
  return false
}

// Επιλογή template από το event. Επιστρέφει { subject, html } ή null αν άγνωστο.
function render(event: string, ctx: Ctx, params: Record<string, any>): { subject: string; html: string } | null {
  const plan = (params.plan as Plan) || 'free'
  switch (event) {
    case 'welcome':          return welcomeEmail({ ...ctx, plan })
    case 'plan_upgraded':    return planUpgradedEmail({ ...ctx, plan })
    case 'plan_downgraded':  return planDowngradedEmail({ ...ctx, plan })
    case 'new_property':     return newPropertyEmail({ ...ctx, propertyName: String(params.propertyName || 'Ακίνητο') })
    case 'feedback':         return feedbackRequestEmail(ctx)
    case 'mobile_launch':    return mobileLaunchEmail(ctx)
    case 'referral_invite':  return referralInviteEmail(ctx)
    case 'upsell':           return upsellEmail({ ...ctx, toPlan: params.toPlan as Plan, discountPct: Number(params.discountPct) || 0, seasonLabel: params.seasonLabel })
    case 'legislation':      return legislationUpdateEmail({ ...ctx, headline: String(params.headline || ''), summaryHtml: String(params.summaryHtml || '') })
    case 'seasonal':         return seasonalCampaignEmail({ ...ctx, season: params.season as Season, toPlan: params.toPlan as Plan, discountPct: Number(params.discountPct) || undefined })
    default:                 return null
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)
  if (!RESEND_API_KEY) return json({ error: 'no_resend_key' }, 500)

  let event = '', email = '', name = '', params: Record<string, any> = {}
  try {
    const b = await req.json()
    event = String(b?.event || '').trim()
    email = String(b?.email || '').trim().toLowerCase()
    name = b?.name ? String(b.name).trim() : ''
    params = (b?.params && typeof b.params === 'object') ? b.params : {}
  } catch { return json({ error: 'bad_body' }, 400) }

  if (!event) return json({ error: 'no_event' }, 400)
  if (!isEmail(email)) return json({ error: 'bad_email' }, 400)

  const ctx: Ctx = { name: name || undefined, appUrl: APP_URL }
  const tpl = render(event, ctx, params)
  if (!tpl) return json({ error: 'unknown_event', event }, 400)

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
