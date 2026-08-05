'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY OS, Theme.tsx (Κοινά Components Σχεδίασης v1.0)
// ─────────────────────────────────────────────────────────────────────────
// Τα δομικά στοιχεία που ήδη χρησιμοποιούν τα Bills tabs, εξαγμένα σε ΕΝΑ
// αρχείο ώστε ΟΛΑ τα tabs (Επισκόπηση, Δαπάνες, Ημερολόγιο, Ενοικιαστής,
// Αποδόσεις, Δάνειο, Απογραφή, Checklist, Επαφές) να τα εισάγουν από εδώ.
//
// Χρήση σε οποιοδήποτε tab:
//   import { T, fe, Card, SecHdr, KPIGrid, Badge, InfoBanner, StatRow } from '@/components/Theme';
//
// Πηγή αλήθειας για τα tokens (χρώματα/κενά/ακτίνες) είναι το app/globals.css
// (Google Material Design 3). Εδώ δεν ορίζουμε χρώματα, μόνο τα καταναλώνουμε
// μέσω των σημασιολογικών μεταβλητών (--accent, --info, --positive, --warning,
// --negative, --bg-*, --text-*, --border-*).
// ═══════════════════════════════════════════════════════════════════════════

import { ReactNode, CSSProperties, useState, useEffect } from 'react';

// Τα tokens ζουν σε module ΧΩΡΙΣ React (components/tokens.ts) ώστε να μπορεί να
// τα εισάγει και Server Component. Εδώ ξανα-εξάγονται αυτούσια, ώστε τα ~600
// σημεία που γράφουν `from '@/components/Theme'` να μη χρειαστεί να αλλάξουν.
export { T, TT, fe, feAuto, fn, fd, fdLong } from './tokens';
export type { Tone } from './tokens';
import { T, TT, fe, type Tone } from './tokens';

// ═══ Skeleton, placeholder φόρτωσης (αντικαθιστά τα «Φόρτωση…») ══════════
export function Skeleton({ w = '100%', h = 14, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// ═══ SkeletonKPIs, σειρά από skeleton κάρτες μετρικών ═════════════════════
export function SkeletonKPIs({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 10, marginBottom: 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="kpi-card" style={{ pointerEvents: 'none' }}>
          <Skeleton w={70} h={9} style={{ marginBottom: 12 }} />
          <Skeleton w={90} h={20} />
        </div>
      ))}
    </div>
  );
}

// ═══ Spinner, κυκλικός δείκτης φόρτωσης (Google style) ════════════════════
export function Spinner({ size = 22, label }: { size?: number; label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: 40 }}>
      <div style={{ width: size, height: size, borderRadius: '50%', border: `${Math.max(2, size / 12)}px solid var(--border-subtle)`, borderTopColor: 'var(--accent)', animation: 'spin 0.7s linear infinite' }} />
      {label && <span style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>{label}</span>}
    </div>
  );
}

// ── Σημασιολογικοί τόνοι, ρόλοι, όχι αυθαίρετα χρώματα ────────────────────
const toneVars = (tone: Tone) => {
  if (tone === 'neutral')
    return { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)' };
  return { color: `var(--${tone})`, bg: `var(--${tone}-soft)`, border: `var(--${tone}-border)` };
};

// ═══ Card, η βασική επιφάνεια κάθε ενότητας ═══════════════════════════════
//
// ΓΙΑΤΙ ΕΧΕΙ PROPS ΚΑΙ ΔΕΝ ΕΙΝΑΙ ΜΙΑ ΣΤΑΘΕΡΗ ΕΠΙΦΑΝΕΙΑ: μετρήθηκαν 13 χειρόγραφα
// αντίγραφα της «κάρτας ενότητας» στην εφαρμογή, με 5 διαφορετικά paddings και
// δύο επιφάνειες που ΕΠΙΤΗΔΕΣ δεν έχουν ορατή περίμετρο (καρτέλα Λογιστικής).
// Η αιτία δεν ήταν αμέλεια: το primitive δεν κάλυπτε αυτές τις πραγματικές
// ανάγκες, οπότε όποιος τις είχε έγραφε δικό του αντικείμενο από την αρχή.
// Οι προεπιλογές μένουν ΑΚΡΙΒΩΣ όπως πριν, ώστε καμία υπάρχουσα χρήση να μην
// αλλάξει όψη.
const CARD_PAD = { sm: T.sp.lg, md: 18, lg: T.sp.xl } as const;

export function Card({ children, style, className, pad = 'sm', gap = true, elevation = 'raised', tabIndex }: {
  children: ReactNode; style?: CSSProperties; className?: string;
  /** Εστιάσιμη κάρτα: το tap σε κινητό αποκαλύπτει ό,τι το hover σε desktop (focus-within). */
  tabIndex?: number;
  /** Εσωτερικό περιθώριο: sm=16 (προεπιλογή), md=18, lg=20. */
  pad?: 'sm' | 'md' | 'lg';
  /** false = χωρίς κάτω περιθώριο, όταν η κάρτα ζει μέσα σε flex/grid με δικό του gap. */
  gap?: boolean;
  /** 'flat' = καμία ορατή περίμετρος, μόνο βάθος (η γλώσσα της καρτέλας Λογιστικής). */
  elevation?: 'raised' | 'flat';
}) {
  const flat = elevation === 'flat';
  return (
    <div className={className} tabIndex={tabIndex} style={{
      background: 'var(--surface-raised)',
      border: flat ? 'none' : '1px solid var(--border-raised)',
      borderRadius: T.radius.card, padding: CARD_PAD[pad], marginBottom: gap ? T.sp.lg : 0,
      boxShadow: flat ? 'var(--elev-1)' : 'var(--highlight-inset), var(--elev-1)', ...style,
    }}>
      {children}
    </div>
  );
}

// ═══ Modal, ΜΙΑ επιφάνεια για κάθε παράθυρο ═══════════════════════════════
// Πριν, κάθε modal έφτιαχνε μόνο του overlay/πλαίσιο: 7 διαφορετικές
// διαφάνειες και 8 διαφορετικά radius, οπότε το app έμοιαζε με πολλά apps.
// Εδώ ορίζεται μία φορά: ίδιο scrim, ίδιο radius, ίδια κεφαλίδα (εικονίδιο +
// τίτλος + υπότιτλος + ×), ίδιο padding, ίδιο υποσέλιδο ενεργειών.
// Κλείνει με κλικ στο φόντο ή Escape· το περιεχόμενο κυλά, header/footer όχι.
export function Modal({ open, onClose, title, ariaLabel, subtitle, icon, width = 620, children, footer, footerInfo }: {
  open: boolean; onClose: () => void;
  /** Δέχεται και JSX (π.χ. τίτλος με <InfoHint>). Για τεχνολογίες υποβοήθησης δώσε ariaLabel. */
  title: ReactNode; ariaLabel?: string; subtitle?: ReactNode; icon?: ReactNode;
  width?: number; children: ReactNode; footer?: ReactNode; footerInfo?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
      style={{ position: 'fixed', inset: 0, background: T.scrim, backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: T.sp.lg }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.modal, width: `min(${width}px, 100%)`, maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {icon && (
            <div style={{ width: T.h.lg, height: T.h.lg, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TT.h2 }}>{title}</div>
            {subtitle && <div style={{ ...TT.bodySm, marginTop: 1 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4, fontFamily: T.font.sans }}>×</button>
        </div>

        <div style={{ padding: T.sp.xxl, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: T.sp.xl }}>
          {children}
        </div>

        {(footer || footerInfo) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: T.sp.md, padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ ...TT.bodySm }}>{footerInfo}</span>
            <div style={{ display: 'flex', gap: T.sp.sm }}>{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ SecHdr, επικεφαλίδα ενότητας (η τελεία + uppercase label των Bills) ══
export function SecHdr({ label, sub, right }: { label: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</div>
        {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ═══ PageTitle, τίτλος σελίδας/tab ════════════════════════════════════════
export function PageTitle({ title, sub, right, titleHint }: { title: string; sub?: string; right?: ReactNode; titleHint?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: T.sp.xxl, flexWrap: 'wrap' as const }}>
      <div>
        <h1 title={titleHint} style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.15, margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  );
}

// ═══ KPIGrid, η σειρά μετρικών στην κορυφή κάθε tab ═══════════════════════
export interface KPIItem {
  label: string; value: string; sub?: string; tone?: Tone;
  /** Εξήγηση στο hover/long-press. Χωρίς αυτό, η Επισκόπηση αναγκαζόταν να
   *  γράψει δικά της πλακίδια για να κρατήσει τις επεξηγήσεις της — και έτσι
   *  απέκτησε δεύτερο, παράλληλο σύστημα καρτών. */
  title?: string;
  /** Χρώμα για τη γραμμή `sub` (π.χ. μεταβολή vs πέρσι). */
  subTone?: Tone;
}

const TONE_COLOR: Record<string, string> = {
  positive: 'var(--positive)', negative: 'var(--negative)',
  warning: 'var(--warning)', info: 'var(--info)', accent: 'var(--accent)',
};

export function KPIGrid({ items, columns }: { items: KPIItem[]; columns?: number }) {
  // Ρευστό πλέγμα: γεμίζει όσες στήλες χωράνε (min 150px) και «σπάει» μόνο του
  // σε 2 ή 1 στήλες σε tablet/κινητό, χωρίς media queries, δουλεύει παντού.
  const cols = columns ?? items.length;
  return (
    <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(140, Math.floor(920 / cols))}px), 1fr))`, gap: 12, marginBottom: 16 }}>
      {items.map((k, i) => {
        const toned = !!(k.tone && k.tone !== 'neutral');
        return (
        // Οι κάρτες με τόνο γίνονται εστιάσιμες, ώστε το tap σε κινητό να
        // αποκαλύπτει το χρώμα όπως ο κέρσορας (focus-within). Οι ουδέτερες όχι,
        // για να μη γεμίζει το tab order.
        <div key={i} className="kpi-card" title={k.title} tabIndex={toned ? 0 : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="kpi-label">{k.label}</div>
          {/* Ουδέτερο by default· ο σημασιολογικός τόνος αποκαλύπτεται στο hover ή
              στο άγγιγμα (data-tone + globals.css), για χαμηλού θορύβου look. */}
          <div className="kpi-value" style={{ marginBottom: 0 }} data-tone={toned ? k.tone : undefined}>{k.value}</div>
          {k.sub && <div style={{ fontSize: 10, lineHeight: 1.4, fontWeight: k.subTone ? 600 : 400, color: (k.subTone && TONE_COLOR[k.subTone]) || 'var(--text-tertiary)', fontFamily: T.font.sans }}>{k.sub}</div>}
        </div>
        );
      })}
    </div>
  );
}

// ═══ Badge, μικρή ετικέτα κατάστασης (Πληρώθηκε, Ενεργό…) ════════════════
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const tv = toneVars(tone);
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: tv.bg, border: `1px solid ${tv.border}`, color: tv.color, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
      {children}
    </span>
  );
}

// ═══ Chip, κανονική «pill» ετικέτα (mixed-case, σε αντίθεση με το uppercase Badge)
// Ένα ενιαίο primitive για όλα τα chips των Ρυθμίσεων: ίδια γεωμετρία παντού
// (padding/radius/μέγεθος/βάρος). Το gap:6 αφήνει μικρή τελεία/εικονίδιο να
// καθίσει μέσα (π.χ. ο παλλόμενος live-dot). Το title περνά για tooltip.
export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: Tone; title?: string }) {
  const tv = toneVars(tone);
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.pill, background: tv.bg, border: `1px solid ${tv.border}`, color: tv.color, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, letterSpacing: '0.01em', lineHeight: 1.4 }}>
      {children}
    </span>
  );
}

// ═══ TierBadge, εμβλήματα ιδιότητας (Ιδιώτης / Επαγγελματίας / Συνεργάτης) ══
// Premium, minimal, μονοχρωματικά (accent + ουδέτερα): η διαφοροποίηση γίνεται
// με σχήμα, βάρος, elevation και —μόνο για τον Συνεργάτη— διακριτικό gradient
// & λάμψη. Καθαρά, χωρίς color noise, στο ίδιο design system με το app.
export function TierBadge({ tier, showLabel = true, size = 40 }: { tier: 'owner' | 'agency' | 'partner'; showLabel?: boolean; size?: number }) {
  const cfg = {
    owner:   { label: 'Ιδιώτης',      ring: 'var(--border-default)', ic: 'var(--text-secondary)', text: 'var(--text-secondary)' },
    agency:  { label: 'Επαγγελματίας', ring: 'var(--accent-border)',  ic: 'var(--accent)',          text: 'var(--accent)' },
    partner: { label: 'Συνεργάτης',    ring: 'var(--accent)',         ic: 'var(--accent-text)',     text: 'var(--accent)' },
  }[tier];
  const isPartner = tier === 'partner';
  // Χτυπημένο «νόμισμα/σφραγίδα»: βάση με λεπτή εσωτερική στεφάνη + top sheen.
  // Χτυπημένο νόμισμα και για τα τρία: ακτινικό «μεταλλικό» σώμα + ανάγλυφο (φως
  // πάνω / σκιά κάτω) + στεφάνη. Κοινή οικογένεια, αυξανόμενος πλούτος ως τον Συνεργάτη.
  const bg =
    tier === 'partner' ? 'radial-gradient(120% 90% at 50% -8%, rgba(255,255,255,.34), transparent 55%), radial-gradient(130% 130% at 32% 22%, color-mix(in srgb, var(--accent) 92%, #ffffff) 0%, var(--accent) 46%, color-mix(in srgb, var(--accent) 52%, #0c1f3a) 100%)'
    : tier === 'agency' ? 'radial-gradient(115% 85% at 50% -10%, rgba(255,255,255,.22), transparent 55%), radial-gradient(130% 130% at 34% 24%, color-mix(in srgb, var(--accent-dim) 60%, #ffffff) 0%, var(--accent-dim) 54%, color-mix(in srgb, var(--accent) 22%, var(--accent-dim)) 100%)'
    : 'radial-gradient(115% 85% at 50% -12%, rgba(255,255,255,.5), transparent 52%), radial-gradient(130% 130% at 34% 24%, color-mix(in srgb, var(--border-raised) 72%, #ffffff) 0%, var(--border-raised) 54%, color-mix(in srgb, var(--border-raised) 82%, #0c1f3a) 100%)';
  const shadow =
    tier === 'partner' ? 'inset 0 0 0 1.5px color-mix(in srgb, var(--accent-text) 32%, transparent), inset 0 2px 5px color-mix(in srgb, #ffffff 26%, transparent), inset 0 -3px 6px color-mix(in srgb, #0c1f3a 22%, transparent), 0 10px 26px -8px color-mix(in srgb, var(--accent) 62%, transparent)'
    : tier === 'agency' ? 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 26%, transparent), inset 0 2px 3px rgba(255,255,255,.22), inset 0 -3px 6px color-mix(in srgb, var(--accent) 20%, transparent), 0 5px 12px -6px color-mix(in srgb, var(--accent) 44%, transparent)'
    : 'inset 0 0 0 1px rgba(255,255,255,.5), inset 0 2px 3px rgba(255,255,255,.42), inset 0 -3px 5px rgba(16,24,40,.12), 0 3px 8px -4px rgba(16,24,40,.24)';
  const groove =
    tier === 'partner' ? 'color-mix(in srgb, var(--accent-text) 24%, transparent)'
    : tier === 'agency' ? 'color-mix(in srgb, var(--accent) 22%, transparent)'
    : 'color-mix(in srgb, var(--text-tertiary) 22%, transparent)';
  const gl = size * (isPartner ? 0.58 : 0.5);
  const glyphs: Record<string, string> = {
    owner:  'M4 11 12 4l8 7|M6 9.5V20h12V9.5|M10 20v-5h4v5',
    agency: 'M4 21V7l7-4 7 4v14|M3 21h18|M8.5 11h1m-1 4h1m5-4h1m-1 4h1',
  };
  const medallion = (
    <span className="tier-medallion" style={{
      position: 'relative', width: size, height: size, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      background: bg, border: `1.5px solid ${cfg.ring}`, boxShadow: shadow,
    }}>
      <span aria-hidden style={{ position: 'absolute', inset: Math.max(3, Math.round(size * 0.15)), borderRadius: '50%', border: `1px solid ${groove}`, pointerEvents: 'none' }} />
      {isPartner && (
        <span aria-hidden style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', pointerEvents: 'none' }}>
          <span className="tier-sheen" style={{ position: 'absolute', top: '-20%', bottom: '-20%', left: 0, width: '38%', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent)' }} />
        </span>
      )}
      {isPartner ? (
        <svg width={gl} height={gl} viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 1px 1px color-mix(in srgb, #0c1f3a 34%, transparent))' }}>
          {/* διακριτικές ακτίνες μεταλλίου */}
          <g stroke="var(--accent-text)" strokeWidth="1" strokeLinecap="round" opacity="0.32">
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i * 30 * Math.PI) / 180;
              return <line key={i} x1={12 + 9.4 * Math.cos(a)} y1={12 + 9.4 * Math.sin(a)} x2={12 + 10.6 * Math.cos(a)} y2={12 + 10.6 * Math.sin(a)} />;
            })}
          </g>
          <path d="M12 4l2.16 4.38 4.84.7-3.5 3.42.83 4.82L12 19.02 7.67 17.3l.83-4.82L5 9.06l4.84-.7z" fill="var(--accent-text)" />
          <circle cx="17.6" cy="6.4" r="0.95" fill="var(--accent-text)" opacity="0.92" />
        </svg>
      ) : (
        <svg width={gl} height={gl} viewBox="0 0 24 24" fill="none" stroke={cfg.ic} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 1px 0.5px rgba(255,255,255,.45))' }}>
          {glyphs[tier].split('|').map((d, i) => <path key={i} d={d} />)}
        </svg>
      )}
    </span>
  );
  if (!showLabel) return medallion;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      {medallion}
      {/* Σταθερό πλάτος στήλης: το μετάλλιο και η ετικέτα «Ιδιότητα» δεν
          μετακινούνται όταν αλλάζει η ιδιότητα· προσαρμόζεται μόνο η λέξη
          (Ιδιώτης / Επαγγελματίας / Συνεργάτης). */}
      <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 104 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Ιδιότητα</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: cfg.text, fontFamily: T.font.sans, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{cfg.label}</span>
      </span>
    </span>
  );
}

// ═══ InfoBanner, η γραμμή ειδοποίησης με την τελεία (dot) των Bills ═══════
export function InfoBanner({ children, tone = 'info' }: { children: ReactNode; tone?: Tone }) {
  const tv = toneVars(tone);
  return (
    <div style={{ background: tv.bg, border: `1px solid ${tv.border}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: tv.color, flexShrink: 0, marginTop: 6 }}/>
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ═══ StatRow, γραμμή «ετικέτα ... ποσό» με μπάρα αναλογίας (σύνοψη) ═══════
export function StatRow({ label, amount, total, annual }: { label: string; amount: number; total: number; annual?: boolean }) {
  const pct = total > 0 ? (amount / total) * 100 : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{label}</span>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(amount)} / μήνα</span>
          {annual !== false && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(amount * 12)} / έτος</span>}
        </div>
      </div>
      <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.25s cubic-bezier(0.2,0,0,1)' }}/>
      </div>
    </div>
  );
}

// ═══ TotalRow, η τελική γραμμή συνόλου με τη διπλή διαχωριστική ═══════════
export function TotalRow({ label, monthly }: { label: string; monthly: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid var(--border-subtle)', marginTop: 8 }}>
      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.sans, color: 'var(--text-primary)' }}>{label}</span>
      <div style={{ textAlign: 'right' as const }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(monthly)} / μήνα</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(monthly * 12)} / έτος</div>
      </div>
    </div>
  );
}

// ═══ Btn, κουμπιά σε 3 ρόλους ═════════════════════════════════════════════
export function Btn({ children, onClick, variant = 'secondary', disabled, type }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'ghost'; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '9px 18px', borderRadius: T.radius.btn,
    fontSize: 12, fontWeight: 700, fontFamily: T.font.sans,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s cubic-bezier(0.2,0,0,1)',
    border: '1px solid transparent',
  };
  const variants: Record<string, CSSProperties> = {
    primary:   { background: 'var(--accent)', color: 'var(--accent-text)' },
    secondary: { background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' },
    ghost:     { background: 'transparent', color: 'var(--info)' },
  };
  return <button type={type ?? 'button'} onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

// ═══ ExportButton, κοινό κουμπί εξαγωγής Excel (ίδιο σε όλα τα tabs) ═══════
// Αν δοθεί onExportData, γίνεται split-button με δύο επιλογές: «Μορφοποιημένο»
// (εμφάνιση, ελληνικό «1.234,56 €» ως κείμενο) και «Επεξεργάσιμο (δεδομένα)»
// (ζωντανά αριθμητικά κελιά + SUM, για pivot/re-sum από λογιστή).
export function ExportButton({ onClick, onExportData, label = 'Εξαγωγή Excel', disabled }: { onClick: () => void; onExportData?: () => void; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const icon = <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>;
  const base: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, height: T.h.md, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' };

  if (!onExportData) {
    return (
      <button onClick={disabled ? undefined : onClick} title="Εξαγωγή σε Excel (.xlsx)" disabled={disabled}
        style={{ ...base, padding: '0 14px', borderRadius: T.radius.pill }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
        {icon}{label}
      </button>
    );
  }

  const item = (title: string, sub: string, fn: () => void) => (
    <button onClick={() => { setOpen(false); fn(); }}
      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: T.font.sans }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
    </button>
  );

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button onClick={disabled ? undefined : onClick} title="Μορφοποιημένο Excel (.xlsx)" disabled={disabled}
        style={{ ...base, padding: '0 12px', borderRadius: `${T.radius.pill}px 0 0 ${T.radius.pill}px`, borderRight: 'none' }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
        {icon}{label}
      </button>
      <button onClick={disabled ? undefined : () => setOpen(o => !o)} title="Επιλογές εξαγωγής" aria-label="Επιλογές εξαγωγής" disabled={disabled}
        style={{ ...base, width: 30, padding: 0, justifyContent: 'center', borderRadius: `0 ${T.radius.pill}px ${T.radius.pill}px 0` }}
        onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 41, minWidth: 244, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: '0 10px 28px rgba(0,0,0,0.14)', overflow: 'hidden' }}>
            {item('Μορφοποιημένο', 'Έτοιμο για εκτύπωση · ελληνικό «1.234,56 €»', onClick)}
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
            {item('Επεξεργάσιμο (δεδομένα)', 'Ζωντανά αριθμητικά κελιά + άθροισμα SUM, για pivot ή επεξεργασία', onExportData)}
          </div>
        </>
      )}
    </div>
  );
}

// ═══ EmptyState, κενή κατάσταση με πρόσκληση σε δράση (όχι σκέτο «κενό») ══
//
// ΤΟ `icon` ΔΕΝ ΕΙΝΑΙ ΚΑΛΛΩΠΙΣΜΟΣ. Μετρήθηκε ότι το 86% των κενών καταστάσεων
// της εφαρμογής είναι χειρόγραφες, με 7 διαφορετικά αρχέτυπα, 20 paddings και
// 6 μεγέθη τίτλου — και η δομική αιτία ήταν ακριβώς αυτή η παράλειψη: όποιος
// ήθελε εικονίδιο δεν μπορούσε να χρησιμοποιήσει το primitive, οπότε έγραφε
// δικό του από την αρχή. Ένα primitive που δεν καλύπτει τη συνηθισμένη ανάγκη
// δεν αγνοείται από αμέλεια· παρακάμπτεται από ανάγκη.
export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
      {icon && (
        <div aria-hidden style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 44, height: 44, margin: '0 auto 12px', borderRadius: T.radius.inner + 2,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          color: 'var(--text-tertiary)',
        }}>{icon}</div>
      )}
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ═══ Grid helpers, τα g2/g3/g4 των Bills, μία φορά για όλους ══════════════
// Ρευστά πλέγματα: «auto-fit + minmax(min(100%, Xpx))» ώστε σε στενές οθόνες
// (κινητό/tablet) να πέφτουν αυτόματα σε λιγότερες στήλες ή μία, ενώ σε desktop
// κρατούν την επιθυμητή διάταξη. Το «min(100%, …)» εγγυάται ότι ποτέ δεν
// ξεπερνούν το πλάτος του γονέα (μηδενική οριζόντια κύλιση).
// ── Κοινό πεδίο εισόδου Ρυθμίσεων ─────────────────────────────────────────
// Μία γεωμετρία (ύψος/ακτίνα/border/χρώματα) για όλα τα «χειροποίητα» inputs των
// Ρυθμίσεων, ώστε να μη διαφέρουν μεταξύ τους. Το focus ring μπαίνει με την κλάση
// `po-field` (globals.css), χωρίς ανά-input JS handlers.
export const settingsField: CSSProperties = {
  width: '100%', height: T.h.lg, padding: '0 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
};

export const g2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
export const g3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
export const g4: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };
