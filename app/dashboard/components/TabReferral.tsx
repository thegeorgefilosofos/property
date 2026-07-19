'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { downloadCsv, csvDate } from './exportCsv';
import { drawQrToCanvas } from '@/lib/qr';
import { T, TT, Badge, TierBadge } from '@/components/Theme';
import {
  referralCode, referralLink, progress,
  individualReferrerReward, refereeWelcome,
  REFEREE_FREE_SLOT_MONTHS, INDIV_PRO_BONUS_MONTHS, REFEREE_AGENCY_MONTHS, REFEREE_OWNER_MONTHS,
  INDIV_VOLUME_TARGET, INDIV_VOLUME_BONUS_MONTHS,
  PRO_PAID_TARGET, PRO_PAID_BONUS_MONTHS, PRO_FREE_TARGET, PRO_FREE_BONUS_MONTHS,
  STREAK_TARGET_MONTHS, PARTNER_COMMISSION_RATE,
} from '@/lib/referral/referral';

// ═══════════════════════════════════════════════════════════════════════════
// TabReferral — δύο ΞΕΧΩΡΙΣΤΑ προγράμματα ανά προφίλ:
//  • Ιδιώτης  → «Πρόγραμμα Πρόσκλησης»  (κοινωνικό, αξία ανά φίλο)
//  • Επαγγελματίας → «Πρόγραμμα Συνεργατών» (εισόδημα: milestones συνδρομητών +
//    ιδιότητα Συνεργάτη με προμήθεια). Καθένας βλέπει ΜΟΝΟ ό,τι τον αφορά.
// Design system του app (T/TT tokens, elevation για βάθος, ένα accent στο hover).
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
const PAD = T.sp.xl;
// Κοινό στυλ «chip» για τα κανάλια κοινοποίησης (ενιαία εμφάνιση).
const CHIP: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 36, padding: '0 14px',
  background: 'transparent', border: '1px solid var(--border-default)', borderRadius: T.radius.pill,
  fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textDecoration: 'none',
};
// Επικεφαλίδα ενότητας: πραγματικό <h2> (σημασιολογία + πλοήγηση αναγνώστη οθόνης).
function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <h2 style={{ ...TT.label, margin: '0 0 12px', ...style }}>{children}</h2>;
}
// Διακριτικό pill κοινωνικής απόδειξης / κατάταξης. Το κείμενο σκουραίνει προς το
// κύριο χρώμα κειμένου ώστε να περνά άνετα την αντίθεση AA και στα δύο θέματα.
const PILL: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px',
  borderRadius: T.radius.pill, background: 'var(--accent-dim)', border: '1px solid var(--accent-border)',
};
const PILL_TEXT = 'color-mix(in srgb, var(--accent) 68%, var(--text-primary))';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Πόσες ημέρες απομένουν ως το τέλος του τρέχοντος μήνα (για επείγουσα ώθηση).
const daysLeftInMonth = () => {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1); // αρχή επόμενου μήνα
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
};

// ── Κάρτα προόδου (brag artifact): σχεδίαση σε canvas για κοινοποίηση ──
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outer: number, inner: number, fill: string) {
  let rot = -Math.PI / 2; const step = Math.PI / spikes;
  ctx.beginPath(); ctx.moveTo(cx, cy - outer);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
function drawCoin(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(138,180,248,0.45)'; ctx.shadowBlur = 70;
  const g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.32, r * 0.1, cx, cy, r);
  g.addColorStop(0, '#d6e4fc'); g.addColorStop(0.55, '#8ab4f8'); g.addColorStop(1, '#3f66bf');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(cx, cy, r - 9, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(10,26,50,0.35)'; ctx.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24));
    ctx.lineTo(cx + Math.cos(a) * (r - 42), cy + Math.sin(a) * (r - 42));
    ctx.stroke();
  }
  drawStar(ctx, cx, cy, 5, r * 0.44, r * 0.18, '#0a2647');
}
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let cy = y;
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { ctx.fillText(line, x, cy); cy += lineHeight; line = w; }
      else line = test;
    }
    if (line) { ctx.fillText(line, x, cy); cy += lineHeight; }
  }
  return cy;
}

// Odometer: τα ψηφία κυλούν κατακόρυφα στη θέση τους (em-based, tabular, ήρεμο
// cubic με κλιμακωτή καθυστέρηση). Σεβασμός prefers-reduced-motion. Ενιαίο σε
// κάθε KPI της καρτέλας.
function CountUp({ value }: { value: number }) {
  const target = Math.max(0, Math.round(Number(value) || 0));
  // rolled ξεκινά false ΚΑΙ στον server ΚΑΙ στον client (καμία ασυμφωνία hydration).
  const [rolled, setRolled] = useState(false);
  useEffect(() => {
    if (reducedMotion()) { setRolled(true); return; }
    const id = requestAnimationFrame(() => setRolled(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const digits = String(target).split('').map(Number);
  const rm = reducedMotion();
  // Ένας αόρατος πραγματικός αριθμός δίνει τη σωστή γραμμή βάσης (το overflow:hidden
  // των κυλιόμενων ψηφίων συνθέτει baseline στο κάτω άκρο και θα «σήκωνε» τα ψηφία).
  // Τα κυλιόμενα ψηφία τοποθετούνται απόλυτα από πάνω, ευθυγραμμισμένα με tabular-nums.
  return (
    <span role="img" aria-label={String(target)} style={{ position: 'relative', display: 'inline-block', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
      <span aria-hidden style={{ visibility: 'hidden' }}>{target}</span>
      <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        {digits.map((d, i) => (
          <span key={`${digits.length}-${i}`} style={{ flex: '0 0 1ch', width: '1ch', height: '1em', overflow: 'hidden' }}>
            <span style={{ display: 'block', transform: `translateY(-${rolled ? d : 0}em)`, transition: rm ? 'none' : 'transform 1.05s cubic-bezier(.16,1,.3,1)', transitionDelay: rm ? '0ms' : `${i * 55}ms` }}>
              {Array.from({ length: 10 }, (_, n) => <span key={n} style={{ display: 'block', height: '1em', textAlign: 'center' }}>{n}</span>)}
            </span>
          </span>
        ))}
      </span>
    </span>
  );
}

// Μπάρα που γεμίζει από το 0 στο mount, με ομαλή καμπύλη.
function Bar({ pct, tone = 'var(--accent)' }: { pct: number; tone?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { if (reducedMotion()) { setW(pct); return; } const id = requestAnimationFrame(() => setW(pct)); return () => cancelAnimationFrame(id); }, [pct]);
  return (
    <div style={{ height: 8, background: 'var(--ring-track)', borderRadius: 100, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, w))}%`, background: tone, borderRadius: 100, transition: `width 0.65s ${T.ease.emphasized}` }} />
    </div>
  );
}

// Διακριτικό «confetti» στη στιγμή της νίκης (μία ριπή, εδώ επιτρέπεται χρώμα).
function Confetti() {
  const dots = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2;
    const dist = 42 + (i % 4) * 13;
    return { dx: Math.cos(a) * dist, dy: Math.sin(a) * dist - 8, c: i % 3 === 0 ? 'var(--positive)' : i % 3 === 1 ? 'var(--accent)' : 'var(--warning)', round: i % 2 === 0 };
  });
  return (
    <span aria-hidden style={{ position: 'absolute', left: '50%', top: 6, width: 0, height: 0, pointerEvents: 'none' }}>
      {dots.map((d, i) => (
        <span key={i} style={{ position: 'absolute', width: 7, height: 7, borderRadius: d.round ? '50%' : 1, background: d.c, ['--dx' as string]: `${d.dx}px`, ['--dy' as string]: `${d.dy}px`, animation: `ref-pop .9s cubic-bezier(.2,.6,.2,1) forwards` } as React.CSSProperties} />
      ))}
    </span>
  );
}

type Overview = {
  invites: number; activated: number;
  m_pro: number; m_indiv: number; m_paid: number; m_free: number;
  streak: number; partner: boolean;
};
type Reward = { kind: string; months: number; tier: string; reason: string; status: string; created_at: string };
type Referee = { created_at: string; activated_at: string | null };

export default function TabReferral({ userId, plan = 'free', profileType }: {
  userId: string; plan?: string; profileType: 'individual' | 'professional';
}) {
  const [origin, setOrigin] = useState('https://property-os.gr');
  const [copied, setCopied] = useState(false);
  const [msgCopied, setMsgCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const qrCloseRef = useRef<HTMLButtonElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  // QR modal: Escape για κλείσιμο, αρχική εστίαση, επαναφορά εστίασης.
  useEffect(() => {
    if (!qrOpen) return;
    const prev = document.activeElement as HTMLElement | null;
    qrCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setQrOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [qrOpen]);
  const [stats, setStats] = useState<Overview | null>(null);
  const [social, setSocial] = useState(0);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [list, setList] = useState<Referee[]>([]);
  const [standing, setStanding] = useState(0);
  const [claim, setClaim] = useState<Record<string, 'idle' | 'saving' | 'done' | 'error'>>({});
  const [celebrate, setCelebrate] = useState<Record<string, boolean>>({});
  useEffect(() => { try { setOrigin(window.location.origin); } catch { /* SSR */ } }, []);

  const code = useMemo(() => referralCode(userId), [userId]);
  const link = useMemo(() => referralLink(origin, userId), [origin, userId]);
  const isPro = profileType === 'professional';
  // QR κώδικας συνδέσμου: σχεδιάζεται τοπικά στη συσκευή όταν ανοίξει το modal.
  useEffect(() => {
    if (qrOpen && qrCanvasRef.current) drawQrToCanvas(qrCanvasRef.current, link, { size: 200 });
  }, [qrOpen, link]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let alive = true;
    (async () => {
      try {
        await supabase.from('referral_codes').upsert({ user_id: userId, code }, { onConflict: 'user_id' });
        // Καταγράφει την ανά-σύσταση αξία στο ledger (idempotent) πριν το διαβάσουμε.
        await supabase.rpc('reconcile_referral_rewards', { p_code: code });
        const [{ data }, { data: sp }, { data: rw }, { data: ls }, { data: st }] = await Promise.all([
          supabase.rpc('get_referral_overview', { p_code: code }),
          supabase.rpc('get_referral_social_proof'),
          supabase.from('referral_rewards').select('kind,months,tier,reason,status,created_at').order('created_at', { ascending: false }),
          supabase.rpc('get_referral_list', { p_code: code }),
          supabase.rpc('get_referral_standing'),
        ]);
        if (alive && typeof sp === 'number') setSocial(sp);
        if (alive && Array.isArray(rw)) setRewards(rw as Reward[]);
        if (alive && Array.isArray(ls)) setList(ls as Referee[]);
        if (alive && typeof st === 'number') setStanding(st);
        if (alive && data) setStats({
          invites: Number(data.invites) || 0, activated: Number(data.activated) || 0,
          m_pro: Number(data.m_pro) || 0, m_indiv: Number(data.m_indiv) || 0,
          m_paid: Number(data.m_paid) || 0, m_free: Number(data.m_free) || 0,
          streak: Number(data.streak) || 0, partner: !!data.partner,
        });
      } catch { /* δουλεύει και χωρίς σύνδεση: δείχνει μηδενική πρόοδο */ }
    })();
    return () => { alive = false; };
  }, [userId, code]);

  const invite = isPro
    ? `Για το ακίνητό σου, σου προτείνω το PropertyOS. Κρατάει τα οικονομικά σου σε τάξη και ετοιμάζει σωστά τα στοιχεία για τη φορολογική σου δήλωση, ώστε να μην τρέχεις εσύ. Το πρώτο ακίνητο είναι δωρεάν και με τον σύνδεσμό μου κερδίζεις ${REFEREE_FREE_SLOT_MONTHS} μήνες δώρο για ένα ή παραπάνω ακίνητα: ${link}`
    : `Οργανώνω το ακίνητό μου με το PropertyOS και μου έλυσε τα χέρια: σαρώνω λογαριασμούς, βλέπω φόρους και αποδόσεις, όλα σε ένα. Ρίξε του μια ματιά. Το πρώτο ακίνητο είναι δωρεάν και με τον σύνδεσμό μου κερδίζεις ${REFEREE_FREE_SLOT_MONTHS} μήνες δώρο για ένα ή παραπάνω ακίνητα: ${link}`;

  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const copyMsg = async () => { try { await navigator.clipboard.writeText(invite); setMsgCopied(true); setTimeout(() => setMsgCopied(false), 1800); } catch { /* ignore */ } };
  // GDPR φορητότητα (Άρθ. 15/20): εξαγωγή των δικών σου δεδομένων σύστασης σε CSV.
  const exportMyData = () => {
    const rows: (string | number | null)[][] = [];
    list.forEach(rf => rows.push(['Πρόσκληση', csvDate(rf.created_at), rf.activated_at ? 'Ενεργοποιήθηκε' : 'Εκκρεμεί ενεργοποίηση', rf.activated_at ? csvDate(rf.activated_at) : '']));
    rewards.forEach(r => rows.push(['Ανταμοιβή', csvDate(r.created_at), r.status === 'granted' ? 'Ενεργό' : 'Σε εκκρεμότητα', `${r.months} μήνες · ${r.reason}`]));
    downloadCsv(`propertyos-referral-${code}`, ['Κατηγορία', 'Ημερομηνία', 'Κατάσταση', 'Λεπτομέρεια'], rows);
  };
  const nativeShare = async () => { try { await (navigator as Navigator & { share?: (d: { text: string }) => Promise<void> }).share?.({ text: invite }); } catch { /* ignore */ } };
  const doClaim = async (kind: string) => {
    setClaim(c => ({ ...c, [kind]: 'saving' }));
    try {
      const supabase = createClient();
      const { data } = await supabase.rpc('claim_referral_bonus', { p_code: code, p_kind: kind });
      const ok = data && (data as { ok?: boolean }).ok;
      setClaim(c => ({ ...c, [kind]: ok ? 'done' : 'error' }));
      if (ok && !reducedMotion()) { setCelebrate(c => ({ ...c, [kind]: true })); setTimeout(() => setCelebrate(c => ({ ...c, [kind]: false })), 1000); }
    } catch { setClaim(c => ({ ...c, [kind]: 'error' })); }
  };

  const emailSubject = isPro ? 'Πρόσκληση στο PropertyOS για τα ακίνητα των πελατών σου' : 'Σου προτείνω το PropertyOS για το ακίνητό σου';
  const shares = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(invite)}`, d: 'M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-4-1L3 20l1-4.5a8.5 8.5 0 0 1-1-4A8.38 8.38 0 0 1 11.5 3 8.5 8.5 0 0 1 21 11.5z' },
    { label: 'Viber', href: `viber://forward?text=${encodeURIComponent(invite)}`, d: 'M12 3a9 9 0 0 0-9 9 8.7 8.7 0 0 0 2 5.6L4 21l3.6-1a9 9 0 1 0 4.4-17z|M9 8c1.5 3 3.5 5 6.5 6' },
    { label: 'Telegram', href: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(invite)}`, d: 'M21 4 3 11l5 2 2 6 3-4 5 4z' },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(invite)}`, d: 'M2 5h20v14H2z|M2 6l10 7 10-7' },
  ];

  const referrerPaying = plan === 'monthly' || plan === 'annual';
  const steps = isPro
    ? [
        { n: '1', t: 'Στέλνεις τον σύνδεσμο', d: 'Στους πελάτες-ιδιοκτήτες σου, όπου σε βολεύει.', d2: 'M22 2 11 13|M22 2 15 22l-4-9-9-4z' },
        { n: '2', t: 'Ο νέος ιδιοκτήτης ξεκινά', d: 'Προσθέτει το πρώτο του ακίνητο και σαρώνει ένα έγγραφο στο PropertyOS.', d2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
        { n: '3', t: 'Χτίζεις εισόδημα', d: 'Δωρεάν μήνες και μπόνους από την αρχή. Όσο διατηρείς ρυθμό, εξασφαλίζεις επαναλαμβανόμενη μηνιαία προμήθεια.', d2: 'M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6' },
      ]
    : [
        { n: '1', t: 'Στέλνεις τον σύνδεσμο', d: 'Σε έναν ιδιοκτήτη ακινήτου, όπου σε βολεύει.', d2: 'M22 2 11 13|M22 2 15 22l-4-9-9-4z' },
        { n: '2', t: 'Ο νέος ιδιοκτήτης ξεκινά', d: 'Προσθέτει το πρώτο του ακίνητο και σαρώνει ένα έγγραφο στο PropertyOS.', d2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14|M22 4 12 14.01l-3-3' },
        { n: '3', t: 'Παίρνετε τα δώρα σας', d: `Εκείνος παίρνει ${REFEREE_FREE_SLOT_MONTHS} μήνες δώρο κι εσύ ${referrerPaying ? 'έναν μήνα Ιδιώτη' : 'ένα δωρεάν ακίνητο για έναν μήνα'}.`, d2: 'M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 4.5 12 7 12 7z|M12 7s3-5 5.5-2.5S12 7 12 7z' },
      ];

  const partner = stats?.partner ?? false;
  const streak = Math.min(stats?.streak ?? 0, STREAK_TARGET_MONTHS);
  const streakPct = Math.min(100, (streak / STREAK_TARGET_MONTHS) * 100);
  const coldStart = !!stats && stats.invites === 0;
  const youBase = individualReferrerReward(referrerPaying, 'free');   // τι κερδίζεις για δωρεάν φίλο
  const friendBase = refereeWelcome('free');                          // τι κερδίζει ο φίλος (μένει δωρεάν)
  const myTier: 'owner' | 'agency' | 'partner' = partner ? 'partner' : (isPro ? 'agency' : 'owner');
  const styleBlock = (
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
      .ref-lift { transition: transform .18s ${T.ease.standard}, box-shadow .18s, border-color .18s; }
      .ref-lift:hover { transform: translateY(-2px); box-shadow: var(--highlight-inset-strong), var(--elev-3); border-color: var(--accent-border); }
      .ref-kpi-hover { color: var(--text-primary); transition: color .16s ${T.ease.standard}; }
      .ref-lift:hover .ref-kpi-hover { color: var(--accent); }
      .ref-hover-accent:hover .ref-kpi-hover { color: var(--accent); }
      @keyframes ref-pop { 0% { transform: translate(-50%, 0) scale(1); opacity: 1; } 100% { transform: translate(calc(-50% + var(--dx)), var(--dy)) scale(.35); opacity: 0; } }
      @keyframes ref-rise { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: none; } }
      .ref-rise { animation: ref-rise .5s ${T.ease.decel} both; }
      @media (prefers-reduced-motion: reduce) { .ref-chip:hover, .ref-step:hover, .ref-cta:hover, .ref-lift:hover { transform: none; } .ref-rise { animation: none; } }
    `}</style>
  );

  // ── Κάρτα μηνιαίου milestone με μπάρα + διεκδίκηση ──
  const Milestone = ({ title, count, target, kind, reward }: { title: string; count: number; target: number; kind: string; reward: string }) => {
    const pr = progress(count, target);
    const st = claim[kind] || 'idle';
    const dleft = daysLeftInMonth();
    return (
      <div className="ref-lift" style={{ ...card, padding: PAD, position: 'relative', overflow: 'visible', ...(pr.reached ? { borderColor: 'color-mix(in srgb, var(--positive) 38%, var(--border-raised))', background: 'linear-gradient(180deg, color-mix(in srgb, var(--positive) 8%, var(--surface-raised)), var(--surface-raised) 62%)' } : {}) }}>
        {celebrate[kind] && <Confetti />}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ ...TT.h2 }}>{title}</span>
          <span className={pr.reached ? undefined : 'ref-kpi-hover'} style={{ ...TT.kpi, color: pr.reached ? 'var(--positive)' : undefined }}><CountUp value={pr.count} /><span style={{ ...TT.caption }}> / {target}</span></span>
        </div>
        <Bar pct={pr.pct} tone={pr.reached ? 'var(--positive)' : 'var(--accent)'} />
        <p style={{ ...TT.bodySm, marginTop: 12, lineHeight: 1.55 }}>
          {pr.reached
            ? `Μπράβο, το πέτυχες. Κέρδισες ${reward}.`
            : pr.count === 0
              ? `Προσκάλεσε ${target} μέσα στον ίδιο μήνα και κέρδισε ${reward}.`
              : pr.remaining === 1
                ? `Σου λείπει μόλις ένας ακόμη για ${reward}. Είσαι ένα βήμα πριν τον στόχο.`
                : `Σου λείπουν ${pr.remaining} ακόμη για ${reward}. Συνέχισε.`}
        </p>
        {!pr.reached && (
          <div style={{ ...TT.caption, marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, color: dleft <= 5 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
            <Ic d="M12 8v4l3 2|M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" s={13} c="currentColor" />
            {dleft <= 1 ? 'Τελευταία ημέρα του μήνα' : `Απομένουν ${dleft} ημέρες ως το τέλος του μήνα`}
          </div>
        )}
        {pr.reached && (
          <div style={{ marginTop: 12 }}>
            {st === 'done'
              ? <span role="status" style={{ ...TT.bodySm, color: 'var(--positive)', fontWeight: 600 }}>Το δώρο σου καταχωρήθηκε. Πιστώνεται στη συνδρομή σου.</span>
              : <button onClick={() => doClaim(kind)} disabled={st === 'saving'} className="ref-cta" style={{ height: 36, padding: '0 16px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700, fontFamily: T.font.sans, cursor: st === 'saving' ? 'default' : 'pointer', opacity: st === 'saving' ? 0.6 : 1 }}>{st === 'saving' ? 'Καταχώρηση…' : 'Πάρ’ το δώρο σου'}</button>}
            {st === 'error' && <div role="alert" style={{ ...TT.caption, color: 'var(--warning)', marginTop: 8 }}>Κάτι δεν πήγε καλά. Δοκίμασε ξανά.</div>}
          </div>
        )}
      </div>
    );
  };

  // Κάρτα προόδου: σχεδίαση premium PNG και κοινοποίηση (ή λήψη ως εφεδρεία).
  const shareProof = async () => {
    try {
      const W = 1080, H = 1350;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0b1c36'); bg.addColorStop(1, '#081327');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(W / 2, 360, 40, W / 2, 360, 640);
      glow.addColorStop(0, 'rgba(138,180,248,0.20)'); glow.addColorStop(1, 'rgba(138,180,248,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.font = `700 36px ${T.font.sans}`;
      ctx.fillText('PropertyOS', W / 2, 132);
      drawCoin(ctx, W / 2, 388, 150);
      const activated = stats?.activated ?? 0;
      const headline = partner ? 'Συνεργάτης\nPropertyOS'
        : activated > 0 ? `${activated} ${activated === 1 ? 'ιδιοκτήτης ξεκίνησε' : 'ιδιοκτήτες ξεκίνησαν'}\nμαζί μου στο PropertyOS`
        : 'Οργάνωσε το\nακίνητό σου';
      ctx.fillStyle = '#ffffff'; ctx.font = `800 70px ${T.font.sans}`;
      const afterH = wrapText(ctx, headline, W / 2, 700, W - 150, 86);
      ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.font = `500 34px ${T.font.sans}`;
      wrapText(ctx, 'Λογαριασμοί, φόροι και αποδόσεις, όλα σε ένα.', W / 2, afterH + 26, W - 210, 46);
      const chipW = 470, chipH = 92, chipX = (W - chipW) / 2, chipY = 1118, rr = 46;
      ctx.fillStyle = 'rgba(138,180,248,0.16)';
      ctx.beginPath();
      ctx.moveTo(chipX + rr, chipY);
      ctx.arcTo(chipX + chipW, chipY, chipX + chipW, chipY + chipH, rr);
      ctx.arcTo(chipX + chipW, chipY + chipH, chipX, chipY + chipH, rr);
      ctx.arcTo(chipX, chipY + chipH, chipX, chipY, rr);
      ctx.arcTo(chipX, chipY, chipX + chipW, chipY, rr);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cfe0fb'; ctx.font = `700 38px ${T.font.sans}`;
      ctx.fillText('Κωδικός ' + code, W / 2, chipY + 60);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.font = `500 28px ${T.font.sans}`;
      ctx.fillText('property-os.gr', W / 2, 1272);

      const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'));
      if (!blob) return;
      const file = new File([blob], 'propertyos.png', { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean; share?: (d: { files?: File[]; text?: string }) => Promise<void> };
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try { await nav.share({ files: [file], text: invite }); return; } catch { /* πέρασε στη λήψη */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'propertyos.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch { /* ignore */ }
  };

  return (
    <div style={{ maxWidth: 900, fontFamily: T.font.sans }}>
      {styleBlock}

      {/* ── QR κωδικός συνδέσμου (για διά ζώσης πρόσκληση) ── */}
      {qrOpen && (
        <div onClick={() => setQrOpen(false)} role="dialog" aria-modal="true" aria-label="Κωδικός QR πρόσκλησης"
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(6,12,24,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-3)', padding: 24, maxWidth: 340, width: '100%', textAlign: 'center' }}>
            <div style={{ ...TT.h2, marginBottom: 4 }}>Σάρωσε για να προσκαλέσεις</div>
            <div style={{ ...TT.bodySm, marginBottom: 16 }}>Δείξε τον κωδικό ώστε να ανοίξει τον σύνδεσμό σου από το κινητό.</div>
            <div style={{ background: '#fff', padding: 14, borderRadius: T.radius.inner, display: 'inline-block', boxShadow: 'var(--well-inset)' }}>
              <canvas ref={qrCanvasRef} role="img" aria-label="Κωδικός QR πρόσκλησης" style={{ display: 'block' }} />
            </div>
            <button ref={qrCloseRef} onClick={() => setQrOpen(false)} className="ref-cta" style={{ marginTop: 18, height: 40, padding: '0 22px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer' }}>Έτοιμο</button>
          </div>
        </div>
      )}

      {/* ── Κεφαλίδα ── */}
      <div style={{ marginBottom: T.sp.xxl }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ ...TT.label, color: 'var(--accent)' }}>{isPro ? 'PropertyOS · Πρόγραμμα Συνεργατών' : 'PropertyOS · Πρόγραμμα Πρόσκλησης'}</div>
          <TierBadge tier={myTier} />
        </div>
        <h1 style={{ ...TT.display, margin: 0 }}>{isPro ? 'Προσκάλεσε τους πελάτες σου. Κέρδισε μήνες και προμήθεια.' : 'Ξέρεις κι άλλον ιδιοκτήτη;'}</h1>
        <p style={{ ...TT.body, color: 'var(--text-secondary)', maxWidth: 640, marginTop: 8 }}>
          {isPro
            ? 'Κάθε ιδιοκτήτης που προσκαλείς οργανώνεται και σου δίνει έτοιμα στοιχεία. Εσύ κερδίζεις δωρεάν μήνες και, με σταθερή απόδοση, γίνεσαι Συνεργάτης με δική σου προμήθεια. Η πλέον αποδοτική πηγή εισοδήματος για λογιστές, μεσίτες και διαχειριστές ακινήτων.'
            : 'Δείξε του πώς να βάλει το ακίνητό του σε τάξη. Με κάθε ιδιοκτήτη που ξεκινά, κερδίζετε και οι δύο.'}
        </p>
        {(standing > 0 || social >= 8) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            {standing > 0 && (
              <div className="ref-rise" style={PILL}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Ic d="M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6" s={15} /></span>
                <span style={{ ...TT.bodySm, color: PILL_TEXT, fontWeight: 600 }}>Είσαι στο κορυφαίο {standing}% όσων προσκαλούν αυτόν τον μήνα</span>
              </div>
            )}
            {social >= 8 && (
              <div className="ref-rise" style={PILL}>
                <span style={{ color: 'var(--accent)', display: 'inline-flex' }}><Ic d="M20 21v-2a4 4 0 0 0-3-3.87|M4 21v-2a4 4 0 0 1 3-3.87|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z|M16 3.13a4 4 0 0 1 0 7.75" s={15} /></span>
                <span style={{ ...TT.bodySm, color: PILL_TEXT, fontWeight: 600 }}>{social.toLocaleString('el-GR')} ιδιοκτήτες κάλεσαν φίλο αυτόν τον μήνα</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Σύνδεσμος πρόσκλησης (focal, elevated) ── */}
      <div style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-2)', padding: 'clamp(18px, 2.4vw, 26px)', marginBottom: T.sp.xl }}>
        <SectionLabel>Ο προσωπικός σου σύνδεσμος</SectionLabel>
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
        <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{copied ? 'Ο σύνδεσμος αντιγράφηκε' : msgCopied ? 'Το μήνυμα αντιγράφηκε' : ''}</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {shares.map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" className="ref-chip" style={CHIP}>
              <Ic d={s.d} s={15} c="var(--text-tertiary)" />{s.label}
            </a>
          ))}
          <button onClick={copyMsg} className="ref-chip" style={{ ...CHIP, cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d={msgCopied ? 'M20 6 9 17l-5-5' : 'M8 4h10a2 2 0 0 1 2 2v10|M4 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z'} s={15} c="var(--text-tertiary)" />{msgCopied ? 'Αντιγράφηκε' : 'Αντιγραφή μηνύματος'}
          </button>
          <button onClick={() => setQrOpen(true)} className="ref-chip" style={{ ...CHIP, cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d="M3 3h7v7H3z|M14 3h7v7h-7z|M3 14h7v7H3z|M14 14h3v3|M20 20h1|M20 14h1|M14 20h1" s={15} c="var(--text-tertiary)" />QR
          </button>
          <button onClick={nativeShare} className="ref-chip" style={{ ...CHIP, cursor: 'pointer', fontFamily: T.font.sans }}>
            <Ic d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" s={15} c="var(--text-tertiary)" />Κοινοποίηση
          </button>
          <span style={{ ...TT.caption, marginLeft: 'auto' }}>Κωδικός <strong style={{ color: 'var(--text-secondary)', fontFamily: T.font.mono, letterSpacing: '0.04em' }}>{code}</strong></span>
        </div>
      </div>

      {/* ── Cold-start: προτροπή πρώτης πρόσκλησης ── */}
      {coldStart && (
        <div className="ref-rise" style={{ ...card, borderColor: 'var(--accent-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent 170%)', padding: PAD, marginBottom: T.sp.xl, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ width: 40, height: 40, borderRadius: T.radius.inner, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic d="M22 2 11 13|M22 2 15 22l-4-9-9-4z" s={20} />
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ ...TT.h2, fontSize: 14 }}>Κάνε την πρώτη σου πρόσκληση</div>
            <div style={{ ...TT.bodySm, marginTop: 2 }}>Στείλε τον σύνδεσμό σου σε {isPro ? 'έναν πελάτη-ιδιοκτήτη' : 'έναν ιδιοκτήτη ακινήτου'} και ξεκίνα να κερδίζεις από σήμερα.</div>
          </div>
          <button onClick={async () => { await nativeShare(); copy(); }} className="ref-cta" style={{ height: 40, padding: '0 20px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>Μοιράσου τώρα</button>
        </div>
      )}

      {/* ── Τα κέρδη σου με μια ματιά (μόλις υπάρχει δραστηριότητα) ── */}
      {!coldStart && stats && stats.invites > 0 && (
        <div className="ref-rise ref-hover-accent" style={{ ...card, boxShadow: 'var(--highlight-inset), var(--elev-2)', borderColor: 'var(--accent-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent 160%)', padding: PAD, marginBottom: T.sp.xl, display: 'flex', alignItems: 'center', gap: 'clamp(16px, 3vw, 28px)', flexWrap: 'wrap' }}>
          <TierBadge tier={myTier} showLabel={false} size={48} />
          {([
            ['Προσκλήσεις', stats.invites, false],
            ['Ενεργοποιήθηκαν', stats.activated, true],
            [isPro ? 'Συνδρομητές τον μήνα' : 'Νέοι τον μήνα', isPro ? stats.m_paid : stats.m_indiv, false],
          ] as [string, number, boolean][]).map(([l, v, hi], i) => (
            <div key={i} style={{ minWidth: 88 }}>
              <div className={hi ? 'ref-kpi-hover' : undefined} style={{ ...TT.kpi, fontSize: 26, color: hi ? undefined : 'var(--text-primary)' }}><CountUp value={Number(v)} /></div>
              <div style={{ ...TT.caption, marginTop: 3 }}>{l}</div>
            </div>
          ))}
          <button onClick={shareProof} className="ref-cta" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.pill, fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <Ic d="M4 12v8h16v-8|M12 16V4|M8 8l4-4 4 4" s={15} />Κάρτα προόδου
          </button>
        </div>
      )}

      {isPro ? (
        /* ═══ ΕΠΑΓΓΕΛΜΑΤΙΑΣ — milestones συνδρομητών + Συνεργάτης ═══ */
        <>
          <SectionLabel>Οι στόχοι του μήνα</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12, marginBottom: T.sp.xl }}>
            <Milestone title="Συνδρομητές" count={stats?.m_paid ?? 0} target={PRO_PAID_TARGET} kind="pro_paid" reward={`${PRO_PAID_BONUS_MONTHS} μήνες Επαγγελματία`} />
            <Milestone title="Δωρεάν χρήστες" count={stats?.m_free ?? 0} target={PRO_FREE_TARGET} kind="pro_free" reward={`${PRO_FREE_BONUS_MONTHS} μήνα Επαγγελματία`} />
          </div>

          {/* Συνεργάτης */}
          <SectionLabel>Ιδιότητα Συνεργάτη</SectionLabel>
          <div className="ref-hover-accent" style={{ ...card, padding: PAD, marginBottom: T.sp.xl, ...(partner ? { borderColor: 'var(--accent-border)', background: 'linear-gradient(180deg, var(--accent-soft), transparent 140%)' } : {}) }}>
            {partner ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <TierBadge tier="partner" showLabel={false} size={56} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ ...TT.h2, color: 'var(--accent)' }}>Είσαι Συνεργάτης PropertyOS</span>
                  <span style={{ ...TT.bodySm }}>Ενεργή ιδιότητα. Να τι απολαμβάνεις:</span>
                </div>
              </div>
            ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ ...TT.h2 }}>Γίνε Συνεργάτης PropertyOS</span>
              <span className="ref-kpi-hover" style={{ ...TT.kpi }}><CountUp value={streak} /><span style={{ ...TT.caption }}> / {STREAK_TARGET_MONTHS} μήνες</span></span>
            </div>
            )}
            {!partner && <div style={{ marginBottom: 14 }}><Bar pct={streakPct} /></div>}
            {!partner && (
              <p style={{ ...TT.bodySm, marginBottom: 14, lineHeight: 1.55 }}>
                Φτάσε τους {PRO_PAID_TARGET} συνδρομητές για {STREAK_TARGET_MONTHS} συνεχόμενους μήνες και γίνε επίσημος Συνεργάτης. Να τι κερδίζεις:
              </p>
            )}
            <ul style={{ ...TT.bodySm, lineHeight: 1.7, margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {[
                `${PARTNER_COMMISSION_RATE * 100}% προμήθεια σε κάθε συνδρομή που φέρνεις, κάθε μήνα`,
                'Κάθε μήνα που πιάνεις τον στόχο, ο επόμενος είναι δωρεάν',
                'Σήμα Συνεργάτη και προτεραιότητα στην εξυπηρέτηση',
              ].map((t, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ color: partner ? 'var(--accent)' : 'var(--text-tertiary)', flexShrink: 0, marginTop: 3 }}><Ic d="M20 6 9 17l-5-5" s={14} /></span>{t}
                </li>
              ))}
            </ul>
            {(() => {
              const d = daysLeftInMonth();
              const r = PRO_PAID_TARGET - (stats?.m_paid ?? 0);
              if (!(streak >= 1 && r > 0 && d <= 10)) return null;
              return (
                <div style={{ marginTop: 16, display: 'flex', gap: 9, alignItems: 'flex-start', padding: '10px 12px', borderRadius: T.radius.inner, background: 'color-mix(in srgb, var(--warning) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 26%, transparent)' }}>
                  <span style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }}><Ic d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z|M12 9v4|M12 17h.01" s={15} /></span>
                  <span style={{ ...TT.bodySm, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {d === 1 ? 'Ο μήνας κλείνει αύριο.' : `Ο μήνας κλείνει σε ${d} ημέρες.`} {r === 1 ? 'Σου λείπει ένας συνδρομητής' : `Σου λείπουν ${r} συνδρομητές`} {partner ? 'για να εξασφαλίσεις τον δωρεάν μήνα.' : 'για να διατηρήσεις τους συνεχόμενους μήνες σου.'}
                  </span>
                </div>
              );
            })()}
          </div>
        </>
      ) : (
        /* ═══ ΙΔΙΩΤΗΣ — αξία ανά φίλο + μηνιαίο μπόνους όγκου ═══ */
        <>
          <SectionLabel>Τι κερδίζετε σε κάθε πρόσκληση</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 12, marginBottom: T.sp.xl }}>
            <div className="ref-lift" style={{ ...card, padding: PAD }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ic d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" s={16} c="var(--text-secondary)" />
                <span style={{ ...TT.label }}>Εσύ κερδίζεις</span>
              </div>
              <div style={{ ...TT.displaySm, marginBottom: 6 }}>{youBase.isSlot ? '+1 ακίνητο' : `+${youBase.months} μήνας Ιδιώτη`}</div>
              <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>{youBase.isSlot ? `δωρεάν για ${youBase.months} μήνα, για κάθε φίλο που προσκαλείς.` : 'για κάθε φίλο που προσκαλείς. Πιστώνεται αυτόματα στη συνδρομή σου.'}</div>
            </div>
            <div className="ref-lift" style={{ ...card, padding: PAD }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Ic d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={16} c="var(--text-secondary)" />
                <span style={{ ...TT.label }}>Ο φίλος σου κερδίζει</span>
              </div>
              <div style={{ ...TT.displaySm, marginBottom: 6 }}>{friendBase.months} μήνες δώρο</div>
              <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>για ένα ή παραπάνω ακίνητα, με το πρώτο του δωρεάν από την πρώτη μέρα. Κι αν γίνει συνδρομητής Ιδιώτης, κερδίζει δωρεάν τους επόμενους {REFEREE_OWNER_MONTHS} μήνες.</div>
            </div>
          </div>

          <SectionLabel>Επιπλέον μπόνους</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12, marginBottom: T.sp.xl }}>
            {/* Ποιοτικό μπόνους: φέρε έναν Επαγγελματία */}
            <div className="ref-lift" style={{ ...card, padding: PAD }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, minHeight: 22 }}>
                <span style={{ ...TT.h2 }}>Προσκάλεσε έναν Επαγγελματία</span>
                {(stats?.m_pro ?? 0) >= 1 && <Badge tone="positive">Το πέτυχες</Badge>}
              </div>
              <div style={{ ...TT.displaySm, marginBottom: 6 }}>+{INDIV_PRO_BONUS_MONTHS} μήνες Ιδιώτη</div>
              <div style={{ ...TT.bodySm, lineHeight: 1.55 }}>για σένα, μόλις κάποιος που προσκάλεσες γίνει Επαγγελματίας. Κι εκείνος παίρνει δώρο τον δεύτερο μήνα ως Επαγγελματίας.</div>
            </div>
            {/* Μπόνους όγκου: 5 νέοι τον μήνα */}
            <Milestone title="5 νέοι τον μήνα" count={stats?.m_indiv ?? 0} target={INDIV_VOLUME_TARGET} kind="indiv_volume" reward={`${INDIV_VOLUME_BONUS_MONTHS} επιπλέον μήνα Ιδιώτη`} />
          </div>
        </>
      )}

      {/* ── Πώς λειτουργεί: τρία βήματα ── */}
      <SectionLabel>Πώς λειτουργεί</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginBottom: T.sp.xl }}>
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

      {/* ── Οι προσκλήσεις σου (χωνί ανά στάδιο, χωρίς στοιχεία ταυτότητας) ── */}
      {list.length > 0 && (
        <div style={{ marginBottom: T.sp.xl }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <SectionLabel style={{ margin: 0 }}>Οι προσκλήσεις σου</SectionLabel>
            <div style={{ ...TT.caption }}>{list.filter(r => r.activated_at).length} από {list.length} ενεργοποιήθηκαν</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {list.map((rf, i) => {
              const stage = rf.activated_at ? 'Ενεργοποιήθηκε' : 'Εκκρεμεί ενεργοποίηση';
              const pending = !rf.activated_at;
              const when = new Date(rf.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });
              return (
                <div key={i} className="ref-lift" style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: T.radius.inner, background: pending ? 'var(--surface-sunken)' : 'var(--accent-dim)', color: pending ? 'var(--text-tertiary)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: pending ? 'var(--well-inset)' : undefined }}>
                    <Ic d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" s={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TT.h2, fontSize: 13 }}>{stage}</div>
                    <div style={{ ...TT.bodySm, marginTop: 2 }}>{pending ? 'Θύμισέ του να ξεκινήσει για να κερδίσετε κι οι δύο.' : `Ξεκίνησε ${when}`}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Τα δώρα σου (ιστορικό ανταμοιβών) ── */}
      {rewards.length > 0 && (
        <div style={{ marginBottom: T.sp.xl }}>
          <SectionLabel>Τα δώρα σου</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rewards.map((r, i) => {
              const granted = r.status === 'granted';
              const tierLabel = r.tier === 'agency' ? 'Επαγγελματία' : 'Ιδιώτη';
              const monthsWord = r.months === 1 ? 'μήνας' : 'μήνες';
              const title = r.kind === 'slot'
                ? `1 δωρεάν ακίνητο για ${r.months === 1 ? 'έναν μήνα' : `${r.months} μήνες`}`
                : `${r.months} ${monthsWord} ${tierLabel} δωρεάν`;
              const reasonLabel = ({ per_referral: 'Σύσταση φίλου', per_referral_pro: 'Σύσταση Επαγγελματία', indiv_volume: '5 νέοι μέσα στον μήνα', pro_paid: '5 συνδρομητές μέσα στον μήνα', pro_free: '10 δωρεάν χρήστες μέσα στον μήνα', milestone: 'Μηνιαίο μπόνους', partner: 'Ιδιότητα Συνεργάτη' } as Record<string, string>)[r.reason] || 'Μπόνους';
              return (
                <div key={i} className="ref-lift" style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                  <div style={{ width: 38, height: 38, borderRadius: T.radius.inner, background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic d="M20 12v9H4v-9|M2 7h20v5H2z|M12 22V7|M12 7S9 2 6.5 4.5 12 7 12 7z|M12 7s3-5 5.5-2.5S12 7 12 7z" s={19} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...TT.h2, fontSize: 13 }}>{title}</div>
                    <div style={{ ...TT.bodySm, marginTop: 2 }}>{reasonLabel}</div>
                  </div>
                  <Badge tone={granted ? 'positive' : 'warning'}>{granted ? 'Ενεργό' : 'Σε εκκρεμότητα'}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p style={{ ...TT.caption, lineHeight: 1.6, maxWidth: 640 }}>
        Κάθε ανταμοιβή κατοχυρώνεται μόλις ο νέος ιδιοκτήτης σου προσθέσει ακίνητο και σαρώσει το πρώτο του έγγραφο στο PropertyOS. Έτσι επιβραβεύουμε μόνο πραγματικές συστάσεις.
        {isPro ? ' Για τη φορολογική μεταχείριση της προμήθειας, ρώτησε τον λογιστή σου.' : ''}
      </p>

      {(list.length > 0 || rewards.length > 0) && (
        <button onClick={exportMyData} className="ref-chip" style={{ ...CHIP, marginTop: 14, cursor: 'pointer', fontFamily: T.font.sans }}>
          <Ic d="M12 3v12|M7 10l5 5 5-5|M5 21h14" s={15} c="var(--text-tertiary)" />Εξαγωγή των δεδομένων μου (CSV)
        </button>
      )}
    </div>
  );
}
