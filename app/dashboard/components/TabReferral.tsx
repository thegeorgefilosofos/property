'use client';
import { useEffect, useMemo, useState } from 'react';
import { T, TT } from '@/components/Theme';
import {
  referralCode, referralLink, daysUntilExpiry,
  REFEREE_TRIAL_MONTHS, SLOT_REWARD_MONTHS, PAID_REWARD_MONTHS,
  PAID_REFEREE_BONUS_MONTHS, MONTHLY_CAP_AGENCY, MONTHLY_CAP_DEFAULT,
} from '@/lib/referral/referral';

// ═══════════════════════════════════════════════════════════════════════════
// TabReferral — «Πρόγραμμα Συνεργατών» (επαγγελματίας) / «Πρόγραμμα Πρόσκλησης»
// (ιδιώτης). Σχεδίαση στο design system του app: επιφάνειες surface-raised με
// elevation για βάθος (όχι υφές/θόρυβος), ένα accent (γαλάζιο) που εμφανίζεται
// στο hover, αυστηρή στοίχιση και τυποποίηση (T/TT tokens). Το πρόγραμμα είναι
// αξίας-για-αξία: σχεδόν μηδενικό κόστος για την Property OS, πραγματικό όφελος
// και για τους δύο. Τα λεκτικά ανταμοιβής βγαίνουν από το lib/referral, ώστε να
// μη διαφέρουν ποτέ από τους κανόνες.
// ═══════════════════════════════════════════════════════════════════════════

const Ic = ({ d, s = 18, c = 'currentColor', sw = 1.8 }: { d: string; s?: number; c?: string; sw?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    {d.split('|').map((p, i) => <path key={i} d={p} />)}
  </svg>
);

const card: React.CSSProperties = {
  background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
  borderRadius: T.radius.card, boxShadow: 'var(--highlight-inset), var(--elev-1)',
};

export default function TabReferral({ userId, plan, profileType, activeSlots = [] }: {
  userId: string; plan: string; profileType: 'individual' | 'professional';
  activeSlots?: { expiresAt: string }[];
}) {
  const [origin, setOrigin] = useState('https://property-os.gr');
  const [copied, setCopied] = useState(false);
  const [nowIso, setNowIso] = useState('');
  useEffect(() => { try { setOrigin(window.location.origin); } catch { /* SSR */ } setNowIso(new Date().toISOString()); }, []);

  const code = useMemo(() => referralCode(userId), [userId]);
  const link = useMemo(() => referralLink(origin, userId), [origin, userId]);
  const isPro = profileType === 'professional';

  const invite = isPro
    ? `Σου στέλνω το Property OS για να έχεις τα οικονομικά του ακινήτου σου οργανωμένα και έτοιμα. Το πρώτο ακίνητο δωρεάν, με ${REFEREE_TRIAL_MONTHS} μήνες δώρο: ${link}`
    : `Οργανώνω το ακίνητό μου με το Property OS: σάρωση λογαριασμών, φορολογία, αποδόσεις, όλα σε ένα. Το πρώτο ακίνητο δωρεάν και ${REFEREE_TRIAL_MONTHS} μήνες δώρο με τον σύνδεσμό μου: ${link}`;

  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const nativeShare = async () => { try { await (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }).share?.({ text: invite }); } catch { /* ignore */ } };

  const shares = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(invite)}`, d: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z' },
    { label: 'Viber', href: `viber://forward?text=${encodeURIComponent(invite)}`, d: 'M12 3a9 9 0 0 0-9 9 8.7 8.7 0 0 0 2 5.6L4 21l3.6-1a9 9 0 1 0 4.4-17z|M9 8c1.5 3 3.5 5 6.5 6' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(invite)}`, d: 'M21 4 3 11l5 2 2 6 3-4 5 4z' },
  ];

  // Ανταμοιβές — από τους πραγματικούς κανόνες (lib/referral).
  const youHeadline = isPro || plan !== 'free' ? `+${PAID_REWARD_MONTHS} μήνας` : `+1 ακίνητο`;
  const youDetail = isPro
    ? `Επαγγελματία δωρεάν για κάθε ενεργό πελάτη, ${PAID_REWARD_MONTHS + PAID_REFEREE_BONUS_MONTHS} αν γίνει κι αυτός συνδρομητής. Έως ${MONTHLY_CAP_AGENCY} τον μήνα.`
    : plan === 'free'
      ? `για ${SLOT_REWARD_MONTHS} μήνα, για κάθε φίλο που ξεκινά. Αν ο φίλος γίνει Ιδιοκτήτης, κερδίζεις έναν μήνα Ιδιοκτήτη δωρεάν. Έως ${MONTHLY_CAP_DEFAULT} τον μήνα.`
      : `Ιδιοκτήτη δωρεάν ανά φίλο, ${PAID_REWARD_MONTHS + PAID_REFEREE_BONUS_MONTHS} αν ο φίλος γίνει κι αυτός Ιδιοκτήτης. Έως ${MONTHLY_CAP_DEFAULT} τον μήνα.`;

  const steps = [
    { n: '1', t: 'Στέλνεις τον σύνδεσμο', d: `Σε έναν ${isPro ? 'πελάτη' : 'φίλο'} ιδιοκτήτη, όπου σε βολεύει.`, d2: 'M22 2 11 13|M22 2 15 22l-4-9-9-4z' },
    { n: '2', t: `Ο ${isPro ? 'πελάτης' : 'φίλος'} σου ξεκινά`, d: 'Προσθέτει το πρώτο του ακίνητο και σαρώνει ένα έγγραφο.', d2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
    { n: '3', t: 'Κερδίζετε και οι δύο', d: `Εκείνος παίρνει ${REFEREE_TRIAL_MONTHS} μήνες δώρο, εσύ την ανταμοιβή σου.`, d2: 'M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 4.5 12 7 12 7z|M12 7s3-5 5.5-2.5S12 7 12 7z' },
  ];

  const slotsView = nowIso ? activeSlots.map(s => ({ days: daysUntilExpiry(s.expiresAt, nowIso) })).filter(s => s.days > 0).sort((a, b) => a.days - b.days) : [];

  return (
    <div style={{ maxWidth: 900, fontFamily: T.font.sans }}>
      <style>{`
        .ref-chip { transition: border-color .16s ${T.ease.standard}, background .16s, color .16s, transform .16s; }
        .ref-chip:hover { border-color: var(--accent-border); background: var(--accent-dim); color: var(--accent); transform: translateY(-1px); }
        .ref-chip:hover svg { stroke: var(--accent); }
        .ref-step { transition: transform .18s ${T.ease.standard}, box-shadow .18s, border-color .18s; }
        .ref-step:hover { transform: translateY(-2px); box-shadow: var(--highlight-inset-strong), var(--elev-3); border-color: var(--accent-border); }
        .ref-step:hover .ref-step-ic { color: var(--accent); }
        .ref-cta { transition: filter .15s, transform .15s; }
        .ref-cta:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .ref-linkbox { transition: border-color .16s ${T.ease.standard}; }
        .ref-linkbox:hover { border-color: var(--accent-border); }
        @media (prefers-reduced-motion: reduce) { .ref-chip:hover, .ref-step:hover, .ref-cta:hover { transform: none; } }
      `}</style>

      {/* ── Κεφαλίδα ── */}
      <div style={{ marginBottom: T.sp.xxl }}>
        <div style={{ ...TT.label, color: 'var(--accent)', marginBottom: 8 }}>{isPro ? 'Πρόγραμμα Συνεργατών' : 'Πρόγραμμα Πρόσκλησης'}</div>
        <h1 style={{ ...TT.display, margin: 0 }}>{isPro ? 'Φέρε τους πελάτες σου. Κέρδισε μήνες.' : 'Ξέρεις κι άλλον ιδιοκτήτη;'}</h1>
        <p style={{ ...TT.body, color: 'var(--text-secondary)', maxWidth: 640, marginTop: 8 }}>
          {isPro
            ? 'Κάθε ιδιοκτήτης-πελάτης που φέρνεις οργανώνεται και σου στέλνει έτοιμα στοιχεία, ενώ εσύ κερδίζεις δωρεάν μήνες. Ιδανικό για λογιστές, μεσίτες και διαχειριστές.'
            : 'Βοήθησέ τον να βάλει το ακίνητό του σε τάξη. Κάθε φίλος που ξεκινά κερδίζει δώρο, το ίδιο κι εσύ.'}
        </p>
      </div>

      {/* ── Σύνδεσμος πρόσκλησης (focal, elevated) ── */}
      <div style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-2)', padding: 'clamp(18px, 2.4vw, 26px)', marginBottom: T.sp.lg }}>
        <div style={{ ...TT.label, marginBottom: 12 }}>Ο σύνδεσμός σου</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="ref-linkbox" style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '11px 14px', minHeight: 44, boxSizing: 'border-box' }}>
            <Ic d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" s={15} c="var(--text-tertiary)" />
            <span style={{ ...TT.body, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
          </div>
          <button onClick={copy} className="ref-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.inner, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Ic d={copied ? 'M20 6 9 17l-5-5' : 'M8 4h10a2 2 0 0 1 2 2v10|M4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z'} s={15} />
            {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {shares.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="ref-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>
              <Ic d={s.d} s={15} c="var(--text-tertiary)" />{s.label}
            </a>
          ))}
          <button onClick={nativeShare} className="ref-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" s={15} c="var(--text-tertiary)" />Κοινοποίηση
          </button>
          <span style={{ ...TT.caption, marginLeft: 'auto' }}>Κωδικός <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.mono, letterSpacing: '0.04em' }}>{code}</strong></span>
        </div>
      </div>

      {/* ── Κερδισμένες θέσεις με αντίστροφη μέτρηση ── */}
      {slotsView.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: T.sp.lg }}>
          {slotsView.map((s, i) => {
            const urgent = s.days <= 7;
            const tone = urgent ? 'var(--warning)' : 'var(--accent)';
            return (
              <div key={i} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderColor: `color-mix(in srgb, ${tone} 30%, transparent)` }}>
                <div style={{ width: 36, height: 36, borderRadius: T.radius.inner, background: `color-mix(in srgb, ${tone} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic d="M12 8v4l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" s={19} c={tone} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TT.h2, fontSize: 13.5 }}>Δωρεάν θέση ακινήτου · Λήγει σε {s.days} {s.days === 1 ? 'ημέρα' : 'ημέρες'}</div>
                  <div style={{ ...TT.bodySm, marginTop: 2 }}>Προσκάλεσε άλλον έναν ιδιοκτήτη για να την κρατήσεις ζωντανή.</div>
                </div>
                <span style={{ ...TT.kpi, color: tone }}>{s.days}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Πώς λειτουργεί: τρία βήματα ── */}
      <div style={{ ...TT.label, marginBottom: 12 }}>Πώς λειτουργεί</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginBottom: T.sp.xl }}>
        {steps.map((st, i) => (
          <div key={i} className="ref-step" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 700 }}>{st.n}</span>
              <span className="ref-step-ic" style={{ color: 'var(--text-tertiary)', transition: 'color .18s' }}><Ic d={st.d2} s={20} /></span>
            </div>
            <div style={{ ...TT.h2, fontSize: 13.5 }}>{st.t}</div>
            <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>{st.d}</div>
          </div>
        ))}
      </div>

      {/* ── Οι ανταμοιβές: εσύ | ο φίλος/πελάτης σου ── */}
      <div style={{ ...TT.label, marginBottom: 12 }}>Οι ανταμοιβές</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12, marginBottom: T.sp.xl }}>
        <div style={{ ...card, padding: 20, background: 'linear-gradient(180deg, var(--accent-soft), transparent 120%)', borderColor: 'var(--accent-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ic d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" s={16} c="var(--accent)" />
            <span style={{ ...TT.label, color: 'var(--accent)' }}>Εσύ κερδίζεις</span>
          </div>
          <div style={{ ...TT.display, fontSize: 30, color: 'var(--accent)', marginBottom: 6 }}>{youHeadline}</div>
          <div style={{ ...TT.bodySm, lineHeight: 1.55, color: 'var(--text-secondary)' }}>{youDetail}</div>
        </div>
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ic d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={16} c="var(--text-secondary)" />
            <span style={{ ...TT.label }}>{isPro ? 'Ο πελάτης σου' : 'Ο φίλος σου'} κερδίζει</span>
          </div>
          <div style={{ ...TT.display, fontSize: 30, marginBottom: 6 }}>{REFEREE_TRIAL_MONTHS} μήνες</div>
          <div style={{ ...TT.bodySm, lineHeight: 1.55, color: 'var(--text-secondary)' }}>δυνατότητες Ιδιοκτήτη δωρεάν, από την πρώτη μέρα.</div>
        </div>
      </div>

      {/* ── Κατάσταση προσκλήσεων ── */}
      <div style={{ ...TT.label, marginBottom: 12 }}>Οι προσκλήσεις σου</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 14 }}>
        {[['Προσκλήσεις', '0'], ['Ενεργοποιήθηκαν', '0'], ['Ανταμοιβές', '0']].map(([l, v], i) => (
          <div key={i} className="kpi-card">
            <div className="kpi-label">{l}</div>
            <div className="kpi-value">{v}</div>
          </div>
        ))}
      </div>

      <p style={{ ...TT.caption, lineHeight: 1.6, maxWidth: 640 }}>
        Η ανταμοιβή κλειδώνει όταν ο {isPro ? 'πελάτης' : 'φίλος'} σου προσθέσει ακίνητο και σαρώσει το πρώτο του έγγραφο. Έτσι επιβραβεύουμε μόνο πραγματικές συστάσεις, χωρίς κόστος για κανέναν.
      </p>
    </div>
  );
}
