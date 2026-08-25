// Καθαρή μετατροπή κρατήσεων βραχυχρόνιας μίσθωσης (client_stays) σε γεγονότα
// ημερολογίου: check-in + check-out ανά κράτηση, με το όνομα της κράτησης/επισκέπτη.
// Χωρίς I/O ώστε να δοκιμάζεται ντετερμινιστικά· η άντληση/εγγραφή γίνεται στο UI.

import { nightsBetween } from '../core/greek'
import { declarableGrossOrTotal } from '../clients/stayAmounts'
import type { EventDraft } from '../data/calendar'

export interface StayInput {
  id: string
  check_in: string                 // YYYY-MM-DD
  check_out?: string | null        // YYYY-MM-DD
  total?: number | null
  /** Η ανάλυση της πλατφόρμας, όταν υπάρχει. Χωρίς αυτήν το `total` είναι το
   *  μόνο που ξέρουμε και το `declarableGrossOrTotal` το επιστρέφει αυτούσιο. */
  gross_guest_paid?: number | null
  platform_fee?: number | null
  climate_levy?: number | null
  amount_basis?: string | null
  nights?: number | null
  guests?: number | null
  channel?: string | null          // airbnb | booking | other
  guest_name?: string | null       // από clients.full_name (ή null)
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
//
// ΧΩΡΙΣ ΑΚΙΝΗΤΟ ΚΑΙ ΧΩΡΙΣ ΧΡΗΣΤΗ. Η συνάρτηση δεχόταν `propertyId` και `userId`
// μόνο και μόνο για να τα σφραγίσει σε κάθε γραμμή — δουλειά του στρώματος
// δεδομένων, όχι μιας καθαρής μετατροπής. Τώρα γυρίζει προσχέδια· την εμβέλεια
// τη βάζει το `lib/data/calendar`, μία φορά και για όλες τις πηγές.
export function buildBookingEvents(stays: StayInput[]): EventDraft[] {
  const rows: EventDraft[] = []
  for (const s of stays || []) {
    if (!s || !validDate(s.check_in)) continue
    const guest = guestLabel(s)
    const ch = channelLabel(s.channel)
    const nights = s.nights || (validDate(s.check_out) ? nightsBetween(s.check_in, s.check_out) : null)
    const detail = [ch, nights ? `${nights} ${nights === 1 ? 'νύχτα' : 'νύχτες'}` : '', s.guests ? `${s.guests} άτομα` : '']
      .filter(Boolean).join(' · ')
    rows.push({
      title: `Άφιξη, ${guest}`, category: 'tenant', event_date: s.check_in,
      // ΔΗΛΩΤΕΟ ΑΚΑΘΑΡΙΣΤΟ, ΟΧΙ ΩΜΟ `total`. Το γεγονός γράφεται με
      // `status: 'pending'` και το ημερολόγιο αθροίζει τα εκκρεμή ποσά του
      // μήνα στην κεφαλίδα του. Με payout, η ίδια κράτηση έδειχνε εδώ ένα
      // νούμερο και στη Λογιστική άλλο, μικρότερο κατά την προμήθεια.
      amount: declarableGrossOrTotal(s) || null, priority: 'medium', status: 'pending',
      recurring: false, recurring_interval: null, source: `booking:${s.id}:in`,
      notes: [detail, validDate(s.check_out) ? `Αναχώρηση: ${s.check_out}` : ''].filter(Boolean).join('\n') || null,
    })
    if (validDate(s.check_out) && s.check_out !== s.check_in) {
      rows.push({
        title: `Αναχώρηση, ${guest}`, category: 'tenant', event_date: s.check_out,
        amount: null, priority: 'low', status: 'pending',
        recurring: false, recurring_interval: null, source: `booking:${s.id}:out`,
        notes: ch,
      })
    }
  }
  return rows
}

// Πλήθος νυχτών: υπολογίζεται ΜΙΑ φορά, στο lib/core/greek.ts.
export { nightsBetween }
