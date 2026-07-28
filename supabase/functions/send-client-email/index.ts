// ─────────────────────────────────────────────────────────────────────────
// send-client-email — μαζική & αυτοματοποιημένη επικοινωνία με πελάτες μέσω
// Resend. Δέχεται θέμα + HTML + λίστα παραληπτών, στέλνει σε παρτίδες (batch API,
// έως 100/κλήση), κάνει personalization ({{name}}, {{email}}), βάζει reply-to τη
// διεύθυνση του ιδιοκτήτη (οι απαντήσεις πελατών πάνε σ' αυτόν) και καταγράφει
// αποτέλεσμα ανά παραλήπτη στους πίνακες email_campaigns / email_recipients.
//
// Ασφάλεια: εκτελείται με το JWT του καλούντος (RLS — γράφει μόνο δικές του
// εγγραφές). Το κλειδί Resend μένει server-side (secret), ποτέ στον browser.
//
// Ενεργοποίηση:
//   supabase secrets set RESEND_API_KEY=re_...           (κλειδί Resend)
//   supabase secrets set RESEND_FROM="Property OS <no-reply@to-domain-sou.gr>"
//   supabase functions deploy send-client-email
// ─────────────────────────────────────────────────────────────────────────
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON  = Deno.env.get('SUPABASE_ANON_KEY')!
// Env-driven αποστολέας: μόλις επαληθεύσεις domain στο Resend, όρισε το RESEND_FROM
// και ΟΛΑ τα emails φεύγουν από τη δική σου διεύθυνση, χωρίς αλλαγή κώδικα.
const FROM_EMAIL     = Deno.env.get('RESEND_FROM') || 'Property OS <onboarding@resend.dev>'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
const fill = (tpl: string, r: { name?: string; email: string }) =>
  tpl.replace(/\{\{\s*name\s*\}\}/g, r.name || '').replace(/\{\{\s*email\s*\}\}/g, r.email)

interface Recipient { email: string; name?: string; clientId?: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)
  if (!RESEND_API_KEY) return json({ error: 'no_resend_key', detail: 'Λείπει το RESEND_API_KEY στα secrets της function.' }, 500)

  let subject = '', bodyHtml = '', kind = 'broadcast', recipients: Recipient[] = []
  try {
    const b = await req.json()
    subject = String(b?.subject || '').trim()
    bodyHtml = String(b?.bodyHtml || b?.html || '')
    kind = String(b?.kind || 'broadcast')
    recipients = Array.isArray(b?.recipients) ? b.recipients : []
  } catch { return json({ error: 'bad_body' }, 400) }

  // Καθάρισμα/έλεγχος παραληπτών (έγκυρο email, χωρίς διπλότυπα).
  const seen = new Set<string>()
  recipients = recipients
    .map(r => ({ email: String(r?.email || '').trim().toLowerCase(), name: r?.name?.toString().trim(), clientId: r?.clientId }))
    .filter(r => isEmail(r.email) && !seen.has(r.email) && (seen.add(r.email), true))
  if (!subject) return json({ error: 'no_subject' }, 400)
  if (!recipients.length) return json({ error: 'no_recipients' }, 400)
  if (recipients.length > 2000) return json({ error: 'too_many', detail: 'Έως 2000 παραλήπτες ανά αποστολή.' }, 400)

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await supabase.auth.getUser()
  const user = userData?.user
  if (!user) return json({ error: 'unauthorized' }, 401)
  const replyTo = user.email || undefined

  // ── Anti-relay: recipients MUST be the caller's own CRM clients ──────────────
  // Without this, any authenticated account could send arbitrary HTML to an
  // arbitrary list under our sending domain. The caller's JWT already scopes
  // `clients` via RLS; we build the allow-set from it (+ the owner's own address
  // for self-tests) and silently drop anything else, reporting the count.
  const { data: myClients } = await supabase.from('clients').select('email').eq('user_id', user.id)
  const allow = new Set<string>(
    (myClients || []).map((c: { email: string | null }) => (c.email || '').trim().toLowerCase()).filter(Boolean),
  )
  if (user.email) allow.add(user.email.trim().toLowerCase())
  const requested = recipients.length
  recipients = recipients.filter(r => allow.has(r.email))
  const droppedNotClient = requested - recipients.length
  if (!recipients.length) {
    return json({ error: 'no_permitted_recipients', detail: 'Οι παραλήπτες πρέπει να είναι καταχωρημένοι πελάτες σου στο CRM.' }, 400)
  }

  // ── Anti-abuse: per-user rolling 24h volume cap ──────────────────────────────
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: recentCamps } = await supabase.from('email_campaigns')
    .select('recipient_count').eq('user_id', user.id).gte('created_at', since)
  const sent24h = (recentCamps || []).reduce((s: number, c: { recipient_count: number | null }) => s + (c.recipient_count || 0), 0)
  if (sent24h + recipients.length > 3000) {
    return json({ error: 'daily_cap', detail: 'Ξεπεράστηκε το ημερήσιο όριο αποστολών (3.000 παραλήπτες / 24ω).' }, 429)
  }

  // Καμπάνια + παραλήπτες (RLS — γράφει μόνο δικές του εγγραφές).
  const { data: camp, error: cErr } = await supabase.from('email_campaigns')
    .insert({ user_id: user.id, subject, body_html: bodyHtml, kind, recipient_count: recipients.length, status: 'sending' })
    .select('id').single()
  if (cErr || !camp) return json({ error: 'campaign_insert_failed', detail: cErr?.message }, 500)
  const campaignId = camp.id as string

  const recRows = recipients.map(r => ({ campaign_id: campaignId, user_id: user.id, client_id: r.clientId || null, email: r.email, name: r.name || null, status: 'pending' }))
  await supabase.from('email_recipients').insert(recRows)

  // Αποστολή σε παρτίδες των 100 (Resend batch API).
  let sent = 0, failed = 0
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100)
    const payload = chunk.map(r => ({
      from: FROM_EMAIL, to: r.email, subject: fill(subject, r), html: fill(bodyHtml, r),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }))
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const out = await res.json().catch(() => ({}))
      if (res.ok && Array.isArray(out?.data)) {
        for (let j = 0; j < chunk.length; j++) {
          const id = out.data[j]?.id || null
          sent++
          await supabase.from('email_recipients').update({ status: 'sent', resend_id: id, sent_at: new Date().toISOString() })
            .eq('campaign_id', campaignId).eq('email', chunk[j].email)
        }
      } else {
        const detail = (typeof out === 'object' ? JSON.stringify(out) : String(out)).slice(0, 400)
        for (const r of chunk) {
          failed++
          await supabase.from('email_recipients').update({ status: 'failed', error: detail })
            .eq('campaign_id', campaignId).eq('email', r.email)
        }
      }
    } catch (err) {
      for (const r of chunk) {
        failed++
        await supabase.from('email_recipients').update({ status: 'failed', error: String(err).slice(0, 400) })
          .eq('campaign_id', campaignId).eq('email', r.email)
      }
    }
  }

  const status = failed === 0 ? 'sent' : sent === 0 ? 'failed' : 'partial'
  await supabase.from('email_campaigns')
    .update({ sent_count: sent, failed_count: failed, status, sent_at: new Date().toISOString() })
    .eq('id', campaignId)

  return json({ campaignId, sent, failed, status, droppedNotClient })
})
