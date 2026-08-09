// ─────────────────────────────────────────────────────────────────────────
// send-monthly-statements — αυτόματη μηνιαία κατάσταση εισπράξεων ενοικίων στον
// ιδιοκτήτη. Ο cron το τρέχει την 1η κάθε μήνα· για τον ΠΡΟΗΓΟΥΜΕΝΟ μήνα συνθέτει
// ανά ιδιοκτήτη μια καθαρή, branded κατάσταση (ανά ακίνητο/ενοικιαστή: αναμενόμενο,
// εισπραχθέν, κατάσταση + σύνολα) και τη στέλνει στο reminder_email του. Η ίδια
// κατάσταση είναι ήδη διαθέσιμη ζωντανά μέσα στην εφαρμογή/portal.
//
// Αυθεντικοποίηση (zero-config): x-cron-secret ή Authorization: Bearer, που
// επαληθεύεται με το κοινό μυστικό του πίνακα public.cron_secrets (ίδιο μοτίβο με
// τα υπόλοιπα cron functions). Δεν χρειάζεται κανένα χειροκίνητο μυστικό.
//
// Deploy: supabase functions deploy send-monthly-statements  (verify_jwt=false)
// Χρειάζεται RESEND_API_KEY (υπάρχει) + προαιρετικά RESEND_FROM (branded αποστολέας).
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { authorizeCron } from '../_shared/auth.ts'
import { eur } from '../_shared/format.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET    = Deno.env.get('MONTHLY_STATEMENTS_CRON_SECRET') || ''
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'
const APP_URL        = Deno.env.get('APP_URL') || 'https://propertyos.gr'

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })
const MONTHS = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου']

// Εξουσιοδότηση cron (zero-config): service-role bearer, ή x-cron-secret env, ή το
// κοινό μυστικό του πίνακα cron_secrets (το στέλνει το pg_cron).
async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })
}

interface Rent { property_id: string | null; tenant_id: string | null; amount: number | null; paid: boolean | null }

function statementHtml(ownerRows: { primary: string; secondary: string; expected: number; paid: number }[], expected: number, collected: number, periodLabel: string): string {
  const outstanding = Math.max(0, expected - collected)
  const rows = ownerRows.map(r => {
    const status = r.expected === 0 ? '—' : r.paid >= r.expected ? 'Πλήρης' : r.paid > 0 ? 'Μερική' : 'Εκκρεμεί'
    const color = r.paid >= r.expected ? '#188038' : r.paid > 0 ? '#b8860b' : '#d93025'
    return `<tr>
      <td style="padding:11px 0;border-bottom:1px solid #f1f3f4;">
        <span style="display:block;font-size:13px;color:#202124;font-weight:500;">${r.primary}</span>
        <span style="display:block;font-size:11px;color:#80868b;">${r.secondary}</span>
      </td>
      <td style="padding:11px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-size:13px;color:#3c4043;">${eur(r.paid)} / ${eur(r.expected)}</td>
      <td style="padding:11px 0;border-bottom:1px solid #f1f3f4;text-align:right;font-size:12px;font-weight:700;color:${color};">${status}</td>
    </tr>`
  }).join('')
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f3f4;font-family:-apple-system,'Inter',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="display:flex;align-items:center;margin-bottom:22px;">
      <div style="width:34px;height:34px;background:#1a73e8;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;"><span style="color:#fff;font-weight:800;font-size:17px;">P</span></div>
      <span style="font-size:16px;font-weight:700;color:#111;margin-left:10px;">Property OS</span>
    </div>
    <div style="background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:26px 24px;">
      <p style="margin:0 0 4px;font-size:10.5px;color:#1a73e8;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">Μηνιαία κατάσταση</p>
      <h1 style="margin:0 0 4px;font-size:20px;color:#111;font-weight:700;">Εισπράξεις ${periodLabel}</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#5f6368;">Εισπράχθηκαν <b>${eur(collected)}</b> από ${eur(expected)}${outstanding > 0 ? ` · ανείσπρακτα <b style="color:#d93025;">${eur(outstanding)}</b>` : ''}.</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:0 0 6px;font-size:10px;color:#80868b;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #d0d5dd;">Ακίνητο / Ενοικιαστής</td><td style="padding:0 0 6px;text-align:right;font-size:10px;color:#80868b;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #d0d5dd;">Εισπρ. / Αναμ.</td><td style="padding:0 0 6px;text-align:right;font-size:10px;color:#80868b;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #d0d5dd;">Κατάσταση</td></tr>
        ${rows}
        <tr><td style="padding:12px 0 0;font-size:13px;font-weight:700;color:#111;">Σύνολο</td><td style="padding:12px 0 0;text-align:right;font-size:13px;font-weight:700;color:#111;">${eur(collected)} / ${eur(expected)}</td><td></td></tr>
      </table>
      <div style="text-align:center;margin-top:22px;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;background:#1a73e8;color:#fff;text-decoration:none;padding:11px 24px;border-radius:100px;font-weight:700;font-size:13px;">Άνοιγμα στο Property OS</a>
      </div>
    </div>
    <p style="text-align:center;font-size:11px;color:#5f6368;margin:16px 0 0;line-height:1.6;">Ενημερωτική κατάσταση με βάση τα δεδομένα σου. Δεν αποτελεί επίσημο λογιστικό ή φορολογικό έγγραφο.</p>
    <p style="text-align:center;font-size:11px;color:#80868b;margin:8px 0 4px;line-height:1.6;">Αυτόματη μηνιαία κατάσταση · Property OS</p>
  </div></body></html>`
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)
  if (!RESEND_API_KEY) return json({ error: 'no_resend_key' }, 500)

  // Προηγούμενος μήνας.
  const now = new Date()
  let py = now.getUTCFullYear(), pm = now.getUTCMonth() // getUTCMonth: 0-11 → ο προηγούμενος μήνας (1-based) είναι ίδιος αριθμός
  if (pm === 0) { py -= 1; pm = 12 }
  const periodLabel = `${MONTHS[pm - 1]} ${py}`
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()

  const { data: prefs } = await supabase.from('notification_preferences').select('user_id,reminder_email').eq('email_enabled', true)
  if (!prefs?.length) return json({ message: 'no_users' })

  let sent = 0, skipped = 0, failed = 0
  for (const pref of prefs as { user_id: string; reminder_email: string | null }[]) {
    if (!pref.reminder_email) { skipped++; continue }

    // Idempotency: αν έχει ήδη σταλεί κατάσταση αυτόν τον μήνα, παράλειψε.
    const { data: already } = await supabase.from('notification_log')
      .select('id').eq('user_id', pref.user_id).eq('reminder_type', 'monthly_statement').gte('created_at', monthStart).limit(1)
    if (already?.length) { skipped++; continue }

    const { data: rentData } = await supabase.from('rent_payments')
      .select('property_id,tenant_id,amount,paid').eq('user_id', pref.user_id).eq('period_year', py).eq('period_month', pm)
    const rents = (rentData || []) as Rent[]
    if (!rents.length) { skipped++; continue }

    // Batched ονόματα ακινήτων/ενοικιαστών.
    const propIds = [...new Set(rents.map(r => r.property_id).filter((v): v is string => v != null))]
    const tenantIds = [...new Set(rents.map(r => r.tenant_id).filter((v): v is string => v != null))]
    const propMap: Record<string, string> = {}, tenMap: Record<string, string> = {}
    if (propIds.length) { const { data } = await supabase.from('user_properties').select('id,name').in('id', propIds); for (const p of data || []) propMap[p.id] = p.name }
    if (tenantIds.length) { const { data } = await supabase.from('tenants').select('id,full_name').in('id', tenantIds); for (const t of data || []) tenMap[t.id] = t.full_name }

    const rows = rents.map(r => {
      const prop = r.property_id ? propMap[r.property_id] : null
      const ten = r.tenant_id ? tenMap[r.tenant_id] : null
      return { primary: prop || ten || 'Ενοίκιο', secondary: [prop && ten ? ten : null].filter(Boolean).join(' · ') || 'Μίσθωμα', expected: Number(r.amount) || 0, paid: r.paid ? (Number(r.amount) || 0) : 0 }
    })
    const expected = rows.reduce((s, r) => s + r.expected, 0)
    const collected = rows.reduce((s, r) => s + r.paid, 0)

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: FROM_EMAIL, to: pref.reminder_email, subject: `Property OS · Μηνιαία κατάσταση ${periodLabel}`, html: statementHtml(rows, expected, collected, periodLabel) }),
      })
      if (res.ok) {
        sent++
        await supabase.from('notification_log').insert({ user_id: pref.user_id, event_id: null, reminder_type: 'monthly_statement', created_at: new Date().toISOString() })
      } else { failed++ }
    } catch { failed++ }
  }

  return json({ sent, skipped, failed, period: periodLabel })
})
