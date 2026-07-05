import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

// ═══════════════════════════════════════════════════════════════════════════
// Landing page — world-tier, στα πρότυπα προϊόντος Google. Premium βάθος
// (radial glows, glass nav, product mockup), bento δυνατότητες, πλήρως ρευστό
// (clamp + auto-fit) από 320px έως 100 ίντσες. Theme-aware μέσω των tokens.
// Server component (auth-aware nav/CTA). FAQ με native <details> (0 JS).
// ═══════════════════════════════════════════════════════════════════════════

export const metadata = {
  title: 'Property OS · Διαχείριση ακινήτων για Έλληνες ιδιοκτήτες',
  description: 'Δες καθαρά τι σου αποδίδει κάθε ακίνητο. Αποδόσεις, δαπάνες, λογαριασμοί, σύγκριση παρόχων ενέργειας, φορολογία 2026 και διαχείριση ενοικιαστή, όλα οργανωμένα σε ένα σημείο.',
};

const GOLD = 'var(--accent)';
const BG = 'var(--bg-base)';
const PANEL = 'var(--bg-surface)';
const ELEV = 'var(--bg-elevated)';
const TEXT = 'var(--text-primary)';
const MUTED = 'var(--text-secondary)';
const FAINT = 'var(--text-tertiary)';
const LINE = 'var(--border-subtle)';

const FEATURES = [
  { t: 'Πλήρης οικονομική εικόνα', d: 'Δες σε πραγματικό χρόνο τι σου αποδίδει κάθε ακίνητο, καθαρά, αφού αφαιρεθούν φόροι, λειτουργικά έξοδα και αποσβέσεις.', i: 'M3 12h4l3 8 4-16 3 8h4' },
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

const TRUST = ['Ελληνική φορολογία 2026', '11 πάροχοι ενέργειας', 'Εξαγωγή Ε2 & ΕΝΦΙΑ', 'Συμβατό με GDPR', 'iCal συγχρονισμός'];

const wrap: React.CSSProperties = { maxWidth: 1180, margin: '0 auto', padding: '0 clamp(20px, 5vw, 48px)' };
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 28%, transparent)', borderRadius: 100, padding: '6px 14px', fontSize: 12.5, color: GOLD, fontWeight: 600, letterSpacing: '0.01em' };
const ic = (d: string) => <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d.split('M').filter(Boolean).map((p, i) => <path key={i} d={'M' + p} />)}</svg>;

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const loggedIn = !!user;

  return (
    <div style={{ background: BG, color: TEXT, minHeight: '100vh', fontFamily: "'Google Sans','Inter',-apple-system,sans-serif", overflowX: 'hidden', position: 'relative' }}>

      <style>{`
        .lp-card { transition: transform .22s cubic-bezier(.2,0,0,1), border-color .22s, background .22s; }
        .lp-card:hover { transform: translateY(-4px); border-color: color-mix(in srgb, var(--accent) 45%, transparent); }
        .lp-cta { transition: transform .15s, filter .15s, box-shadow .2s; }
        .lp-cta:hover { transform: translateY(-1px); filter: brightness(1.04); box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 35%, transparent); }
        .lp-ghost { transition: border-color .15s, background .15s; }
        .lp-ghost:hover { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: color-mix(in srgb, var(--accent) 6%, transparent); }
        details.lp-faq { transition: border-color .18s, background .18s; }
        details.lp-faq[open] { border-color: color-mix(in srgb, var(--accent) 32%, transparent); background: color-mix(in srgb, var(--accent) 4%, transparent); }
        details.lp-faq summary::-webkit-details-marker { display: none; }
        details.lp-faq[open] summary .lp-plus { transform: rotate(45deg); }
        @keyframes lpUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        .lp-rise { animation: lpUp .6s cubic-bezier(.2,0,0,1) both; }
        @media (max-width: 720px) { .lp-rail { display: none !important; } .lp-shot-pad { padding: 12px !important; } }
        @media (max-width: 520px) { .lp-hide-xs { display: none !important; } }
      `}</style>

      {/* ── Ambient glow ── */}
      <div aria-hidden style={{ position: 'absolute', top: -220, left: '50%', transform: 'translateX(-50%)', width: 'min(1100px, 120vw)', height: 640, background: 'radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 22%, transparent), transparent 62%)', filter: 'blur(20px)', opacity: 0.55, pointerEvents: 'none', zIndex: 0 }} />

      {/* ── Nav ── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 50, background: 'color-mix(in srgb, var(--bg-base) 72%, transparent)', backdropFilter: 'saturate(180%) blur(14px)', WebkitBackdropFilter: 'saturate(180%) blur(14px)', borderBottom: `1px solid ${LINE}` }}>
        <nav style={{ ...wrap, height: 66, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: GOLD, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 15, boxShadow: '0 4px 12px color-mix(in srgb, var(--accent) 40%, transparent)' }}>P</div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Property OS</span>
          </div>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta" style={{ background: GOLD, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ο πίνακάς μου →</Link>
          ) : (<>
            <Link href="/login" className="lp-hide-xs" style={{ color: MUTED, textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '8px 12px' }}>Σύνδεση</Link>
            <Link href="/signup" className="lp-cta" style={{ background: GOLD, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, padding: '9px 18px', borderRadius: 100 }}>Ξεκίνα δωρεάν</Link>
          </>)}
        </nav>
      </header>

      {/* ── Hero ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(52px, 8vw, 96px)', paddingBottom: 'clamp(20px, 4vw, 40px)', textAlign: 'center' }}>
        <div className="lp-rise" style={{ ...chip, display: 'inline-flex' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD, boxShadow: '0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)' }} />Το πρώτο σου ακίνητο, δωρεάν για πάντα</div>
        <h1 className="lp-rise" style={{ fontSize: 'clamp(36px, 7vw, 72px)', fontWeight: 800, letterSpacing: '-0.035em', lineHeight: 1.03, margin: '24px auto 20px', maxWidth: 920 }}>
          Το ακίνητό σου.<br />
          <span style={{ background: 'linear-gradient(120deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #ffffff))', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Υπό απόλυτο έλεγχο.</span>
        </h1>
        <p className="lp-rise" style={{ fontSize: 'clamp(15px, 2.1vw, 19px)', color: MUTED, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 32px' }}>
          Δες καθαρά τι σου αποδίδει κάθε ακίνητο, πού πάνε τα έξοδά σου και τι φόρο θα πληρώσεις. Όλα οργανωμένα σε ένα σημείο.
        </p>
        <div className="lp-rise" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {loggedIn ? (
            <Link href="/dashboard" className="lp-cta" style={{ background: GOLD, color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Άνοιξε τον πίνακά σου →</Link>
          ) : (<>
            <Link href="/signup" className="lp-cta" style={{ background: GOLD, color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '14px 28px', borderRadius: 100 }}>Δημιούργησε λογαριασμό →</Link>
            <Link href="/login" className="lp-ghost" style={{ background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 600, padding: '14px 28px', borderRadius: 100, border: `1px solid ${LINE}` }}>Έχω ήδη λογαριασμό</Link>
          </>)}
        </div>
        <div style={{ marginTop: 16, fontSize: 12.5, color: FAINT }}>Χωρίς κάρτα · Ακύρωση όποτε θέλεις · Συμβατό με GDPR</div>

        {/* Product mockup */}
        <ProductShot />
      </section>

      {/* ── Trust strip ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(24px, 4vw, 40px)', paddingBottom: 'clamp(24px, 4vw, 44px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 28px', alignItems: 'center', justifyContent: 'center' }}>
          {TRUST.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: MUTED, fontWeight: 500 }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              {t}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features (bento) ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingTop: 'clamp(40px, 6vw, 72px)', paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Δυνατότητες" title="Ένα εργαλείο για όλη τη διαχείριση" sub="Ό,τι χρειάζεται ένας Έλληνας ιδιοκτήτης, σχεδιασμένο να συνεργάζεται σε ένα ενιαίο περιβάλλον." />

        {/* Hero feature: energy comparison, με ζωντανό widget */}
        <div className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 22, padding: 'clamp(24px, 3vw, 36px)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 32, alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ ...chip, marginBottom: 16 }}>Μοναδικό στην αγορά</div>
            <h3 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 12px' }}>Βρες το φθηνότερο ρεύμα για κάθε ακίνητο</h3>
            <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.65, margin: 0 }}>
              Βάζεις την κατανάλωσή σου και το Property OS συγκρίνει αυτόματα όλα τα τιμολόγια της αγοράς, μπλε, κίτρινα, πράσινα, δυναμικά και all-in, και σου δείχνει πόσα γλιτώνεις αν αλλάξεις πάροχο. Δεν θα το βρεις σε κανένα άλλο εργαλείο διαχείρισης ακινήτων.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[['ΔΕΗ myHome Enter', 'Μπλε τιμολόγιο', '142 €', false], ['Protergia Value Flow', 'Φθηνότερο', '128 €', true], ['Ήρων Blue Smart', 'Μπλε τιμολόγιο', '135 €', false]].map(([n, b, p, best], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: BG, border: `1px solid ${best ? 'color-mix(in srgb, var(--accent) 45%, transparent)' : LINE}`, borderRadius: 14, padding: '14px 16px', position: 'relative', boxShadow: best ? '0 8px 24px color-mix(in srgb, var(--accent) 16%, transparent)' : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{n as string}</div>
                  <div style={{ fontSize: 11, color: best ? GOLD : FAINT, marginTop: 2, fontWeight: best ? 700 : 400 }}>{b as string}</div>
                </div>
                <div style={{ fontFamily: "'Google Sans',sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', fontSize: 17, fontWeight: 800, color: best ? GOLD : TEXT }}>{p as string}</div>
              </div>
            ))}
            <div style={{ fontSize: 12, color: FAINT, textAlign: 'right', marginTop: 2 }}>Εκτίμηση για 350 kWh / μήνα</div>
          </div>
        </div>

        {/* Rest as refined bento grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'color-mix(in srgb, var(--accent) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>{ic(f.i)}</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.01em' }}>{f.t}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ background: PANEL, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, position: 'relative', zIndex: 1 }}>
        <div style={{ ...wrap, padding: 'clamp(48px, 7vw, 90px) clamp(20px, 5vw, 48px)' }}>
          <SectionHead over="Πώς δουλεύει" title="Ξεκίνα σε τρία βήματα" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
            {STEPS.map((s, i) => (
              <div key={i} className="lp-card" style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 18, padding: 26 }}>
                <div style={{ width: 38, height: 38, borderRadius: 11, background: GOLD, color: '#fff', fontWeight: 800, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 6px 16px color-mix(in srgb, var(--accent) 35%, transparent)' }}>{s.n}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{s.t}</h3>
                <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, padding: 'clamp(48px, 7vw, 90px) clamp(20px, 5vw, 48px)' }}>
        <SectionHead over="Τιμολόγηση" title="Ξεκίνα δωρεάν. Πλήρωσε μόνο αν μεγαλώσεις." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 16, maxWidth: 760, margin: '0 auto', alignItems: 'stretch' }}>

          <div className="lp-card" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 20, padding: 'clamp(24px, 3vw, 32px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>Δωρεάν</div>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 18 }}>Για να ξεκινήσεις με το πρώτο σου ακίνητο</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Google Sans',sans-serif", fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(34px, 5vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', color: TEXT }}>0&nbsp;€</span>
              <span style={{ fontSize: 15, color: MUTED }}>για πάντα</span>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 11, textAlign: 'left', margin: '22px 0 24px' }}>
              {['1 ακίνητο, κάθε τύπου', 'Όλες οι δυνατότητες, χωρίς κλειδώματα', 'Αποδόσεις, δαπάνες, ενέργεια, φορολογία', 'Χωρίς κάρτα, χωρίς λήξη'].map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: GOLD, fontWeight: 800 }}>✓</span><span style={{ fontSize: 14, color: TEXT }}>{t}</span></div>
              ))}
            </div>
            <Link href="/signup" className="lp-ghost" style={{ display: 'block', textAlign: 'center', background: 'transparent', color: TEXT, textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100, border: `1px solid ${LINE}` }}>Ξεκίνα δωρεάν</Link>
          </div>

          <div className="lp-card" style={{ background: PANEL, border: `1.5px solid color-mix(in srgb, var(--accent) 50%, transparent)`, borderRadius: 20, padding: 'clamp(24px, 3vw, 32px)', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 20px 50px color-mix(in srgb, var(--accent) 14%, transparent)' }}>
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ color: GOLD, fontWeight: 800 }}>✓</span><span style={{ fontSize: 14, color: TEXT }}>{t}</span></div>
              ))}
            </div>
            <Link href="/signup" className="lp-cta" style={{ display: 'block', textAlign: 'center', background: GOLD, color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: '13px', borderRadius: 100 }}>Ξεκίνα δωρεάν →</Link>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: FAINT, margin: '24px auto 0', maxWidth: 520, lineHeight: 1.6 }}>
          Πληρώνεις μόνο όταν προσθέσεις δεύτερο ακίνητο. Το πρώτο σου μένει δωρεάν, για πάντα.
        </p>
      </section>

      {/* ── FAQ ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(48px, 7vw, 90px)' }}>
        <SectionHead over="Απορίες" title="Συχνές ερωτήσεις" />
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FAQ.map((f, i) => (
            <details key={i} className="lp-faq" style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 14, padding: '4px 20px' }}>
              <summary style={{ cursor: 'pointer', listStyle: 'none', padding: '17px 0', fontSize: 15.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                {f.q}<span className="lp-plus" style={{ color: GOLD, fontSize: 22, lineHeight: 1, transition: 'transform .2s', flexShrink: 0 }}>+</span>
              </summary>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, margin: '0 0 18px' }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{ ...wrap, position: 'relative', zIndex: 1, paddingBottom: 'clamp(56px, 8vw, 100px)' }}>
        <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, transparent), color-mix(in srgb, var(--accent) 4%, transparent))', border: `1px solid color-mix(in srgb, var(--accent) 30%, transparent)`, borderRadius: 26, padding: 'clamp(40px, 6vw, 68px)', textAlign: 'center' }}>
          <div aria-hidden style={{ position: 'absolute', top: -140, left: '50%', transform: 'translateX(-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 26%, transparent), transparent 60%)', filter: 'blur(10px)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <h2 style={{ fontSize: 'clamp(26px, 4.5vw, 44px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 14px' }}>Πάρε τον έλεγχο των ακινήτων σου σήμερα</h2>
            <p style={{ fontSize: 16, color: MUTED, maxWidth: 500, margin: '0 auto 28px', lineHeight: 1.6 }}>Το πρώτο σου ακίνητο, δωρεάν για πάντα. Χωρίς κάρτα, χωρίς δέσμευση.</p>
            <Link href={loggedIn ? '/dashboard' : '/signup'} className="lp-cta" style={{ display: 'inline-block', background: GOLD, color: '#fff', textDecoration: 'none', fontSize: 16, fontWeight: 700, padding: '15px 34px', borderRadius: 100 }}>{loggedIn ? 'Άνοιξε τον πίνακά σου →' : 'Δημιούργησε τον λογαριασμό σου →'}</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${LINE}`, position: 'relative', zIndex: 1 }}>
        <div style={{ ...wrap, padding: '28px clamp(20px, 5vw, 48px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: GOLD, color: '#fff', fontWeight: 800, fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>P</div>
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

// ── Product mockup — μίνι πίνακας ελέγχου σε πλαίσιο εφαρμογής (0 εικόνες) ────
function ProductShot() {
  const months = [42, 55, 48, 61, 52, 70, 66, 78, 60, 84, 72, 90];
  const rail = ['Επισκόπηση', 'Ενοίκιο', 'Δαπάνες', 'Λογαριασμοί', 'Ημερολόγιο'];
  const kpis = [
    { l: 'Καθαρή απόδοση', v: '4,8%', c: 'var(--positive)' },
    { l: 'Έσοδα / μήνα', v: '1.250 €', c: 'var(--text-primary)' },
    { l: 'Πληρότητα', v: '92%', c: 'var(--accent)' },
  ];
  return (
    <div style={{ position: 'relative', maxWidth: 940, margin: 'clamp(40px, 6vw, 72px) auto 0' }}>
      <div aria-hidden style={{ position: 'absolute', inset: '-8% -4% -14%', background: 'radial-gradient(ellipse at center, color-mix(in srgb, var(--accent) 20%, transparent), transparent 65%)', filter: 'blur(24px)', opacity: 0.7, pointerEvents: 'none' }} />
      <div className="lp-rise" style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 40px 90px rgba(0,0,0,0.35), 0 8px 24px rgba(0,0,0,0.2)' }}>
        {/* window chrome */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
          <div className="lp-hide-xs" style={{ margin: '0 auto', display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '5px 14px', fontSize: 12, color: 'var(--text-tertiary)', fontFamily: "'Roboto Mono',monospace" }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            property-os.gr/dashboard
          </div>
        </div>
        {/* app body */}
        <div className="lp-shot-pad" style={{ display: 'flex', gap: 16, padding: 18, textAlign: 'left' }}>
          {/* rail */}
          <div className="lp-rail" style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 12px' }}>
              <div style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>P</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Property OS</div>
            </div>
            {rail.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 10px', borderRadius: 9, background: i === 0 ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: i === 0 ? 'var(--accent)' : 'var(--text-tertiary)', fontSize: 12.5, fontWeight: i === 0 ? 700 : 500 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: i === 0 ? 'var(--accent)' : 'var(--border-strong)' }} />
                {r}
              </div>
            ))}
          </div>
          {/* main */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {kpis.map((k, i) => (
                <div key={i} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '13px 14px' }}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{k.l}</div>
                  <div style={{ fontFamily: "'Google Sans',sans-serif", fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontSize: 'clamp(17px, 2.6vw, 22px)', fontWeight: 800, color: k.c, lineHeight: 1 }}>{k.v}</div>
                </div>
              ))}
            </div>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '16px 16px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>Έσοδα ανά μήνα</div>
                <div style={{ fontSize: 11, color: 'var(--positive)', fontWeight: 700 }}>▲ 12% φέτος</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'clamp(4px, 1.2vw, 9px)', height: 92 }}>
                {months.map((m, i) => (
                  <div key={i} style={{ flex: 1, height: `${m}%`, borderRadius: '4px 4px 0 0', background: i === months.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 34%, transparent)' }} />
                ))}
              </div>
            </div>
            <div className="lp-hide-xs" style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'color-mix(in srgb, var(--accent) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 22%, transparent)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14 }}>✦</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Έξυπνη πρόταση:</strong> γλιτώνεις 184 € τον χρόνο αλλάζοντας πάροχο ρεύματος σε αυτό το ακίνητο.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHead({ over, title, sub }: { over: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 'clamp(28px, 4vw, 48px)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: GOLD, marginBottom: 10 }}>{over}</div>
      <h2 style={{ fontSize: 'clamp(24px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.15, margin: 0 }}>{title}</h2>
      {sub && <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.6, maxWidth: 560, margin: '14px auto 0' }}>{sub}</p>}
    </div>
  );
}
