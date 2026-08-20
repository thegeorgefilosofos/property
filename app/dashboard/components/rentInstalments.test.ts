// npx tsx app/dashboard/components/rentInstalments.test.ts
//
// ΕΔΩ ΚΡΙΝΕΤΑΙ ΑΝ Ο ΙΔΙΟΚΤΗΤΗΣ ΒΛΕΠΕΙ ΤΑ ΧΡΗΜΑΤΑ ΤΟΥ.
// Οι δόσεις ενοικίου είναι ο πίνακας από τον οποίο βγαίνουν η ταμειακή θέση,
// η οφειλή, η Πύλη ενοικιαστή και το Ε2. Μέχρι τώρα γεννιούνταν ΜΟΝΟ μέσα στην
// οθόνη των εισπράξεων: όποιος καταχωρούσε ενοικιαστή και γύριζε στην
// Επισκόπηση έβλεπε μηδέν, χωρίς κανένα σφάλμα να το εξηγεί.
import { dueDayOf, rowsForPeriods, instalmentRows, syncInstalments } from './rentInstalments'
import type { Tenant } from './TabTenantTypes'
import type { InstalmentPeriod } from '@/lib/rent/frequency'

let pass = 0, fail = 0
const ok = (n: string, c: boolean) => { if (c) pass++; else { fail++; console.error('✗ ' + n) } }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthsAgo = (n: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); d.setMonth(d.getMonth() - n); return iso(d) }

const tenant = (over: Partial<Tenant> = {}): Tenant => ({
  id: 't1', full_name: 'Δοκιμή', monthly_rent: 500, lease_start: monthsAgo(3),
  payment_frequency: 'monthly', rent_due_day: 5,
  ...over,
} as Tenant)

// ── Η ημέρα λήξης ─────────────────────────────────────────────────────────
// ΚΛΕΙΝΕΤΑΙ ΣΤΟ 28 γιατί ο Φεβρουάριος υπάρχει: μια «31η Φεβρουαρίου» δεν
// είναι άσχημη ημερομηνία, είναι ημερομηνία που η Postgres απορρίπτει, και
// μαζί της ολόκληρη την καταχώρηση των δόσεων.
ok('η 31η γίνεται 28η', dueDayOf({ rent_due_day: 31 }) === 28)
ok('η μηδενική γίνεται 1η', dueDayOf({ rent_due_day: 0 }) === 1)
ok('η κενή γίνεται 1η', dueDayOf({}) === 1 && dueDayOf({ rent_due_day: null }) === 1)
ok('η κανονική μένει', dueDayOf({ rent_due_day: 12 }) === 12)

// ── Η σύνθεση της δόσης ───────────────────────────────────────────────────
// Το ερωτηματικό ΧΡΕΙΑΖΕΤΑΙ: χωρίς αυτό, το `({…})` της επιστροφής και το `{`
// του επόμενου μπλοκ διαβάζονται ως λίστα παραμέτρων άλλου βέλους.
const period = (months: number): InstalmentPeriod => ({ year: 2026, month: 1, months, due_date: '2026-01-05' });
{
  const [r] = rowsForPeriods([period(1)], tenant(), 'p1', 'u1')
  ok('η δόση κρατά μισθωτή, ακίνητο και χρήστη',
    r.tenant_id === 't1' && r.property_id === 'p1' && r.user_id === 'u1')
  ok('η δόση γεννιέται απλήρωτη', r.paid === false)
  ok('η δόση κρατά την προθεσμία', r.due_date === '2026-01-05')
  ok('χωρίς υπηρεσίες, το ποσό είναι το ενοίκιο', r.amount === 500 && r.base_rent === 500 && r.services_charge === 0)
}
{
  // ΤΟ ΠΟΣΟ ΑΚΟΛΟΥΘΕΙ ΤΗ ΣΥΧΝΟΤΗΤΑ. Αν άλλαζε μόνο το βήμα των ημερομηνιών, ο
  // ιδιοκτήτης θα εισέπραττε το ένα τρίτο του ετήσιου ενοικίου — και το ίδιο
  // θα δήλωνε στο Ε2.
  const [r] = rowsForPeriods([period(3)], tenant(), 'p1', 'u1')
  ok('η τριμηνιαία δόση είναι τρία μισθώματα', r.amount === 1500 && r.base_rent === 1500)
}
{
  // Η ΣΤΡΟΓΓΥΛΟΠΟΙΗΣΗ ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Το 833,33 × 3 δίνει
  // 2499,9900000000002 σε κινητή υποδιαστολή, και αυτό θα πήγαινε αυτούσιο στη
  // βάση, στο Ε2 και στη βεβαίωση ενοικίου.
  //
  // Η ΤΙΜΗ ΤΟΥ ΠΑΡΑΔΕΙΓΜΑΤΟΣ ΔΙΑΛΕΧΤΗΚΕ ΓΙΑΤΙ ΟΝΤΩΣ ΣΠΑΕΙ. Η προηγούμενη
  // (416,67) πολλαπλασιάζεται καθαρά, οπότε ο έλεγχος περνούσε ακόμη και με τη
  // στρογγυλοποίηση αφαιρεμένη — δηλαδή δεν έλεγχε τίποτα.
  const [r] = rowsForPeriods([period(3)], tenant({ monthly_rent: 833.33 }), 'p1', 'u1')
  ok('τα λεπτά μένουν δύο', r.amount === 2499.99 && r.base_rent === 2499.99)
}
{
  // Χρέωση υπηρεσιών προς τον μισθωτή: μπαίνει στο σύνολο ΚΑΙ ξεχωριστά.
  const t = tenant({ parking_extra: true, parking_extra_price: 50 })
  const [r] = rowsForPeriods([period(2)], t, 'p1', 'u1')
  ok('οι υπηρεσίες μπαίνουν στο σύνολο', r.amount === 1100)
  ok('και μένουν χωριστά αναγνωρίσιμες', r.base_rent === 1000 && r.services_charge === 100)
}
ok('καμία περίοδος, καμία γραμμή', rowsForPeriods([], tenant(), 'p1', 'u1').length === 0)

// ── Ποια μίσθωση γεννά δόσεις ─────────────────────────────────────────────
ok('μίσθωση τριών μηνών γεννά τέσσερις δόσεις', instalmentRows(tenant(), 'p1', 'u1').length === 4)
// ΤΟ ΜΙΣΟΣΥΜΠΛΗΡΩΜΕΝΟ ΔΕΝ ΕΙΝΑΙ ΣΦΑΛΜΑ, ΕΙΝΑΙ ΠΡΟΣΧΕΔΙΟ. Καρτέλα χωρίς έναρξη
// ή χωρίς ενοίκιο — ή σάρωση που δεν βρήκε ποσό — απλώς δεν γεννά δόσεις.
ok('χωρίς έναρξη, καμία δόση', instalmentRows(tenant({ lease_start: null }), 'p1', 'u1').length === 0)
ok('χωρίς ενοίκιο, καμία δόση',
  instalmentRows(tenant({ monthly_rent: 0 }), 'p1', 'u1').length === 0
  && instalmentRows(tenant({ monthly_rent: null }), 'p1', 'u1').length === 0)
// Η ΑΠΟΧΩΡΗΣΗ ΚΟΒΕΙ. Χωρίς αυτό, ένας μισθωτής που έφυγε θα συνέχιζε να
// χρωστά ενοίκιο για πάντα, και το «μου χρωστάνε» θα μεγάλωνε κάθε μήνα.
{
  const left = instalmentRows(tenant({ move_out_date: monthsAgo(2) }), 'p1', 'u1')
  ok('η αποχώρηση κόβει τις δόσεις', left.length === 2)
}
{
  const ended = instalmentRows(tenant({ lease_end: monthsAgo(1) }), 'p1', 'u1')
  ok('η λήξη μίσθωσης κόβει τις δόσεις', ended.length === 3)
}
// Μελλοντική μίσθωση: υπογεγραμμένη, όχι ξεκινημένη. Καμία δόση για μήνα που
// δεν ήρθε, αλλιώς η οφειλή θα εμφανιζόταν πριν καν μπει ο μισθωτής.
{
  const soon = new Date(); soon.setMonth(soon.getMonth() + 2)
  ok('μίσθωση που δεν ξεκίνησε δεν γεννά τίποτα',
    instalmentRows(tenant({ lease_start: iso(soon) }), 'p1', 'u1').length === 0)
}
{
  // Η τριμηνιαία πιάνει ΕΝΑ κλειδί ανά δόση, όχι τρία: το `UNIQUE` του πίνακα
  // είναι (μισθωτής, έτος, μήνας), και τρία κλειδιά θα έδειχναν την ίδια
  // πληρωμή τρεις φορές στο λογιστήριο.
  const q = instalmentRows(tenant({ payment_frequency: 'quarterly', lease_start: monthsAgo(5) }), 'p1', 'u1')
  ok('η τριμηνιαία δίνει μία γραμμή ανά τρίμηνο', q.length === 2)
  ok('και κάθε γραμμή είναι τρία μισθώματα', q.every(r => r.amount === 1500))
}

// ── Η γραφή ───────────────────────────────────────────────────────────────
function fakeDb(error: { message: string } | null = null) {
  const calls: { rows: unknown; opts: Record<string, unknown> | undefined }[] = []
  const db = {
    from() {
      return {
        upsert(rows: unknown, opts?: Record<string, unknown>) {
          calls.push({ rows, opts })
          return Promise.resolve({ data: null, error })
        },
      }
    },
  }
  return { db: db as never, calls }
}

async function asyncChecks() {
  {
    const { db, calls } = fakeDb()
    const out = await syncInstalments(db, tenant(), 'p1', 'u1')
    ok('η αποθήκευση μίσθωσης γράφει τις δόσεις', calls.length === 1 && out.requested === 4)
    // ΧΩΡΙΣ ΑΥΤΟ, Η ΕΠΑΝΑΠΟΘΗΚΕΥΣΗ ΣΒΗΝΕΙ ΠΛΗΡΩΜΕΣ: το upsert θα ξανάγραφε
    // `paid: false` πάνω σε δόση που έχει ήδη εισπραχθεί.
    ok('οι υπάρχουσες δόσεις δεν αγγίζονται', calls[0].opts?.ignoreDuplicates === true)
    ok('η σύγκρουση κρίνεται από το κλειδί περιόδου',
      calls[0].opts?.onConflict === 'tenant_id,period_year,period_month')
  }
  {
    const { db, calls } = fakeDb()
    const out = await syncInstalments(db, tenant({ lease_start: null }), 'p1', 'u1')
    ok('προσχέδιο δεν ρωτά καθόλου τη βάση', calls.length === 0)
    ok('και δεν είναι σφάλμα', out.requested === 0 && out.error === '')
  }
  {
    // ΤΟ ΣΙΩΠΗΛΟ ΣΦΑΛΜΑ ΕΙΝΑΙ ΤΟ ΧΕΙΡΟΤΕΡΟ: ο ενοικιαστής αποθηκεύεται, οι
    // δόσεις δεν γράφονται, και η οθόνη δείχνει μηδέν χωρίς εξήγηση.
    const { db } = fakeDb({ message: 'RLS' })
    const out = await syncInstalments(db, tenant(), 'p1', 'u1')
    ok('η αποτυχία επιστρέφεται, δεν καταπίνεται', out.error === 'RLS')
  }
}

asyncChecks().then(() => {
  console.log(fail === 0 ? `✓ rentInstalments: ${pass} έλεγχοι πέρασαν` : `✗ rentInstalments: ${fail} απέτυχαν από ${pass + fail}`)
  if (fail > 0) process.exit(1)
})
