'use client'
import { useState } from 'react'
import { programStatus } from '@/lib/loans/programStatus'
import {
  SPITI_MOU, spitiMouEligibility, spitiMouPayment, spitiMouIncomeLimit,
  annuityMonthly, rankLoans, type UserLoanNeeds, type BankInput,
} from '@/lib/loans/recommend'

// ── «Σπίτι μου ΙΙ — για σένα» ────────────────────────────────────────────────
// Συγκεντρώνει σε μία εικόνα: το 50/50 σκέλος (άτοκο/τραπεζικό), την πραγματική
// δόση και εξοικονόμηση έναντι κανονικού δανείου, τα κριτήρια ένα-ένα (ναι/όχι),
// τις συμμετέχουσες τράπεζες και την αντίστροφη μέτρηση ως τη λήξη συμβολαίων.
const FONT = "'Inter',sans-serif"
const MONO = "'Roboto Mono',monospace"

type Crit = { label: string; status: 'pass' | 'fail' | 'unknown'; detail: string }

export default function SpitiMouPanel({
  amount, propertyValue, years, bankRatePct, incomeMonthly, marital, childCount,
  sqm, yearBuilt, banks, euribor, fmtEur, fmtPct, onOpenCalculator,
}: {
  amount: number; propertyValue: number; years: number; bankRatePct: number
  incomeMonthly?: number; marital?: 'single' | 'married' | 'single_parent';
  /** Αριθμός εξαρτώμενων τέκνων για το εισοδηματικό όριο «Σπίτι μου ΙΙ».
   *  ΔΕΝ είναι React children — γι' αυτό δεν λέγεται `children`. */
  childCount?: number
  // Ο πίνακας τραπεζών πηγαίνει αυτούσιος στον `rankLoans`, άρα ο τύπος του
  // είναι αυτός που ζητά ο `rankLoans` — ούτε ένα πεδίο λιγότερο. Με `any[]`
  // χρειαζόταν `as any` στην κλήση παρακάτω, δηλαδή μια τράπεζα χωρίς
  // `fixed_min`/`max_ltv` περνούσε αθόρυβα και έβγαινε κατάταξη με μηδενικά
  // επιτόκια. Ίδιος τύπος με το LoanDocScan, που δέχεται τον ίδιο πίνακα.
  sqm?: number; yearBuilt?: number; banks: BankInput[]; euribor: number
  fmtEur: (n: number) => string; fmtPct: (n: number) => string; onOpenCalculator?: () => void
}) {
  const [hi, setHi] = useState(false)
  const incomeAnnual = incomeMonthly && incomeMonthly > 0 ? Math.round(incomeMonthly * 12) : undefined
  const needs: UserLoanNeeds = {
    amount, propertyValue, years, purpose: 'first_home', ratePreference: 'fixed',
    income: incomeAnnual, maritalStatus: marital ?? 'single', children: childCount ?? 0,
    propertySqm: sqm, propertyYearBuilt: yearBuilt, firstHome: true,
  }
  const elig = spitiMouEligibility(needs)
  const pay = spitiMouPayment(amount, bankRatePct, years, elig.interestFreeShare, elig.rateSubsidyShare)
  const normalMonthly = annuityMonthly(amount, bankRatePct, years)
  const months = years * 12
  const saveMonthly = Math.max(0, normalMonthly - pay.monthly)
  const saveTotal = Math.max(0, (normalMonthly - pay.monthly) * months)
  const incomeLimit = spitiMouIncomeLimit(needs.maritalStatus, needs.children)

  // Κριτήρια ένα-ένα: όσα ξέρουμε ελέγχονται, τα υπόλοιπα «προς επιβεβαίωση».
  const crit: Crit[] = [
    { label: 'Πρώτη και κύρια κατοικία', status: 'unknown', detail: 'Προς επιβεβαίωση' },
    { label: 'Ηλικία 25–50 ετών', status: 'unknown', detail: 'Προς επιβεβαίωση' },
    { label: 'Αξία ακινήτου έως 250.000 €', status: propertyValue > 0 ? (propertyValue <= SPITI_MOU.maxPropertyValue ? 'pass' : 'fail') : 'unknown', detail: propertyValue > 0 ? fmtEur(propertyValue) : 'Προς επιβεβαίωση' },
    { label: 'Ποσό δανείου έως 190.000 €', status: amount > 0 ? (amount <= SPITI_MOU.maxAmount ? 'pass' : 'fail') : 'unknown', detail: amount > 0 ? fmtEur(amount) : 'Προς επιβεβαίωση' },
    { label: 'Εμβαδόν έως 150 τ.μ.', status: sqm && sqm > 0 ? (sqm <= SPITI_MOU.maxSqm ? 'pass' : 'fail') : 'unknown', detail: sqm && sqm > 0 ? `${sqm} τ.μ.` : 'Προς επιβεβαίωση' },
    { label: 'Έτος κατασκευής έως 2007', status: yearBuilt && yearBuilt > 0 ? (yearBuilt <= SPITI_MOU.maxYearBuilt ? 'pass' : 'fail') : 'unknown', detail: yearBuilt && yearBuilt > 0 ? String(yearBuilt) : 'Προς επιβεβαίωση' },
    { label: 'Διάρκεια έως 30 έτη', status: years > 0 ? (years <= SPITI_MOU.maxYears ? 'pass' : 'fail') : 'unknown', detail: `${years} έτη` },
    { label: `Εισόδημα έως ${fmtEur(incomeLimit)}`, status: incomeAnnual ? (incomeAnnual <= incomeLimit && incomeAnnual >= SPITI_MOU.incomeMin ? 'pass' : 'fail') : 'unknown', detail: incomeAnnual ? `${fmtEur(incomeAnnual)} τον χρόνο` : 'Προς επιβεβαίωση' },
  ]
  const hardFail = crit.some(c => c.status === 'fail')

  // Συμμετέχουσες τράπεζες, κατά συνολικό κόστος.
  const ranked = rankLoans(needs, banks, euribor).filter(r => r.spitiMouApplied && r.eligible).slice(0, 3)

  // ── ΤΟ ΠΡΟΓΡΑΜΜΑ ΔΕΧΕΤΑΙ ΑΚΟΜΗ ΑΙΤΗΣΗ; ─────────────────────────────────────
  // ΤΟ ΣΦΑΛΜΑ: η αντίστροφη μέτρηση ήταν ως τη λήξη ΣΥΝΑΨΗΣ ΣΥΜΒΟΛΑΙΩΝ, και το
  // `applicationDeadline` καθόταν αχρησιμοποίητο δύο γραμμές πιο πάνω. Στις 8
  // Αυγούστου 2026 η κάρτα έγραφε «23 ημέρες ως τη λήξη» με σήμα «Πιθανώς
  // επιλέξιμο» — σε χρήστη που ΔΕΝ έχει κάνει αίτηση και δεν μπορεί πια: οι
  // αιτήσεις είχαν κλείσει στις 31/05. Οι 23 μέρες αφορούν μόνο όσους έχουν ήδη
  // έγκριση. Η κρίση έρχεται τώρα από το ΕΝΑ σημείο που την ξέρει.
  const status = programStatus(
    { applicationDeadline: SPITI_MOU.applicationDeadline, deadline: SPITI_MOU.contractDeadline },
    new Date())
  const deadline = new Date(SPITI_MOU.contractDeadline + 'T23:59:59')
  // Η αντίστροφη μέτρηση διαβάζει το ρολόι ΜΙΑ φορά, στην προσάρτηση: αλλιώς
  // κάθε απόδοση δίνει άλλη τιμή και ο διακομιστής διαφωνεί με τον περιηγητή.
  const [nowMs] = useState(() => Date.now())
  const daysLeft = Math.ceil((deadline.getTime() - nowMs) / 86400000)
  const deadlineStr = deadline.toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })

  const tri = (s: Crit['status']) => s === 'pass' ? 'var(--accent)' : s === 'fail' ? 'var(--negative)' : 'var(--text-tertiary)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Hero: μπλεντ επιτόκιο + δόση + εξοικονόμηση */}
      <div onMouseEnter={() => setHi(true)} onMouseLeave={() => setHi(false)} onTouchStart={() => setHi(true)} onTouchEnd={() => setHi(false)}
        style={{ position: 'relative', background: 'var(--bg-surface)', border: `1px solid ${hi ? 'var(--border-default)' : 'var(--border-subtle)'}`, borderLeft: '3px solid var(--accent)', borderRadius: 14, padding: '18px 20px', transition: 'border-color 0.15s, box-shadow 0.15s', boxShadow: hi ? 'var(--elev-2)' : 'var(--elev-1)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            {/* Όσο δεν δέχεται αιτήσεις, το «Πιθανώς επιλέξιμο» είναι υπόσχεση
                που δεν μπορεί να τηρηθεί, όσο σωστά κι αν βγαίνουν τα κριτήρια. */}
            <span style={{ fontSize: 10, padding: '3px 9px', borderRadius: 100, background: (hardFail || !status.acceptsApplications) ? 'var(--bg-elevated)' : 'var(--accent)', color: (hardFail || !status.acceptsApplications) ? 'var(--text-secondary)' : 'var(--accent-text)', fontWeight: 700, fontFamily: FONT }}>{!status.acceptsApplications ? status.badge : hardFail ? 'Δεν πληρούνται κριτήρια' : 'Πιθανώς επιλέξιμο'}</span>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5, fontFamily: FONT }}>
              Το 50% του δανείου είναι <strong style={{ color: 'var(--text-primary)' }}>άτοκο</strong> (Ταμείο Ανάκαμψης) και το 50% με το επιτόκιο της τράπεζας{elig.rateSubsidyShare > 0 ? ', με επιπλέον 50% επιδότηση επιτοκίου για πολύτεκνους' : ''}.
            </p>
          </div>
          <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
            <p style={{ fontSize: 28, fontWeight: 700, color: hi ? 'var(--accent)' : 'var(--text-primary)', fontFamily: FONT, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em', transition: 'color 0.15s' }}>{fmtPct(pay.blendedRatePct)}</p>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: FONT }}>μέσο πραγματικό επιτόκιο</p>
          </div>
        </div>
      </div>

      {/* KPI: δόση vs κανονική + εξοικονόμηση */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
        {[
          { k: 'Δόση με Σπίτι μου ΙΙ', v: fmtEur(pay.monthly), s: 'τον μήνα' },
          { k: 'Κανονική δόση', v: fmtEur(normalMonthly), s: `με ${fmtPct(bankRatePct)}` },
          { k: 'Εξοικονόμηση τον μήνα', v: fmtEur(saveMonthly), s: `${fmtEur(saveTotal)} συνολικά` },
        ].map(t => (
          <div key={t.k} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 16 }}>
            <p style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: FONT }}>{t.k}</p>
            <p style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, marginTop: 7, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', fontFamily: FONT }}>{t.v}</p>
            <p style={{ fontSize: 11, marginTop: 5, color: 'var(--text-tertiary)', fontFamily: FONT }}>{t.s}</p>
          </div>
        ))}
      </div>

      {/* Κατανομή 50/50 */}
      <div>
        <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
          <div title="Άτοκο σκέλος" style={{ width: `${Math.round(elig.interestFreeShare * 100)}%`, background: 'var(--accent)' }} />
          <div title="Τραπεζικό σκέλος" style={{ flex: 1, background: 'var(--bg-elevated)' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: FONT }}>{Math.round(elig.interestFreeShare * 100)}% άτοκο · {fmtEur(amount * elig.interestFreeShare)}</span>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: FONT }}>{100 - Math.round(elig.interestFreeShare * 100)}% τραπεζικό · {fmtEur(amount - amount * elig.interestFreeShare)}</span>
        </div>
      </div>

      {/* Κριτήρια ένα-ένα */}
      <div>
        <p style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: FONT, marginBottom: 9 }}>Κριτήρια ένταξης</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 7 }}>
          {crit.map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>
              <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.status === 'pass' ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: c.status === 'pass' ? 'none' : '1px solid var(--border-subtle)' }}>
                {c.status === 'pass'
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
                  : c.status === 'fail'
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--negative)" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  : <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--text-tertiary)' }} />}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: c.status === 'fail' ? 'var(--negative)' : 'var(--text-primary)', fontFamily: FONT, fontWeight: 500 }}>{c.label}</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FONT, marginTop: 1 }}>{c.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Συμμετέχουσες τράπεζες */}
      {ranked.length > 0 && (
        <div>
          <p style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: FONT, marginBottom: 9 }}>Συμμετέχουσες τράπεζες, κατά συνολικό κόστος</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {ranked.map((r, i) => (
              <div key={r.bankId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', background: 'var(--bg-surface)', border: `1px solid ${i === 0 ? 'var(--border-accent)' : 'var(--border-subtle)'}`, borderRadius: 10 }}>
                <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: '50%', background: i === 0 ? 'var(--accent-dim)' : 'var(--bg-elevated)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontFamily: FONT }}>{i + 1}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', fontFamily: FONT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.bankName}</span>
                <span style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fmtEur(r.monthlyPayment)}</span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FONT, marginTop: 2 }}>τον μήνα · {fmtPct(r.effectiveRatePct)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Προθεσμία + προειδοποίηση μίας τράπεζας */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${daysLeft > 0 && daysLeft <= 60 ? 'var(--accent)' : 'var(--border-default)'}`, borderRadius: 10, flexWrap: 'wrap' }}>
        {/* Ο αριθμός των ημερών μπαίνει ΜΟΝΟ όταν αφορά τον αναγνώστη. Μεγάλο
            νούμερο δίπλα σε κλειστό πρόγραμμα διαβάζεται ως «προλαβαίνεις». */}
        {status.acceptsApplications && daysLeft > 0 ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: daysLeft <= 60 ? 'var(--accent)' : 'var(--text-primary)', fontFamily: FONT, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{daysLeft}</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: FONT }}>ημέρες ως τη λήξη σύναψης συμβολαίων</span>
          </span>
        ) : (
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: FONT, fontWeight: 500, lineHeight: 1.55 }}>{status.note || 'Η προθεσμία σύναψης συμβολαίων έχει παρέλθει'}</span>
        )}
        {status.acceptsApplications && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: FONT, marginLeft: 'auto' }}>Προθεσμία {deadlineStr}</span>}
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.6, fontFamily: FONT }}>
        Επιτρέπεται αίτηση σε <strong style={{ color: 'var(--text-secondary)' }}>μία μόνο τράπεζα</strong>, οπότε επίλεξε προσεκτικά με βάση το συνολικό κόστος. Ενδεικτικά στοιχεία, επιβεβαίωσε την επιλεξιμότητα στην{' '}
        <a href="https://www.gov.gr/ipiresies/periousia-kai-phorologia/akinhta/elegkhos-epile3imotetas-programmatos-spiti-mou-ii" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 500 }}>επίσημη πύλη</a>.
        {onOpenCalculator && <> Συμπλήρωσε ηλικία, εισόδημα και στοιχεία ακινήτου στον <button onClick={onOpenCalculator} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontWeight: 500, fontFamily: FONT, fontSize: 11 }}>Υπολογιστή</button> για ακριβέστερο έλεγχο.</>}
      </p>
    </div>
  )
}
