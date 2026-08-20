// ─────────────────────────────────────────────────────────────────────────
// notify-mobile-launch — εφάπαξ αποστολή ενημερωτικού email στη λίστα αναμονής
// του Property OS Mobile, ΤΗΝ ΗΜΕΡΑ ΚΥΚΛΟΦΟΡΙΑΣ. Διαβάζει όσους πάτησαν
// «Ειδοποίησέ με μόλις βγει» (mobile_waitlist, notified_at IS NULL), στέλνει το
// email μέσω Resend και σημειώνει notified_at ώστε να μη σταλεί δεύτερη φορά.
//
// Ασφάλεια (least privilege): απαιτεί σωστό x-cron-secret (MOBILE_LAUNCH_SECRET).
// Το service-role key μένει ΜΟΝΟ μέσα στο function. Τρέχει χειροκίνητα στο launch
// (όχι pg_cron) — μπορεί να ξανακληθεί με ασφάλεια (μόνο τους μη-ειδοποιημένους).
//
// Ενεργοποίηση (μία φορά, όταν βγει η εφαρμογή):
//   supabase secrets set MOBILE_LAUNCH_SECRET="<τυχαίο-μακρύ-μυστικό>"
//   supabase functions deploy notify-mobile-launch
//   curl -X POST "https://<PROJECT_REF>.functions.supabase.co/notify-mobile-launch" \
//        -H "x-cron-secret: <το-ίδιο-μυστικό>" -H "Content-Type: application/json" \
//        -d '{"limit":200}'
//   (Επανάλαβε μέχρι το "sent" να γίνει 0 — στέλνει σε παρτίδες.)
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { APP_URL as SITE } from '../_shared/site.ts'
import { timingSafeEqual } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LAUNCH_SECRET  = Deno.env.get('MOBILE_LAUNCH_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'
const APP_URL        = `${SITE}/dashboard`
const IOS_URL        = 'https://apps.apple.com/app/property-os'
const ANDROID_URL    = 'https://play.google.com/store/apps/details?id=com.propertyos'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function launchEmail(): { subject: string; html: string } {
  const subject = 'Το Property OS Mobile κυκλοφόρησε'
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff;font-weight:800;font-size:18px;">P</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#202124;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#1a73e8;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Μόλις κυκλοφόρησε</p>
      <h1 style="margin:0 0 12px;font-size:22px;color:#202124;font-weight:800;letter-spacing:-0.5px;">Το Property OS Mobile είναι εδώ</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#5f6368;line-height:1.6;">
        Ζήτησες να μάθεις πρώτος. Η εφαρμογή για κινητό είναι πλέον διαθέσιμη: όλη η διαχείριση των ακινήτων σου στο κινητό, με λίγα κλικ ή τη φωνή σου. Απλά και γρήγορα, όπου κι αν βρίσκεσαι.
      </p>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${IOS_URL}" style="display:inline-block;background:#202124;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:100px;font-weight:700;font-size:14px;margin:4px;">App Store</a>
        <a href="${ANDROID_URL}" style="display:inline-block;background:#202124;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:100px;font-weight:700;font-size:14px;margin:4px;">Google Play</a>
      </div>
      <div style="text-align:center;margin-top:16px;">
        <a href="${APP_URL}" style="font-size:13px;color:#1a73e8;text-decoration:none;font-weight:600;">ή συνέχισε από τον υπολογιστή</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">Property OS · Λαμβάνεις αυτό το email επειδή ζήτησες ειδοποίηση για την εφαρμογή.</p>
  </div>
  </body></html>`
  return { subject, html }
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
    })
    return res.ok
  } catch { return false }
}

Deno.serve(async (req) => {
  const header = req.headers.get('x-cron-secret') || ''
  if (!LAUNCH_SECRET || !timingSafeEqual(header, LAUNCH_SECRET)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let limit = 200
  try { const body = await req.json(); if (body?.limit) limit = Math.min(500, Math.max(1, Number(body.limit))); } catch { /* no body */ }

  try {
    const { data: rows } = await supabase
      .from('mobile_waitlist')
      .select('user_id, email')
      .is('notified_at', null)
      .not('email', 'is', null)
      .limit(limit)

    if (!rows?.length) {
      return new Response(JSON.stringify({ message: 'Κανένας εκκρεμής παραλήπτης', sent: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    const { subject, html } = launchEmail()
    const sentIds: string[] = []
    let failed = 0
    for (const r of rows) {
      const ok = await sendEmail(r.email as string, subject, html)
      if (ok) sentIds.push(r.user_id as string)
      else failed++
    }

    if (sentIds.length) {
      await supabase.from('mobile_waitlist').update({ notified_at: new Date().toISOString() }).in('user_id', sentIds)
    }

    return new Response(JSON.stringify({ success: true, sent: sentIds.length, failed }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
