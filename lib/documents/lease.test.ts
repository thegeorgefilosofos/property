// Τεστ για το ιδιωτικό συμφωνητικό μίσθωσης (lease.ts).
import { computeLease, leaseEndDate, declarationDeadline, leaseTerms, leasePreamble } from './lease'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// Λήξη: 3ετία από 01/09/2026 → 31/08/2029 (παραμονή της επετείου).
ok('end of 3y lease', leaseEndDate('2026-09-01', 3) === '2029-08-31')
// Λήξη σε μήνα με λιγότερες ημέρες: 31/01 + 1 έτος → 30/01.
ok('end of 1y lease from 31/01', leaseEndDate('2026-01-31', 1) === '2027-01-30')
ok('end with invalid start', leaseEndDate('', 3) === '')

// Προθεσμία δήλωσης: τέλος του επόμενου μήνα.
ok('deadline for Sep start', declarationDeadline('2026-09-15') === '2026-10-31')
ok('deadline crosses year', declarationDeadline('2026-12-03') === '2027-01-31')
// Φεβρουάριος (μη δίσεκτο 2027): 31/03.
ok('deadline for Feb start', declarationDeadline('2027-02-10') === '2027-03-31')

// Πλήρης υπολογισμός τριετίας.
const l = computeLease({ monthlyRent: 500, deposit: 1000, start: '2026-09-01', years: 3, adjustmentPct: 3 })
ok('rent kept', l.monthlyRent === 500)
ok('deposit kept', l.deposit === 1000)
ok('end computed', l.end === '2029-08-31')
ok('36 months', l.months === 36)
ok('3 years', l.years === 3)
ok('not below minimum', l.belowLegalMinimum === false)
ok('first year total', l.firstYearTotal === 6000)
ok('deadline set', l.declarationDeadline === '2026-10-31')

// Κάτω από την ελάχιστη τριετία κατοικίας → σημαία.
const short = computeLease({ monthlyRent: 400, start: '2026-01-01', years: 1 })
ok('1y residence flagged', short.belowLegalMinimum === true)
// Επαγγελματική χρήση: δεν ισχύει η τριετία κατοικίας.
const pro = computeLease({ monthlyRent: 400, start: '2026-01-01', years: 1, use: 'professional' })
ok('1y professional not flagged', pro.belowLegalMinimum === false)

// Ρητή ημερομηνία λήξης υπερισχύει των ετών.
const explicit = computeLease({ monthlyRent: 300, start: '2026-01-01', years: 5, end: '2026-12-31' })
ok('explicit end wins', explicit.end === '2026-12-31' && explicit.months === 12)

// Ημέρα πληρωμής: περιορίζεται στο 1..28.
ok('payment day clamped high', computeLease({ monthlyRent: 1, start: '2026-01-01', paymentDay: 31 }).paymentDay === 28)
ok('payment day clamped low', computeLease({ monthlyRent: 1, start: '2026-01-01', paymentDay: 0 }).paymentDay === 1)
ok('payment day default', computeLease({ monthlyRent: 1, start: '2026-01-01' }).paymentDay === 5)

// Άκυρη έναρξη → δεν σπάει.
const bad = computeLease({ monthlyRent: 500, start: 'άκυρη' })
ok('invalid start safe', bad.months === 0 && bad.end === '' && bad.declarationDeadline === '')

// Όροι: αριθμημένοι, με εγγύηση και αναπροσαρμογή όταν υπάρχουν.
const terms = leaseTerms(l)
ok('terms numbered from 1', terms[0].title.startsWith('1. '))
ok('has adjustment term', terms.some(t => t.title.includes('Αναπροσαρμογή')))
ok('has deposit term', terms.some(t => t.title.includes('Εγγύηση')))
ok('mentions myAADE deadline', terms.some(t => t.text.includes('31/10/2026')))
ok('mentions bank payment', terms.some(t => t.text.includes('τραπεζικό')))

// Χωρίς εγγύηση/αναπροσαρμογή → οι όροι παραλείπονται και η αρίθμηση μένει συνεχής.
const bare = leaseTerms(computeLease({ monthlyRent: 500, start: '2026-09-01', years: 3 }))
ok('no deposit term when zero', !bare.some(t => t.title.includes('Εγγύηση')))
ok('no adjustment term when zero', !bare.some(t => t.title.includes('Αναπροσαρμογή')))
ok('numbering stays sequential', bare.every((t, i) => t.title.startsWith(`${i + 1}. `)))

// Προοίμιο: αναφέρει και τα δύο μέρη και το ακίνητο.
const pre = leasePreamble({ landlordName: 'Γεωργίου', landlordAfm: '123456789', tenantName: 'Παπαδοπούλου', propertyAddress: 'Ερμού 1', sqm: 75 }, l)
ok('preamble has landlord', pre.includes('Γεωργίου'))
ok('preamble has tenant', pre.includes('Παπαδοπούλου'))
ok('preamble has address', pre.includes('Ερμού 1'))
ok('preamble has sqm', pre.includes('75'))

console.log(`lease.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
