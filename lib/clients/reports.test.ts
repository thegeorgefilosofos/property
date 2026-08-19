// npx tsx lib/clients/reports.test.ts
//
// ΓΙΑΤΙ ΓΡΑΦΤΗΚΕ. Το lib/clients/reports.ts υπολογίζει έσοδα ανά κανάλι και ανά
// μήνα, νύχτες, πληρότητα έτους και υψηλή περίοδο — δηλαδή τους αριθμούς που
// βλέπει ο ιδιοκτήτης βραχυχρόνιας μίσθωσης όταν αποφασίζει τιμή, και τους
// αριθμούς που στέλνει στον λογιστή του. Εκατόν εβδομήντα εννέα γραμμές
// αριθμητικής, ΧΩΡΙΣ έναν έλεγχο.
//
// Οι έλεγχοι τρέχουν σε ΤΕΣΣΕΡΙΣ ζώνες ώρας. Ο κώδικας τρέχει στον περιηγητή
// του χρήστη, όχι στον διακομιστή: η ζώνη είναι του χρήστη, όχι δική μας.
import { execFileSync } from 'node:child_process'
import {
  revenueByChannel, revenueByMonth, nightsInRange, nightsByMonth,
  yearOccupancy, totals, type ReportStay,
} from './reports'

let pass = 0, fail = 0
function ok(name: string, cond: boolean) { if (cond) pass++; else { fail++; console.error('✗ ' + name) } }
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++; else { fail++; console.error(`✗ ${name}\n   got  ${g}\n   want ${w}`) }
}

const stay = (o: Partial<ReportStay>): ReportStay => ({
  check_in: '2026-06-01', check_out: '2026-06-08', total: 700, ...o,
})

// ═══ ΝΥΧΤΕΣ ΣΕ ΔΙΑΣΤΗΜΑ ════════════════════════════════════════════════════
eq('επτά νύχτες, όλες μέσα', nightsInRange(stay({}), '2026-06-01', '2026-07-01'), 7)
eq('διαμονή που περνά μήνα: μόνο το κομμάτι του Ιουνίου',
  nightsInRange(stay({ check_in: '2026-06-28', check_out: '2026-07-05' }), '2026-06-01', '2026-07-01'), 3)
eq('… και το κομμάτι του Ιουλίου',
  nightsInRange(stay({ check_in: '2026-06-28', check_out: '2026-07-05' }), '2026-07-01', '2026-08-01'), 4)
eq('εντελώς έξω → μηδέν', nightsInRange(stay({}), '2026-08-01', '2026-09-01'), 0)
eq('χωρίς αναχώρηση → μηδέν', nightsInRange(stay({ check_out: null }), '2026-06-01', '2026-07-01'), 0)
eq('ανάποδες ημερομηνίες → μηδέν',
  nightsInRange(stay({ check_in: '2026-06-10', check_out: '2026-06-03' }), '2026-06-01', '2026-07-01'), 0)

// ΤΟ ΚΡΙΣΙΜΟ: μια διαμονή δεν επιτρέπεται να μετρηθεί ΔΥΟ φορές όταν σπάει σε
// δύο μήνες. Το άθροισμα των δώδεκα μηνών πρέπει να ισούται με τις νύχτες της.
{
  const s = [stay({ check_in: '2026-06-28', check_out: '2026-07-05' })]
  const nbm = nightsByMonth(s, 2026)
  eq('η διαμονή που σπάει σε δύο μήνες δεν διπλομετριέται', nbm.reduce((a, b) => a + b, 0), 7)
  eq('και μοιράζεται σωστά', [nbm[5], nbm[6]], [3, 4])
}

// ═══ ΕΣΟΔΑ ΑΝΑ ΜΗΝΑ — Η ΖΩΝΗ ΩΡΑΣ ΤΟΥ ΧΡΗΣΤΗ ══════════════════════════════
// Το `new Date('2026-01-01')` είναι μεσάνυχτα UTC. Με τοπικούς getters, σε ζώνη
// με ΑΡΝΗΤΙΚΗ απόκλιση (Νέα Υόρκη, UTC−5) γίνεται 31 Δεκεμβρίου του ΠΡΟΗΓΟΥΜΕΝΟΥ
// έτους: η διαμονή της Πρωτοχρονιάς εξαφανιζόταν από τη χρονιά της.
{
  const jan = [stay({ check_in: '2026-01-01', check_out: '2026-01-03', total: 200 })]
  const m = revenueByMonth(jan, 2026)
  eq('η διαμονή της 1ης Ιανουαρίου μένει στον Ιανουάριο', m[0], 200)
  eq('και δεν διαρρέει στον Δεκέμβριο', m[11], 0)

  const dec = [stay({ check_in: '2026-12-31', check_out: '2027-01-02', total: 300 })]
  eq('η διαμονή της παραμονής μένει στον Δεκέμβριο', revenueByMonth(dec, 2026)[11], 300)
  eq('και δεν μετράει στο 2027', revenueByMonth(dec, 2027).reduce((a, b) => a + b, 0), 0)
}

// ═══ ΕΣΟΔΑ ΑΝΑ ΚΑΝΑΛΙ ══════════════════════════════════════════════════════
{
  const rows = revenueByChannel([
    stay({ channel: 'airbnb', total: 700 }),
    stay({ channel: 'airbnb', total: 300 }),
    stay({ channel: 'booking', total: 500 }),
  ])
  eq('δύο κανάλια', rows.length, 2)
  eq('ταξινόμηση από το μεγαλύτερο', rows[0].channel, 'airbnb')
  eq('άθροισμα καναλιού', rows[0].revenue, 1000)
  eq('πλήθος διαμονών', rows[0].count, 2)
  const none = revenueByChannel([stay({ channel: null, total: 100 })])
  eq('κενό κανάλι δεν χάνεται', none.length, 1)
  ok('και έχει ελληνική ετικέτα', /[α-ωΑ-Ω]/.test(none[0].label))
}

// ═══ ΠΛΗΡΟΤΗΤΑ ΕΤΟΥΣ ═══════════════════════════════════════════════════════
{
  const empty = yearOccupancy([], 2026)
  eq('χωρίς κρατήσεις: μηδέν διαθέσιμες ημέρες, όχι 365', empty.availableDays, 0)
  eq('και μηδέν ποσοστό, όχι διαίρεση με το μηδέν', empty.pct, 0)
  eq('και κανένα παράθυρο λειτουργίας', [empty.openFromMonth, empty.openToMonth], [null, null])
  eq('και καμία υψηλή περίοδος', empty.peak, null)
}
{
  // Ιούνιος και Σεπτέμβριος: το παράθυρο λειτουργίας είναι Ιούν–Σεπ (122 ημέρες),
  // δηλαδή οι κενές μέρες Ιουλίου και Αυγούστου ΜΕΤΡΟΥΝ εναντίον της πληρότητας.
  const y = yearOccupancy([
    stay({ check_in: '2026-06-01', check_out: '2026-06-11' }),
    stay({ check_in: '2026-09-01', check_out: '2026-09-11' }),
  ], 2026)
  eq('είκοσι νύχτες', y.bookedNights, 20)
  eq('παράθυρο Ιούνιος–Σεπτέμβριος', [y.openFromMonth, y.openToMonth], [5, 8])
  eq('διαθέσιμες ημέρες: 30+31+31+30', y.availableDays, 122)
  eq('πληρότητα 16,4%', y.pct, 16.4)
}
{
  // Πλήρης χρόνος: ακριβώς 100%, και καμία επικάλυψη.
  const y = yearOccupancy([stay({ check_in: '2026-01-01', check_out: '2027-01-01' })], 2026)
  eq('365 νύχτες', y.bookedNights, 365)
  eq('γεμάτος χρόνος = 100%', y.pct, 100)
  ok('και καμία διπλή κράτηση', !y.overbooked)
}
{
  // ΤΟ ΤΑΒΑΝΙ ΕΚΡΥΒΕ ΤΗ ΔΙΠΛΗ ΚΡΑΤΗΣΗ.
  //
  // Εδώ καθόταν ένα «ok('ποσοστό ≤ 100')»: ένα τεστ που ΚΛΕΙΔΩΝΕ το σφάλμα.
  // Δύο διαμονές στις ίδιες ακριβώς ημέρες είναι δύο επισκέπτες στο ίδιο
  // κρεβάτι — και η οθόνη έγραφε ήσυχα «100%», δηλαδή «γεμάτο σπίτι».
  //
  // Ολόκληρος ο Ιούλιος κρατημένος δύο φορές: 62 νύχτες σε 31 διαθέσιμες
  // ημέρες. Η αλήθεια είναι 200%, και η σημαία το εξηγεί.
  const y = yearOccupancy([
    stay({ check_in: '2026-07-01', check_out: '2026-08-01' }),
    stay({ check_in: '2026-07-01', check_out: '2026-08-01' }),
  ], 2026)
  eq('οι νύχτες μετρώνται και οι δύο φορές', y.bookedNights, 62)
  eq('διαθέσιμες ημέρες: μόνο ο Ιούλιος', y.availableDays, 31)
  eq('το ποσοστό λέει την αλήθεια, δεν κόβεται στο 100', y.pct, 200)
  ok('και σημαίνεται ως διπλή κράτηση', y.overbooked)
}
{
  // Μερική επικάλυψη: πέντε νύχτες πέφτουν δύο φορές μέσα σε έναν μήνα.
  const y = yearOccupancy([
    stay({ check_in: '2026-07-01', check_out: '2026-07-29' }),   // 28
    stay({ check_in: '2026-07-25', check_out: '2026-07-31' }),   // 6, οι 4 επικαλύπτονται
  ], 2026)
  eq('34 νύχτες σε 31 ημέρες', y.bookedNights, 34)
  ok('πάνω από 100', y.pct > 100)
  ok('σημαία διπλής κράτησης', y.overbooked)
}
{
  // ΥΨΗΛΗ ΠΕΡΙΟΔΟΣ: το παράθυρο λέγεται «πληρότητα υψηλής περιόδου», άρα
  // επιλέγεται με ΠΟΣΟΣΤΟ. Οι μήνες δεν έχουν ίδιες ημέρες: 30 νύχτες στον
  // Ιούνιο (30 ημέρες) είναι 100%, 30 στον Ιούλιο (31) είναι 96,8%.
  const y = yearOccupancy([
    stay({ check_in: '2026-02-01', check_out: '2026-02-15' }),   // 14 νύχτες
    stay({ check_in: '2026-06-01', check_out: '2026-07-01' }),   // 30, γεμάτος Ιούνιος
    stay({ check_in: '2026-07-01', check_out: '2026-07-20' }),   // 19
  ], 2026)
  ok('υπάρχει υψηλή περίοδος', y.peak !== null)
  ok('τρεις μήνες', (y.peak!.toMonth - y.peak!.fromMonth) === 2)
  ok('το παράθυρο περιέχει τον γεμάτο Ιούνιο', y.peak!.fromMonth <= 5 && y.peak!.toMonth >= 5)
  ok('το ποσοστό της είναι το ΜΕΓΙΣΤΟ κάθε τριμήνου του παραθύρου', (() => {
    const nbm = y.nightsByMonth
    const days = (m: number) => new Date(Date.UTC(2026, m + 1, 0)).getUTCDate()
    let best = 0
    for (let s = y.openFromMonth!; s + 2 <= y.openToMonth!; s++) {
      let n = 0, d = 0
      for (let m = s; m < s + 3; m++) { n += nbm[m]; d += days(m) }
      best = Math.max(best, Math.round((n / d) * 1000) / 10)
    }
    return y.peak!.pct === best
  })())
}
{
  // Παράθυρο μικρότερο από τρίμηνο: η υψηλή περίοδος είναι όλο το παράθυρο.
  const y = yearOccupancy([stay({ check_in: '2026-08-01', check_out: '2026-08-06' })], 2026)
  eq('ένας μήνας → παράθυρο ενός μήνα', [y.peak!.fromMonth, y.peak!.toMonth], [7, 7])
}

// ═══ ΣΥΓΚΕΝΤΡΩΤΙΚΑ ═════════════════════════════════════════════════════════
{
  const t = totals([
    { ...stay({ total: 700 }), declared_at: '2026-06-10' },
    { ...stay({ total: 300 }), declared_at: null },
  ])
  eq('δύο διαμονές', t.count, 2)
  eq('άθροισμα εσόδων', t.revenue, 1000)
  eq('μία αδήλωτη', t.undeclared, 1)
  ok('το αδιευκρίνιστο μετριέται ΞΕΧΩΡΙΣΤΑ, δεν κρύβεται', t.unresolved >= 0 && t.unresolvedAmount <= t.revenue)
  eq('κενή λίστα → μηδενικά, όχι NaN',
    totals([]), { revenue: 0, nights: 0, count: 0, unresolved: 0, unresolvedAmount: 0, platformFees: 0, climateLevy: 0, undeclared: 0 })
}

// ═══ ΚΑΘΕ ΖΩΝΗ ΩΡΑΣ ════════════════════════════════════════════════════════
// Ο κώδικας τρέχει στον περιηγητή του χρήστη. Ένας ιδιοκτήτης που ταξιδεύει
// δεν επιτρέπεται να δει άλλα έσοδα Ιανουαρίου από ό,τι στην Αθήνα.
if (!process.env.PO_TZ_CHILD) {
  const zones = ['Europe/Athens', 'UTC', 'America/New_York', 'Pacific/Auckland']
  let bad = ''
  for (const tz of zones) {
    try {
      execFileSync('npx', ['tsx', __filename], {
        env: { ...process.env, TZ: tz, PO_TZ_CHILD: '1' }, stdio: 'pipe',
      })
    } catch { bad += (bad ? ', ' : '') + tz }
  }
  ok('ίδια αποτελέσματα σε Αθήνα, UTC, Νέα Υόρκη και Ώκλαντ' + (bad ? ` — απέτυχε: ${bad}` : ''), bad === '')
}

console.log(fail === 0 ? `✓ reports: ${pass} έλεγχοι πέρασαν` : `✗ reports: ${fail} απέτυχαν από ${pass + fail}`)
if (fail > 0) process.exit(1)
