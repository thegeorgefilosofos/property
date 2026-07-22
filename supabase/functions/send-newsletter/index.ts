// ─────────────────────────────────────────────────────────────────────────
// send-newsletter — αυτόματο newsletter «Νέες δυνατότητες» στους χρήστες. Ο cron
// το τρέχει· στέλνει branded digest για τις published & αδημοσίευτες (emailed_at
// null) ανακοινώσεις του πίνακα product_updates σε όλους τους εγγεγραμμένους
// χρήστες (soft opt-in) που ΔΕΝ έχουν απεγγραφεί (email_marketing_prefs.product_news).
// Κάθε email φέρει μοναδικό link απεγγραφής (GDPR).
//
// Ενεργοποίηση: κανένα χειροκίνητο μυστικό δεν χρειάζεται — το pg_cron καλεί τη
// function με το service-role key (Authorization: Bearer, από το vault) και η
// authorized() το δέχεται. Προαιρετικά: RESEND_FROM (branded αποστολέας μετά την
// επαλήθευση domain) & APP_URL (default: https://propertyos.gr).
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCron } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET    = Deno.env.get('NEWSLETTER_CRON_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'
const APP_URL        = Deno.env.get('APP_URL') || 'https://propertyos.gr'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const esc = (v: unknown) => String(v ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))

// Εξουσιοδότηση cron (zero-config): δέχεται (α) το service-role key (Bearer),
// (β) το προαιρετικό x-cron-secret env, ή (γ) το κοινό μυστικό cron από τη ΒΔ
// (public.cron_secrets) — η κύρια, μηδενικής-ρύθμισης οδός. Το pg_cron στέλνει
// την τιμή του πίνακα, το function την επαληθεύει με τον service-role client του.
async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })
}

interface Update { id: string; title: string; body_html: string; cta_label?: string; cta_url?: string }

function layout(inner: string, unsubUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:22px;">
      <div style="width:34px;height:34px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;">
        <span style="color:#fff;font-weight:800;font-size:17px;">P</span></div>
      <span style="font-size:16px;font-weight:700;color:#111;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:26px 24px;">
      <p style="margin:0 0 4px;font-size:10.5px;color:#1a73e8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Νέες δυνατότητες</p>
      ${inner}
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin:18px 0 4px;line-height:1.6;">
      Λαμβάνεις αυτό το email ως χρήστης του Property OS.<br>
      <a href="${unsubUrl}" style="color:#80868b;text-decoration:underline;">Απεγγραφή από τα ενημερωτικά</a> · Property OS
    </p>
  </div></body></html>`
}

function updateBlock(u: Update): string {
  const cta = u.cta_url ? `<p style="margin:12px 0 0;"><a href="${esc(u.cta_url)}" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:9px 16px;border-radius:8px;">${esc(u.cta_label || 'Δες περισσότερα')}</a></p>` : ''
  return `<div style="padding:16px 0;border-top:1px solid #f1f3f4;">
    <h2 style="margin:0 0 6px;font-size:17px;color:#111;font-weight:700;letter-spacing:-0.2px;">${esc(u.title)}</h2>
    <div style="font-size:14px;color:#3c4043;line-height:1.65;">${u.body_html || ''}</div>${cta}
  </div>`
}

async function listUsers(): Promise<{ id: string; email: string }[]> {
  const out: { id: string; email: string }[] = []
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) break
    for (const u of data.users) if (u.email && u.email_confirmed_at) out.push({ id: u.id, email: u.email })
    if (data.users.length < 1000) break
  }
  return out
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)
  if (!RESEND_API_KEY) return json({ error: 'no_resend_key' }, 500)

  const { data: updates } = await supabase.from('product_updates')
    .select('id,title,body_html,cta_label,cta_url').eq('published', true).is('emailed_at', null).order('created_at', { ascending: true })
  if (!updates?.length) return json({ message: 'no_updates' })

  const users = await listUsers()
  if (!users.length) return json({ message: 'no_users' })

  // Εξασφάλισε γραμμή προτιμήσεων (default: εγγεγραμμένος) → μοναδικό token ανά χρήστη.
  await supabase.from('email_marketing_prefs').upsert(users.map(u => ({ user_id: u.id })), { onConflict: 'user_id', ignoreDuplicates: true })
  const { data: prefs } = await supabase.from('email_marketing_prefs').select('user_id,product_news,unsubscribe_token')
  const prefMap = new Map((prefs || []).map((p: any) => [p.user_id, p]))
  const recipients = users.filter(u => prefMap.get(u.id)?.product_news !== false)
  if (!recipients.length) return json({ message: 'no_subscribers' })

  const inner = (updates as Update[]).map(updateBlock).join('')
  const subject = updates.length === 1 ? `Property OS — ${updates[0].title}` : `Property OS — ${updates.length} νέες δυνατότητες`

  let sent = 0, failed = 0
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100)
    const payload = chunk.map(u => ({
      from: FROM_EMAIL, to: u.email, subject,
      html: layout(inner, `${APP_URL}/unsubscribe/${prefMap.get(u.id)?.unsubscribe_token}`),
    }))
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) sent += chunk.length; else failed += chunk.length
    } catch { failed += chunk.length }
  }

  await supabase.from('product_updates').update({ emailed_at: new Date().toISOString() }).in('id', (updates as Update[]).map(u => u.id))
  return json({ sent, failed, updates: updates.length, recipients: recipients.length })
})
