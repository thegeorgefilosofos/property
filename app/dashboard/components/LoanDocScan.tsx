'use client'
import { useCallback, useRef, useState } from 'react'
import { rankLoans, type UserLoanNeeds } from '@/lib/loans/recommend'
import { fmtEur, fmtPct } from './TabLoanData'

// ── Σάρωση εγγράφου/φωτογραφίας δανειολήπτη → εξαγωγή πεδίων → πρόταση δανείου ──
// Ανεβάζεις φωτογραφία ή αρχείο με τις επιθυμίες ενός υποψήφιου δανειολήπτη (ή
// υπάρχον δάνειο)· το AI εξάγει τα στοιχεία, τρέχει τον πραγματικό recommender
// και δίνει άμεση, τεκμηριωμένη πρόταση. Χωρίς διπλότυπα: ίδιο /api/anthropic
// pattern με τη σάρωση εγγράφων, ίδιος engine με το tab.

const PURPOSES = ['purchase','first_home','renovation','energy','investment','auction','construction','commercial','land','refinance'] as const
type Purpose = typeof PURPOSES[number]

const SYSTEM_PROMPT = `Είσαι εξειδικευμένος αναλυτής στεγαστικών δανείων στην Ελλάδα. Σου δίνεται φωτογραφία ή έγγραφο με τις επιθυμίες/ανάγκες ενός υποψήφιου δανειολήπτη ή τα στοιχεία ενός υπάρχοντος δανείου.
Εξήγαγε ΜΟΝΟ ό,τι αναφέρεται ρητά ή προκύπτει με ασφάλεια. Επίστρεψε ΑΠΟΚΛΕΙΣΤΙΚΑ ένα έγκυρο JSON, χωρίς σχόλια ή κείμενο εκτός JSON, με το εξής σχήμα (παρέλειψε όποιο πεδίο δεν προκύπτει):
{
  "loan_amount": number,            // ποσό δανείου σε ευρώ
  "property_value": number,          // αξία/τιμή ακινήτου σε ευρώ
  "years": number,                   // διάρκεια σε έτη
  "purpose": "purchase|first_home|renovation|energy|investment|auction|construction|commercial|land|refinance",
  "rate_preference": "fixed|variable|mixed",
  "age": number,
  "income_annual": number,           // ετήσιο καθαρό/δηλωθέν εισόδημα σε ευρώ
  "marital_status": "single|married|single_parent",
  "children": number,
  "first_home": boolean,             // αν πρόκειται για πρώτη κατοικία
  "energy_class": string,            // π.χ. "A+", "B", "Γ"
  "property_year_built": number,
  "property_sqm": number,
  "bank": string,                    // αν αναφέρεται τράπεζα
  "current_rate": number,            // αν είναι υπάρχον δάνειο, το επιτόκιό του (%)
  "summary": string,                 // μία σύντομη πρόταση για το τι ζητά ο δανειολήπτης
  "confidence": number               // 0-100
}
Οι αριθμοί χωρίς σύμβολα ή τελείες χιλιάδων. Αν δεν είσαι σίγουρος για ένα πεδίο, παρέλειψέ το.`

type Extracted = {
  loan_amount?: number; property_value?: number; years?: number; purpose?: string
  rate_preference?: string; age?: number; income_annual?: number; marital_status?: string
  children?: number; first_home?: boolean; energy_class?: string; property_year_built?: number
  property_sqm?: number; bank?: string; current_rate?: number; summary?: string; confidence?: number
}

const num = (v: unknown): number | undefined => {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^\d.,-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'))
  return isFinite(n) ? n : undefined
}

export interface AppliedLoan { v: number; loanAmount?: number; propValue?: number; rate?: number; years?: number; rateType?: 'fixed'|'variable'|'mixed'; loanType?: string; income?: number; marital?: 'single'|'married'; children?: number }

export default function LoanDocScan({ banks, euribor, defaultPropertyValue, onApply, onSaveLoan, onOpenCalculator }: {
  banks: any[]; euribor: number; defaultPropertyValue?: number
  onApply?: (a: AppliedLoan) => void
  onSaveLoan?: (loan: any) => Promise<void> | void
  onOpenCalculator?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const [ex, setEx] = useState<Extracted | null>(null)
  const [saving, setSaving] = useState(false)

  const scan = async (base64: string, mime: string) => {
    setScanning(true); setError(''); setEx(null)
    const isPdf = mime === 'application/pdf'
    const part = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } }
    try {
      const res = await fetch('/api/anthropic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5', max_tokens: 1200, system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: [part, { type: 'text', text: 'Εξήγαγε τα στοιχεία δανείου με ακρίβεια και επίστρεψε μόνο το JSON.' }] }],
        }),
      })
      const data = await res.json()
      if (!res.ok || data?.error) { setError(String(data?.error || '').includes('API_KEY') ? 'key' : 'service'); return }
      const text = (data.content || []).find((c: { type: string }) => c.type === 'text')?.text || '{}'
      const parsed = JSON.parse(text.replace(/```json?|```/g, '').trim()) as Extracted
      // Ντετερμινιστική εξομάλυνση αριθμών (το AI μπορεί να δώσει strings/σύμβολα).
      ;(['loan_amount','property_value','years','age','income_annual','children','property_year_built','property_sqm','current_rate','confidence'] as const)
        .forEach(k => { if (parsed[k] != null) (parsed as any)[k] = num(parsed[k]) })
      setEx(parsed)
    } catch { setError('unreadable') }
    finally { setScanning(false) }
  }

  const loadFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/') && f.type !== 'application/pdf') { setError('Υποστηριζόμενα: JPG, PNG, PDF'); return }
    if (f.size > 10 * 1024 * 1024) { setError('Το αρχείο είναι πολύ μεγάλο (όριο 10MB).'); return }
    const reader = new FileReader()
    reader.onload = e => { const dataUrl = e.target?.result as string; scan(dataUrl.split(',')[1], f.type || 'image/jpeg') }
    reader.readAsDataURL(f)
  }, [])

  // Χτίζει τις ανάγκες δανειολήπτη από τα εξαγόμενα, με ασφαλείς προεπιλογές.
  const needs: UserLoanNeeds | null = ex && (ex.loan_amount || ex.property_value) ? {
    amount: ex.loan_amount || Math.round((ex.property_value || 0) * 0.8) || 0,
    propertyValue: ex.property_value || defaultPropertyValue || 0,
    years: ex.years || 25,
    purpose: (PURPOSES.includes(ex.purpose as Purpose) ? ex.purpose : (ex.first_home ? 'first_home' : 'purchase')) as Purpose,
    ratePreference: (ex.rate_preference === 'variable' || ex.rate_preference === 'mixed') ? ex.rate_preference : 'fixed',
    age: ex.age,
    income: ex.income_annual,
    maritalStatus: (ex.marital_status === 'married' || ex.marital_status === 'single_parent') ? ex.marital_status : 'single',
    children: ex.children,
    firstHome: ex.first_home ?? (ex.purpose === 'first_home'),
    propertySqm: ex.property_sqm,
    propertyYearBuilt: ex.property_year_built,
    energyClass: ex.energy_class,
  } : null

  const ranked = needs ? rankLoans(needs, banks as any, euribor) : []
  const best = ranked.find(r => r.eligible) || ranked[0]

  const applyToCalc = () => {
    if (!needs) return
    onApply?.({
      v: Date.now() % 1e9 + Math.round((ex?.confidence || 0)),
      loanAmount: needs.amount, propValue: needs.propertyValue, years: needs.years,
      rate: best?.effectiveRatePct ?? ex?.current_rate,
      rateType: needs.ratePreference,
      loanType: needs.purpose,
      income: ex?.income_annual ? Math.round(ex.income_annual / 12) : undefined,
      marital: needs.maritalStatus === 'married' ? 'married' : 'single',
      children: needs.children,
    })
    onOpenCalculator?.()
  }

  const saveAsLoan = async () => {
    if (!needs || !best) return
    setSaving(true)
    try {
      await onSaveLoan?.({
        bank: best.bankName || ex?.bank || '', amount: needs.amount,
        rate: Number((best.effectiveRatePct ?? ex?.current_rate ?? 3.5).toFixed(2)),
        years: needs.years, rate_type: needs.ratePreference === 'variable' ? 'variable' : 'fixed',
        property_value: needs.propertyValue, loan_type: needs.purpose,
        start_date: new Date().toISOString().split('T')[0], status: 'active',
        notes: `Από σάρωση εγγράφου${ex?.summary ? ` · ${ex.summary}` : ''}`,
      })
    } finally { setSaving(false) }
  }

  const chips: { k: string; v: string }[] = ex ? [
    ex.loan_amount ? { k: 'Ποσό δανείου', v: fmtEur(ex.loan_amount) } : null,
    ex.property_value ? { k: 'Αξία ακινήτου', v: fmtEur(ex.property_value) } : null,
    ex.years ? { k: 'Διάρκεια', v: `${ex.years} έτη` } : null,
    ex.income_annual ? { k: 'Εισόδημα (έτος)', v: fmtEur(ex.income_annual) } : null,
    ex.age ? { k: 'Ηλικία', v: `${ex.age} ετών` } : null,
    ex.children != null ? { k: 'Τέκνα', v: String(ex.children) } : null,
    ex.first_home ? { k: 'Κατοικία', v: 'Πρώτη κατοικία' } : null,
    ex.energy_class ? { k: 'Ενεργειακή κλάση', v: ex.energy_class } : null,
    ex.bank ? { k: 'Τράπεζα', v: ex.bank } : null,
  ].filter(Boolean) as { k: string; v: string }[] : []

  const font = "'Inter',sans-serif"
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: '16px 20px', boxShadow: 'var(--shadow-sm)' }}>
      <input ref={inputRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.currentTarget.value = '' }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: ex || scanning ? 16 : 0 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: font, letterSpacing: '-0.01em' }}>Ανάλυση από έγγραφο ή φωτογραφία</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: font, lineHeight: 1.5 }}>Ανέβασε τις επιθυμίες ενός υποψήφιου δανειολήπτη ή ένα υπάρχον δάνειο· το εργαλείο εξάγει τα στοιχεία και προτείνει.</p>
        </div>
        <button onClick={() => inputRef.current?.click()} disabled={scanning} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 16px', height: 40, borderRadius: 10, background: 'var(--accent)', border: 'none', color: 'var(--accent-text)', fontSize: 13, fontFamily: font, fontWeight: 600, cursor: scanning ? 'wait' : 'pointer', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></svg>
          {scanning ? 'Ανάλυση…' : 'Ανέβασε αρχείο'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '11px 14px', background: 'var(--negative-dim)', border: '1px solid var(--negative-border)', borderRadius: 10 }}>
          <p style={{ fontSize: 13, color: 'var(--negative)', fontFamily: font, lineHeight: 1.5 }}>
            {error === 'key' ? 'Η υπηρεσία ανάλυσης δεν είναι διαθέσιμη αυτή τη στιγμή.' : error === 'service' ? 'Προσωρινό πρόβλημα στην υπηρεσία. Δοκίμασε ξανά.' : 'Δεν διαβάστηκε καθαρά το αρχείο. Δοκίμασε πιο ευκρινή φωτογραφία ή PDF.'}
          </p>
        </div>
      )}

      {scanning && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0' }}>
          <span style={{ width: 16, height: 16, border: '2px solid var(--border-default)', borderTopColor: 'var(--accent)', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: font }}>Ανάγνωση και ανάλυση εγγράφου…</span>
          <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      {ex && !scanning && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ex.summary && <p style={{ fontSize: 13, color: 'var(--text-secondary)', fontFamily: font, lineHeight: 1.6, padding: '11px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>{ex.summary}</p>}

          {chips.length > 0 && (
            <div>
              <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--text-tertiary)', fontFamily: font, marginBottom: 8 }}>Στοιχεία που εντοπίστηκαν</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {chips.map(c => (
                  <span key={c.k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, padding: '6px 11px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10 }}>
                    <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)', fontFamily: font }}>{c.k}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: font, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{c.v}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {best ? (
            <div style={{ padding: '16px 18px', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, color: 'var(--accent)', fontFamily: font, marginBottom: 4 }}>Προτεινόμενο δάνειο</p>
                  <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontFamily: font, letterSpacing: '-0.01em' }}>{best.bankName}{best.spitiMouApplied ? ' · Σπίτι μου ΙΙ' : ''}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, fontFamily: font, lineHeight: 1.5 }}>{best.eligible ? best.why : best.blockers.join(' · ')}</p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', fontFamily: font, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-0.02em' }}>{fmtPct(best.effectiveRatePct)}</p>
                  <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 5, fontFamily: font, fontVariantNumeric: 'tabular-nums' }}>{fmtEur(best.monthlyPayment)} τον μήνα</p>
                  <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1, fontFamily: font, fontVariantNumeric: 'tabular-nums' }}>Σύνολο {fmtEur(best.totalCost)}</p>
                </div>
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: font }}>Δεν προέκυψαν αρκετά στοιχεία (ποσό ή αξία ακινήτου) για πρόταση. Δοκίμασε πιο πλήρες έγγραφο.</p>
          )}

          {needs && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={applyToCalc} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 16px', height: 40, borderRadius: 10, background: 'var(--accent)', border: 'none', color: 'var(--accent-text)', fontSize: 12.5, fontFamily: font, fontWeight: 600, cursor: 'pointer' }}>Εφαρμογή στον υπολογιστή</button>
              {onSaveLoan && best && <button onClick={saveAsLoan} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 16px', height: 40, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontSize: 12.5, fontFamily: font, fontWeight: 500, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση ως δάνειο'}</button>}
              <button onClick={() => setEx(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 14px', height: 40, borderRadius: 10, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', fontSize: 12.5, fontFamily: font, fontWeight: 500, cursor: 'pointer' }}>Καθαρισμός</button>
            </div>
          )}
          <p style={{ fontSize: 10.5, color: 'var(--text-tertiary)', lineHeight: 1.6, fontFamily: font }}>Ενδεικτική ανάλυση βάσει των στοιχείων του εγγράφου. Επιβεβαίωσε τους ακριβείς όρους με την τράπεζα.</p>
        </div>
      )}
    </div>
  )
}
