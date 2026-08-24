'use client'

import { BrandLogo } from '@/components/BrandMark';
import { T } from '@/components/Theme'

// ═══════════════════════════════════════════════════════════════════════════
// AuthAside, το ΕΝΙΑΙΟ marketing panel για ΟΛΕΣ τις οθόνες auth (Σύνδεση,
// Εγγραφή, Επαναφορά). Κινηματογραφικό σκοτεινό σκηνικό, ίδιο DNA με το hero
// της landing: πάντα σκοτεινό, με απαλή γαλάζια αύρα, ανεξάρτητα από το θέμα.
// Ένα «δωμάτιο»: logo lockup, μία επικεφαλίδα, τρία σημεία, υποσημείωση τιμής.
// Κρύβεται σε κινητό μέσω της κλάσης .auth-aside (βλ. globals.css).
// ═══════════════════════════════════════════════════════════════════════════

const Check = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const PILLARS = [
  { label: 'Μία φωτογραφία, όλα καταχωρημένα', text: 'Φωτογράφισε λογαριασμό, μισθωτήριο ή ασφαλιστήριο. Το διαβάζει και το καταχωρεί στη σωστή θέση.' },
  { label: 'Βοηθός με φωνή που ξέρει το ακίνητό σου', text: 'Ρώτα στα ελληνικά, με κείμενο ή με τη φωνή σου. Απαντά με τα δεδομένα σου, όχι με έτοιμες συμβουλές.' },
  { label: 'Τα οικονομικά σου, ξεκάθαρα', text: 'Έσοδα, δαπάνες, απόδοση, ρεύμα και φορολογία 2026, σε μία οθόνη.' },
]

export default function AuthAside({
  headline = 'Διαχειρίσου το ακίνητό σου',
  accent = 'με μία φωτογραφία.',
  sub = 'Από ένα ακίνητο έως ολόκληρο χαρτοφυλάκιο: έσοδα, δαπάνες, μισθώσεις και φόροι σε ένα σημείο.',
}: {
  headline?: string
  accent?: string
  sub?: string
}) {
  return (
    <div className="auth-aside" style={{ width: '45%', minWidth: 400, background: 'linear-gradient(180deg, #070b12 0%, #0a0f18 70%, #0b101a 100%)', borderRight: '1px solid rgba(255,255,255,.07)', display: 'flex', flexDirection: 'column', padding: '48px 48px', overflow: 'hidden', position: 'relative', fontFamily: T.font.sans }}>
      <style>{`
        .auth-aside::before { content: ''; position: absolute; top: -18%; left: -22%; width: 78%; aspect-ratio: 1; border-radius: 50%; filter: blur(90px); background: radial-gradient(circle, #1a73e8, transparent 64%); opacity: .18; pointer-events: none; animation: authDrift 30s ease-in-out infinite alternate; }
        @keyframes authDrift { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(4vw, 4vh, 0) scale(1.12); } }
        @media (prefers-reduced-motion: reduce) { .auth-aside::before { animation: none; } }
      `}</style>

      {/* logo lockup */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
        <BrandLogo size={28} style={{ color: '#fff' }} />
      </div>

      {/* headline + sub */}
      <div style={{ position: 'relative', marginBottom: 40 }}>
        {/* Διακοσμητική marketing επικεφαλίδα (όχι page heading): το h1 της σελίδας
            είναι η φόρμα δεξιά, ώστε να υπάρχει έγκυρο h1 και όταν το aside κρύβεται σε κινητό. */}
        <div style={{ fontSize: 'clamp(27px, 3vw, 34px)', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.12, margin: '0 0 18px', color: '#fff' }}>
          {headline}<br /><span style={{ color: '#8ab4f8' }}>{accent}</span>
        </div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,.62)', lineHeight: 1.7, margin: 0, maxWidth: 380 }}>{sub}</p>
      </div>

      {/* three supporting bullets */}
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {PILLARS.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 14, alignItems: 'start' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(138,180,248,.12)', border: '1px solid rgba(138,180,248,.32)', color: '#8ab4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><Check /></span>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#fff', margin: '0 0 4px', letterSpacing: '-0.01em' }}>{p.label}</p>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', margin: 0, lineHeight: 1.6 }}>{p.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* pricing footnote */}
      <div style={{ position: 'relative', marginTop: 40, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.1)', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        {/* ΔΥΟ ΒΑΘΜΙΔΕΣ, ΟΠΩΣ ΠΑΝΤΟΥ ΑΛΛΟΥ: η υπόσχεση με έμφαση, το πρακτικό
            δίπλα της σε δεύτερο τόνο. Με μόνο τη μία, η γραμμή έμοιαζε
            μισοτελειωμένη — υπήρχε ο χώρος και το περίγραμμα από πάνω, αλλά
            τίποτα να τα δικαιολογεί. */}
        <p style={{ fontSize: 13, color: '#8ab4f8', fontWeight: 700, margin: 0 }}>Το ακίνητό σου πάντα σε τάξη</p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,.45)', margin: 0 }}>Έτοιμο σε ένα λεπτό</p>
      </div>
    </div>
  )
}
