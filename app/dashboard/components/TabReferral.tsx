'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, TT, Badge } from '@/components/Theme';
import {
  referralCode, referralLink, daysUntilExpiry,
  REFEREE_TRIAL_MONTHS, PAID_REWARD_MONTHS, PAID_REFEREE_BONUS_MONTHS,
  MONTHLY_CAP_AGENCY, MONTHLY_CAP_DEFAULT, MAX_ACTIVE_SLOTS,
  MONTHLY_MILESTONE, MILESTONE_BONUS_MONTHS,
  STREAK_TARGET_MONTHS, PARTNER_COMMISSION_RATE,
} from '@/lib/referral/referral';

// ═══════════════════════════════════════════════════════════════════════════
// TabReferral — «Πρόγραμμα Συνεργατών» (επαγγελματίας) / «Πρόγραμμα Πρόσκλησης»
// (ιδιώτης). Χτισμένο στο design system του app (T/TT tokens, surface-raised +
// elevation για βάθος, ΕΝΑ accent-γαλάζιο κυρίως στο hover). Τρία επίπεδα:
// (0) αξία-για-αξία ανά σύσταση, (1) μηνιαίο milestone «Οι 5 του μήνα» με μπάρα
// προόδου, (2) ιδιότητα «Συνεργάτης». Persona-differentiated. Οικονομικά win-win:
// όλες οι ανταμοιβές είναι αξία προϊόντος (μηδενικό οριακό κόστος), ενεργοποίηση
// επαληθευμένη server-side, τίποτα δεν πληρώνεται αυτόματα.
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
const PAD = T.sp.xl; // ενιαίο padding καρτών

function Bar({ pct, tone = 'var(--accent)' }: { pct: number; tone?: string }) {
  return (
    <div style={{ height: 8, background: 'var(--ring-track)', borderRadius: 100, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: tone, borderRadius: 100, transition: `width 0.4s ${T.ease.standard}` }} />
    </div>
  );
}

export default function TabReferral({ userId, plan, profileType, activeSlots = [], activatedThisMonth = 0 }: {
  userId: string; plan: string; profileType: 'individual' | 'professional';
  activeSlots?: { expiresAt: string }[];
  activatedThisMonth?: number;      // fallback πριν φορτώσουν τα δεδομένα
}) {
  const [origin, setOrigin] = useState('https://property-os.gr');
  const [copied, setCopied] = useState(false);
  const [nowIso, setNowIso] = useState('');
  const [claim, setClaim] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [stats, setStats] = useState<{ invites: number; activated: number; this_month: number; streak: number; partner: boolean; rewards: number } | null>(null);
  useEffect(() => { try { setOrigin(window.location.origin); } catch { /* SSR */ } setNowIso(new Date().toISOString()); }, []);

  const code = useMemo(() => referralCode(userId), [userId]);
  const link = useMemo(() => referralLink(origin, userId), [origin, userId]);
  const isPro = profileType === 'professional';

  // Καταχώρησε τον ντετερμινιστικό κωδικό ώστε οι σύνδεσμοι να είναι εξαργυρώσιμοι,
  // και τράβα τους πραγματικούς αριθμούς (προσκλήσεις/ενεργοποιήσεις/σερί/partner).
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let alive = true;
    (async () => {
      try {
        await supabase.from('referral_codes').upsert({ user_id: userId, code }, { onConflict: 'user_id' });
        const [{ data }, { count: rewards }] = await Promise.all([
          supabase.rpc('get_referral_overview', { p_code: code }),
          supabase.from('referral_rewards').select('id', { count: 'exact', head: true }),
        ]);
        if (alive && data) setStats({
          invites: Number(data.invites) || 0,
          activated: Number(data.activated) || 0,
          this_month: Number(data.this_month) || 0,
          streak: Number(data.streak) || 0,
          partner: !!data.partner,
          rewards: rewards || 0,
        });
      } catch { /* η καρτέλα δουλεύει και χωρίς σύνδεση: δείχνει μηδενική πρόοδο */ }
    })();
    return () => { alive = false; };
  }, [userId, code]);

  const invite = isPro
    ? `Σου στέλνω το Property OS για να έχεις τα οικονομικά του ακινήτου σου οργανωμένα και έτοιμα. Το πρώτο ακίνητο δωρεάν, με ${REFEREE_TRIAL_MONTHS} μήνες δώρο: ${link}`
    : `Οργανώνω το ακίνητό μου με το Property OS: σάρωση λογαριασμών, φορολογία, αποδόσεις, όλα σε ένα. Το πρώτο ακίνητο δωρεάν και ${REFEREE_TRIAL_MONTHS} μήνες δώρο με τον σύνδεσμό μου: ${link}`;

  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const nativeShare = async () => { try { await (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }).share?.({ text: invite }); } catch { /* ignore */ } };

  const doClaim = async () => {
    setClaim('saving');
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc('claim_monthly_bonus', { p_code: code });
      setClaim(data && (data as { ok?: boolean }).ok ? 'done' : 'error');
    } catch { setClaim('error'); }
  };

  const shares = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(invite)}`, d: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z' },
    { label: 'Viber', href: `viber://forward?text=${encodeURIComponent(invite)}`, d: 'M12 3a9 9 0 0 0-9 9 8.7 8.7 0 0 0 2 5.6L4 21l3.6-1a9 9 0 1 0 4.4-17z|M9 8c1.5 3 3.5 5 6.5 6' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(invite)}`, d: 'M21 4 3 11l5 2 2 6 3-4 5 4z' },
  ];

  // Ανταμοιβή ανά σύσταση — από τους πραγματικούς κανόνες (αξία προϊόντος).
  const paid = isPro || plan !== 'free';
  const youMonths = PAID_REWARD_MONTHS;
  const youHeadline = paid ? `+${youMonths} ${youMonths === 1 ? 'μήνας' : 'μήνες'}` : '+1 ακίνητο';
  const youDetail = isPro
    ? `Επαγγελματία δωρεάν για κάθε ενεργό πελάτη, ${PAID_REWARD_MONTHS + PAID_REFEREE_BONUS_MONTHS} αν γίνει κι αυτός συνδρομητής. Πιστώνεται στη συνδρομή σου, έως ${MONTHLY_CAP_AGENCY} τον μήνα.`
    : plan === 'free'
      ? `για κάθε φίλο που ξεκινά, έως ${MAX_ACTIVE_SLOTS} ενεργές θέσεις μαζί. Αν ο φίλος γίνει Ιδιοκτήτης, κερδίζεις έναν μήνα Ιδιοκτήτη δωρεάν. Έως ${MONTHLY_CAP_DEFAULT} τον μήνα.`
      : `Ιδιοκτήτη δωρεάν ανά φίλο, ${PAID_REWARD_MONTHS + PAID_REFEREE_BONUS_MONTHS} αν ο φίλος γίνει κι αυτός Ιδιοκτήτης. Πιστώνεται στη συνδρομή σου, έως ${MONTHLY_CAP_DEFAULT} τον μήνα.`;

  const steps = [
    { n: '1', t: 'Στέλνεις τον σύνδεσμο', d: `Σε έναν ${isPro ? 'πελάτη' : 'φίλο'} ιδιοκτήτη, όπου σε βολεύει.`, d2: 'M22 2 11 13|M22 2 15 22l-4-9-9-4z' },
    { n: '2', t: `Ο ${isPro ? 'πελάτης' : 'φίλος'} σου ξεκινά`, d: 'Προσθέτει το πρώτο του ακίνητο και σαρώνει ένα έγγραφο.', d2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
    { n: '3', t: 'Κερδίζετε και οι δύο', d: `Εκείνος παίρνει ${REFEREE_TRIAL_MONTHS} μήνες δώρο, εσύ την ανταμοιβή σου.`, d2: 'M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 4.5 12 7 12 7z|M12 7s3-5 5.5-2.5S12 7 12 7z' },
  ];

  const slotsView = nowIso ? activeSlots.map(s => ({ days: daysUntilExpiry(s.expiresAt, nowIso) })).filter(s => s.days > 0).sort((a, b) => a.days - b.days) : [];
  const thisMonth = stats?.this_month ?? activatedThisMonth;
  const mCount = Math.max(0, Math.floor(thisMonth));
  const mReached = mCount >= MONTHLY_MILESTONE;
  const mRemaining = Math.max(0, MONTHLY_MILESTONE - mCount);
  const mPct = Math.min(100, (mCount / MONTHLY_MILESTONE) * 100);
  const streak = Math.min(stats?.streak ?? 0, STREAK_TARGET_MONTHS);
  const streakPct = Math.min(100, (streak / STREAK_TARGET_MONTHS) * 100);
  const partner = stats?.partner ?? false;
  const coldStart = !!stats && mCount === 0 && streak === 0 && (stats.invites === 0);

  const sectionGap = T.sp.xl;

  return (
    <div style={{ maxWidth: 900, fontFamily: T.font.sans }}>
      <style>{`
        .ref-chip { transition: border-color .16s ${T.ease.standard}, background .16s, color .16s, transform .16s; }
        .ref-chip:hover { border-color: var(--accent-border); background: var(--accent-dim); color: var(--accent); transform: translateY(-1px); }
        .ref-chip:hover svg { stroke: var(--accent); }
        .ref-step { transition: transform .18s ${T.ease.standard}, box-shadow .18s, border-color .18s; }
        .ref-step:hover { transform: translateY(-2px); box-shadow: var(--highlight-inset-strong), var(--elev-3); border-color: var(--accent-border); }
        .ref-step:hover .ref-step-ic { color: var(--accent); }
        .ref-step:hover .ref-step-n { background: var(--accent-dim); color: var(--accent); }
        .ref-cta { transition: filter .15s, transform .15s; }
        .ref-cta:hover { filter: brightness(1.06); transform: translateY(-1px); }
        .ref-linkbox { transition: border-color .16s ${T.ease.standard}; }
        .ref-linkbox:hover { border-color: var(--accent-border); }
        @media (prefers-reduced-motion: reduce) { .ref-chip:hover, .ref-step:hover, .ref-cta:hover { transform: none; } }
      `}</style>

      {/* ── Κεφαλίδα ── */}
      <div style={{ marginBottom: T.sp.xxl }}>
        <div style={{ ...TT.label, color: 'var(--accent)', marginBottom: 8 }}>{isPro ? 'Πρόγραμμα Συνεργατών' : 'Πρόγραμμα Πρόσκλησης'}</div>
        <h1 style={{ ...TT.display, margin: 0 }}>{isPro ? 'Φέρε τους πελάτες σου. Κέρδισε μήνες και προμήθεια.' : 'Ξέρεις κι άλλον ιδιοκτήτη;'}</h1>
        <p style={{ ...TT.body, color: 'var(--text-secondary)', maxWidth: 640, marginTop: 8 }}>
          {isPro
            ? 'Κάθε ιδιοκτήτης-πελάτης που φέρνεις οργανώνεται και σου δίνει έτοιμα στοιχεία, ενώ εσύ κερδίζεις δωρεάν μήνες και χτίζεις προμήθεια. Το πιο αποδοτικό κανάλι για λογιστές, μεσίτες και διαχειριστές.'
            : 'Βοήθησέ τον να βάλει το ακίνητό του σε τάξη. Κάθε φίλος που ξεκινά κερδίζει δώρο, το ίδιο κι εσύ.'}
        </p>
      </div>

      {/* ── Σύνδεσμος πρόσκλησης (focal, elevated) ── */}
      <div style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-2)', padding: 'clamp(18px, 2.4vw, 26px)', marginBottom: sectionGap }}>
        <div style={{ ...TT.label, marginBottom: 12 }}>Ο σύνδεσμός σου</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="ref-linkbox" style={{ flex: 1, minWidth: 240, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-sunken)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: '11px 14px', minHeight: 44, boxSizing: 'border-box', boxShadow: 'var(--well-inset)' }}>
            <Ic d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1|M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" s={15} c="var(--text-tertiary)" />
            <span style={{ ...TT.body, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</span>
          </div>
          <button onClick={copy} className="ref-cta" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 20px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.inner, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Ic d={copied ? 'M20 6 9 17l-5-5' : 'M8 4h10a2 2 0 0 1 2 2v10|M4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z'} s={15} />
            {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
          </button>
        </div>
        <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{copied ? 'Ο σύνδεσμος αντιγράφηκε' : ''}</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {shares.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="ref-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none' }}>
              <Ic d={s.d} s={15} c="var(--text-tertiary)" />{s.label}
            </a>
          ))}
          <button onClick={nativeShare} className="ref-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" s={15} c="var(--text-tertiary)" />Κοινοποίηση
          </button>
          <span style={{ ...TT.caption, marginLeft: 'auto' }}>Κωδικός <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.mono, letterSpacing: '0.04em' }}>{code}</strong></span>
        </div>
      </div>

      {/* ── Η πρόοδός σου: μηνιαίο milestone + δρόμος για Συνεργάτη ── */}
      {!coldStart && <div style={{ ...TT.label, marginBottom: 12 }}>Η πρόοδός σου</div>}
      {coldStart ? (
        <div style={{ ...card, padding: PAD, marginBottom: sectionGap, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: 'var(--text-tertiary)' }}><Ic d="M13 2 3 14h9l-1 8 10-12h-9z" s={18} /></span>
          <span style={{ ...TT.bodySm }}>Μόλις φέρεις τον πρώτο σου ιδιοκτήτη, εδώ θα βλέπεις την πρόοδό σου προς το μηνιαίο μπόνους και την ιδιότητα Συνεργάτη.</span>
        </div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12, marginBottom: sectionGap }}>

        {/* Μηνιαίο milestone «Οι 5 του μήνα» */}
        <div style={{ ...card, padding: PAD }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ ...TT.h2 }}>Οι 5 του μήνα</span>
            <span style={{ ...TT.kpi, color: mReached ? 'var(--positive)' : 'var(--accent)' }}>{mCount}<span style={{ ...TT.caption }}> / {MONTHLY_MILESTONE}</span></span>
          </div>
          <Bar pct={mPct} tone={mReached ? 'var(--positive)' : 'var(--accent)'} />
          <p style={{ ...TT.bodySm, marginTop: 12, lineHeight: 1.55 }}>
            {mReached
              ? `Το κατάφερες! Κέρδισες ${MILESTONE_BONUS_MONTHS} μήνες Επαγγελματία δωρεάν.`
              : mCount === 0
                ? `Φέρε ${MONTHLY_MILESTONE} ενεργές συστάσεις αυτόν τον μήνα και κερδίζεις ${MILESTONE_BONUS_MONTHS} μήνες Επαγγελματία δωρεάν.`
                : `Φέρε ${mRemaining} ${mRemaining === 1 ? 'ακόμη ενεργή σύσταση' : 'ακόμη ενεργές συστάσεις'} και κερδίζεις ${MILESTONE_BONUS_MONTHS} μήνες Επαγγελματία δωρεάν.`}
          </p>
          {mReached && (
            <div style={{ marginTop: 12 }}>
              {claim === 'done'
                ? <span style={{ ...TT.bodySm, color: 'var(--positive)', fontWeight: 600 }}>Καταχωρήθηκε — θα εφαρμοστεί στη συνδρομή σου.</span>
                : <button onClick={doClaim} disabled={claim === 'saving'} className="ref-cta" style={{ height: 36, padding: '0 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: claim === 'saving' ? 'default' : 'pointer', opacity: claim === 'saving' ? 0.6 : 1 }}>{claim === 'saving' ? 'Καταχώρηση…' : `Διεκδίκησε ${MILESTONE_BONUS_MONTHS} μήνες`}</button>}
              {claim === 'error' && <div style={{ ...TT.caption, color: 'var(--warning)', marginTop: 8 }}>Κάτι πήγε στραβά. Δοκίμασε ξανά.</div>}
            </div>
          )}
        </div>

        {/* Δρόμος για Συνεργάτη (streak 3 ολοκληρωμένων μηνών) */}
        <div style={{ ...card, padding: PAD, ...(partner ? { borderColor: 'var(--accent-border)' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ ...TT.h2, color: partner ? 'var(--accent)' : undefined }}>{partner ? 'Είσαι Συνεργάτης' : 'Γίνε Συνεργάτης'}</span>
            {partner
              ? <Badge tone="accent">Ενεργός</Badge>
              : <span style={{ ...TT.kpi, color: 'var(--accent)' }}>{streak}<span style={{ ...TT.caption }}> / {STREAK_TARGET_MONTHS} μήνες</span></span>}
          </div>
          {partner ? (
            <ul style={{ ...TT.bodySm, lineHeight: 1.7, margin: 0, paddingLeft: 0, listStyle: 'none' }}>
              {[`${PARTNER_COMMISSION_RATE * 100}% προμήθεια στις συνδρομές που φέρνεις`, 'Μόνιμο δωρεάν Επαγγελματίας', 'Σήμα Συνεργάτη & προτεραιότητα υποστήριξης'].map((t, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 3 }}><Ic d="M20 6 9 17l-5-5" s={14} /></span>{t}
                </li>
              ))}
            </ul>
          ) : (
            <>
              <Bar pct={streakPct} />
              <p style={{ ...TT.bodySm, marginTop: 12, lineHeight: 1.55 }}>
                Πέτυχε το milestone για {STREAK_TARGET_MONTHS} συνεχόμενους μήνες και γίνεσαι επίσημος Συνεργάτης: επαναλαμβανόμενη προμήθεια {PARTNER_COMMISSION_RATE * 100}% στις συνδρομές που φέρνεις, μόνιμο δωρεάν Επαγγελματίας, σήμα και προτεραιότητα.
              </p>
            </>
          )}
        </div>
      </div>
      )}

      {/* ── Κερδισμένες θέσεις με αντίστροφη μέτρηση ── */}
      {slotsView.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: sectionGap }}>
          {slotsView.map((s, i) => {
            const urgent = s.days <= 7;
            const tone = urgent ? 'var(--warning)' : 'var(--accent)';
            return (
              <div key={i} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderColor: `color-mix(in srgb, ${tone} 30%, transparent)` }}>
                <div style={{ width: 36, height: 36, borderRadius: T.radius.inner, background: `color-mix(in srgb, ${tone} 12%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic d="M12 8v4l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" s={18} c={tone} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TT.h2, fontSize: 13 }}>Δωρεάν θέση ακινήτου · Λήγει σε {s.days} {s.days === 1 ? 'ημέρα' : 'ημέρες'}</div>
                  <div style={{ ...TT.bodySm, marginTop: 2 }}>Προσκάλεσε άλλον έναν ιδιοκτήτη για να την κρατήσεις ζωντανή.</div>
                </div>
                <span style={{ ...TT.kpi, color: tone }}>{s.days}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Οι ανταμοιβές: εσύ | ο φίλος/πελάτης σου (συμμετρικά, ουδέτερα) ── */}
      <div style={{ ...TT.label, marginBottom: 12 }}>Ανταμοιβή ανά σύσταση</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12, marginBottom: sectionGap }}>
        <div style={{ ...card, padding: PAD }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ic d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" s={16} c="var(--text-secondary)" />
            <span style={{ ...TT.label }}>Εσύ κερδίζεις</span>
          </div>
          <div style={{ ...TT.displaySm, marginBottom: 6 }}>{youHeadline}</div>
          <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>{youDetail}</div>
        </div>
        <div style={{ ...card, padding: PAD }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ic d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={16} c="var(--text-secondary)" />
            <span style={{ ...TT.label }}>{isPro ? 'Ο πελάτης σου' : 'Ο φίλος σου'} κερδίζει</span>
          </div>
          <div style={{ ...TT.displaySm, marginBottom: 6 }}>{REFEREE_TRIAL_MONTHS} μήνες</div>
          <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>δυνατότητες Ιδιοκτήτη δωρεάν, από την πρώτη μέρα.</div>
        </div>
      </div>

      {/* ── Πώς λειτουργεί: τρία βήματα ── */}
      <div style={{ ...TT.label, marginBottom: 12 }}>Πώς λειτουργεί</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginBottom: sectionGap }}>
        {steps.map((st, i) => (
          <div key={i} className="ref-step" style={{ ...card, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="ref-step-n" style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, transition: 'background .18s, color .18s' }}>{st.n}</span>
              <span className="ref-step-ic" style={{ color: 'var(--text-tertiary)', transition: 'color .18s' }}><Ic d={st.d2} s={20} /></span>
            </div>
            <div style={{ ...TT.h2, fontSize: 13 }}>{st.t}</div>
            <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>{st.d}</div>
          </div>
        ))}
      </div>

      {/* ── Κατάσταση προσκλήσεων ── */}
      <div style={{ ...TT.label, marginBottom: 12 }}>Οι προσκλήσεις σου</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12, marginBottom: 14 }}>
        {[['Προσκλήσεις', stats?.invites ?? 0], ['Ενεργοποιήθηκαν', stats?.activated ?? 0], ['Ανταμοιβές', stats?.rewards ?? 0]].map(([l, v], i) => (
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
