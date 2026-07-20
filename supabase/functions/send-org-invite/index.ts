// ─────────────────────────────────────────────────────────────────────────
// send-org-invite — στέλνει πραγματικό email πρόσκλησης σε νέο μέλος ομάδας.
// Καλείται από την εφαρμογή (ο ιδιοκτήτης του οργανισμού) αμέσως μετά το
// invite_org_member. Η πρόσκληση στη βάση παραμένει η πηγή αλήθειας· αυτό το
// email είναι η φιλική ειδοποίηση προς τον προσκεκλημένο.
//
// Ασφάλεια (least privilege): εκτελείται με το JWT του καλούντος (όχι service
// role). Επιβεβαιώνει ότι ο καλών είναι ιδιοκτήτης οργανισμού και ότι το email
// ανήκει όντως σε προσκεκλημένο μέλος του (RLS), ώστε να μη γίνεται εργαλείο
// αποστολής σε αυθαίρετες διευθύνσεις.
//
// Ενεργοποίηση:
//   supabase functions deploy send-org-invite
//   (RESEND_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY υπάρχουν ήδη)
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY')!
const FROM_EMAIL     = 'Property OS <onboarding@resend.dev>'
const SIGNUP_URL     = 'https://propertyos-psi.vercel.app/signup'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const roleLabel = (r: string) => (r === 'admin' ? 'Διαχειριστής' : 'Μέλος')
const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string))

function inviteEmail(orgName: string, inviter: string, role: string): { subject: string; html: string } {
  const org = orgName ? esc(orgName) : 'μια ομάδα στο Property OS'
  const who = inviter ? esc(inviter) : 'Ο διαχειριστής της ομάδας'
  const subject = `Πρόσκληση στο Property OS${orgName ? ` — ${esc(orgName)}` : ''}`
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:24px;">
      <div style="width:36px;height:36px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#ffffff;font-weight:800;font-size:18px;">P</span>
      </div>
      <span style="font-size:16px;font-weight:700;color:#202124;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#ffffff;border:1px solid #e8eaed;border-radius:14px;padding:28px 24px;">
      <p style="margin:0 0 6px;font-size:11px;color:#1a73e8;font-family:monospace;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Πρόσκληση σε ομάδα</p>
      <h1 style="margin:0 0 12px;font-size:22px;color:#202124;font-weight:800;letter-spacing:-0.5px;">Προσκλήθηκες στο ${org}</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#5f6368;line-height:1.6;">
        ${who} σε προσκάλεσε να συνεργαστείς στο Property OS με ρόλο <strong style="color:#202124;">${roleLabel(role)}</strong>.
        Δημιούργησε λογαριασμό με αυτό το email και θα βρεις την ομάδα να σε περιμένει, με πρόσβαση στα ακίνητα του χαρτοφυλακίου.
      </p>
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${SIGNUP_URL}" style="display:inline-block;background:#1a73e8;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:100px;font-weight:700;font-size:14px;">Δημιουργία λογαριασμού</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin-top:20px;">Property OS · Έλαβες αυτό το email επειδή προστέθηκες σε ομάδα. Αν δεν το περίμενες, αγνόησέ το.</p>
  </div>
  </body></html>`
  return { subject, html }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

  let email = ''
  try { const body = await req.json(); email = String(body?.email || '').trim().toLowerCase() } catch { /* no body */ }
  if (!email || !email.includes('@')) return json({ error: 'invalid_email' }, 400)

  // Client με το JWT του καλούντος: όλα τα queries περνούν από RLS.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } })

  const { data: userData } = await supabase.auth.getUser()
  const inviter = userData?.user?.email || ''
  if (!userData?.user) return json({ error: 'unauthorized' }, 401)

  // Ο καλών πρέπει να είναι ιδιοκτήτης οργανισμού (RLS: owner-only select).
  const { data: orgRow } = await supabase
    .from('organizations').select('id, name').eq('owner_user_id', userData.user.id).maybeSingle()
  if (!orgRow) return json({ error: 'not_owner' }, 403)

  // Το email πρέπει να είναι όντως προσκεκλημένο μέλος αυτού του οργανισμού.
  const { data: member } = await supabase
    .from('organization_members').select('role, status').eq('org_id', orgRow.id).eq('email', email).maybeSingle()
  if (!member) return json({ error: 'not_a_member' }, 404)

  const { subject, html } = inviteEmail(orgRow.name || '', inviter, member.role || 'member')
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to: email, subject, html }),
    })
    if (!res.ok) return json({ error: 'send_failed' }, 502)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
  return json({ sent: true })
})
