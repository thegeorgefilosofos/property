'use client'
import { useState } from 'react'
import Link from 'next/link'
import { T } from '@/components/tokens'
import { rentalIncomeTax, RENTAL_TAX_BRACKETS_2026, taxRateLabel } from '@/lib/billing/greekTax'
import { fe, fp } from '@/lib/core/format'
import { PRESUMPTIVE_DEDUCTION_RATE } from '@/lib/accounting/statement'
import LiveResult from '@/components/LiveResult'

// ═══════════════════════════════════════════════════════════════════════════
// Ζωντανό εργαλείο απόδοσης μέσα στο landing. Τρέχει την ΙΔΙΑ ακριβή φορολογική
// συνάρτηση με την εφαρμογή (κλίμακα ενοικίων 2026: 15/25/35/45%). Δίνει αξία
// επιτόπου και αποδεικνύει την ακρίβειά μας, χωρίς να δείχνει καθόλου την
// εφαρμογή και χωρίς κανένα «παραδειγματικό» νούμερο: υπολογίζει από τα δικά
// σου στοιχεία. Καθαρά client-side, καμία αποθήκευση, καμία αποστολή.
// ═══════════════════════════════════════════════════════════════════════════

// ═══ ΔΥΟ ΤΟΠΙΚΟΙ ΜΟΡΦΟΠΟΙΗΤΕΣ, ΜΕ ΑΛΛΟΥΣ ΚΑΝΟΝΕΣ ΑΠΟ ΟΛΗ ΤΗΝ ΕΦΑΡΜΟΓΗ ══════
// Έγραφαν «650 €» και «3,0%»: μηδέν δεκαδικά στα ποσά, ένα στα ποσοστά — ενώ ο
// κανόνας του έργου είναι ΔΥΟ, παντού, ώστε οι υποδιαστολές να στοιχίζονται
// κάθετα. Ο επισκέπτης έβλεπε «457 €» εδώ και «457,00 €» δύο κλικ μετά, στην
// ίδια αριθμομηχανή που υπόσχεται «οι ίδιοι υπολογισμοί με την εφαρμογή».
//
// Και ο φύλακας τοπικών μορφοποιητών ΔΕΝ το έπιασε: έψαχνε `toLocaleString`,
// ενώ εδώ ήταν `new Intl.NumberFormat`. Ίδια δουλειά, άλλο API — και η τρύπα
// ήταν ακριβώς στη μία σελίδα που βλέπει ο επισκέπτης πριν πληρώσει. Ο φύλακας
// επεκτάθηκε την ίδια μέρα.
//
// Το `fp` δέχεται ποσοστιαία μονάδα, όχι κλάσμα: 0,043 γίνεται fp(4,3).
const pct = (n: number) => fp(n * 100)

// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΛΙΜΑΚΑ ΔΕΝ ΞΑΝΑΓΡΑΦΕΤΑΙ ΕΔΩ.
// ─────────────────────────────────────────────────────────────────────────
// Ηταν χειρόγραφος πίνακας με τα ίδια όρια (12.000 / 24.000 / 35.000) και τα
// ίδια ποσοστά ('15%'…'45%') που ζουν στο lib/billing/greekTax.ts. Δηλαδή η
// ΠΡΩΤΗ οθόνη που βλέπει ο επισκέπτης κρατούσε δικό της αντίγραφο του νόμου,
// δίπλα στον υπολογισμό που έρχεται απο τη μία πηγή: με την πρώτη αλλαγή
// κλίμακας, ο αριθμός θα άλλαζε και η ζωγραφισμένη κλίμακα από κάτω του όχι.
//
// ΤΟ ΤΑΒΑΝΙ ΕΙΝΑΙ ΣΧΕΔΙΑΣΤΙΚΟ, ΚΑΙ ΤΟ ΛΕΕΙ. Το τελευταίο κλιμάκιο πάει ώς το
// άπειρο· μια μπάρα δεν ζωγραφίζεται ώς το άπειρο. Το `SCALE_MAX` δίνει στο
// ανώτατο κλιμάκιο ΟΡΑΤΟ πλάτος και δεν είναι φορολογικό όριο — γι' αυτό
// γράφεται χωριστά, με όνομα που το λέει, αντί να κρύβεται ως «to: 45000».
// ═══════════════════════════════════════════════════════════════════════════
const SCALE_MAX = 45000
const BANDS = RENTAL_TAX_BRACKETS_2026.map(b => ({
  to: Number.isFinite(b.to) ? b.to : SCALE_MAX,
  rate: taxRateLabel(b.rate),
}))

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

// ═══ ΤΟ ΠΡΑΣΙΝΟ ΕΦΥΓΕ ΑΠΟ ΤΗΝ ΑΠΟΔΟΣΗ ══════════════════════════════════════
// Ο μεγάλος αριθμός ήταν `var(--positive)`, δηλαδή η οθόνη έλεγε «καλό» για
// κάθε τιμή: και για 3,00% και για 0,40%. Μια απόδοση δεν είναι θετική ή
// αρνητική από μόνη της· εξαρτάται από το τι θα έκανε ο ίδιος με τα ίδια
// χρήματα αλλού και αυτό το κρίνει εκείνος. Η έμφαση μένει και τη δίνει το
// μέγεθος: σαράντα δύο εικονοστοιχεία δίπλα σε είκοσι.
function Stat({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: 'accent' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.02em' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em', lineHeight: 1, fontWeight: 700, fontSize: big ? 'clamp(30px, 5vw, 42px)' : 20, color: tone === 'accent' ? 'var(--accent)' : 'var(--text-primary)' }}>{value}</span>
    </div>
  )
}

export default function LandingCalculator() {
  const [rent, setRent] = useState(650)
  const [value, setValue] = useState(180000)
  const [costs, setCosts] = useState(1200)

  const annual = rent * 12
  // Η ΕΚΠΤΩΣΗ ΒΓΑΙΝΕΙ ΑΠΟ ΤΗ ΜΙΑ ΠΗΓΗ. Ηταν κυριολεκτικό `0.95` — τρίτο
  // αντίγραφο του ίδιου φορολογικού κανόνα, στην πρώτη οθόνη που βλέπει ο
  // επισκέπτης. Ο υπολογιστής εδώ δεν ρωτά τρόπο είσπραξης, οπότε κρατά την
  // ευνοϊκή παραδοχή· η υποσημείωση το λέει ρητά, αντί να το αποσιωπά.
  const taxable = annual * (1 - PRESUMPTIVE_DEDUCTION_RATE)
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
        /* ΤΟ ΚΟΨΙΜΟ ΑΝΗΚΕΙ ΣΤΙΣ ΖΩΝΕΣ, ΟΧΙ ΣΤΟΝ ΔΕΙΚΤΗ.
           Ο δείκτης ζούσε ΜΕΣΑ στο .calc-band, που έχει «overflow: hidden» για
           να στρογγυλεύει τις χρωματιστές ζώνες στα άκρα του. Ετσι κοβόταν και
           αυτός: ύψος 16 μέσα σε κουτί 8, δηλαδή έχανε τέσσερα εικονοστοιχεία
           από πάνω και τέσσερα από κάτω, ακριβώς το κομμάτι που τον κάνει
           δείκτη αντί για κουκκίδα. Μετρημένο σε Chromium στα 390.

           Η διαδρομή κρατά τη θέση, η ταινία κρατά το κόψιμο, ο δείκτης
           κάθεται πάνω από τα δύο. */
        .calc-track { position: relative; }
        .calc-band { position: relative; height: 8px; border-radius: 100px; overflow: hidden; display: flex; }
        .calc-marker { position: absolute; top: -4px; width: 2px; height: 16px; background: var(--text-primary); border-radius: 2px; transition: left .25s cubic-bezier(.2,0,0,1); }
        input[type=range]::-webkit-slider-thumb { cursor: pointer; }
      `}</style>

      {/* Αριστερά: τα δικά σου δεδομένα */}
      <div className="calc-panel" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Control label="Μηνιαίο ενοίκιο" hint="Το μεικτό μηνιαίο μίσθωμα" value={rent} set={setRent} min={100} max={5000} step={10} format={fe} />
        <Control label="Αξία ακινήτου" hint="Τρέχουσα εμπορική αξία, για τον υπολογισμό απόδοσης" value={value} set={setValue} min={2000} max={1000000} step={1000} format={fe} />
        <Control label="Ετήσιες δαπάνες" hint="ΕΝΦΙΑ, ασφάλεια, συντήρηση, κοινόχρηστα ιδιοκτήτη" value={costs} set={setCosts} min={0} max={10000} step={100} format={fe} />

        {/* Πού πέφτεις στην κλίμακα ενοικίων 2026 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)' }}>
            <span>Κλίμακα ενοικίων 2026</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>φορολογητέο {fe(taxable)}</span>
          </div>
          <div className="calc-track">
            <div className="calc-band">
              {BANDS.map((b, i) => (
                <div key={i} style={{ flex: (b.to - (BANDS[i - 1]?.to ?? 0)), background: `color-mix(in srgb, var(--accent) ${18 + i * 22}%, transparent)`, borderRight: i < BANDS.length - 1 ? '1px solid var(--bg-surface)' : 'none' }} />
              ))}
            </div>
            <div className="calc-marker" style={{ left: `${markerPct}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {BANDS.map((b, i) => <span key={i}>{b.rate}</span>)}
          </div>
        </div>
      </div>

      {/* Δεξιά: το αποτέλεσμα, ζωντανά */}
      <div className="calc-panel" style={{ display: 'flex', flexDirection: 'column', gap: 22, background: 'var(--bg-elevated)' }}>
        <Stat label="Καθαρή απόδοση, μετά τον φόρο" value={pct(netYield)} big />
        <LiveResult say={`Καθαρή απόδοση μετά τον φόρο ${pct(netYield)}. Καθαρά τον μήνα ${fe(monthlyNet)}.`} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
          <Stat label="Καθαρά τον μήνα" value={fe(monthlyNet)} />
          <Stat label="Ακαθάριστη απόδοση" value={pct(grossYield)} />
          <Stat label="Ετήσιος φόρος ενοικίων" value={fe(tax)} />
          <Stat label="Μέσος συντελεστής" value={pct(effRate)} />
        </div>
        <div style={{ flex: 1 }} />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0 }}>
          Ενδεικτικός υπολογισμός με την κλίμακα ενοικίων 2026 και τεκμαρτή έκπτωση {fp(PRESUMPTIVE_DEDUCTION_RATE * 100)} για δαπάνες, που από 1/1/2026 προϋποθέτει είσπραξη μέσω τραπέζης. Δεν υποκαθιστά τον λογιστή σου.
        </p>
        <Link href="/signup" className="lp-cta lp-primary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: T.radius.pill }}>
          Δες τα δικά σου δεδομένα, αυτόματα
        </Link>
      </div>
    </div>
  )
}
