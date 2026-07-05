import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

// ═══════════════════════════════════════════════════════════════════════════
// Landing page — δημόσια σελίδα προορισμού, στην αισθητική Google (γαλάζιο
// accent, theme-aware μέσω των tokens του app). Πλήρως ρευστή (clamp + auto-fit)
// ώστε να είναι άψογη από 320px έως 100 ίντσες. Server component — το FAQ
// χρησιμοποιεί native <details> (0 JS).
// ═══════════════════════════════════════════════════════════════════════════

export const metadata = {
  title: 'Property OS · Διαχείριση ακινήτων για Έλληνες ιδιοκτήτες',
  description: 'Δες καθαρά τι σου αποδίδει κάθε ακίνητο. Αποδόσεις, δαπάνες, λογαριασμοί, σύγκριση παρόχων ενέργειας, φορολογία 2026 και διαχείριση ενοικιαστή, όλα οργανωμένα σε ένα σημείο.',
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
  { t: 'Πλήρης οικονομική εικόνα', d: 'Δες σε πραγματικό χρόνο τι σου αποδίδει κάθε ακίνητο, καθαρά, αφού αφαιρεθούν φόροι, λειτουργικά έξοδα και αποσβέσεις.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Σύγκριση παρόχων ενέργειας', d: 'Έντεκα πάροχοι ρεύματος και αερίου, για κατοικίες και επαγγελματικούς χώρους. Βάζεις την κατανάλωσή σου και βρίσκεις αυτόματα το φθηνότερο τιμολόγιο.', i: 'M13 2 3 14h7l-1 8 10-12h-7z' },
  { t: 'Φορολογία 2026', d: 'Υπολογισμός φόρου εισοδήματος με την ισχύουσα κλίμακα, έκπτωση για ηλεκτρονικές πληρωμές και έτοιμη εξαγωγή για τον λογιστή σου.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Διαχείριση ενοικιαστή', d: 'Προφίλ, συμβόλαιο, ιστορικό πληρωμών, εγγύηση και υπενθυμίσεις λήξης, όλα μαζεμένα σε ένα σημείο.', i: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87' },
  { t: 'Δάνειο και αγορά', d: 'Ανάλυση στεγαστικού, πίνακες χρεολυσίων, έλεγχος αντοχής στο επιτόκιο, συμβολαιογραφικά και φόρος μεταβίβασης.', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Τεκμηρίωση και αρχείο', d: 'Απογραφή εξοπλισμού με αποσβέσεις, εγγυήσεις, ΕΝΦΙΑ, ΠΕΑ, φωτογραφίες και έγγραφα, όλα οργανωμένα και εύκολα προσβάσιμα.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

const STEPS = [
  { n: '1', t: 'Πρόσθεσε το ακίνητο', d: 'Ένας απλός οδηγός σε βήματα: τύπος, στοιχεία, οικονομικά. Παίρνει λιγότερο από ένα λεπτό.' },
  { n: '2', t: 'Κατέγραψε ό,τι μετράει', d: 'Ενοίκια, δαπάνες, λογαριασμοί, ενοικιαστής. Η εφαρμογή κάνει αυτόματα τους υπολογισμούς.' },
  { n: '3', t: 'Πάρε τις αποφάσεις σου', d: 'Αποδόσεις, συγκρίσεις, ειδοποιήσεις και έξυπνες προτάσεις, πάντα μπροστά σου.' },
];

const FAQ = [
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε ιδιοκτήτες ακινήτων στην Ελλάδα, από ένα έως δεκαπέντε ακίνητα κάθε τύπου: κατοικία, επαγγελματικός χώρος, αποθήκη ή οικόπεδο. Είτε έχεις ένα διαμέρισμα είτε ένα μικρό χαρτοφυλάκιο, το Property OS προσαρμόζεται σε σένα.' },
  { q: 'Χρειάζομαι γνώσεις λογιστικής;', a: 'Όχι. Το Property OS κάνει τους υπολογισμούς για σένα: αποδόσεις, φόρους, αποσβέσεις. Και σου δίνει έτοιμες εξαγωγές για να τις στείλεις στον λογιστή σου.' },
  { q: 'Πόσο κοστίζει;', a: 'Το πρώτο σου ακίνητο είναι δωρεάν, για πάντα, με όλες τις δυνατότητες. Αν προσθέσεις δεύτερο ακίνητο, το κόστος είναι 2,99 € τον μήνα ή 29,90 € τον χρόνο για όλα σου τα ακίνητα, χωρίς ετήσια δέσμευση.' },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Ναι. Ο κάθε χρήστης βλέπει μόνο τα δικά του δεδομένα, με κρυπτογραφημένη σύνδεση και αποθήκευση σε ασφαλή υποδομή. Κανείς άλλος δεν έχει πρόσβαση στα ακίνητά σου.' },
  { q: 'Δουλεύει στο κινητό;', a: 'Ναι. Η εφαρμογή προσαρμόζεται πλήρως και δουλεύει άψογα σε κινητό, tablet, υπολογιστή και μεγάλες οθόνες.' },
];

const wrap: React.CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(26,115,232,0.10)', border: '1px solid rgba(26,115,232,0.25)', borderRadius: 100, padding: '6px 14px', fontSize: 12, color: GOLD, fontWeight: 600, letterSpacing: '0.02em' };
const ic = (d: string) => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;
  return (
    <div style={{ background: BG, color: TEXT, minHeight: '100vh', fontFamily: "'Google Sans','Inter',-apple-system,sans-serif", overflowX: 'hidden' }}>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-surface) 82%, transparent)', backdropFilter: 'blur(12px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: BG, fontWeight: 800, fontSize: 15 }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς μου →</Link>
          ) : (<>
            <Link href="/login" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Σύνδεση</Link>
            <Link href="/signup" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
          </>)}
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{ ...wrap, paddingTop: 'clamp(56px, 9vw, 110px)', paddingBottom: 'clamp(48px, 7vw, 90px)', textAlign: 'center' }}>
        <div style={chip}><span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />Το πρώτο σου ακίνητο, δωρεάν για πάντα · χωρίς κάρτα</div>
        <h1 style={{ fontSize: 'clamp(34px, 6.5vw, 68px)', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, margin: '24px auto 20px', maxWidth: 900 }}>
          Το ακίνητό σου.<br /><span style={{ color: GOLD }}>Υπό απόλυτο έλεγχο.</span>
        </h1>
        <p style={{ fontSize: 'clamp(15px, 2.2vw, 19px)', color: MUTED, lineHeight: 1.6, maxWidth: 620, margin: '0 auto 32px' }}>
          Δες καθαρά τι σου αποδίδει κάθε ακίνητο, πού πάνε τα έξοδά σου και τι φόρο θα πληρώσεις. Αποδόσεις, δαπάνες, ενέργεια, φορολογία και ενοικιαστές, όλα οργανωμένα σε ένα σημείο.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου →</Link>
          ) : (<>
            <Link href="/signup" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Δημιούργησε λογαριασμό →</Link>
            <Link href="/login" style={{ background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: `1px solid ${LINE}` }}>Έχω ήδη λογαριασμό</Link>
          </>)}
        </div>

        {/* Stat bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 1, maxWidth: 720, margin: '56px auto 0', background: LINE, border: `1px solid ${LINE}`, borderRadius: 16, overflow: 'hidden' }}>
          {[['11', 'πάροχοι ενέργειας'], ['15', 'ακίνητα ανά λογαριασμό'], ['2026', 'φορολογική κλίμακα'], ['2,99 €', 'τον μήνα']].map(([n, l], i) => (
            <div key={i} style={{ background: PANEL, padding: '20px 12px' }}>
              <div style={{ fontFamily: "'Google Sans',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(20px, 3vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', color: GOLD }}>{n}</div>
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
              Βάζεις την κατανάλωσή σου και το Property OS συγκρίνει αυτόματα όλα τα τιμολόγια της αγοράς, μπλε, κίτρινα, πράσινα, δυναμικά και all-in, και σου δείχνει πόσα γλιτώνεις αν αλλάξεις πάροχο. Δεν θα το βρεις σε κανένα άλλο εργαλείο διαχείρισης ακινήτων.
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
        <SectionHead over="Τιμολόγηση" title="Ξεκίνα δωρεάν. Πλήρωσε μόνο αν μεγαλώσεις." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, maxWidth: 760, margin: '0 auto', alignItems: 'stretch' }}>

          {/* Free tier */}
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 20, padding: 'clamp(24px, 3vw, 32px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Δωρεάν</div>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 18 }}>Για να ξεκινήσεις με το πρώτο σου ακίνητο</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Google Sans',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(34px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: TEXT }}>0&nbsp;€</span>
              <span style={{ fontSize: 15, color: MUTED }}>για πάντα</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
              {['1 ακίνητο, κάθε τύπου', 'Όλες οι δυνατότητες, χωρίς κλειδώματα', 'Αποδόσεις, δαπάνες, ενέργεια, φορολογία', 'Χωρίς κάρτα, χωρίς λήξη'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: GOLD, fontWeight: 800 }}>✓</span>
                  <span style={{ fontSize: 14, color: TEXT }}>{t}</span>
                </div>
              ))}
            </div>
            <Link href="/signup" style={{ display: 'block', textAlign: 'center', background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: `1px solid ${LINE}` }}>Ξεκίνα δωρεάν</Link>
          </div>

          {/* Pro tier */}
          <div style={{ background: PANEL, border: `1.5px solid rgba(26,115,232,0.5)`, borderRadius: 20, padding: 'clamp(24px, 3vw, 32px)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 16, right: 16, ...chip, padding: '4px 10px', fontSize: 11 }}>Για 2+ ακίνητα</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 4 }}>Pro</div>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 18 }}>Για όσους διαχειρίζονται περισσότερα ακίνητα</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Google Sans',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(34px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: GOLD }}>2,99&nbsp;€</span>
              <span style={{ fontSize: 15, color: MUTED }}>τον μήνα</span>
            </div>
            <div style={{ fontSize: 13, color: FAINT }}>ή <strong style={{ color: TEXT }}>29,90 € τον χρόνο</strong>, με 2 μήνες δώρο</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
              {['Από 2 έως 15 ακίνητα', 'Όλα όσα έχει το δωρεάν πλάνο', 'Συγκρίσεις μεταξύ των ακινήτων σου', 'Χωρίς ετήσια δέσμευση, ακυρώνεις όποτε θέλεις'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: GOLD, fontWeight: 800 }}>✓</span>
                  <span style={{ fontSize: 14, color: TEXT }}>{t}</span>
                </div>
              ))}
            </div>
            <Link href="/signup" style={{ display: 'block', textAlign: 'center', background: GOLD, color: BG, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: FAINT, margin: '24px auto 0', maxWidth: 520, lineHeight: 1.6 }}>
          Πληρώνεις μόνο όταν προσθέσεις δεύτερο ακίνητο. Το πρώτο σου μένει δωρεάν, για πάντα.
        </p>
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
          <p style={{ fontSize: 16, color: MUTED, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>Το πρώτο σου ακίνητο, δωρεάν για πάντα. Χωρίς κάρτα, χωρίς δέσμευση.</p>
          <Link href="/signup" style={{ background: GOLD, color: BG, textDecoration: 'none', fontSize: 16, fontWeight: 700, padding: '15px 34px', borderRadius: 100 }}>Δημιούργησε τον λογαριασμό σου →</Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${LINE}` }}>
        <div style={{ ...wrap, padding: '28px clamp(20px, 5vw, 48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: GOLD, color: BG, fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
            <span style={{ fontSize: 13, color: MUTED }}>Property OS · {new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/login" style={{ color: FAINT, textDecoration: 'none', fontSize: 13 }}>Σύνδεση</Link>
            <Link href="/signup" style={{ color: FAINT, textDecoration: 'none', fontSize: 13 }}>Εγγραφή</Link>
            <Link href="/privacy" style={{ color: FAINT, textDecoration: 'none', fontSize: 13 }}>Απόρρητο</Link>
            <Link href="/terms" style={{ color: FAINT, textDecoration: 'none', fontSize: 13 }}>Όροι</Link>
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
