// Εξαγόμενο «busy» .ics των κρατήσεων ενός ακινήτου, για ΑΜΦΙΔΡΟΜΟ συγχρονισμό
// καναλιών ΧΩΡΙΣ partner API: το Airbnb/Booking/Vrbo κάνουν «Import calendar» αυτό
// το URL και μπλοκάρουν αυτόματα τις πιασμένες ημερομηνίες. Πρόσβαση μόνο με το
// μυστικό token του χρήστη: GET /bookings-feed?token=XXX&property=UUID.
// Ιδιωτικότητα: ΔΕΝ διαρρέει όνομα επισκέπτη — γενικό SUMMARY «Μη διαθέσιμο».
import { createClient } from 'npm:@supabase/supabase-js@2.110.8'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function esc(s: string) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n') }
function fold(line: string) { if (line.length <= 74) return line; const out: string[] = []; let s = line; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74) } out.push(s); return out.join('\r\n') }
const pad = (n: number) => String(n).padStart(2, '0')
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
function addDay(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const nd = new Date(Date.UTC(y, m - 1, d + days))
  return `${nd.getUTCFullYear()}${pad(nd.getUTCMonth() + 1)}${pad(nd.getUTCDate())}`
}

/** Η διαμονή, όσο τη χρειάζεται η ροή. Ήταν `any`: ένα ορθογραφικό σε όνομα
 *  πεδίου θα παρήγαγε σιωπηλά ημερολόγιο με λάθος ημερομηνίες. */
interface StayRow { id: string; check_in: string | null; check_out: string | null; channel?: string | null }

function veventLines(s: StayRow, stamp: string): string[] {
  if (!isDate(s.check_in)) return []
  const startYmd = String(s.check_in).replace(/-/g, '')
  // DTEND ολοήμερου = EXCLUSIVE (η ημέρα αναχώρησης) — hotel-style μπλοκάρισμα.
  const endYmd = isDate(s.check_out) && s.check_out > s.check_in ? String(s.check_out).replace(/-/g, '') : addDay(s.check_in, 1)
  const ch = (s.channel || '').toString()
  return [
    'BEGIN:VEVENT', `UID:stay-${s.id}@properwise`, `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${startYmd}`, `DTEND;VALUE=DATE:${endYmd}`,
    'SUMMARY:Μη διαθέσιμο',
    ...(ch ? [fold(`DESCRIPTION:${esc('Κανάλι: ' + ch)}`)] : []),
    'TRANSP:OPAQUE', 'STATUS:CONFIRMED', 'END:VEVENT',
  ]
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || ''
  const property = url.searchParams.get('property') || ''
  if (!token || token.length < 20) return new Response('Μη έγκυρο token', { status: 401 })

  // Enforce token expiry server-side (mirror of calendar-feed): a leaked/rotated token
  // must stop working. expires_at is set on issue; legacy NULL rows never expire.
  const { data: row } = await supabase.from('calendar_feed_tokens')
    .select('user_id, expires_at').eq('token', token).maybeSingle()
  if (!row?.user_id) return new Response('Δεν βρέθηκε', { status: 404 })
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return new Response('Το token έχει λήξει', { status: 401 })
  }

  let q = supabase.from('client_stays').select('id,check_in,check_out,channel').eq('user_id', row.user_id).order('check_in')
  if (property) q = q.eq('property_id', property)
  const { data: stays } = await q

  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PROPERWISE//Bookings Feed//EL', 'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH', 'X-WR-CALNAME:PROPERWISE · Κρατήσεις', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H',
  ]
  for (const s of stays || []) lines.push(...veventLines(s, now))
  lines.push('END:VCALENDAR')

  return new Response(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="krathseis.ics"',
      // Token-authorized personal data — must never sit in a shared/CDN cache.
      'Cache-Control': 'private, no-store',
    },
  })
})
