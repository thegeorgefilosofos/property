// Ζωντανό .ics feed ημερολογίου (webcal). Το εξωτερικό ημερολόγιο (Google/Apple/
// Outlook) το διαβάζει περιοδικά και ενημερώνεται μόνο του. Πρόσβαση μόνο με το
// μυστικό token του χρήστη: GET /calendar-feed?token=XXX[&property=UUID].
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const CAT_LABELS: Record<string, string> = {
  financial: 'Οικονομικά', bills: 'Λογαριασμοί', maintenance: 'Συντήρηση',
  contract: 'Συμβόλαιο', tenant: 'Ενοικιαστής', reminder: 'Υπενθύμιση',
}

function esc(s: string) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n') }
function fold(line: string) { if (line.length <= 74) return line; const out: string[] = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74) } out.push(s); return out.join('\r\n') }
const pad = (n: number) => String(n).padStart(2, '0')

function veventLines(e: any, stamp: string): string[] {
  const cat = CAT_LABELS[e.category] || e.category || ''
  const time: string | null = e.event_time || null
  const dur: number = Number.isFinite(e.duration_minutes) && e.duration_minutes > 0 ? e.duration_minutes : 60
  const ymd = String(e.event_date).replace(/-/g, '')
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@property-os`, `DTSTAMP:${stamp}`]
  if (time && /^\d{1,2}:\d{2}$/.test(time)) {
    const [h, m] = time.split(':').map(Number)
    const startMin = h * 60 + m, endMin = startMin + dur
    const endYmd = endMin >= 1440 ? (() => { const [Y, M, D] = String(e.event_date).split('-').map(Number); const d = new Date(Date.UTC(Y, M - 1, D + Math.floor(endMin / 1440))); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` })() : ymd
    const em = endMin % 1440
    lines.push(`DTSTART:${ymd}T${pad(h)}${pad(m)}00`, `DTEND:${endYmd}T${pad(Math.floor(em / 60))}${pad(em % 60)}00`)
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd}`, `DTEND;VALUE=DATE:${ymd}`)
  }
  const desc = [e.notes || '', e.amount ? `Ποσό: ${Number(e.amount).toLocaleString('el-GR')} €` : ''].filter(Boolean).join(', ')
  lines.push(fold(`SUMMARY:${esc((cat ? `${cat}: ` : '') + (e.title || 'Γεγονός'))}`))
  if (desc) lines.push(fold(`DESCRIPTION:${esc(desc)}`))
  if (cat) lines.push(`CATEGORIES:${esc(cat)}`)
  lines.push(`STATUS:${e.status === 'paid' ? 'CONFIRMED' : 'TENTATIVE'}`)
  lines.push('BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(e.title || 'Υπενθύμιση')}`), 'END:VALARM')
  lines.push('END:VEVENT')
  return lines
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || ''
  const property = url.searchParams.get('property') || ''
  if (!token || token.length < 20) return new Response('Μη έγκυρο token', { status: 401 })

  // Enforce token expiry server-side: a leaked/rotated feed token must stop working.
  // expires_at is set on issue (see migration); tolerate legacy NULL rows (never-expiring)
  // by filtering only when a value exists — checked in code so one query stays index-simple.
  const { data: row } = await supabase.from('calendar_feed_tokens')
    .select('user_id, expires_at').eq('token', token).maybeSingle()
  if (!row?.user_id) return new Response('Δεν βρέθηκε', { status: 404 })
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return new Response('Το token έχει λήξει', { status: 401 })
  }

  let q = supabase.from('calendar_events').select('*').eq('user_id', row.user_id).order('event_date')
  if (property) q = q.eq('property_id', property)
  const { data: events } = await q

  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Property OS//Calendar Feed//EL', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:Property OS', 'X-WR-TIMEZONE:Europe/Athens', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
  ]
  for (const e of events || []) lines.push(...veventLines(e, now))
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="property-os.ics"',
      // Token-authorized personal data — must never sit in a shared/CDN cache.
      'Cache-Control': 'private, no-store',
    },
  })
})
