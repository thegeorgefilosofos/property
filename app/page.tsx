import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LandingShowcase from './LandingShowcase';

// ═══════════════════════════════════════════════════════════════════════════
// Landing. Χτισμένη γύρω από τα δύο μοναδικά μας: (1) μία φωτογραφία → αυτόματη
// καταχώρηση παντού, (2) βοηθός με φωνή που ξέρει το ακίνητό σου. Ήρεμο βάθος,
// ζωντανό product-showcase (καμία εικόνα), πλήρως ρευστή και theme-aware,
// FAQ με native <details> (χωρίς JS). Server component (auth-aware).
// Αισθητική: μονόχρωμη, ένα γαλάζιο, καθαρή· καμία διακοσμητική «κονκάρδα».
// ═══════════════════════════════════════════════════════════════════════════

const OG_TITLE = 'Property OS · Διαχείριση ακινήτων με μία φωτογραφία';
const OG_DESC = 'Σκάναρε λογαριασμό, συμβόλαιο ή ασφάλεια και μπαίνει μόνο του στη θέση του. Ρώτα τον βοηθό με τη φωνή σου. Αποδόσεις, δαπάνες, φορολογία 2026 και σύγκριση παρόχων ενέργειας, σε μία οθόνη.';

export const metadata = {
  metadataBase: new URL('https://property-os.gr'),
  title: OG_TITLE,
  description: OG_DESC,
  openGraph: { title: OG_TITLE, description: OG_DESC, type: 'website', locale: 'el_GR', siteName: 'Property OS' },
  twitter: { card: 'summary_large_image', title: OG_TITLE, description: OG_DESC },
};

const ACCENT = 'var(--accent)';
const BG = 'var(--bg-base)';
const PANEL = 'var(--bg-surface)';
const TEXT = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';
const LINE = 'var(--border-subtle)';

const DIFF = [
  {
    tag: 'Σάρωση', h: 'Δεν πληκτρολογείς. Φωτογραφίζεις.',
    icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    p: 'Λογαριασμός, μισθωτήριο, ασφαλιστήριο ή ΕΝΦΙΑ. Μία φωτογραφία και καταχωρείται εκεί που πρέπει.',
    b: ['Διαβάζει ποσά, ημερομηνίες και πάροχο', 'Ενημερώνει δαπάνες, ημερολόγιο και αρχείο μαζί', 'Ό,τι θέλεις το διορθώνεις με ένα άγγιγμα'],
  },
  {
    tag: 'Βοηθός', h: 'Μιλάει και σκέφτεται ελληνικά.',
    icon: 'M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z',
    p: 'Ρωτάς με τη φωνή σου, όπως θα ρωτούσες έναν συνεργάτη. Ξέρει τα νούμερα του ακινήτου σου και για κάθε δεσμευτικό θέμα σε παραπέμπει στον σωστό επαγγελματία.',
    b: ['Ρωτάς «τι εκκρεμεί;» και απαντά με τα δικά σου στοιχεία', 'Σου απαντά με ανθρώπινη φωνή, στα ελληνικά', 'Σε πάει με ένα άγγιγμα εκεί που θέλεις'],
  },
];

const FEATURES = [
  { t: 'Σύγκριση ρεύματος και ασφάλειας', d: 'Συγκρίνεις τα τιμολόγια όλων των παρόχων και τις ασφάλειες ακινήτου, και βλέπεις πόσα γλιτώνεις πριν αποφασίσεις.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Έξυπνη χρηματοδότηση', d: 'Ανάλυση στεγαστικού, δόσεις, επιτόκια και έξοδα μεταβίβασης, ώστε να επιλέγεις την πιο αποδοτική λύση για κάθε τύπο ακινήτου.', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Προϋπολογισμός και αποδόσεις', d: 'Καταγράφεις δαπάνες, ορίζεις στόχους και βλέπεις σε πραγματικό χρόνο τι σου αποδίδει καθαρά κάθε ακίνητο.', i: 'M12 2v20M17 7H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H7' },
  { t: 'Μίσθωση με σιγουριά', d: 'Καθοδήγηση για βραχυχρόνια ή μακροχρόνια μίσθωση, με πραγματικά νούμερα, είτε σκέφτεσαι να μισθώσεις είτε το έχεις ήδη κάνει.', i: 'M3 21h18M5 21V7l8-4v18M13 9h6v12M9 9h.01M9 13h.01M9 17h.01' },
  { t: 'Φορολογική ενημέρωση', d: 'Γνωρίζεις ανά πάσα στιγμή τις υποχρεώσεις και τις ευκαιρίες σου με τη φορολογία του 2026. Δεν αντικαθιστά τον λογιστή σου, σε κρατά όμως πάντα ενημερωμένο.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Όλα σε ένα σημείο', d: 'Έγγραφα, ημερολόγιο, υπενθυμίσεις και αρχείο, οργανωμένα και κρυπτογραφημένα. Χωρίς άγχος, χωρίς σκόρπιους φακέλους.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

const FAQ = [
  { q: 'Πώς δουλεύει η σάρωση με φωτογραφία;', a: 'Βγάζεις φωτογραφία ή ανεβάζεις ένα PDF: λογαριασμό, μισθωτήριο, ασφαλιστήριο, ΕΝΦΙΑ. Το διαβάζει, καταλαβαίνει τι είναι και το καταχωρεί αυτόματα στο σωστό σημείο: λογαριασμοί, δαπάνες, ημερολόγιο, ενοικιαστής. Εσύ επιβεβαιώνεις και διορθώνεις οτιδήποτε με ένα άγγιγμα.' },
  { q: 'Ο βοηθός καταλαβαίνει και μιλάει ελληνικά;', a: 'Ναι, φυσικά ελληνικά, με κείμενο ή με τη φωνή σου. Του δίνεις όνομα και φωνή όπως θέλεις, απαντά με βάση τα δικά σου δεδομένα και, για δεσμευτικά θέματα, σε παραπέμπει στον σωστό επαγγελματία.' },
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε ιδιοκτήτες ακινήτων στην Ελλάδα κάθε τύπου (κατοικία, επαγγελματικός χώρος, αποθήκη ή οικόπεδο), αλλά και σε μεσιτικά γραφεία και διαχειριστές. Είτε έχεις ένα διαμέρισμα είτε ολόκληρο χαρτοφυλάκιο, προσαρμόζεται σε σένα.' },
  { q: 'Πόσο κοστίζει;', a: 'Το πρώτο ακίνητο είναι δωρεάν για πάντα, με όλες τις δυνατότητες. Για περισσότερα, το πλάνο Ιδιοκτήτης είναι 6,90 € τον μήνα (ή 59 € τον χρόνο) για έως 15 ακίνητα. Για επαγγελματίες, το πλάνο Επαγγελματίας είναι 19 € τον μήνα με απεριόριστα ακίνητα και ομάδα.' },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Ναι. Κάθε χρήστης βλέπει μόνο τα δικά του δεδομένα, με κρυπτογραφημένη σύνδεση και απομόνωση ανά χρήστη. Τα δεδομένα σου δεν χρησιμοποιούνται για εκπαίδευση μοντέλων και είμαστε συμβατοί με τον GDPR.' },
];

const STATS = [
  { n: '11', l: 'πάροχοι ρεύματος συγκρίνονται αυτόματα' },
  { n: '2026', l: 'φορολογική κλίμακα, ενσωματωμένη' },
  { n: 'Μία', l: 'φωτογραφία για κάθε καταχώρηση' },
  { n: 'EU', l: 'δεδομένα, κρυπτογραφημένα' },
];

const SECURITY = [
  { t: 'Κρυπτογραφημένη σύνδεση', d: 'Κάθε μεταφορά δεδομένων προστατεύεται από άκρο σε άκρο.', i: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4' },
  { t: 'Απομόνωση ανά χρήστη', d: 'Βλέπεις μόνο τα δικά σου δεδομένα. Κανείς άλλος δεν έχει πρόσβαση.', i: 'M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z' },
  { t: 'Καμία εκπαίδευση μοντέλων', d: 'Τα έγγραφα και οι αριθμοί σου δεν τροφοδοτούν κανένα μοντέλο.', i: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z' },
  { t: 'Δεδομένα σε EU · GDPR', d: 'Αποθήκευση σε ευρωπαϊκά κέντρα, πλήρως συμβατή με τον GDPR.', i: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c3 3 3 17 0 20M12 2c-3 3-3 17 0 20' },
];

const wrap: React.CSSProperties = { maxWidth: 1140, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const ic = (d: string) => <svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;
const check = <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M20 6 9 17l-5-5" /></svg>;

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  return (
    <div style={{ background: BG, color: TEXT, minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif", overflowX: 'hidden', position: 'relative' }}>

      <style>{`
        .lp-skip { position: absolute; left: -9999px; top: 10px; z-index: 100; padding: 10px 16px; border-radius: 12px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 14px; font-weight: 600; text-decoration: none; }
        .lp-skip:focus { left: 12px; outline: 2px solid var(--accent); outline-offset: 2px; }
        .lp-card { transition: transform .22s cubic-bezier(.2,0,0,1), box-shadow .22s cubic-bezier(.2,0,0,1), border-color .22s; }
        .lp-card:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -14px rgba(16,24,40,.18); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
        .lp-cta { transition: transform .15s, filter .15s; }
        .lp-cta:hover { transform: translateY(-1px); filter: brightness(1.05); }
        .lp-ghost { transition: border-color .15s, background .15s, color .15s; }
        .lp-ghost:hover { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 5%, transparent); color: var(--accent); }
        .lp-link { transition: color .15s; }
        .lp-link:hover { color: var(--accent) !important; }
        details.lp-faq { transition: border-color .18s, background .18s; }
        details.lp-faq[open] { border-color: color-mix(in srgb, var(--accent) 28%, transparent); }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        details.lp-faq[open] summary .lp-plus { transform: rotate(45deg); }
        @keyframes lpUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
        .lp-rise { animation: lpUp .6s cubic-bezier(.2,0,0,1) both; }
        .lp-rise-2 { animation: lpUp .6s cubic-bezier(.2,0,0,1) .06s both; }
        .lp-rise-3 { animation: lpUp .6s cubic-bezier(.2,0,0,1) .12s both; }
        .lp-rise-4 { animation: lpUp .6s cubic-bezier(.2,0,0,1) .18s both; }
        @keyframes lpReveal { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: none; } }
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            .lp-reveal { animation: lpReveal linear both; animation-timeline: view(); animation-range: entry 3% cover 18%; }
          }
        }
        @media (max-width: 760px) { .lp-split { grid-template-columns: 1fr !important; } }
        @media (max-width: 520px) { .lp-hide-xs { display: none !important; } }
        @media (prefers-reduced-motion: reduce) { .lp-rise, .lp-rise-2, .lp-rise-3, .lp-rise-4, .lp-reveal { animation: none !important; } }
      `}</style>

      <a href="#main" className="lp-skip">Μετάβαση στο περιεχόμενο</a>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-base) 78%, transparent)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 29, height: 29, borderRadius: 9, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontWeight: 800, fontSize: 15 }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς μου →</Link>
          ) : (<>
            <Link href="/login" className="lp-link lp-hide-xs" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Σύνδεση</Link>
            <Link href="/signup" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
          </>)}
        </nav>
      </header>

      <main id="main">

      {/* ── Hero ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(56px, 8vw, 96px)', paddingBottom: 'clamp(16px, 3vw, 32px)', textAlign: 'center' }}>
        <h1 className="lp-rise" style={{ fontSize: 'clamp(36px, 6.8vw, 66px)', fontWeight: 680, letterSpacing: '-0.04em', lineHeight: 1.03, margin: '0 auto 22px', maxWidth: 880, color: TEXT }}>
          Βγάλε μία φωτογραφία.<br />
          <span style={{ color: MUTED }}>Όλα τα υπόλοιπα, τακτοποιημένα.</span>
        </h1>
        <p className="lp-rise-2" style={{ fontSize: 'clamp(15px, 2vw, 19px)', color: MUTED, lineHeight: 1.6, maxWidth: 620, margin: '0 auto 30px' }}>
          Λογαριασμοί, συμβόλαια και ασφάλειες μπαίνουν στη θέση τους με μία φωτογραφία. Ο βοηθός σου απαντά στα ελληνικά, με τα δικά σου νούμερα. Εσύ έχεις τον πλήρη έλεγχο του ακινήτου σου, από ένα σπίτι μέχρι ολόκληρο χαρτοφυλάκιο.
        </p>
        <div className="lp-rise-3" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου →</Link>
          ) : (<>
            <Link href="/signup" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
            <Link href="/login" className="lp-ghost" style={{ background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: `1px solid ${LINE}` }}>Έχω λογαριασμό</Link>
          </>)}
        </div>
        <div className="lp-rise-4" style={{ marginTop: 16, fontSize: 12.5, color: FAINT }}>Χωρίς κάρτα · Το πρώτο ακίνητο δωρεάν για πάντα · Συμβατό με GDPR</div>

        <LandingShowcase />
      </section>

      {/* ── Proof band: μετρήσιμα, πραγματικά (χωρίς ψεύτικα «νούμερα χρηστών») ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(20px, 3vw, 34px)', paddingBottom: 'clamp(28px, 4vw, 48px)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 1, background: LINE, border: `1px solid ${LINE}`, borderRadius: 18, overflow: 'hidden' }}>
          {STATS.map((s, i) => (
            <div key={i} style={{ padding: 'clamp(20px, 3vw, 26px) 22px', textAlign: 'center', background: PANEL }}>
              <div style={{ fontSize: 'clamp(24px, 3vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', color: TEXT, lineHeight: 1, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>{s.n}</div>
              <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.45 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Differentiators: τα δύο μοναδικά ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(36px, 5vw, 64px)', paddingBottom: 'clamp(24px, 4vw, 44px)' }}>
        <SectionHead over="Γιατί εμάς" title="Δύο πράγματα που δεν κάνει καμία άλλη εφαρμογή" sub="Μία φωτογραφία τα καταχωρεί όλα και ένας βοηθός που μιλάει ελληνικά σού τα εξηγεί." />
        <div className="lp-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {DIFF.map((c, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 3vw, 32px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic(c.icon)}</div>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: FAINT }}>{c.tag}</span>
              </div>
              <h3 style={{ fontSize: 'clamp(20px, 2.5vw, 25px)', fontWeight: 680, letterSpacing: '-0.025em', lineHeight: 1.15, margin: '0 0 12px' }}>{c.h}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: '0 0 18px' }}>{c.p}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                {c.b.map((t, j) => <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: TEXT, lineHeight: 1.45 }}>{check}{t}</div>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Capabilities ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Δυνατότητες" title="Ό,τι χρειάζεται το ακίνητό σου" sub="Από τον λογαριασμό ρεύματος μέχρι τη φορολογική δήλωση, με τη σειρά που τα χρειάζεσαι." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 16.5, fontWeight: 680, margin: '0 0 8px', letterSpacing: '-0.015em' }}>{f.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Security & trust ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <div className="lp-split" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(24px, 3vw, 38px)', display: 'grid', gridTemplateColumns: '1fr 1.1fr', gap: 'clamp(24px, 3vw, 40px)', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 12 }}>Ασφάλεια</div>
            <h3 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.15, margin: '0 0 12px' }}>Τα δεδομένα σου είναι δικά σου</h3>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, margin: 0 }}>
              Οι λογαριασμοί, τα συμβόλαια και οι αριθμοί σου είναι από τα πιο ευαίσθητα δεδομένα που έχεις. Τα αντιμετωπίζουμε ανάλογα.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
            {SECURITY.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{s.i.split('M').filter(Boolean).map((p, j) => <path key={j} d={'M' + p} />)}</svg>
                </div>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 680, color: TEXT, marginBottom: 3, letterSpacing: '-0.01em' }}>{s.t}</div>
                  <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>{s.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, padding: 'clamp(20px, 3vw, 32px) clamp(20px, 5vw, 48px) clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Τιμολόγηση" title="Ξεκίνα δωρεάν. Πλήρωσε μόνο όταν αξίζει." sub="Το πρώτο ακίνητο δωρεάν για πάντα. Από εκεί και πάνω, μια τιμή που την καλύπτουν όσα σου δείχνουμε να γλιτώσεις." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, maxWidth: 1040, margin: '0 auto', alignItems: 'stretch' }}>

          {/* Δωρεάν */}
          <PlanCard
            name="Δωρεάν" nameColor={TEXT} sub="Για τον ιδιοκτήτη με ένα ακίνητο"
            price="0 €" per="για πάντα" note="Χωρίς κάρτα, χωρίς λήξη"
            items={['1 ακίνητο, κάθε τύπου', 'Σάρωση με φωτογραφία και βοηθός με φωνή', 'Αποδόσεις, δαπάνες, ενέργεια, φορολογία', 'Έξυπνες ειδοποιήσεις και υπενθυμίσεις']}
            cta="Ξεκίνα δωρεάν" ctaGhost featured={false}
          />

          {/* Ιδιοκτήτης */}
          <PlanCard
            name="Ιδιοκτήτης" nameColor={ACCENT} sub="Για χαρτοφυλάκιο, ενοικιαστές και βραχυχρόνια"
            price="6,90 €" per="τον μήνα" note={<>ή <strong style={{ color: TEXT }}>59 € τον χρόνο</strong>, έκπτωση 29%</>}
            items={['Έως 15 ακίνητα, όλων των τύπων', 'Όλα όσα έχει το δωρεάν, χωρίς όρια', 'Συγκρίσεις μεταξύ των ακινήτων σου', 'Φορολογικές εξαγωγές για τον λογιστή', 'Προτεραιότητα στη σάρωση και στον βοηθό']}
            cta="Δοκίμασε δωρεάν →" featured
          />

          {/* Επαγγελματίας */}
          <PlanCard
            name="Επαγγελματίας" nameColor={TEXT} sub="Για μεσιτικά, διαχειριστές και λογιστές"
            price="19 €" per="τον μήνα" note={<>ή <strong style={{ color: TEXT }}>190 € τον χρόνο</strong>, δύο μήνες δώρο</>}
            items={['Απεριόριστα ακίνητα', 'Πολλοί χρήστες στην ίδια ομάδα', 'Αναφορές με τη δική σου επωνυμία', 'Υποστήριξη κατά προτεραιότητα']}
            cta="Δοκίμασε δωρεάν →" ctaGhost featured={false}
          />
        </div>
        <p style={{ textAlign: 'center', fontSize: 12.5, color: FAINT, margin: '22px auto 0', maxWidth: 540, lineHeight: 1.6 }}>
          Αλλάζεις πλάνο όποτε θέλεις, χωρίς δέσμευση διάρκειας. Οι τιμές περιλαμβάνουν ΦΠΑ.
        </p>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(44px, 7vw, 84px)' }}>
        <SectionHead over="Απορίες" title="Συχνές ερωτήσεις" />
        <div style={{ maxWidth: 748, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ.map((f, i) => (
            <details key={i} className="lp-faq" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '2px 20px' }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '17px 0', fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {f.q}<span className="lp-plus" style={{ color: ACCENT, fontSize: 22, lineHeight: 1, transition: 'transform .2s', flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, margin: '0 0 18px' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(56px, 8vw, 96px)' }}>
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 20, padding: 'clamp(40px, 6vw, 68px)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(26px, 4.4vw, 42px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '0 0 14px' }}>Το ακίνητό σου, υπό έλεγχο</h2>
          <p style={{ fontSize: 16, color: MUTED, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>Μία φωτογραφία και το πρώτο σου ακίνητο μπαίνει σε τάξη. Δωρεάν, χωρίς δέσμευση.</p>
          <Link href={loggedIn ? '/dashboard' : '/signup'} className="lp-cta" style={{ display: 'inline-block', background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 16, fontWeight: 700, padding: '15px 34px', borderRadius: 100 }}>{loggedIn ? 'Άνοιξε τον πίνακά σου →' : 'Δημιούργησε τον λογαριασμό σου →'}</Link>
        </div>
      </section>

      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${LINE}`, position: 'relative', zIndex: 1 }}>
        <div style={{ ...wrap, padding: 'clamp(32px, 5vw, 48px) clamp(20px, 5vw, 48px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
            <div style={{ maxWidth: 320 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: ACCENT, color: 'var(--accent-text)', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
                <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em' }}>Property OS</span>
              </div>
              <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: 0 }}>Το ακίνητό σου, υπό έλεγχο. Χτισμένο στην Ελλάδα, για Έλληνες ιδιοκτήτες και επαγγελματίες.</p>
            </div>
            <div style={{ display: 'flex', gap: 'clamp(28px, 6vw, 64px)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Προϊόν</span>
                <Link href="/signup" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Ξεκίνα δωρεάν</Link>
                <Link href="/login" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Σύνδεση</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: FAINT, marginBottom: 2 }}>Νομικά</span>
                <Link href="/privacy" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Απόρρητο</Link>
                <Link href="/terms" className="lp-link" style={{ color: MUTED, textDecoration: 'none', fontSize: 13.5 }}>Όροι Χρήσης</Link>
              </div>
            </div>
          </div>
          <div style={{ paddingTop: 20, borderTop: `1px solid ${LINE}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 12.5, color: FAINT }}>
            <span>© {new Date().getFullYear()} Property OS</span>
            <span>Δεδομένα σε EU · Συμβατό με GDPR</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ over, title, sub }: { over: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 4vw, 44px)' }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: FAINT, marginBottom: 12 }}>{over}</div>
      <h2 style={{ fontSize: 'clamp(24px, 3.8vw, 37px)', fontWeight: 680, letterSpacing: '-0.03em', lineHeight: 1.13, margin: 0, maxWidth: 760, marginInline: 'auto' }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, maxWidth: 540, margin: '14px auto 0' }}>{sub}</p>}
    </div>
  );
}

function PlanCard({ name, nameColor, sub, price, per, note, items, cta, ctaGhost, featured }: {
  name: string; nameColor: string; sub: string; price: string; per: string; note: React.ReactNode; items: string[]; cta: string; ctaGhost?: boolean; featured: boolean;
}) {
  return (
    <div className="lp-card" style={{ background: PANEL, border: featured ? `1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)` : `1px solid ${LINE}`, borderRadius: 18, padding: 'clamp(22px, 2.6vw, 30px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: nameColor, marginBottom: 4 }}>{name}</div>
      <div style={{ fontSize: 12, color: FAINT, marginBottom: 18, minHeight: 32 }}>{sub}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 4.4vw, 40px)', fontWeight: 700, letterSpacing: '-0.035em', color: TEXT }}>{price}</span>
        <span style={{ fontSize: 15, color: MUTED }}>{per}</span>
      </div>
      <div style={{ fontSize: 13, color: FAINT, minHeight: 20 }}>{note}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
        {items.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
        ))}
      </div>
      <Link href="/signup" className={ctaGhost ? 'lp-ghost' : 'lp-cta'} style={{ display: 'block', textAlign: 'center', background: ctaGhost ? 'transparent' : ACCENT, color: ctaGhost ? TEXT : 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: ctaGhost ? `1px solid ${LINE}` : 'none' }}>{cta}</Link>
    </div>
  );
}
