// ─────────────────────────────────────────────────────────────────────────────
// dispatch-message — the one hop that assigns a channel to a delivery.
//
// The cadence plan already decided WHAT and WHEN (one delivery per event, caps
// applied). This decides the medium: pickChannel(copyId, prefs) returns exactly
// one of email/viber/whatsapp/imessage based on the user's opt-ins. Email goes to
// send-lifecycle-email; messaging goes to the provider adapter. If a provider key
// is missing, it falls back to email — so nothing is ever double-sent and nothing
// is lost. This is the seam the drain calls instead of send-lifecycle directly,
// once channels are live.
//
// Env (optional, per channel): VIBER_TOKEN, WHATSAPP_TOKEN + WHATSAPP_PHONE_ID,
// IMESSAGE_API_URL + IMESSAGE_TOKEN (Apple Messages for Business via an MSP such as
// Sunshine Conversations). Absent → that channel falls back to email. Deploy:
// supabase functions deploy dispatch-message (verify_jwt=false).
//
// NO PUSH BRANCH HERE, AND THAT IS DELIBERATE. This function used to POST device
// tokens to fcm.googleapis.com/fcm/send — an endpoint Google decommissioned on
// 20 June 2024, fed by a `push_devices` table that no code ever wrote a row to.
// Web push now lives in the app itself (app/api/push/route.ts + lib/push/*), on
// the W3C standard with VAPID keys and no Google account: the browser gives the
// keys, the daily job encrypts and sends. `push` is therefore not a channel this
// dispatcher offers; a delivery that would have taken it takes email.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'
import { APP_URL } from '../_shared/site.ts'
import { MSG, pickChannel, renderViber, renderIMessage, renderWhatsApp, type ChannelPrefs } from '../_shared/messaging.ts'
import type { Personal } from '../_shared/emailTemplates.ts'
import { authorizeCron } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET  = Deno.env.get('LIFECYCLE_CRON_SECRET') || ''

const VIBER_TOKEN    = Deno.env.get('VIBER_TOKEN') || ''
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || ''
const WHATSAPP_PHONE = Deno.env.get('WHATSAPP_PHONE_ID') || ''
const IMESSAGE_URL   = Deno.env.get('IMESSAGE_API_URL') || ''
const IMESSAGE_TOKEN = Deno.env.get('IMESSAGE_TOKEN') || ''

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } })

async function authorized(req: Request): Promise<boolean> {
  return authorizeCron(req, { serviceKey: SERVICE_KEY, envSecret: CRON_SECRET, supabase })
}

async function sendEmail(copyId: string, email: string, name: string, params: Record<string, unknown>) {
  const secret = (await supabase.from('cron_secrets').select('secret').eq('name', 'email_cron').maybeSingle()).data?.secret || CRON_SECRET
  await fetch(`${SUPABASE_URL}/functions/v1/send-lifecycle-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret, 'Authorization': `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify({ copyId, email, name, params }),
  })
}

Deno.serve(async (req) => {
  if (!(await authorized(req))) return json({ error: 'unauthorized' }, 401)
  let b: Record<string, unknown> = {}
  try { b = await req.json() } catch { /* empty */ }
  const copyId = String(b.copyId || '').trim()
  const email = String(b.email || '').trim()
  const name = String(b.name || '')
  const userId = b.userId ? String(b.userId) : ''
  const params = (b.params && typeof b.params === 'object') ? b.params as Record<string, unknown> : {}
  if (!copyId || !email) return json({ error: 'missing_copyId_or_email' }, 400)

  // Opt-ins → channel prefs. No row / no userId → email-only.
  let prefs: ChannelPrefs = {}
  let phone = ''
  if (userId) {
    const { data } = await supabase.from('messaging_prefs')
      .select('wants_viber,wants_whatsapp,wants_imessage,phone_e164').eq('user_id', userId).maybeSingle()
    if (data) { prefs = { viber: data.wants_viber, whatsapp: data.wants_whatsapp, imessage: data.wants_imessage }; phone = data.phone_e164 || '' }
  }

  const channel = pickChannel(copyId, prefs)
  const url = `${APP_URL}/dashboard`

  // Build the short message (personalized) for the messaging channels.
  const personal = { name, appUrl: APP_URL, ...(params as Personal) } as Personal
  const msg = MSG[copyId] ? MSG[copyId](personal) : null

  try {
    if (channel === 'email' || !msg) { await sendEmail(copyId, email, name, params); return json({ channel: 'email' }) }

    if (channel === 'viber' && VIBER_TOKEN && phone) {
      const v = renderViber(msg, url)
      // Carry the CTA as a tappable open-url keyboard button — never drop v.action.
      const keyboard = v.action ? {
        Type: 'keyboard', DefaultHeight: false,
        Buttons: [{ Columns: 6, Rows: 1, BgColor: '#1a73e8', ActionType: 'open-url', ActionBody: v.action.url, Text: `<font color="#ffffff"><b>${v.action.text}</b></font>`, TextSize: 'medium' }],
      } : undefined
      await fetch('https://chatapi.viber.com/pa/send_message', {
        method: 'POST', headers: { 'X-Viber-Auth-Token': VIBER_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver: phone, min_api_version: 7, type: 'text', text: v.text, keyboard }),
      })
      return json({ channel: 'viber' })
    }
    if (channel === 'whatsapp' && WHATSAPP_TOKEN && WHATSAPP_PHONE && phone) {
      const w = renderWhatsApp(msg, copyId, url)
      await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'template', template: w.template }),
      })
      return json({ channel: 'whatsapp' })
    }
    if (channel === 'imessage' && IMESSAGE_URL && IMESSAGE_TOKEN && phone) {
      const im = renderIMessage(msg, url)
      // Generic MSP webhook (e.g. Sunshine Conversations): { recipient, text }.
      await fetch(IMESSAGE_URL, {
        method: 'POST', headers: { Authorization: `Bearer ${IMESSAGE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient: phone, type: 'text', text: im.text }),
      })
      return json({ channel: 'imessage' })
    }
    // Chosen channel not configured (missing key/phone/device) → email fallback.
    await sendEmail(copyId, email, name, params)
    return json({ channel: 'email', fallbackFrom: channel })
  } catch (e) {
    // Any provider error → email fallback, never a lost message.
    await sendEmail(copyId, email, name, params)
    return json({ channel: 'email', fallbackError: e instanceof Error ? e.message : String(e) })
  }
})
