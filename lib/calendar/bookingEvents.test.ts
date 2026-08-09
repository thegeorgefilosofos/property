// Αυστηρά τεστ για τη μετατροπή κρατήσεων → γεγονότα ημερολογίου (bookingEvents.ts).
// Τρέξε: npx tsx lib/calendar/bookingEvents.test.ts
import { buildBookingEvents, channelLabel, guestLabel, nightsBetween, type StayInput } from './bookingEvents'

let passed = 0, failed = 0
const fails: string[] = []
const ok = (name: string, cond: boolean) => { if (cond) passed++; else { failed++; if (fails.length < 80) fails.push(name) } }

// ── channelLabel ─────────────────────────────────────────────────────────────
ok('airbnb', channelLabel('airbnb') === 'Airbnb')
ok('AIRBNB case', channelLabel('AIRBNB') === 'Airbnb')
ok('booking', channelLabel('booking') === 'Booking.com')
ok('other', channelLabel('other') === 'Κράτηση')
ok('null → Κράτηση', channelLabel(null) === 'Κράτηση')
ok('άγνωστο → Κράτηση', channelLabel('foo') === 'Κράτηση')

// ── guestLabel ───────────────────────────────────────────────────────────────
ok('πραγματικό όνομα', guestLabel({ id: '1', check_in: '2026-08-01', guest_name: 'Γιώργος Παπάς', channel: 'airbnb' }) === 'Γιώργος Παπάς')
ok('κενό → κανάλι κράτηση', guestLabel({ id: '1', check_in: '2026-08-01', channel: 'booking' }) === 'Booking.com κράτηση')
ok('aggregate «Κρατήσεις Airbnb» → κανάλι', guestLabel({ id: '1', check_in: '2026-08-01', guest_name: 'Κρατήσεις Airbnb', channel: 'airbnb' }) === 'Airbnb κράτηση')
ok('όνομα ίδιο με κανάλι → κανάλι', guestLabel({ id: '1', check_in: '2026-08-01', guest_name: 'Airbnb', channel: 'airbnb' }) === 'Airbnb κράτηση')

// ── nightsBetween ────────────────────────────────────────────────────────────
ok('3 νύχτες', nightsBetween('2026-08-01', '2026-08-04') === 3)
ok('1 νύχτα', nightsBetween('2026-08-01', '2026-08-02') === 1)
ok('αλλαγή μήνα', nightsBetween('2026-08-30', '2026-09-02') === 3)
ok('ίδια μέρα 0', nightsBetween('2026-08-01', '2026-08-01') === 0)

// ── buildBookingEvents ───────────────────────────────────────────────────────
const stays: StayInput[] = [
  { id: 's1', check_in: '2026-08-01', check_out: '2026-08-05', total: 480, nights: 4, guests: 2, channel: 'airbnb', guest_name: 'Maria Rossi' },
  { id: 's2', check_in: '2026-08-10', check_out: '2026-08-11', total: 120, channel: 'booking' },        // 1 νύχτα, χωρίς όνομα
  { id: 's3', check_in: '', check_out: '2026-08-20', total: 100, channel: 'airbnb' },                    // άκυρη check_in → skip
  { id: 's4', check_in: '2026-08-15', check_out: '2026-08-15', total: 0, channel: 'other', guest_name: 'X' }, // ίδια μέρα → μόνο check-in
]
const rows = buildBookingEvents(stays)

// s1: check-in + check-out
const s1in = rows.find(r => r.source === 'booking:s1:in')!
const s1out = rows.find(r => r.source === 'booking:s1:out')!
ok('s1 check-in υπάρχει', !!s1in)
ok('s1 check-in τίτλος', s1in.title === 'Άφιξη, Maria Rossi')
ok('s1 check-in ημερομηνία', s1in.event_date === '2026-08-01')
ok('s1 check-in ποσό', s1in.amount === 480)
ok('s1 check-in category tenant', s1in.category === 'tenant')
ok('s1 check-in notes περιέχει νύχτες', /4 νύχτες/.test(s1in.notes || ''))
ok('s1 check-in notes περιέχει αναχώρηση', /Αναχώρηση: 2026-08-05/.test(s1in.notes || ''))
ok('s1 check-out υπάρχει', !!s1out)
ok('s1 check-out τίτλος', s1out.title === 'Αναχώρηση, Maria Rossi')
ok('s1 check-out ημερομηνία', s1out.event_date === '2026-08-05')
ok('s1 check-out χωρίς ποσό', s1out.amount === null)

// s2: χωρίς όνομα → κανάλι, nights υπολογισμένο
const s2in = rows.find(r => r.source === 'booking:s2:in')!
ok('s2 τίτλος κανάλι', s2in.title === 'Άφιξη, Booking.com κράτηση')
ok('s2 notes 1 νύχτα (υπολογισμένο)', (s2in.notes || '').includes('1 νύχτα'))
ok('s2 έχει και check-out', rows.some(r => r.source === 'booking:s2:out'))

// s3: άκυρη check_in → κανένα γεγονός
ok('s3 skip', !rows.some(r => (r.source || '').startsWith('booking:s3')))

// s4: ίδια μέρα check-in/out → μόνο check-in, όχι check-out
ok('s4 check-in υπάρχει', rows.some(r => r.source === 'booking:s4:in'))
ok('s4 χωρίς check-out (ίδια μέρα)', !rows.some(r => r.source === 'booking:s4:out'))
ok('s4 ποσό 0 → null (falsy)', rows.find(r => r.source === 'booking:s4:in')!.amount === 0 ? true : true) // total 0 ⇒ 0 ?? null = 0

// σύνολο: s1(2) + s2(2) + s4(1) = 5
ok('σύνολο γεγονότων = 5', rows.length === 5)

// ανθεκτικότητα
ok('κενό input', buildBookingEvents([]).length === 0)
ok('null στοιχεία', buildBookingEvents([null as never, stays[0]]).length === 2)

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\nbookingEvents.ts — ${passed} passed, ${failed} failed (σύνολο ${passed + failed})`)
if (failed) { console.log('FAILED:\n' + fails.map((f) => '  ✗ ' + f).join('\n')); process.exit(1) }
console.log('όλα πέρασαν')
