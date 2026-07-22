// ─────────────────────────────────────────────────────────────────────────
// send-test-notification — στέλνει ΠΡΑΓΜΑΤΙΚΟ δοκιμαστικό email ειδοποίησης, ώστε
// ο χρήστης να επιβεβαιώσει ότι όντως φτάνει στα εισερχόμενά του (όχι απλός
// έλεγχος μορφής). Καλείται από τις Ρυθμίσεις → Ειδοποιήσεις («Δοκιμή»).
//
// Ασφάλεια: εκτελείται με το JWT του καλούντος (όχι service role). Στέλνει ΕΝΑ
// email στη διεύθυνση που όρισε ο ίδιος ο συνδεδεμένος χρήστης.
//
// Ενεργοποίηση:
//   supabase functions deploy send-test-notification
//   (RESEND_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY υπάρχουν ήδη)
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY')!
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

function testEmailHtml(): { subject: string; html: string } {
  const subject = 'Δοκιμαστική ειδοποίηση από το Property OS'
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff;font-weight:800;font-size:18px;">P</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#202124;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#1a73e8;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Δοκιμή</p>
      <h1 style="margin:0 0 12px;font-size:22px;color:#202124;font-weight:800;letter-spacing:-0.5px;">Οι ειδοποιήσεις σου δουλεύουν</h1>
      <p style="margin:0;font-size:14px;color:#5f6368;line-height:1.6;">
        Αυτό είναι ένα δοκιμαστικό email. Αν το βλέπεις, η διεύθυνσή σου είναι σωστή και θα λαμβάνεις κανονικά τις υπενθυμίσεις για ενοίκια, λογαριασμούς και γεγονότα του ημερολογίου σου.
      </p>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">Property OS · Δοκιμαστικό μήνυμα που ζήτησες από τις ρυθμίσεις.</p>
  </div>
  </body></html>`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await supabase.auth.getUser()
  if (!userData?.user) return json({ error: 'unauthorized' }, 401)

  // The recipient is ALWAYS the authenticated user's own account address — never a
  // body-supplied value — so this cannot be abused to email arbitrary people.
  const email = String(userData.user.email || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'invalid_email' }, 400)

  if (!RESEND_API_KEY) return json({ error: 'no_resend_key', detail: 'Λείπει το RESEND_API_KEY στα secrets της function.' }, 500)

  const { subject, html } = testEmailHtml()
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    })
    if (!res.ok) {
      // Επίστρεψε το πραγματικό μήνυμα του Resend (π.χ. sandbox: μόνο η δική σου
      // διεύθυνση επιτρέπεται χωρίς επαληθευμένο domain), για σαφή διάγνωση.
      const detail = await res.text().catch(() => '')
      return json({ error: 'send_failed', status: res.status, detail: detail.slice(0, 500) }, 502)
    }
  } catch (err) {
    return json({ error: 'fetch_failed', detail: String(err) }, 500)
  }
  return json({ sent: true })
})
