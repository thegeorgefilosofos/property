'use client'

// ═══════════════════════════════════════════════════════════════════════════
// AuthAside, το ΕΝΙΑΙΟ marketing panel για ΟΛΕΣ τις οθόνες auth (Σύνδεση,
// Εγγραφή, Επαναφορά). Ένα και μόνο «δωμάτιο»: logo lockup, μία επικεφαλίδα,
// τρία σημεία (πρώτα τα δύο μοναδικά χαρακτηριστικά: φωτογραφία-εγγράφου με
// αυτόματη καταχώρηση και ο φωνητικός βοηθός) και μία υποσημείωση τιμής.
// Κρύβεται σε κινητό μέσω της κλάσης .auth-aside (βλ. globals.css).
// ═══════════════════════════════════════════════════════════════════════════

const Check = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

const PILLARS = [
  { label: 'Μία φωτογραφία, όλα καταχωρημένα', text: 'Φωτογράφισε λογαριασμό, μισθωτήριο ή ασφαλιστήριο. Το διαβάζει και το βάζει στη σωστή θέση.' },
  { label: 'Βοηθός με φωνή που ξέρει το ακίνητό σου', text: 'Ρώτα στα ελληνικά, με κείμενο ή με τη φωνή σου. Απαντά με τα στοιχεία σου, όχι με γενικότητες.' },
  { label: 'Τα οικονομικά σου, ξεκάθαρα', text: 'Έσοδα, δαπάνες, απόδοση, ρεύμα και φορολογία 2026, σε μία οθόνη.' },
]

export default function AuthAside({
  headline = 'Διαχειρίσου το ακίνητό σου',
  accent = 'σαν επαγγελματίας.',
  sub = 'Για κάθε ιδιοκτήτη, από ένα σπίτι μέχρι ολόκληρο χαρτοφυλάκιο. Ό,τι αφορά το ακίνητό σου, χωρίς να ανοίγεις άλλη εφαρμογή.',
}: {
  headline?: string
  accent?: string
  sub?: string
}) {
  return (
    <div className="auth-aside" style={{ width: '45%', minWidth: 400, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', padding: '48px 48px', overflowY: 'auto', fontFamily: "'Inter',sans-serif" }}>

      {/* logo lockup */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontSize: 15, fontWeight: 800 }}>P</div>
        <span style={{ color: 'var(--text-primary)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
      </div>

      {/* headline + sub */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 'clamp(27px, 3vw, 34px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.12, margin: '0 0 18px', color: 'var(--text-primary)' }}>
          {headline}<br /><span style={{ color: 'var(--accent)' }}>{accent}</span>
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, maxWidth: 380 }}>{sub}</p>
      </div>

      {/* three supporting bullets */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {PILLARS.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 14, alignItems: 'start' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}><Check /></span>
            <div>
              <p style={{ fontSize: 13.5, fontWeight: 680, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.01em' }}>{p.label}</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', margin: 0, lineHeight: 1.6 }}>{p.text}</p>
            </div>
          </div>
        ))}
      </div>

      {/* pricing footnote */}
      <div style={{ marginTop: 40, paddingTop: 24, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: 0 }}>Το πρώτο ακίνητο δωρεάν για πάντα</p>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Χωρίς κάρτα</p>
      </div>
    </div>
  )
}
