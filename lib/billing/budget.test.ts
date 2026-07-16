// Τεστ για τον πυρήνα προϋπολογισμού (lib/billing/budget.ts)
import { forecastMonthEnd, categoryStatus, annualSummary, periodTrend, sumByMonth, detectRecurring } from './budget'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

// ── forecastMonthEnd ─────────────────────────────────────────────────────────
{
  // Σταθερά 200 (πλήρη), μεταβλητά 50 στις 10/30 ημέρες → 50/10×30 = 150· σύνολο 350.
  ok('προβολή μόνο του μεταβλητού', forecastMonthEnd(200, 50, 10, 30) === 350)
  // Χωρίς μεταβλητά → μόνο τα σταθερά.
  ok('σταθερά ως έχουν', forecastMonthEnd(200, 0, 10, 30) === 200)
  // Ποτέ κάτω από ό,τι ξοδεύτηκε (τέλος μήνα, μεταβλητό δεν ανεβαίνει).
  ok('όχι κάτω από το ήδη ξοδεμένο', forecastMonthEnd(100, 80, 30, 30) === 180)
  ok('ημέρα 0 → άθροισμα', forecastMonthEnd(100, 40, 0, 30) === 140)
  ok('αρνητικά κόβονται στο μηδέν', forecastMonthEnd(-5, -5, 10, 30) === 0)
}

// ── categoryStatus ───────────────────────────────────────────────────────────
{
  ok('ήδη υπέρβαση', categoryStatus(100, 120, 120) === 'over')
  ok('προβλεπόμενη υπέρβαση', categoryStatus(100, 60, 130) === 'projected_over')
  ok('κοντά στο όριο (>80%)', categoryStatus(100, 85, 90) === 'warn')
  ok('εντάξει', categoryStatus(100, 40, 70) === 'ok')
  ok('μηδενικός στόχος → εντάξει (όχι διαίρεση με 0)', categoryStatus(0, 0, 0) === 'ok')
  ok('υπέρβαση προηγείται της προβλεπόμενης', categoryStatus(100, 120, 200) === 'over')
}

// ── annualSummary ────────────────────────────────────────────────────────────
{
  const a = annualSummary(400, 2600, 6) // στόχος 400/μήνα, 6 μήνες, YTD 2600
  ok('ετήσιος στόχος = 4800', a.annualBudget === 4800)
  ok('YTD στόχος = 2400', a.ytdBudget === 2400)
  ok('απόκλιση = +200', a.variance === 200)
  ok('προβολή έτους = 5200', a.projectedYearEnd === 5200) // 2600/6×12
  ok('εκτός στόχου (5200 > 4800)', a.onTrack === false)

  const b = annualSummary(500, 2000, 5) // 2000/5×12 = 4800 ≤ 6000
  ok('εντός στόχου', b.onTrack === true && b.projectedYearEnd === 4800)
  const c = annualSummary(300, 0, 0)
  ok('μηδέν μήνες → προβολή 0', c.projectedYearEnd === 0 && c.ytdBudget === 0)
}

// ── periodTrend ──────────────────────────────────────────────────────────────
{
  const t = periodTrend(120, [100, 100, 100])
  ok('μέσος όρος προηγούμενων = 100', t.avgPrior === 100)
  ok('delta = +20', t.delta === 20)
  ok('deltaPct = +20%', t.deltaPct === 20)
  ok('κατεύθυνση up', t.direction === 'up')

  const d = periodTrend(80, [100, 100])
  ok('κατεύθυνση down', d.direction === 'down' && d.deltaPct === -20)

  const f = periodTrend(101, [100, 100])
  ok('σταθερό (<3%)', f.direction === 'flat')

  const e = periodTrend(100, [0, 0])   // όλα κενά
  ok('χωρίς ιστορικό → flat, 0%', e.avgPrior === 0 && e.deltaPct === 0 && e.direction === 'flat')
  const g = periodTrend(150, [200, 0, 100]) // αγνοεί το 0
  ok('αγνοεί μηδενικούς μήνες', g.avgPrior === 150)
}

// ── sumByMonth ───────────────────────────────────────────────────────────────
{
  const s = sumByMonth([
    { ym: '2026-01', amount: 100 }, { ym: '2026-01', amount: 50 },
    { ym: '2026-02', amount: 200 },
  ])
  ok('άθροισμα ανά μήνα', s['2026-01'] === 150 && s['2026-02'] === 200)
  ok('κενό → κενό', Object.keys(sumByMonth([])).length === 0)
}

// ── detectRecurring ──────────────────────────────────────────────────────────
{
  // Μηνιαία συνδρομή Netflix (διαφορετικά reference numbers, ίδιο ποσό).
  const netflix = detectRecurring([
    { date: '2026-01-05', amount: 12.99, description: 'NETFLIX.COM 8842', category: 'streaming' },
    { date: '2026-02-05', amount: 12.99, description: 'NETFLIX.COM 9931', category: 'streaming' },
    { date: '2026-03-05', amount: 12.99, description: 'NETFLIX.COM 1120', category: 'streaming' },
  ])
  ok('εντοπίζει μηνιαία συνδρομή', netflix.length === 1)
  ok('συχνότητα μηνιαία', netflix[0]?.cadence === 'monthly')
  ok('τυπικό ποσό 12,99', netflix[0]?.avgAmount === 12.99)
  ok('ετήσιο κόστος ~156', netflix[0]?.annualCost === Math.round(12.99 * 12))
  ok('υψηλή εμπιστοσύνη (3 τακτικοί μήνες)', netflix[0]?.confidence === 'high')
  ok('επόμενη αναμενόμενη = Απρίλιος', netflix[0]?.nextExpected === '2026-04-05')
  ok('κρατά κατηγορία', netflix[0]?.category === 'streaming')

  // Ετήσιο (ασφάλεια) — μία φορά τον χρόνο, per=12.
  const yearly = detectRecurring([
    { date: '2024-06-10', amount: 240, description: 'INTERAMERICAN ΑΣΦΑΛΙΣΤΗΡΙΟ' },
    { date: '2025-06-12', amount: 260, description: 'INTERAMERICAN ΑΣΦΑΛΙΣΤΗΡΙΟ' },
  ])
  ok('εντοπίζει ετήσια χρέωση', yearly[0]?.cadence === 'yearly')
  ok('μηνιαίο ισοδύναμο ~21 (250/12)', yearly[0]?.monthlyEquivalent === Math.round((250 / 12) * 100) / 100)

  // Μία μόνο εμφάνιση → ΔΕΝ είναι επαναλαμβανόμενη.
  const once = detectRecurring([{ date: '2026-01-05', amount: 40, description: 'IKEA ΑΓΟΡΑ' }])
  ok('μία εμφάνιση αγνοείται', once.length === 0)

  // Άσχετες χρεώσεις (διαφορετικοί έμποροι) δεν ομαδοποιούνται.
  const mixed = detectRecurring([
    { date: '2026-01-05', amount: 12.99, description: 'NETFLIX' },
    { date: '2026-02-05', amount: 12.99, description: 'NETFLIX' },
    { date: '2026-01-20', amount: 9.99, description: 'SPOTIFY AB' },
    { date: '2026-02-20', amount: 9.99, description: 'SPOTIFY AB' },
  ])
  ok('ξεχωρίζει δύο συνδρομές', mixed.length === 2)
  ok('ταξινόμηση κατά ετήσιο κόστος φθίνουσα', mixed[0].annualCost >= mixed[1].annualCost)

  // Μεταβλητό ποσό (ΔΕΗ) αλλά σταθερή μηνιαία συχνότητα → ακόμη επαναλαμβανόμενο.
  const deh = detectRecurring([
    { date: '2026-01-15', amount: 78, description: 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ ΙΑΝ' },
    { date: '2026-02-15', amount: 92, description: 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ ΦΕΒ' },
    { date: '2026-03-15', amount: 61, description: 'ΔΕΗ ΛΟΓΑΡΙΑΣΜΟΣ ΜΑΡ' },
  ])
  ok('ΔΕΗ ομαδοποιείται παρά το μεταβλητό ποσό', deh.length === 1 && deh[0].cadence === 'monthly')
  ok('μέσο ποσό ΔΕΗ = 77', deh[0]?.avgAmount === 77)

  ok('κενή είσοδος → κενό', detectRecurring([]).length === 0)
}

console.log(`\nbudget.test: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
