// ─────────────────────────────────────────────────────────────────────────
// send-market-digest — εβδομαδιαίο ενημερωτικό για τα δεδομένα αγοράς (Euribor,
// επιτόκιο ΕΚΤ, επιτόκια στεγαστικών ΤτΕ) στους χρήστες που το θέλουν
// (email_marketing_prefs.market_news). Διαβάζει τις 2 πιο πρόσφατες εγγραφές του
// market_rates και στέλνει τις μεταβολές· αν δεν υπάρχει μεταβολή, δεν στέλνει.
//
// Ενεργοποίηση: κανένα χειροκίνητο μυστικό — το pg_cron καλεί με το service-role
// key (Authorization: Bearer, από το vault) και η authorized() το δέχεται.
// Προαιρετικά: RESEND_FROM (branded αποστολέας μετά την επαλήθευση domain).
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCron } from '../_shared/auth.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET    = Deno.env.get('MARKET_DIGEST_CRON_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'
const APP_URL        = Deno.env.get('APP_URL') || 'https://propertyos.gr'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const pct = (n: number | null | undefined) => n == null ? '—' : `${Number(n).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`

// Εξουσιοδότηση cron (zero-config): δέχεται (α) το service-role key (Bearer),
// (β) το προαιρετικό x-cron-secret env, ή (γ) το κοινό μυστικό cron από τη ΒΔ
// (public.cron_secrets) — η κύρια, μηδενικής-ρύθμισης οδός. Το pg_cron στέλνει
// την τιμή του πίνακα, το function την επαληθεύει με τον service-role client του.
async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })
}

const METRICS: { key: string; label: string }[] = [
  { key: 'euribor_3m', label: 'Euribor 3 μηνών' },
  { key: 'euribor_6m', label: 'Euribor 6 μηνών' },
  { key: 'euribor_12m', label: 'Euribor 12 μηνών' },
  { key: 'ecb_rate', label: 'Επιτόκιο ΕΚΤ' },
  { key: 'bog_housing_new', label: 'Επιτόκιο νέων στεγαστικών (ΤτΕ)' },
]

function rowHtml(label: string, cur: number | null, prev: number | null): string {
  const d = (cur != null && prev != null) ? cur - prev : null
  const arrow = d == null || Math.abs(d) < 0.001 ? '<span style="color:#80868b;">—</span>'
    : d > 0 ? `<span style="color:#d93025;">▲ ${pct(Math.abs(d))}</span>` : `<span style="color:#188038;">▼ ${pct(Math.abs(d))}</span>`
  return `<tr>
    <td style="padding:11px 0;border-bottom:1px solid #f1f3f4;font-size:13px;color:#3c4043;">${label}</td>
    <td style="padding:11px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-size:13px;font-weight:600;color:#111;">${pct(cur)}</td>
    <td style="padding:11px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-size:12px;">${arrow}</td>
  </tr>`
}

function layout(inner: string, unsubUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:22px;">
      <div style="width:34px;height:34px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;"><span style="color:#fff;font-weight:800;font-size:17px;">P</span></div>
      <span style="font-size:16px;font-weight:700;color:#111;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:26px 24px;">
      <p style="margin:0 0 4px;font-size:10.5px;color:#1a73e8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Δεδομένα αγοράς</p>
      <h1 style="margin:0 0 14px;font-size:20px;color:#111;font-weight:700;">Εβδομαδιαία ενημέρωση επιτοκίων</h1>
      <table style="width:100%;border-collapse:collapse;">${inner}</table>
      <p style="margin:16px 0 0;font-size:12px;color:#5f6368;line-height:1.6;">Χρήσιμο για την αξιολόγηση δανείων και αποδόσεων στο Property OS.</p>
    </div>
    <p style="text-align:center;font-size:11px;color:#80868b;margin:18px 0 4px;line-height:1.6;">
      <a href="${unsubUrl}" style="color:#80868b;text-decoration:underline;">Απεγγραφή από τα δεδομένα αγοράς</a> · Property OS
    </p>
  </div></body></html>`
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

  const { data: rows } = await supabase.from('market_rates')
    .select('euribor_3m,euribor_6m,euribor_12m,ecb_rate,bog_housing_new,updated_at')
    .order('updated_at', { ascending: false }).limit(2)
  if (!rows?.length) return json({ message: 'no_data' })
  const cur = rows[0] as Record<string, number | null>
  const prev = (rows[1] || {}) as Record<string, number | null>

  // Στείλε μόνο αν υπάρχει ουσιαστική μεταβολή σε κάποιο μέγεθος.
  const changed = METRICS.some(m => cur[m.key] != null && prev[m.key] != null && Math.abs((cur[m.key] as number) - (prev[m.key] as number)) >= 0.001)
  if (!changed) return json({ message: 'no_change' })

  const users = await listUsers()
  if (!users.length) return json({ message: 'no_users' })
  await supabase.from('email_marketing_prefs').upsert(users.map(u => ({ user_id: u.id })), { onConflict: 'user_id', ignoreDuplicates: true })
  const { data: prefs } = await supabase.from('email_marketing_prefs').select('user_id,market_news,unsubscribe_token')
  const prefMap = new Map((prefs || []).map((p: any) => [p.user_id, p]))
  const recipients = users.filter(u => prefMap.get(u.id)?.market_news !== false)
  if (!recipients.length) return json({ message: 'no_subscribers' })

  const inner = METRICS.map(m => rowHtml(m.label, cur[m.key], prev[m.key])).join('')
  const subject = 'Property OS — Εβδομαδιαία ενημέρωση επιτοκίων'

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
  return json({ sent, failed, recipients: recipients.length })
})
