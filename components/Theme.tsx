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

import { ReactNode, CSSProperties } from 'react';

// ── Tokens (ίδια ονόματα με τα Bills, μηδενική αλλαγή νοοτροπίας) ─────────
export const T = {
  radius: { card: 14, inner: 10, badge: 100, btn: 10, pill: 100 },
  font: {
    // Γραμματοσειρές που φορτώνει self-hosted το app (globals.css): Inter + Roboto Mono.
    sans: "'Inter', system-ui, sans-serif",
    mono: "'Roboto Mono', 'JetBrains Mono', monospace",
    // Μεγάλοι αριθμοί «κεφαλίδας» (KPI): σφιχτή sans με tabular ψηφία, χωρίς τα
    // πλατιά κενά του monospace γύρω από κόμμα/τελεία. Το mono μένει για πυκνούς πίνακες.
    num:  "'Inter', system-ui, sans-serif",
  },
  sp: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 },
  // Καμπύλες κίνησης Google (Material 3), μία πηγή για όλα τα transitions.
  ease: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.3, 0, 0, 1)', decel: 'cubic-bezier(0, 0, 0, 1)' },
} as const;

// ── Τυπογραφική κλίμακα, ΜΙΑ πηγή αλήθειας για μεγέθη/βάρη/spacing.
// Στόχος: «Google οπτική» ομοιομορφία, ίδιοι τίτλοι/ετικέτες/τιμές παντού.
// Χρήση: <div style={{ ...TT.label }}>…</div>  ή  style={TT.kpi}
export const TT = {
  display: { fontFamily: T.font.sans, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-primary)' },
  // Μικρότερο display για μεγάλους αριθμούς μέσα σε κάρτες (π.χ. ανταμοιβές).
  displaySm: { fontFamily: T.font.sans, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-primary)' },
  h1:      { fontFamily: T.font.sans, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--text-primary)' },
  h2:      { fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3,  color: 'var(--text-primary)' },
  // Ετικέτα ενότητας, η uppercase «τελεία» των Bills, τυποποιημένη.
  label:   { fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)' },
  body:    { fontFamily: T.font.sans, fontSize: 13, fontWeight: 400, lineHeight: 1.55, color: 'var(--text-primary)' },
  bodySm:  { fontFamily: T.font.sans, fontSize: 12, fontWeight: 400, lineHeight: 1.5,  color: 'var(--text-secondary)' },
  caption: { fontFamily: T.font.sans, fontSize: 11, fontWeight: 400, lineHeight: 1.45, color: 'var(--text-tertiary)' },
  // Μεγάλοι αριθμοί KPI: σφιχτή sans (num) + tabular. Το πυκνό mono μένει για πίνακες.
  kpi:     { fontFamily: T.font.num, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: '-0.01em', lineHeight: 1, color: 'var(--text-primary)' },
  mono:    { fontFamily: T.font.mono, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' as const, color: 'var(--text-primary)' },
} as const;

// ═══ Skeleton, placeholder φόρτωσης (αντικαθιστά τα «Φόρτωση...») ══════════
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

// ── Μορφοποίηση ποσών (μία υλοποίηση για όλη την εφαρμογή) ─────────────────
// Χρησιμοποιεί αδιάσπαστο διάστημα (U+00A0) πριν το €, ώστε το ποσό να μη
// «σπάει» ποτέ σε δύο γραμμές (π.χ. «1.234,56» πάνω και «€» κάτω), google-level.
export const fe = (n: number, d = 2) =>
  `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

/// Ευρώ με «έξυπνα» δεκαδικά: ακέραιο ποσό → χωρίς δεκαδικά (751 €), ποσό με λεπτά →
// δύο δεκαδικά (19,25 €). Το δεύτερο όρισμα αγνοείται (για εύκολη αντικατάσταση του fe).
export const feAuto = (n: number, _d?: number) =>
  `${(Math.round((n || 0) * 100) / 100).toLocaleString('el-GR', Number.isInteger(Math.round((n || 0) * 100) / 100) ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// Ακέραιοι/αριθμοί χωρίς σύμβολο νομίσματος
export const fn = (n: number, d = 0) =>
  n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fd = (d: string | Date) =>
  new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });

// Πλήρης μορφή χωρίς συντομογραφία μήνα («30 Ιουνίου 2026»).
export const fdLong = (d: string | Date) =>
  new Date(d).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Σημασιολογικοί τόνοι, ρόλοι, όχι αυθαίρετα χρώματα ─────────────────────
export type Tone = 'accent' | 'info' | 'positive' | 'warning' | 'negative' | 'neutral';

const toneVars = (tone: Tone) => {
  if (tone === 'neutral')
    return { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)' };
  return { color: `var(--${tone})`, bg: `var(--${tone}-soft)`, border: `var(--${tone}-border)` };
};

// ═══ Card, η βασική επιφάνεια κάθε ενότητας ═══════════════════════════════
export function Card({ children, style, className }: { children: ReactNode; style?: CSSProperties; className?: string }) {
  return (
    <div className={className} style={{
      background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
      borderRadius: T.radius.card, padding: T.sp.lg, marginBottom: T.sp.lg,
      boxShadow: 'var(--highlight-inset), var(--elev-1)', ...style,
    }}>
      {children}
    </div>
  );
}

// ═══ SecHdr, επικεφαλίδα ενότητας (η τελεία + uppercase label των Bills) ══
export function SecHdr({ label, sub, right }: { label: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
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
export interface KPIItem { label: string; value: string; sub?: string; tone?: Tone }

export function KPIGrid({ items, columns }: { items: KPIItem[]; columns?: number }) {
  // Ρευστό πλέγμα: γεμίζει όσες στήλες χωράνε (min 150px) και «σπάει» μόνο του
  // σε 2 ή 1 στήλες σε tablet/κινητό, χωρίς media queries, δουλεύει παντού.
  const cols = columns ?? items.length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(140, Math.floor(920 / cols))}px), 1fr))`, gap: 12, marginBottom: 16 }}>
      {items.map((k, i) => (
        <div key={i} className="kpi-card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="kpi-label">{k.label}</div>
          <div className="kpi-value" style={{ marginBottom: 0, color: k.tone && k.tone !== 'neutral' ? `var(--${k.tone})` : undefined }}>{k.value}</div>
          {k.sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ═══ Badge, μικρή ετικέτα κατάστασης (Πληρώθηκε, Ενεργό...) ════════════════
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
      <div style={{ height: 4, background: 'var(--bg-overlay)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.25s cubic-bezier(0.2,0,0,1)' }}/>
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

// ═══ ExportButton, κοινό κουμπί εξαγωγής CSV (ίδιο σε όλα τα tabs) ════════
export function ExportButton({ onClick, label = 'Εξαγωγή CSV', disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button onClick={disabled ? undefined : onClick} title="Εξαγωγή σε CSV (ανοίγει με Excel)" disabled={disabled}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 36, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap' }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
      {label}
    </button>
  );
}

// ═══ EmptyState, κενή κατάσταση με πρόσκληση σε δράση (όχι σκέτο «κενό») ══
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
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
export const g2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
export const g3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
export const g4: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };
