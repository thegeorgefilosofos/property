// Τεστ για τη μηχανή «Δήλωση Πληροφοριακών Στοιχείων Μίσθωσης».
import {
  isValidAfm, isValidAtak, isValidPostalCode,
  declarationDeadline, buildLeaseDeclaration, declarationSheet,
  type LeaseDeclarationInput,
} from './leaseDeclaration'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// ── ΑΦΜ: ο πραγματικός αλγόριθμος mod 11 της ΑΑΔΕ ───────────────────────────
ok('ΑΦΜ έγκυρο 094097524', isValidAfm('094097524'))
ok('ΑΦΜ έγκυρο 123456783', isValidAfm('123456783'))
ok('ΑΦΜ έγκυρο 047732619', isValidAfm('047732619'))
ok('ΑΦΜ άκυρο (λάθος ψηφίο ελέγχου)', !isValidAfm('094097521'))
ok('ΑΦΜ άκυρο (8 ψηφία)', !isValidAfm('09409752'))
ok('ΑΦΜ άκυρο (10 ψηφία)', !isValidAfm('0940975240'))
ok('ΑΦΜ άκυρο (όλα ίδια)', !isValidAfm('111111111'))
ok('ΑΦΜ άκυρο (κενό)', !isValidAfm('') && !isValidAfm(null) && !isValidAfm(undefined))
ok('ΑΦΜ δέχεται κενά/παύλες', isValidAfm('094 097 524') && isValidAfm('094-097-524'))

// ── ΑΤΑΚ & ΤΚ ───────────────────────────────────────────────────────────────
ok('ΑΤΑΚ έγκυρο (11 ψηφία)', isValidAtak('12345678901'))
ok('ΑΤΑΚ άκυρο (10 ψηφία)', !isValidAtak('1234567890'))
ok('ΤΚ έγκυρο (5 ψηφία)', isValidPostalCode('11527') && isValidPostalCode('115 27'))
ok('ΤΚ άκυρο (4 ψηφία)', !isValidPostalCode('1152'))

// ── Προθεσμία: τέλος του ΕΠΟΜΕΝΟΥ μήνα από την έναρξη ───────────────────────
ok('έναρξη 15/01 → προθεσμία 28/02', declarationDeadline('2026-01-15') === '2026-02-28')
ok('έναρξη 01/03 → προθεσμία 30/04', declarationDeadline('2026-03-01') === '2026-04-30')
ok('έναρξη 20/11 → προθεσμία 31/12', declarationDeadline('2026-11-20') === '2026-12-31')
ok('έναρξη 05/12 → προθεσμία 31/01 επόμενου έτους', declarationDeadline('2026-12-05') === '2027-01-31')
// δίσεκτο: 2028 έχει 29 Φεβρουαρίου
ok('δίσεκτο έτος 01/01/2028 → 29/02/2028', declarationDeadline('2028-01-01') === '2028-02-29')

// ── Πλήρης, έγκυρη δήλωση ───────────────────────────────────────────────────
const full: LeaseDeclarationInput = {
  owner: { name: 'Γεώργιος Παπαδόπουλος', afm: '094097524' },
  property: { atak: '12345678901', address: 'Ερμού 15', postalCode: '11527', sqm: 78, floor: '2ος' },
  tenant: { fullName: 'Μαρία Ιωάννου', afm: '123456783' },
  lease: { start: '2026-03-01', end: '2029-02-28', monthlyRent: 650 },
  today: '2026-03-10',
}
const d = buildLeaseDeclaration(full)
ok('πλήρης δήλωση → ready', d.readiness === 'ready')
ok('πλήρης δήλωση → κανένα κενό', d.missing.length === 0)
ok('πλήρης δήλωση → κανένα λάθος', d.invalid.length === 0)
ok('περίληψη λέει ότι μπορεί να υποβάλει', /μπορείς να υποβάλεις/i.test(d.summary))
ok('προθεσμία 30/04/2026', d.deadline.due === '2026-04-30')
ok('προθεσμία σε καλή κατάσταση', d.deadline.state === 'ok')
ok('μίσθωμα μορφοποιημένο σε ευρώ', d.fields.find(f => f.key === 'rent')!.value.includes('€'))
ok('ημερομηνία σε ελληνική μορφή', d.fields.find(f => f.key === 'lease_start')!.value === '01/03/2026')

// ── Λάθος ΑΦΜ μισθωτή → invalid, με σαφή εξήγηση ────────────────────────────
const badAfm = buildLeaseDeclaration({ ...full, tenant: { fullName: 'Μαρία Ιωάννου', afm: '123456789' } })
ok('λάθος ΑΦΜ μισθωτή → invalid', badAfm.readiness === 'invalid')
ok('το πεδίο ΑΦΜ μισθωτή σημειώνεται λάθος', badAfm.invalid.some(f => f.key === 'tenant_afm'))
ok('εξηγεί ότι θα απορριφθεί', /απορρίπτεται/i.test(badAfm.invalid[0].hint || ''))

// ── Κενά πεδία → incomplete, με οδηγία πού διορθώνεται ──────────────────────
const empty = buildLeaseDeclaration({ today: '2026-03-10' })
ok('κενή είσοδος → incomplete', empty.readiness === 'incomplete')
ok('εντοπίζει το ΑΤΑΚ ως κενό', empty.missing.some(f => f.key === 'atak'))
ok('λέει πού βρίσκεται το ΑΤΑΚ', /Ε9|ΕΝΦΙΑ/.test(empty.fields.find(f => f.key === 'atak')!.hint || ''))
ok('κάθε κενό δείχνει καρτέλα διόρθωσης', empty.missing.every(f => !!f.fixIn))
ok('χωρίς έναρξη → προθεσμία unknown', empty.deadline.state === 'unknown')

// ── Εκπρόθεσμη ──────────────────────────────────────────────────────────────
const late = buildLeaseDeclaration({ ...full, today: '2026-06-01' })
ok('μετά την προθεσμία → overdue', late.deadline.state === 'overdue')
ok('αναφέρει πρόστιμο', /πρόστιμο/i.test(late.deadline.label))
ok('παραμένει ready (μπορεί ακόμη να υποβληθεί)', late.readiness === 'ready')

// ── Κοντά στην προθεσμία ────────────────────────────────────────────────────
const soon = buildLeaseDeclaration({ ...full, today: '2026-04-25' })
ok('5 ημέρες πριν → soon', soon.deadline.state === 'soon' && soon.deadline.daysLeft === 5)

// ── Λήξη πριν την έναρξη → invalid ──────────────────────────────────────────
const rev = buildLeaseDeclaration({ ...full, lease: { start: '2026-03-01', end: '2026-02-01', monthlyRent: 650 } })
ok('λήξη πριν την έναρξη → invalid', rev.invalid.some(f => f.key === 'lease_end'))

// ── Φύλλο αντιγραφής ────────────────────────────────────────────────────────
const sheet = declarationSheet(d)
ok('φύλλο περιέχει το ΑΤΑΚ', sheet.includes('12345678901'))
ok('φύλλο περιέχει ΑΦΜ και των δύο', sheet.includes('094097524') && sheet.includes('123456783'))
ok('φύλλο περιέχει την προθεσμία', sheet.includes('30/04/2026'))
ok('φύλλο αναφέρει πηγή ΑΑΔΕ', /ΑΑΔΕ/.test(sheet))
ok('φύλλο δεν περιέχει κενά πεδία', !declarationSheet(empty).includes('undefined'))

console.log(`leaseDeclaration.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
