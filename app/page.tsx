import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LandingShowcase from './LandingShowcase';

// ═══════════════════════════════════════════════════════════════════════════
// Landing, world-tier. Χτισμένη γύρω από τα δύο μοναδικά μας: (1) μία φωτογραφία
// → αυτόματη καταχώρηση παντού, (2) AI βοηθός που ξέρει το ακίνητό σου, με φωνή.
// Ήρεμο βάθος, ζωντανά mockups (0 εικόνες), πλήρως ρευστή,
// theme-aware, FAQ με native <details> (0 JS). Server component (auth-aware).
// ═══════════════════════════════════════════════════════════════════════════

const OG_TITLE = 'Property OS · Διαχείριση ακινήτων με μία φωτογραφία';
const OG_DESC = 'Σκάναρε λογαριασμό, συμβόλαιο ή ασφάλεια και ο βοηθός τα καταχωρεί μόνος του στο σωστό σημείο. Ρώτα τον με τη φωνή σου. Αποδόσεις, δαπάνες, φορολογία 2026 και σύγκριση παρόχων ενέργειας, όλα σε μία οθόνη.';

export const metadata = {
  metadataBase: new URL('https://property-os.gr'),
  title: OG_TITLE,
  description: OG_DESC,
  openGraph: {
    title: OG_TITLE,
    description: OG_DESC,
    type: 'website',
    locale: 'el_GR',
    siteName: 'Property OS',
  },
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: OG_DESC,
  },
};

const ACCENT = 'var(--accent)';
const BG = 'var(--bg-base)';
const PANEL = 'var(--bg-surface)';
const TEXT = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';
const LINE = 'var(--border-subtle)';

const FEATURES = [
  { t: 'Πλήρης οικονομική εικόνα', d: 'Δες σε πραγματικό χρόνο τι σου αποδίδει κάθε ακίνητο, καθαρά, αφού αφαιρεθούν φόροι, λειτουργικά έξοδα και αποσβέσεις.', i: 'M3 12h4l3 8 4-16 3 8h4' },
  { t: 'Φορολογία 2026', d: 'Υπολογισμός φόρου εισοδήματος με την ισχύουσα κλίμακα, έκπτωση για ηλεκτρονικές πληρωμές και έτοιμη εξαγωγή για τον λογιστή σου.', i: 'M9 7h6M9 11h6M9 15h4M5 3h14v18l-3-2-2 2-2-2-2 2-3-2z' },
  { t: 'Διαχείριση ενοικιαστή', d: 'Προφίλ, συμβόλαιο, ιστορικό πληρωμών, εγγύηση και υπενθυμίσεις λήξης, όλα μαζεμένα σε ένα σημείο.', i: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M23 21v-2a4 4 0 0 0-3-3.87' },
  { t: 'Δάνειο και αγορά', d: 'Ανάλυση στεγαστικού, πίνακες χρεολυσίων, έλεγχος αντοχής στο επιτόκιο, συμβολαιογραφικά και φόρος μεταβίβασης.', i: 'M3 21h18M5 21V7l8-4v18M19 21V11l-6-4' },
  { t: 'Ημερολόγιο & υπενθυμίσεις', d: 'Πληρωμές, λήξεις μίσθωσης και ασφάλισης, ΕΝΦΙΑ και συντηρήσεις. Θα το ξέρεις πριν λήξει, όχι μετά.', i: 'M3 5h18v16H3zM3 9h18M8 3v4M16 3v4' },
  { t: 'Αρχείο & τεκμηρίωση', d: 'Απογραφή εξοπλισμού με αποσβέσεις, εγγυήσεις, ΠΕΑ, φωτογραφίες και έγγραφα, όλα οργανωμένα και εύκολα προσβάσιμα.', i: 'M4 4h6l2 2h8v12H4zM4 10h16' },
];

const STEPS = [
  { n: '1', t: 'Σκάναρε ή φωτογράφισε', d: 'Λογαριασμό, συμβόλαιο, ασφάλεια, ΕΝΦΙΑ. Ό,τι κι αν είναι, το διαβάζει και το καταχωρεί στο σωστό σημείο.' },
  { n: '2', t: 'Ρώτησε τον βοηθό σου', d: 'Με κείμενο ή με τη φωνή σου. Ξέρει τα δικά σου νούμερα και σε καθοδηγεί σε δευτερόλεπτα.' },
  { n: '3', t: 'Πάρε τις αποφάσεις σου', d: 'Αποδόσεις, συγκρίσεις και ειδοποιήσεις, μπροστά σου όταν πρέπει να αποφασίσεις.' },
];

const FAQ = [
  { q: 'Πώς δουλεύει η σάρωση με φωτογραφία;', a: 'Βγάζεις φωτογραφία ή ανεβάζεις ένα PDF: λογαριασμό, μισθωτήριο, ασφαλιστήριο, ΕΝΦΙΑ. Το διαβάζει, καταλαβαίνει τι είναι και το καταχωρεί αυτόματα στο σωστό σημείο: λογαριασμοί, δαπάνες, ημερολόγιο, ενοικιαστής, ασφάλεια. Εσύ απλώς επιβεβαιώνεις, και διορθώνεις οτιδήποτε με ένα κλικ.' },
  { q: 'Ο βοηθός καταλαβαίνει και μιλάει ελληνικά;', a: 'Ναι. Μιλάει φυσικά ελληνικά, με κείμενο ή με τη φωνή σου. Του δίνεις όνομα και φύλο όπως θέλεις, απαντά με βάση τα δικά σου δεδομένα και, για δεσμευτικά θέματα, σε παραπέμπει στον σωστό επαγγελματία (λογιστή, δικηγόρο, συμβολαιογράφο).' },
  { q: 'Σε ποιους απευθύνεται;', a: 'Σε ιδιοκτήτες ακινήτων στην Ελλάδα κάθε τύπου (κατοικία, επαγγελματικός χώρος, αποθήκη ή οικόπεδο), αλλά και σε μεσιτικά γραφεία και διαχειριστές. Είτε έχεις ένα διαμέρισμα είτε ολόκληρο χαρτοφυλάκιο, το Property OS προσαρμόζεται σε σένα.' },
  { q: 'Πόσο κοστίζει;', a: 'Το πρώτο σου ακίνητο είναι δωρεάν, για πάντα, με όλες τις δυνατότητες. Αν έχεις περισσότερα, το πλάνο Ιδιοκτήτης είναι 6,90 € τον μήνα (ή 59 € τον χρόνο, έκπτωση περίπου 29%) για έως 15 ακίνητα. Για μεσιτικά γραφεία και διαχειριστές, το πλάνο Επαγγελματίας είναι 19 € τον μήνα με απεριόριστα ακίνητα και πολλούς χρήστες.' },
  { q: 'Είναι ασφαλή τα δεδομένα μου;', a: 'Ναι. Ο κάθε χρήστης βλέπει μόνο τα δικά του δεδομένα, με κρυπτογραφημένη σύνδεση και απομόνωση ανά χρήστη. Τα δεδομένα σου δεν χρησιμοποιούνται για εκπαίδευση μοντέλων και είμαστε συμβατοί με τον GDPR.' },
  { q: 'Δουλεύει στο κινητό;', a: 'Ναι. Η εφαρμογή προσαρμόζεται πλήρως και δουλεύει άψογα σε κινητό, tablet, υπολογιστή και μεγάλες οθόνες. Η σάρωση δουλεύει ιδανικά με την κάμερα του κινητού σου.' },
];

const TRUST = ['11 πάροχοι ρεύματος', 'Φορολογική κλίμακα 2026', 'Τα δεδομένα σου δεν εκπαιδεύουν μοντέλα', 'Δεδομένα σε EU', 'Κρυπτογραφημένη σύνδεση'];

const wrap: React.CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1px solid ${LINE}`, borderRadius: 100, padding: '6px 14px', fontSize: 12.5, color: MUTED, fontWeight: 600, letterSpacing: '0.01em' };
const ic = (d: string) => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={MUTED} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;
const check = <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  return (
    <div style={{ background: BG, color: TEXT, minHeight: '100vh', fontFamily: "'Inter',-apple-system,sans-serif", overflowX: 'hidden', position: 'relative' }}>

      <style>{`
        .lp-skip { position: absolute; left: -9999px; top: 10px; z-index: 100; padding: 10px 16px; border-radius: 12px; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-subtle); font-size: 14px; font-weight: 600; text-decoration: none; box-shadow: 0 1px 2px rgba(16,24,40,.06); }
        .lp-skip:focus { left: 12px; outline: 2px solid var(--accent); outline-offset: 2px; }
        .lp-card { transition: transform .22s cubic-bezier(.2,0,0,1), box-shadow .22s cubic-bezier(.2,0,0,1), border-color .22s, background .22s; }
        .lp-card:hover { transform: translateY(-4px); box-shadow: 0 12px 28px -12px rgba(16,24,40,.16); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
        .lp-cta { transition: transform .15s, filter .15s, box-shadow .2s; }
        .lp-cta:hover { transform: translateY(-1px); filter: brightness(1.04); box-shadow: 0 1px 2px rgba(16,24,40,.06); }
        .lp-ghost { transition: border-color .15s, background .15s; }
        .lp-ghost:hover { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
        details.lp-faq { transition: border-color .18s, background .18s; }
        details.lp-faq[open] { border-color: color-mix(in srgb, var(--accent) 32%, transparent); background: color-mix(in srgb, var(--accent) 4%, transparent); }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        details.lp-faq[open] summary .lp-plus { transform: rotate(45deg); }
        @keyframes lpUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .lp-rise { animation: lpUp .6s cubic-bezier(.2,0,0,1) both; }
        @keyframes lpScan { 0% { top: 6%; opacity: 0; } 12% { opacity: 1; } 88% { opacity: 1; } 100% { top: 92%; opacity: 0; } }
        .lp-scanline { animation: lpScan 2.6s cubic-bezier(.4,0,.2,1) infinite; }
        @keyframes lpPop { 0% { opacity: 0; transform: translateY(6px) scale(.96); } 100% { opacity: 1; transform: none; } }
        .lp-pop { animation: lpPop .5s cubic-bezier(.2,0,0,1) both; }
        @keyframes lpWave { 0%,100% { transform: scaleY(.4); } 50% { transform: scaleY(1); } }
        .lp-bar { animation: lpWave 1s ease-in-out infinite; transform-origin: center; }
        @keyframes lpFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .lp-fade { animation: lpFade .45s cubic-bezier(.2,0,0,1) both; }
        @keyframes lpProg { from { width: 0; } to { width: 100%; } }
        .lp-progress { animation: lpProg 5.2s linear both; }
        @keyframes lpGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .lp-grow { transform-origin: bottom; animation: lpGrow .5s cubic-bezier(.2,0,0,1) both; }
        @media (max-width: 760px) { .lp-rail { display: none !important; } .lp-shot-pad { padding: 12px !important; } .lp-split { grid-template-columns: 1fr !important; } }
        @media (max-width: 520px) { .lp-hide-xs { display: none !important; } }
        /* Scroll-reveal με scroll-driven animations (χωρίς JS). Οι ενότητες
           εμφανίζονται απαλά καθώς μπαίνουν στην οθόνη. Πλήρως ορατές όπου δεν
           υποστηρίζεται (graceful) και ανενεργό σε reduced-motion. */
        @keyframes lpReveal { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
        @supports (animation-timeline: view()) {
          @media (prefers-reduced-motion: no-preference) {
            .lp-reveal { animation: lpReveal linear both; animation-timeline: view(); animation-range: entry 4% cover 20%; }
          }
        }
        @media (prefers-reduced-motion: reduce) { .lp-scanline, .lp-bar, .lp-rise, .lp-pop, .lp-fade, .lp-progress, .lp-grow, .lp-reveal { animation: none !important; } }
      `}</style>

      <a href="#main" className="lp-skip">Μετάβαση στο περιεχόμενο</a>

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-base) 72%, transparent)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 66, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 12, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-text)', fontWeight: 800, fontSize: 15, boxShadow: '0 1px 2px rgba(16,24,40,.06)' }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς μου →</Link>
          ) : (<>
            <Link href="/login" className="lp-hide-xs" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Σύνδεση</Link>
            <Link href="/signup" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
          </>)}
        </nav>
      </header>

      <main id="main">

      {/* ── Hero ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(52px, 8vw, 92px)', paddingBottom: 'clamp(20px, 4vw, 40px)', textAlign: 'center' }}>
        <div className="lp-rise" style={{ ...chip, display: 'inline-flex' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: FAINT }} />Το πρώτο ακίνητο δωρεάν, για πάντα</div>
        <h1 className="lp-rise" style={{ fontSize: 'clamp(34px, 6.6vw, 68px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.04, margin: '24px auto 20px', maxWidth: 900, color: TEXT }}>
          Βγάλε μία φωτογραφία.<br />
          <span style={{ color: MUTED }}>Όλα τα υπόλοιπα, τακτοποιημένα.</span>
        </h1>
        <p className="lp-rise" style={{ fontSize: 'clamp(15px, 2.1vw, 19px)', color: MUTED, lineHeight: 1.6, maxWidth: 660, margin: '0 auto 32px' }}>
          Λογαριασμοί, συμβόλαια, ασφάλειες: το Property OS τα διαβάζει από μία φωτογραφία, τα καταχωρεί μόνο του και σου δείχνει καθαρά τι αποδίδουν, πού πληρώνεις παραπάνω και τι λήγει. Εσύ κρατάς μόνο το πιο σημαντικό: την απόφαση.
        </p>
        <div className="lp-rise" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου →</Link>
          ) : (<>
            <Link href="/signup" className="lp-cta" style={{ background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
            <Link href="/login" className="lp-ghost" style={{ background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: `1px solid ${LINE}` }}>Έχω ήδη λογαριασμό</Link>
          </>)}
        </div>
        <div style={{ marginTop: 16, fontSize: 12.5, color: MUTED }}>Χωρίς κάρτα · Ακύρωση όποτε θέλεις · Συμβατό με GDPR</div>

        <LandingShowcase />
      </section>

      {/* ── Trust strip ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(24px, 4vw, 40px)', paddingBottom: 'clamp(24px, 4vw, 44px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: FAINT, lineHeight: 1.6 }}>
          {TRUST.map((t, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
              {i > 0 && <span aria-hidden style={{ opacity: 0.45 }}>·</span>}
              <span>{t}</span>
            </span>
          ))}
        </div>
      </section>

      {/* ── Flagship 1: One photo → filed everywhere ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(40px, 6vw, 76px)', paddingBottom: 'clamp(28px, 4vw, 48px)' }}>
        <SectionHead over="Γιατί εμάς" title="Δύο πράγματα που δεν κάνει καμία άλλη εφαρμογή" sub="Οι άλλες εφαρμογές σε βάζουν να πληκτρολογείς. Εδώ μια φωτογραφία φτάνει." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 16 }}>
          {[
            {
              tag: 'Σάρωση', h: 'Δεν πληκτρολογείς. Φωτογραφίζεις.',
              icon: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
              p: 'Λογαριασμός ρεύματος, μισθωτήριο, ασφαλιστήριο, ΕΝΦΙΑ. Μία φωτογραφία και μπαίνει μόνο του εκεί που πρέπει. Ό,τι σου έπαιρνε δέκα λεπτά, τώρα σε τρία δευτερόλεπτα.',
              b: ['Διαβάζει ποσά, ημερομηνίες και πάροχο', 'Ενημερώνει δαπάνες, ημερολόγιο και αρχείο μαζί', 'Έκανε λάθος; Το διορθώνεις με ένα κλικ'],
            },
            {
              tag: 'Βοηθός', h: 'Ρώτα όπως θα ρωτούσες έναν φίλο.',
              icon: 'M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z',
              p: 'Ένας βοηθός με όνομα και φωνή που διαλέγεις εσύ. Ξέρει τα δικά σου νούμερα, μιλάει ελληνικά και για κάθε σοβαρό σε στέλνει στον σωστό: λογιστή, δικηγόρο, συμβολαιογράφο.',
              b: ['«Τι εκκρεμεί;» και απαντά με τα δικά σου στοιχεία', 'Του μιλάς, σου απαντά με ανθρώπινη φωνή', 'Σε πάει σε ένα κλικ εκεί που θέλεις'],
            },
          ].map((c, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(22px, 3vw, 30px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{ic(c.icon)}</div>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT }}>{c.tag}</span>
              </div>
              <h3 style={{ fontSize: 'clamp(20px, 2.6vw, 26px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 12px' }}>{c.h}</h3>
              <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: '0 0 18px' }}>{c.p}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {c.b.map((t, j) => <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: TEXT }}>{check}{t}</div>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Energy comparison ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(40px, 6vw, 72px)' }}>
        <div className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(24px, 3vw, 36px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 32, alignItems: 'center' }}>
          <div>
            <div style={{ ...chip, marginBottom: 16 }}>Γλιτώνεις πραγματικά λεφτά</div>
            <h3 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 12px' }}>Βρες το φθηνότερο ρεύμα για κάθε ακίνητο</h3>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              Βάζεις την κατανάλωσή σου και το Property OS συγκρίνει αυτόματα τα τιμολόγια της αγοράς (μπλε, κίτρινα, πράσινα, δυναμικά, με ενιαία χρέωση) και σου δείχνει πόσα γλιτώνεις αν αλλάξεις πάροχο.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['Σταθερό τιμολόγιο', 'Πάγια τιμή', '142 €', false], ['Δυναμικό τιμολόγιο', 'Το φθηνότερο για σένα', '128 €', true], ['Πράσινο τιμολόγιο', 'Πάγια τιμή', '135 €', false]].map(([n, b, p, best], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: BG, border: `1px solid ${best ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : LINE}`, borderRadius: 12, padding: '14px 16px', boxShadow: best ? '0 1px 2px rgba(16,24,40,.06)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n as string}</div>
                  <div style={{ fontSize: 11, color: best ? ACCENT : FAINT, marginTop: 2, fontWeight: best ? 700 : 400 }}>{b as string}</div>
                </div>
                <div style={{ fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', fontSize: 17, fontWeight: 800, color: best ? ACCENT : TEXT }}>{p as string}</div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: FAINT, textAlign: 'right', marginTop: 2 }}>Εκτίμηση για 350 kWh / μήνα</div>
          </div>
        </div>
      </section>

      {/* ── Features (bento) ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Δυνατότητες" title="Ό,τι χρειάζεται ένας Έλληνας ιδιοκτήτης" sub="Όλα σε ένα σημείο, όχι δέκα εφαρμογές και υπολογιστικά φύλλα." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 26 }}>
              <div style={{ width: 46, height: 46, borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{f.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ background: PANEL, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, position: 'relative', zIndex: 1 }}>
        <div style={{ ...wrap, padding: 'clamp(48px, 7vw, 90px) clamp(20px, 5vw, 48px)' }}>
          <SectionHead over="Πώς δουλεύει" title="Τρία βήματα, καμία περιπλοκή" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
            {STEPS.map((s, i) => (
              <div key={i} className="lp-card" style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 16, padding: 26 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: ACCENT, color: 'var(--accent-text)', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 1px 2px rgba(16,24,40,.06)' }}>{s.n}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{s.t}</h3>
                <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, padding: 'clamp(48px, 7vw, 90px) clamp(20px, 5vw, 48px)' }}>
        <SectionHead over="Τιμολόγηση" title="Ξεκίνα δωρεάν. Πλήρωσε μόνο όταν αξίζει." sub="Το πρώτο ακίνητο είναι δωρεάν για πάντα. Από εκεί και πάνω, μια τιμή που την καλύπτει μόνη της όσα σου δείχνουμε να γλιτώσεις." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, maxWidth: 1060, margin: '0 auto', alignItems: 'stretch' }}>

          {/* Δωρεάν */}
          <div className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(22px, 2.6vw, 30px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Δωρεάν</div>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 18, minHeight: 32 }}>Για τον ιδιοκτήτη με ένα ακίνητο</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 4.4vw, 40px)', fontWeight: 700, letterSpacing: '-0.03em', color: TEXT }}>0&nbsp;€</span>
              <span style={{ fontSize: 15, color: MUTED }}>για πάντα</span>
            </div>
            <div style={{ fontSize: 13, color: FAINT, minHeight: 20 }}>Χωρίς κάρτα, χωρίς λήξη</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
              {['1 ακίνητο, κάθε τύπου', 'Σάρωση με φωτογραφία και βοηθός με φωνή', 'Αποδόσεις, δαπάνες, ενέργεια, φορολογία', 'Έξυπνες ειδοποιήσεις και υπενθυμίσεις'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
              ))}
            </div>
            <Link href="/signup" className="lp-ghost" style={{ display: 'block', textAlign: 'center', background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: `1px solid ${LINE}` }}>Ξεκίνα δωρεάν</Link>
          </div>

          {/* Ιδιοκτήτης, δημοφιλές */}
          <div className="lp-card" style={{ background: PANEL, border: `1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)`, borderRadius: 16, padding: 'clamp(22px, 2.6vw, 30px)', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 1px 2px rgba(16,24,40,.06)' }}>
            <div style={{ position: 'absolute', top: 16, right: 16, background: ACCENT, color: 'var(--accent-text)', borderRadius: 100, padding: '4px 10px', fontSize: 11, fontWeight: 700 }}>Δημοφιλές</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>Ιδιοκτήτης</div>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 18, minHeight: 32 }}>Για χαρτοφυλάκιο, ενοικιαστές και Airbnb</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 4.4vw, 40px)', fontWeight: 700, letterSpacing: '-0.03em', color: TEXT }}>6,90&nbsp;€</span>
              <span style={{ fontSize: 15, color: MUTED }}>τον μήνα</span>
            </div>
            <div style={{ fontSize: 13, color: FAINT, minHeight: 20 }}>ή <strong style={{ color: TEXT }}>59 € τον χρόνο</strong>, έκπτωση 29%</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
              {['Έως 15 ακίνητα, όλων των τύπων', 'Όλα όσα έχει το δωρεάν, χωρίς όρια', 'Συγκρίσεις μεταξύ των ακινήτων σου', 'Φορολογικές εξαγωγές έτοιμες για τον λογιστή', 'Προτεραιότητα στη σάρωση και στον βοηθό'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
              ))}
            </div>
            <Link href="/signup" className="lp-cta" style={{ display: 'block', textAlign: 'center', background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100 }}>Δοκίμασε δωρεάν →</Link>
          </div>

          {/* Επαγγελματίας, μεσιτικά / διαχειριστές */}
          <div className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(22px, 2.6vw, 30px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Επαγγελματίας</div>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 18, minHeight: 32 }}>Για μεσιτικά γραφεία, διαχειριστές και λογιστικά γραφεία</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Inter',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(32px, 4.4vw, 40px)', fontWeight: 700, letterSpacing: '-0.03em', color: TEXT }}>19&nbsp;€</span>
              <span style={{ fontSize: 15, color: MUTED }}>τον μήνα</span>
            </div>
            <div style={{ fontSize: 13, color: FAINT, minHeight: 20 }}>ή <strong style={{ color: TEXT }}>190 € τον χρόνο</strong>, δύο μήνες δώρο</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
              {['Απεριόριστα ακίνητα', 'Πολλοί χρήστες στην ίδια ομάδα', 'Αναφορές με τη δική σου επωνυμία', 'Υποστήριξη κατά προτεραιότητα'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>{check}<span style={{ fontSize: 14, color: TEXT, lineHeight: 1.4 }}>{t}</span></div>
              ))}
            </div>
            <Link href="/signup" className="lp-ghost" style={{ display: 'block', textAlign: 'center', background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: `1px solid ${LINE}` }}>Δοκίμασε δωρεάν →</Link>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: FAINT, margin: '24px auto 0', maxWidth: 560, lineHeight: 1.6 }}>
          Αναβαθμίζεις ή αλλάζεις πλάνο όποτε θέλεις, χωρίς δέσμευση διάρκειας. Οι τιμές περιλαμβάνουν ΦΠΑ.
        </p>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Απορίες" title="Συχνές ερωτήσεις" />
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ.map((f, i) => (
            <details key={i} className="lp-faq" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: '4px 20px' }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '17px 0', fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {f.q}<span className="lp-plus" style={{ color: ACCENT, fontSize: 22, lineHeight: 1, transition: 'transform .2s', flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, margin: '0 0 18px' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="lp-reveal" style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(56px, 8vw, 100px)' }}>
        <div style={{ position: 'relative', background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 'clamp(40px, 6vw, 68px)', textAlign: 'center' }}>
          <div style={{ position: 'relative' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4.5vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 14px' }}>Το ακίνητό σου, υπό έλεγχο</h2>
            <p style={{ fontSize: 16, color: MUTED, maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.6 }}>Μία φωτογραφία, και το πρώτο σου ακίνητο μπαίνει σε τάξη. Δωρεάν για να ξεκινήσεις, χωρίς δέσμευση.</p>
            <Link href={loggedIn ? '/dashboard' : '/signup'} className="lp-cta" style={{ display: 'inline-block', background: ACCENT, color: 'var(--accent-text)', textDecoration: 'none', fontSize: 16, fontWeight: 700, padding: '15px 34px', borderRadius: 100 }}>{loggedIn ? 'Άνοιξε τον πίνακά σου →' : 'Δημιούργησε τον λογαριασμό σου →'}</Link>
          </div>
        </div>
      </section>

      </main>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${LINE}`, position: 'relative', zIndex: 1 }}>
        <div style={{ ...wrap, padding: '28px clamp(20px, 5vw, 48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 12, background: ACCENT, color: 'var(--accent-text)', fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
            <span style={{ fontSize: 13, color: MUTED }}>Property OS · {new Date().getFullYear()}</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/login" style={{ color: MUTED, textDecoration: 'none', fontSize: 13 }}>Σύνδεση</Link>
            <Link href="/signup" style={{ color: MUTED, textDecoration: 'none', fontSize: 13 }}>Εγγραφή</Link>
            <Link href="/privacy" style={{ color: MUTED, textDecoration: 'none', fontSize: 13 }}>Απόρρητο</Link>
            <Link href="/terms" style={{ color: MUTED, textDecoration: 'none', fontSize: 13 }}>Όροι</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ over, title, sub }: { over: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 4vw, 48px)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: FAINT, marginBottom: 10 }}>{over}</div>
      <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, maxWidth: 560, margin: '14px auto 0' }}>{sub}</p>}
    </div>
  );
}
