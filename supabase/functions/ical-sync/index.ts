// ═══════════════════════════════════════════════════════════════════════════
// ical-sync — Πλήρης συγχρονισμός ημερολογίων Airbnb/Booking (iCal) από URL.
// Το κατέβασμα γίνεται server-side ώστε να ΠΑΡΑΚΑΜΠΤΕΤΑΙ το CORS του browser.
//
// Λειτουργίες (body.action):
//   • 'preview'  — κατεβάζει ένα URL και επιστρέφει τα events (χωρίς εγγραφή).
//   • 'sync'     — συγχρονίζει τους αποθηκευμένους συνδέσμους ΤΟΥ ΧΡΗΣΤΗ
//                  (προαιρετικά μόνο ενός ακινήτου) σε client_stays.
//   • 'sync-all' — συγχρονίζει ΟΛΟΥΣ τους ενεργούς συνδέσμους (για cron/service).
//
// Ασφάλεια:
//   • Λειτουργίες χρήστη: απαιτούν έγκυρο JWT (ταυτοποίηση μέσω getUser)· το
//     user_id προκύπτει από το token, ΔΕΝ γίνεται εμπιστοσύνη σε παράμετρο.
//   • sync-all: απαιτεί header x-cron-secret == ICAL_CRON_SECRET.
//   • Απλός έλεγχος SSRF: μπλοκάρει localhost/ιδιωτικά δίκτυα.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY')!
const CRON_SECRET  = Deno.env.get('ICAL_CRON_SECRET') || ''

const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-cron-secret',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── iCal parsing (καθρέφτης του lib/clients/ical.ts, μία πηγή αλήθειας λογικά) ──
function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const lines: string[] = []
  for (const l of raw) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && lines.length) lines[lines.length - 1] += l.slice(1)
    else lines.push(l)
  }
  return lines
}
function toIsoDate(val: string): string {
  const m = val.match(/(\d{4})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}
interface ICalEvent { uid: string; start: string; end: string; summary: string }
function parseICal(text: string): ICalEvent[] {
  const events: ICalEvent[] = []
  let cur: Partial<ICalEvent> | null = null
  for (const line of unfold(text || '')) {
    const t = line.trim()
    if (t === 'BEGIN:VEVENT') { cur = {}; continue }
    if (t === 'END:VEVENT') {
      if (cur && cur.start && cur.end && cur.end > cur.start) {
        events.push({ uid: (cur.uid || `${cur.start}_${cur.end}`).trim(), start: cur.start, end: cur.end, summary: (cur.summary || '').trim() })
      }
      cur = null; continue
    }
    if (!cur) continue
    const idx = t.indexOf(':')
    if (idx < 0) continue
    const key = t.slice(0, idx).toUpperCase()
    const val = t.slice(idx + 1)
    if (key.startsWith('DTSTART')) cur.start = toIsoDate(val)
    else if (key.startsWith('DTEND')) cur.end = toIsoDate(val)
    else if (key === 'SUMMARY') cur.summary = val.replace(/\\,/g, ',').replace(/\\n/gi, ' ').replace(/\\/g, '')
    else if (key === 'UID') cur.uid = val
  }
  return events
}
function nightsBetween(start: string, end: string): number {
  const a = new Date(start).getTime(), b = new Date(end).getTime()
  if (isNaN(a) || isNaN(b) || b <= a) return 0
  return Math.round((b - a) / 86400000)
}
function isBlocked(summary: string): boolean {
  const s = (summary || '').toLowerCase()
  return s.includes('not available') || s.includes('blocked') || s.includes('unavailable') || s.includes('μη διαθέσιμο')
}

// ── Ασφαλές κατέβασμα iCal (μπλοκάρει ιδιωτικά δίκτυα, ελέγχει περιεχόμενο) ──
// Αποτρέπει SSRF: (α) μόνο http/https, (β) απαγόρευση loopback/link-local/private
// σε IPv4 ΚΑΙ IPv6 (+ IPv4-mapped, + δεκαδικές/hex μορφές), (γ) οι redirects ΔΕΝ
// ακολουθούνται αυτόματα — κάθε hop επικυρώνεται ξανά με τον ίδιο έλεγχο.
// Checks a bare IP string (v4 or v6, in any encoding) against private/reserved ranges.
function isBlockedIp(ipRaw: string): boolean {
  let h = ipRaw.toLowerCase().trim()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1) // IPv6 literal
  // IPv6 loopback / unspecified / link-local (fe80::) / unique-local (fc00::/7)
  if (h === '::1' || h === '::' || /^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)) return true
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded v4
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (mapped) h = mapped[1]
  // Non-dotted numeric encodings (decimal / hex / octal) — reject outright
  if (/^0x[0-9a-f]+$/i.test(h) || /^\d{8,}$/.test(h)) return true
  // Dotted IPv4 private / loopback / link-local / carrier-grade-NAT / unspecified
  return h === '0.0.0.0'
    || /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)
    || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)   // 100.64.0.0/10 CGNAT
}
// Checks the hostname *string* (literal IPs + obvious internal names).
function isBlockedHost(hRaw: string): boolean {
  const h = hRaw.toLowerCase().trim()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  return isBlockedIp(h)
}
function assertSafeUrl(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('Μη έγκυρο URL') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Επιτρέπονται μόνο http/https')
  if (isBlockedHost(u.hostname)) throw new Error('Δεν επιτρέπεται εσωτερική διεύθυνση')
  return u
}
// Closes the DNS-rebinding SSRF gap: the string check above only inspects the
// hostname, but fetch() resolves DNS itself. So we resolve A/AAAA ourselves and
// reject if ANY resolved address is private/reserved — a public name that maps
// to 169.254.169.254 / 127.0.0.1 / an internal range never gets fetched.
async function assertResolvedSafe(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, '')
  // Literal IPs are already covered by isBlockedHost; only names need resolving.
  const isLiteral = /^[0-9.]+$/.test(host) || host.includes(':')
  if (isLiteral) return
  // Best-effort: if the runtime doesn't expose Deno.resolveDns, fall back to the
  // string-only check (no regression) rather than blocking every sync.
  if (typeof Deno?.resolveDns !== 'function') return
  const addrs: string[] = []
  let resolveFailed = false
  for (const kind of ['A', 'AAAA'] as const) {
    try { addrs.push(...await Deno.resolveDns(host, kind)) }
    catch (e) { if (!(e instanceof Deno.errors.NotFound)) resolveFailed = true }
  }
  // No A/AAAA record at all → refuse. A transient resolver error (not "no record")
  // shouldn't hard-fail a legitimate feed, so only block on an empty-but-clean result.
  if (addrs.length === 0 && !resolveFailed) throw new Error('Το όνομα δεν αναλύεται σε διεύθυνση')
  for (const ip of addrs) {
    if (isBlockedIp(ip)) throw new Error('Το όνομα δείχνει σε εσωτερική διεύθυνση')
  }
}
async function fetchIcal(url: string): Promise<string> {
  let current = assertSafeUrl(url).toString()
  let res: Response | null = null
  for (let hop = 0; hop < 5; hop++) {
    await assertResolvedSafe(new URL(current).hostname) // re-resolve & validate every hop
    res = await fetch(current, {
      headers: { 'User-Agent': 'PropertyOS-iCal/1.0', 'Accept': 'text/calendar, text/plain, */*' },
      redirect: 'manual',
    })
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error(`HTTP ${res.status} χωρίς Location`)
      current = assertSafeUrl(new URL(loc, current).toString()).toString() // re-validate every hop
      continue
    }
    break
  }
  if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? 'redirect loop'}`)
  const text = await res.text()
  if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('Το URL δεν επέστρεψε ημερολόγιο iCal')
  return text
}

interface Feed {
  id: string; user_id: string; property_id: string; channel: string; url: string; include_blocked: boolean
}

async function ensureChannelClient(userId: string, channel: string): Promise<string> {
  const name = channel === 'airbnb' ? 'Κρατήσεις Airbnb' : channel === 'booking' ? 'Κρατήσεις Booking' : 'Κρατήσεις καναλιού'
  const { data: existing } = await admin.from('clients').select('id')
    .eq('user_id', userId).eq('full_name', name).eq('type', 'client').limit(1).maybeSingle()
  if (existing) return (existing as { id: string }).id
  const { data, error } = await admin.from('clients').insert({
    user_id: userId, type: 'client', full_name: name, stage: 'closed',
    notes: 'Συγκεντρωτικός πελάτης για κρατήσεις που εισάγονται από iCal (χωρίς στοιχεία επισκέπτη).',
  }).select('id').single()
  if (error || !data) throw new Error(error?.message || 'client insert failed')
  return (data as { id: string }).id
}

async function syncFeed(feed: Feed): Promise<Record<string, unknown>> {
  try {
    const text = await fetchIcal(feed.url)
    const events = parseICal(text)
    const drafts = events
      .map(e => ({ start: e.start, end: e.end, nights: nightsBetween(e.start, e.end), blocked: isBlocked(e.summary), uid: e.uid }))
      .filter(d => d.nights > 0)
    const toImport = drafts.filter(d => feed.include_blocked || !d.blocked)

    const { data: existing } = await admin.from('client_stays')
      .select('property_id,check_in,check_out').eq('user_id', feed.user_id).eq('property_id', feed.property_id)
    const keys = new Set((existing || []).map((s: { property_id: string; check_in: string; check_out: string }) => `${s.property_id}|${s.check_in}|${s.check_out}`))
    const fresh = toImport.filter(d => !keys.has(`${feed.property_id}|${d.start}|${d.end}`))

    let inserted = 0
    if (fresh.length) {
      const clientId = await ensureChannelClient(feed.user_id, feed.channel)
      const rows = fresh.map(d => ({
        user_id: feed.user_id, client_id: clientId, property_id: feed.property_id,
        check_in: d.start, check_out: d.end, nights: d.nights, channel: feed.channel,
        notes: `Εισαγωγή iCal · ${d.uid}`,
      }))
      for (let i = 0; i < rows.length; i += 100) {
        const { error } = await admin.from('client_stays').insert(rows.slice(i, i + 100))
        if (error) throw new Error(error.message)
        inserted += rows.slice(i, i + 100).length
      }
    }
    const status = `ok: ${inserted} νέες, ${toImport.length - fresh.length} υπήρχαν`
    await admin.from('ical_feeds').update({ last_synced_at: new Date().toISOString(), last_status: status }).eq('id', feed.id)
    return { feedId: feed.id, ok: true, inserted, skipped: toImport.length - fresh.length, bookings: drafts.filter(d => !d.blocked).length }
  } catch (err) {
    await admin.from('ical_feeds').update({ last_synced_at: new Date().toISOString(), last_status: `error: ${String(err).slice(0, 200)}` }).eq('id', feed.id)
    return { feedId: feed.id, ok: false, error: String(err) }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = (body.action as string) || 'sync'
    const cronHeader = req.headers.get('x-cron-secret')

    // ── Cron/service: συγχρονισμός ΟΛΩΝ των ενεργών συνδέσμων ──
    if (action === 'sync-all' || cronHeader) {
      if (!CRON_SECRET || cronHeader !== CRON_SECRET) return json({ error: 'unauthorized' }, 401)
      const { data: feeds } = await admin.from('ical_feeds').select('*').eq('active', true)
      const results = []
      for (const f of (feeds || []) as Feed[]) results.push(await syncFeed(f))
      return json({ ok: true, feeds: results.length, results })
    }

    // ── Ταυτοποίηση χρήστη μέσω JWT ──
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Λείπει το token' }, 401)
    const authClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: userData, error: userErr } = await authClient.auth.getUser(token)
    if (userErr || !userData?.user) return json({ error: 'Μη έγκυρο token' }, 401)
    const userId = userData.user.id

    if (action === 'preview') {
      const url = String(body.url || '').trim()
      const text = await fetchIcal(url)
      const events = parseICal(text)
      const drafts = events
        .map(e => ({ start: e.start, end: e.end, nights: nightsBetween(e.start, e.end), blocked: isBlocked(e.summary), uid: e.uid }))
        .filter(d => d.nights > 0)
      return json({
        ok: true,
        count: drafts.length,
        bookings: drafts.filter(d => !d.blocked).length,
        blocks: drafts.filter(d => d.blocked).length,
        events: events.slice(0, 800),
      })
    }

    if (action === 'sync') {
      let q = admin.from('ical_feeds').select('*').eq('user_id', userId).eq('active', true)
      if (body.propertyId) q = q.eq('property_id', String(body.propertyId))
      const { data: feeds } = await q
      const results = []
      for (const f of (feeds || []) as Feed[]) results.push(await syncFeed(f))
      const inserted = results.reduce((s, r) => s + (Number(r.inserted) || 0), 0)
      return json({ ok: true, feeds: results.length, inserted, results })
    }

    return json({ error: 'Άγνωστη ενέργεια' }, 400)
  } catch (err) {
    return json({ error: String(err) }, 500)
  }
})
