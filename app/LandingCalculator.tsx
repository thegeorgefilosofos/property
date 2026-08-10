'use client'
import { useState } from 'react'
import Link from 'next/link'
import { rentalIncomeTax } from '@/lib/billing/greekTax'

// ═══════════════════════════════════════════════════════════════════════════
// Ζωντανό εργαλείο απόδοσης μέσα στο landing. Τρέχει την ΙΔΙΑ ακριβή φορολογική
// συνάρτηση με την εφαρμογή (κλίμακα ενοικίων 2026: 15/25/35/45%). Δίνει αξία
// επιτόπου και αποδεικνύει την ακρίβειά μας, χωρίς να δείχνει καθόλου την
// εφαρμογή και χωρίς κανένα «παραδειγματικό» νούμερο: υπολογίζει από τα δικά
// σου στοιχεία. Καθαρά client-side, καμία αποθήκευση, καμία αποστολή.
// ═══════════════════════════════════════════════════════════════════════════

const el0 = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const el1 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const eur = (n: number) => `${el0.format(Math.round(n))} €`
const pct = (n: number) => `${el1.format(n * 100)}%`

// Πλάτος κλιμακίου φόρου, για την οπτική «πού πέφτεις» στην κλίμακα.
const BANDS = [
  { to: 12000, rate: '15%' },
  { to: 24000, rate: '25%' },
  { to: 35000, rate: '35%' },
  { to: 45000, rate: '45%' },
]
const SCALE_MAX = 45000

function Control({ label, hint, value, set, min, max, step, format }: {
  label: string; hint: string; value: number; set: (n: number) => void; min: number; max: number; step: number; format: (n: number) => string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</label>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{format(value)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => set(Number(e.target.value))}
        aria-label={label} style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }} />
      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{hint}</span>
    </div>
  )
}

function Stat({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: 'accent' | 'positive' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 1, fontWeight: 700, fontSize: big ? 'clamp(30px, 5vw, 42px)' : 20, color: tone === 'positive' ? 'var(--positive)' : tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

export default function LandingCalculator() {
  const [rent, setRent] = useState(650)
  const [value, setValue] = useState(180000)
  const [costs, setCosts] = useState(1200)

  const annual = rent * 12
  const taxable = annual * 0.95            // τεκμαρτή έκπτωση 5% για συντήρηση/επισκευές
  const tax = rentalIncomeTax(taxable)
  const net = annual - tax - costs
  const grossYield = value > 0 ? annual / value : 0
  const netYield = value > 0 ? net / value : 0
  const monthlyNet = net / 12
  const effRate = annual > 0 ? tax / annual : 0
  const markerPct = Math.min(Math.max(taxable, 0), SCALE_MAX) / SCALE_MAX * 100

  return (
    <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'clamp(16px, 3vw, 28px)', alignItems: 'stretch' }}>
      <style>{`
        @media (max-width: 820px) { .calc-grid { grid-template-columns: 1fr !important; } }
        .calc-panel { background: var(--bg-surface); border: 1px solid var(--border-default); border-radius: 18px; padding: clamp(22px, 3vw, 32px); }
        .calc-band { position: relative; height: 8px; border-radius: 100px; overflow: hidden; display: flex; }
        .calc-marker { position: absolute; top: -4px; width: 2px; height: 16px; background: var(--text-primary); border-radius: 2px; transition: left .25s cubic-bezier(.2,0,0,1); }
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
      `}</style>

      {/* Αριστερά: τα δικά σου δεδομένα */}
      <div className="calc-panel" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Control label="Μηνιαίο ενοίκιο" hint="Το μεικτό μηνιαίο μίσθωμα" value={rent} set={setRent} min={100} max={5000} step={10} format={eur} />
        <Control label="Αξία ακινήτου" hint="Τρέχουσα εμπορική αξία, για τον υπολογισμό απόδοσης" value={value} set={setValue} min={2000} max={1000000} step={1000} format={eur} />
        <Control label="Ετήσιες δαπάνες" hint="ΕΝΦΙΑ, ασφάλεια, συντήρηση, κοινόχρηστα ιδιοκτήτη" value={costs} set={setCosts} min={0} max={10000} step={100} format={eur} />

        {/* Πού πέφτεις στην κλίμακα ενοικίων 2026 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span>Κλίμακα ενοικίων 2026</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>φορολογητέο {eur(taxable)}</span>
          </div>
          <div className="calc-band">
            {BANDS.map((b, i) => (
              <div key={i} style={{ flex: (b.to - (BANDS[i - 1]?.to ?? 0)), background: `color-mix(in srgb, var(--accent) ${18 + i * 22}%, transparent)`, borderRight: i < BANDS.length - 1 ? '1px solid var(--bg-surface)' : 'none' }} />
            ))}
            <div className="calc-marker" style={{ left: `${markerPct}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {BANDS.map((b, i) => <span key={i}>{b.rate}</span>)}
          </div>
        </div>
      </div>

      {/* Δεξιά: το αποτέλεσμα, ζωντανά */}
      <div className="calc-panel" style={{ display: 'flex', flexDirection: 'column', gap: 22, background: 'var(--bg-elevated)' }}>
        <Stat label="Καθαρή απόδοση, μετά τον φόρο" value={pct(netYield)} big tone="positive" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
          <Stat label="Καθαρά τον μήνα" value={eur(monthlyNet)} />
          <Stat label="Ακαθάριστη απόδοση" value={pct(grossYield)} />
          <Stat label="Ετήσιος φόρος ενοικίων" value={eur(tax)} />
          <Stat label="Μέσος συντελεστής" value={pct(effRate)} />
        </div>
        <div style={{ flex: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0 }}>
          Ενδεικτικός υπολογισμός με την κλίμακα ενοικίων 2026 και τεκμαρτή έκπτωση 5%. Δεν υποκαθιστά τον λογιστή σου.
        </p>
        <Link href="/signup" className="lp-cta lp-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100 }}>
          Δες τα δικά σου δεδομένα, αυτόματα
        </Link>
      </div>
    </div>
  )
}
