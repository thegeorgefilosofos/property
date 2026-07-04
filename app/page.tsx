import Link from 'next/link';

// ═══════════════════════════════════════════════════════════════════════════
// Landing page — δημόσια σελίδα προορισμού, στην αισθητική Google (γαλάζιο
// accent, theme-aware μέσω των tokens του app). Πλήρως ρευστή (clamp + auto-fit)
// ώστε να είναι άψογη από 320px έως 100 ίντσες. Server component — το FAQ
// χρησιμοποιεί native <details> (0 JS).
// ═══════════════════════════════════════════════════════════════════════════

export const metadata = {
  title: 'Property OS — Η διαχείριση ακινήτων σου, υπό έλεγχο',
  description: 'Επαγγελματική πλατφόρμα για Έλληνες ιδιοκτήτες & μικρά γραφεία: αποδόσεις, δαπάνες, λογαριασμοί, σύγκριση παρόχων ενέργειας, φορολογία 2026, ενοικιαστές — όλα σε ένα.',
};

// Χρώματα από τα design tokens του app (Google γαλάζιο, theme-aware light/dark)
const GOLD = 'var(--accent)';
const BG = 'var(--bg-base)';
const PANEL = 'var(--bg-surface)';
const TEXT = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';
const LINE = 'var(--border-subtle)';

const FEATURES = [
  { t: 'Πλήρης οικονομική εικόνα', d: 'Έσοδα, δαπάνες, μεικτή & καθαρή απόδοση σε πραγματικό χρόνο — μετά από φόρους, λειτουργικά και αποσβέσεις.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Σύγκριση παρόχων ενέργειας', d: '11 πάροχοι ρεύματος & αερίου, οικιακά και επαγγελματικά. Βρες αυτόματα το φθηνότερο τιμολόγιο για την κατανάλωσή σου.', i: 'M13 2 3 14h7l-1 8 10-12h-7z' },
  { t: 'Φορολογία 2026', d: 'Υπολογισμός φόρου εισοδήματος με την ισχύουσα κλίμακα, έκπτωση ηλεκτρονικών πληρωμών και εξαγωγή για τον λογιστή σου.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Διαχείριση ενοικιαστή', d: 'Προφίλ, συμβόλαιο, ιστορικό πληρωμών, εγγύηση και υπενθυμίσεις λήξης — σε ένα ενιαίο περιβάλλον.', i: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87' },
  { t: 'Δάνειο & απόκτηση', d: 'Ανάλυση στεγαστικού, χρεολύσια, stress test επιτοκίου, συμβολαιογραφικά και φόρος μεταβίβασης.', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Τεκμηρίωση & αρχείο', d: 'Απογραφή εξοπλισμού με απόσβεση, εγγυήσεις, ΕΝΦΙΑ, ΠΕΑ, φωτογραφίες και έγγραφα — όλα οργανωμένα.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

const STEPS = [
  { n: '1', t: 'Πρόσθεσε το ακίνητο', d: 'Ένας οδηγός σε βήματα — τύπος, στοιχεία, οικονομικά. Σε λιγότερο από ένα λεπτό.' },
  { n: '2', t: 'Κατέγραψε ό,τι μετράει', d: 'Ενοίκια, δαπάνες, λογαριασμοί, ενοικιαστής. Το app κάνει αυτόματα τους υπολογισμούς.' },
  { n: '3', t: 'Πάρε αποφάσεις', d: 'Αποδόσεις, συγκρίσεις, ειδοποιήσεις και έξυπνες προτάσεις — πάντα μπροστά σου.' },
];

const FAQ = [
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε ιδιοκτήτες ακινήτων και μικρά μεσιτικά γραφεία στην Ελλάδα, από 1 έως 15 ακίνητα κάθε τύπου — κατοικία, επαγγελματικός χώρος, αποθήκη, οικόπεδο.' },
  { q: 'Χρειάζομαι γνώσεις λογιστικής;', a: 'Όχι. Το Property OS κάνει τους υπολογισμούς για σένα — αποδόσεις, φόρους, αποσβέσεις — και σου δίνει έτοιμες εξαγωγές για τον λογιστή σου.' },
  { q: 'Πόσο κοστίζει;', a: 'Το πρώτο ακίνητο είναι δωρεάν για 3 μήνες. Μετά, από €1.99 τον μήνα. Χωρίς ετήσια δέσμευση, ακύρωση όποτε θες.' },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Ναι. Κάθε χρήστης βλέπει μόνο τα δικά του δεδομένα (Row Level Security), με κρυπτογραφημένη σύνδεση και αποθήκευση σε υποδομή enterprise.' },
  { q: 'Δουλεύει στο κινητό;', a: 'Απόλυτα — το app είναι πλήρως responsive και δουλεύει άψογα σε κινητό, tablet, laptop και μεγάλες οθόνες.' },
];

const wrap: React.CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(26,115,232,0.10)', border: '1px solid rgba(26,115,232,0.25)', borderRadius: 100, padding: '6px 14px', fontSize: 12, color: GOLD, fontWeight: 600, letterSpacing: '0.02em' };
const ic = (d: string) => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;

export default function Landing() {
  return (
    <div style={{ background: BG, color: TEXT, minHeight: '100vh', fontFamily: "'Google Sans','Inter',-apple-system,sans-serif", overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-surface) 82%, transparent)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: BG, fontWeight: 800, fontSize: 15 }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Property OS</span>
          </div>
          <Link href="/login" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Σύνδεση</Link>
          <Link href="/signup" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{ ...wrap, paddingTop: 'clamp(56px, 9vw, 110px)', paddingBottom: 'clamp(48px, 7vw, 90px)', textAlign: 'center' }}>
        <div style={chip}><span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />3 μήνες δωρεάν · χωρίς κάρτα</div>
        <h1 style={{ fontSize: 'clamp(34px, 6.5vw, 68px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '24px auto 20px', maxWidth: 900 }}>
          Το ακίνητό σου.<br /><span style={{ color: GOLD }}>Υπό απόλυτο έλεγχο.</span>
        </h1>
        <p style={{ fontSize: 'clamp(15px, 2.2vw, 19px)', color: MUTED, lineHeight: 1.6, maxWidth: 620, margin: '0 auto 32px' }}>
          Η πληρέστερη πλατφόρμα διαχείρισης ακινήτων για Έλληνες ιδιοκτήτες και μικρά γραφεία. Αποδόσεις, δαπάνες, ενέργεια, φορολογία και ενοικιαστές — όλα σε ένα, σε παγκόσμιο επίπεδο.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/signup" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Δημιούργησε λογαριασμό →</Link>
          <Link href="/login" style={{ background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: `1px solid ${LINE}` }}>Έχω ήδη λογαριασμό</Link>
        </div>

        {/* Stat bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 1, maxWidth: 720, margin: '56px auto 0', background: LINE, border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
          {[['11', 'πάροχοι ενέργειας'], ['15', 'ακίνητα / λογαριασμό'], ['2026', 'φορολογική κλίμακα'], ['€1.99', 'ανά μήνα']].map(([n, l], i) => (
            <div key={i} style={{ background: PANEL, padding: '20px 12px' }}>
              <div style={{ fontFamily: "'Roboto Mono',monospace", fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 700, color: GOLD }}>{n}</div>
              <div style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ ...wrap, paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Δυνατότητες" title="Όλα όσα χρειάζεσαι, σε ένα εργαλείο" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(26,115,232,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{f.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Energy moat highlight ── */}
      <section style={{ background: PANEL, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
        <div style={{ ...wrap, padding: 'clamp(48px, 7vw, 84px) clamp(20px, 5vw, 48px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 40, alignItems: 'center' }}>
          <div>
            <div style={chip}>Μοναδικό στην αγορά</div>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.12, margin: '18px 0 14px' }}>Βρες το φθηνότερο ρεύμα για <span style={{ color: GOLD }}>κάθε ακίνητο</span></h2>
            <p style={{ fontSize: 16, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              Δίνεις την κατανάλωσή σου και το Property OS συγκρίνει αυτόματα όλα τα τιμολόγια — μπλε, κίτρινα, πράσινα, δυναμικά, all-in — και σου δείχνει πόσα γλιτώνεις αλλάζοντας πάροχο. Κανένα άλλο εργαλείο διαχείρισης ακινήτων στον κόσμο δεν το κάνει αυτό.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['ΔΕΗ myHome Enter', 'ΜΠΛΕ', '142 €'], ['Protergia Value Flow', 'ΚΙΤΡΙΝΟ', '128 €'], ['Ήρων Blue Smart', 'ΜΠΛΕ', '135 €']].map(([n, b, p], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: BG, border: `1px solid ${i === 1 ? 'rgba(26,115,232,0.4)' : LINE}`, borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n}</div>
                  <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>{b}{i === 1 ? ' · Φθηνότερο' : ''}</div>
                </div>
                <div style={{ fontFamily: "'Roboto Mono',monospace", fontSize: 16, fontWeight: 700, color: i === 1 ? GOLD : TEXT }}>{p}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ ...wrap, padding: 'clamp(48px, 7vw, 90px) clamp(20px, 5vw, 48px)' }}>
        <SectionHead over="Πώς δουλεύει" title="Ξεκίνα σε τρία βήματα" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: GOLD, color: BG, fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>{s.n}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{s.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ ...wrap, paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Τιμολόγηση" title="Απλή, δίκαιη, χωρίς εκπλήξεις" />
        <div style={{ maxWidth: 460, margin: '0 auto', background: PANEL, border: `1px solid rgba(26,115,232,0.35)`, borderRadius: 20, padding: 'clamp(28px, 4vw, 40px)', textAlign: 'center' }}>
          <div style={chip}>Προσφορά εκκίνησης</div>
          <div style={{ margin: '22px 0 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6 }}>
            <span style={{ fontFamily: "'Roboto Mono',monospace", fontSize: 'clamp(40px, 7vw, 56px)', fontWeight: 700, color: GOLD }}>€1.99</span>
            <span style={{ fontSize: 16, color: MUTED }}>/ μήνα</span>
          </div>
          <div style={{ fontSize: 14, color: MUTED, marginBottom: 24 }}>μετά τους <strong style={{ color: TEXT }}>3 πρώτους μήνες δωρεάν</strong></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left', marginBottom: 28 }}>
            {['Το πρώτο ακίνητο δωρεάν για 90 ημέρες', 'Έως 15 ακίνητα κάθε τύπου', 'Όλες οι δυνατότητες, χωρίς κλειδώματα', 'Χωρίς ετήσια δέσμευση — ακύρωση όποτε θες'].map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: GOLD, fontWeight: 800 }}>✓</span>
                <span style={{ fontSize: 14, color: TEXT }}>{t}</span>
              </div>
            ))}
          </div>
          <Link href="/signup" style={{ display: 'block', background: GOLD, color: BG, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ ...wrap, paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Απορίες" title="Συχνές ερωτήσεις" />
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ.map((f, i) => (
            <details key={i} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: '4px 18px' }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '16px 0', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {f.q}<span style={{ color: GOLD, fontSize: 20, lineHeight: 1 }}>+</span>
              </summary>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.65, margin: '0 0 16px' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ ...wrap, paddingBottom: 'clamp(56px, 8vw, 100px)' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(26,115,232,0.12), rgba(26,115,232,0.03))', border: `1px solid rgba(26,115,232,0.3)`, borderRadius: 24, padding: 'clamp(36px, 6vw, 64px)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(26px, 4.5vw, 44px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 14px' }}>Πάρε τον έλεγχο των ακινήτων σου σήμερα</h2>
          <p style={{ fontSize: 16, color: MUTED, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>Δωρεάν για 3 μήνες. Χωρίς κάρτα. Χωρίς δέσμευση.</p>
          <Link href="/signup" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 16, fontWeight: 700, padding: '15px 34px', borderRadius: 100 }}>Δημιούργησε τον λογαριασμό σου →</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${LINE}` }}>
        <div style={{ ...wrap, padding: '28px clamp(20px, 5vw, 48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: GOLD, color: BG, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
            <span style={{ fontSize: 13, color: MUTED }}>Property OS — {new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/login" style={{ color: FAINT, textDecoration: 'none', fontSize: 13 }}>Σύνδεση</Link>
            <Link href="/signup" style={{ color: FAINT, textDecoration: 'none', fontSize: 13 }}>Εγγραφή</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ over, title }: { over: string; title: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 4vw, 48px)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>{over}</div>
      <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, margin: 0 }}>{title}</h2>
    </div>
  );
}
