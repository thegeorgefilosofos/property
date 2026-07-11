// Καθαρή μετατροπή κρατήσεων βραχυχρόνιας μίσθωσης (client_stays) σε γεγονότα
// ημερολογίου: check-in + check-out ανά κράτηση, με το όνομα της κράτησης/επισκέπτη.
// Χωρίς I/O ώστε να δοκιμάζεται ντετερμινιστικά· η άντληση/εγγραφή γίνεται στο UI.

export interface StayInput {
  id: string
  check_in: string                 // YYYY-MM-DD
  check_out?: string | null        // YYYY-MM-DD
  total?: number | null
  nights?: number | null
  guests?: number | null
  channel?: string | null          // airbnb | booking | other
  guest_name?: string | null       // από clients.full_name (ή null)
}

export interface BookingCalRow {
  property_id: string; user_id: string; title: string; category: string
  event_date: string; amount: number | null; priority: string; status: string
  recurring: boolean; recurring_interval: string | null; source: string; notes: string | null
}

const CHANNELS: Record<string, string> = { airbnb: 'Airbnb', booking: 'Booking.com', vrbo: 'Vrbo', other: 'Κράτηση' }

export function channelLabel(channel?: string | null): string {
  return CHANNELS[(channel || '').toLowerCase()] || 'Κράτηση'
}

// Καθαρίζει το «Κρατήσεις Airbnb»/«Booking» aggregate όνομα (από αυτόματο import)
// ώστε να μη δείχνει τεχνικό placeholder αντί για πραγματικό επισκέπτη.
export function guestLabel(stay: StayInput): string {
  const n = (stay.guest_name || '').trim()
  const ch = channelLabel(stay.channel)
  if (!n) return `${ch} κράτηση`
  if (/^κρατήσεις/i.test(n) || n.toLowerCase() === ch.toLowerCase()) return `${ch} κράτηση`
  return n
}

// Έγκυρη «YYYY-MM-DD»;
function validDate(s?: string | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

// Δύο γεγονότα ανά κράτηση (check-in με ποσό/λεπτομέρειες, check-out). Ολοήμερα.
// source: `booking:{id}:in|out` για idempotent αντικατάσταση.
export function buildBookingEvents(stays: StayInput[], propertyId: string, userId: string): BookingCalRow[] {
  const rows: BookingCalRow[] = []
  for (const s of stays || []) {
    if (!s || !validDate(s.check_in)) continue
    const guest = guestLabel(s)
    const ch = channelLabel(s.channel)
    const nights = s.nights || (validDate(s.check_out) ? nightsBetween(s.check_in, s.check_out) : null)
    const detail = [ch, nights ? `${nights} ${nights === 1 ? 'νύχτα' : 'νύχτες'}` : '', s.guests ? `${s.guests} άτομα` : '']
      .filter(Boolean).join(' · ')
    rows.push({
      property_id: propertyId, user_id: userId,
      title: `Άφιξη, ${guest}`, category: 'tenant', event_date: s.check_in,
      amount: s.total ?? null, priority: 'medium', status: 'pending',
      recurring: false, recurring_interval: null, source: `booking:${s.id}:in`,
      notes: [detail, validDate(s.check_out) ? `Αναχώρηση: ${s.check_out}` : ''].filter(Boolean).join('\n') || null,
    })
    if (validDate(s.check_out) && s.check_out !== s.check_in) {
      rows.push({
        property_id: propertyId, user_id: userId,
        title: `Αναχώρηση, ${guest}`, category: 'tenant', event_date: s.check_out,
        amount: null, priority: 'low', status: 'pending',
        recurring: false, recurring_interval: null, source: `booking:${s.id}:out`,
        notes: ch,
      })
    }
  }
  return rows
}

// Πλήθος νυχτών μεταξύ δύο ISO ημερομηνιών (UTC, ασφαλές από ζώνες ώρας).
export function nightsBetween(a: string, b: string): number {
  const d1 = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))
  const d2 = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10))
  return Math.max(0, Math.round((d2 - d1) / 86400000))
}
