'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PROPERTY OS — Theme.tsx (Κοινά Components Σχεδίασης v1.0)
// ─────────────────────────────────────────────────────────────────────────
// Τα δομικά στοιχεία που ήδη χρησιμοποιούν τα Bills tabs, εξαγμένα σε ΕΝΑ
// αρχείο ώστε ΟΛΑ τα tabs (Επισκόπηση, Δαπάνες, Ημερολόγιο, Ενοικιαστής,
// Αποδόσεις, Δάνειο, Απογραφή, Checklist, Επαφές) να τα εισάγουν από εδώ.
//
// Χρήση σε οποιοδήποτε tab:
//   import { T, fe, Card, SecHdr, KPIGrid, Badge, InfoBanner, StatRow } from '@/components/Theme';
//
// Πηγή αλήθειας για τα tokens (χρώματα/κενά/ακτίνες) είναι το app/globals.css
// (Google Material Design 3). Εδώ δεν ορίζουμε χρώματα — μόνο τα καταναλώνουμε
// μέσω των σημασιολογικών μεταβλητών (--accent, --info, --positive, --warning,
// --negative, --bg-*, --text-*, --border-*).
// ═══════════════════════════════════════════════════════════════════════════

import { ReactNode, CSSProperties } from 'react';

// ── Tokens (ίδια ονόματα με τα Bills — μηδενική αλλαγή νοοτροπίας) ─────────
export const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font: {
    // Γραμματοσειρές που φορτώνει self-hosted το app (globals.css): Inter + Roboto Mono.
    sans: "'Inter', system-ui, sans-serif",
    mono: "'Roboto Mono', 'JetBrains Mono', monospace",
    // Μεγάλοι αριθμοί «κεφαλίδας» (KPI): σφιχτή sans με tabular ψηφία — χωρίς τα
    // πλατιά κενά του monospace γύρω από κόμμα/τελεία. Το mono μένει για πυκνούς πίνακες.
    num:  "'Inter', system-ui, sans-serif",
  },
  sp: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, section: 32 },
  // Καμπύλες κίνησης Google (Material 3) — μία πηγή για όλα τα transitions.
  ease: { standard: 'cubic-bezier(0.2, 0, 0, 1)', emphasized: 'cubic-bezier(0.3, 0, 0, 1)', decel: 'cubic-bezier(0, 0, 0, 1)' },
} as const;

// ── Τυπογραφική κλίμακα — ΜΙΑ πηγή αλήθειας για μεγέθη/βάρη/spacing.
// Στόχος: «Google οπτική» ομοιομορφία — ίδιοι τίτλοι/ετικέτες/τιμές παντού.
// Χρήση: <div style={{ ...TT.label }}>…</div>  ή  style={TT.kpi}
export const TT = {
  display: { fontFamily: T.font.sans, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: 'var(--text-primary)' },
  h1:      { fontFamily: T.font.sans, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: 'var(--text-primary)' },
  h2:      { fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3,  color: 'var(--text-primary)' },
  // Ετικέτα ενότητας — η uppercase «τελεία» των Bills, τυποποιημένη.
  label:   { fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)' },
  body:    { fontFamily: T.font.sans, fontSize: 13, fontWeight: 400, lineHeight: 1.55, color: 'var(--text-primary)' },
  bodySm:  { fontFamily: T.font.sans, fontSize: 12, fontWeight: 400, lineHeight: 1.5,  color: 'var(--text-secondary)' },
  caption: { fontFamily: T.font.sans, fontSize: 11, fontWeight: 400, lineHeight: 1.45, color: 'var(--text-tertiary)' },
  // Μεγάλοι αριθμοί KPI: σφιχτή sans (num) + tabular. Το πυκνό mono μένει για πίνακες.
  kpi:     { fontFamily: T.font.num, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' as const, letterSpacing: '-0.01em', lineHeight: 1, color: 'var(--text-primary)' },
  mono:    { fontFamily: T.font.mono, fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' as const, color: 'var(--text-primary)' },
} as const;

// ═══ Skeleton — placeholder φόρτωσης (αντικαθιστά τα «Φόρτωση...») ══════════
export function Skeleton({ w = '100%', h = 14, r = 8, style }: { w?: number | string; h?: number | string; r?: number; style?: CSSProperties }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

// ═══ SkeletonKPIs — σειρά από skeleton κάρτες μετρικών ═════════════════════
export function SkeletonKPIs({ n = 4 }: { n?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 150px), 1fr))`, gap: 10, marginBottom: 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
          <Skeleton w={70} h={9} style={{ marginBottom: 12 }} />
          <Skeleton w={90} h={20} />
        </div>
      ))}
    </div>
  );
}

// ═══ Spinner — κυκλικός δείκτης φόρτωσης (Google style) ════════════════════
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
// «σπάει» ποτέ σε δύο γραμμές (π.χ. «1.234,56» πάνω και «€» κάτω) — google-level.
export const fe = (n: number, d = 2) =>
  `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

// Ακέραιοι/αριθμοί χωρίς σύμβολο νομίσματος
export const fn = (n: number, d = 0) =>
  n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const fd = (d: string | Date) =>
  new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });

// ── Σημασιολογικοί τόνοι — ρόλοι, όχι αυθαίρετα χρώματα ─────────────────────
export type Tone = 'accent' | 'info' | 'positive' | 'warning' | 'negative' | 'neutral';

const toneVars = (tone: Tone) => {
  if (tone === 'neutral')
    return { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)', border: 'var(--border-subtle)' };
  return { color: `var(--${tone})`, bg: `var(--${tone}-soft)`, border: `var(--${tone}-border)` };
};

// ═══ Card — η βασική επιφάνεια κάθε ενότητας ═══════════════════════════════
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: T.radius.card, padding: T.sp.xl, marginBottom: T.sp.lg, ...style,
    }}>
      {children}
    </div>
  );
}

// ═══ SecHdr — επικεφαλίδα ενότητας (η τελεία + uppercase label των Bills) ══
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

// ═══ PageTitle — τίτλος σελίδας/tab ════════════════════════════════════════
export function PageTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: T.sp.xxl, flexWrap: 'wrap' as const }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.15, margin: 0 }}>{title}</h1>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, fontFamily: T.font.sans }}>{sub}</div>}
      </div>
      {right && <div style={{ display: 'flex', gap: 8 }}>{right}</div>}
    </div>
  );
}

// ═══ KPIGrid — η σειρά μετρικών στην κορυφή κάθε tab ═══════════════════════
export interface KPIItem { label: string; value: string; sub?: string; tone?: Tone }

export function KPIGrid({ items, columns }: { items: KPIItem[]; columns?: number }) {
  // Ρευστό πλέγμα: γεμίζει όσες στήλες χωράνε (min 150px) και «σπάει» μόνο του
  // σε 2 ή 1 στήλες σε tablet/κινητό — χωρίς media queries, δουλεύει παντού.
  const cols = columns ?? items.length;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.max(140, Math.floor(920 / cols))}px), 1fr))`, gap: 10, marginBottom: 16 }}>
      {items.map((k, i) => (
        <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: k.tone && k.tone !== 'neutral' ? `var(--${k.tone})` : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', lineHeight: 1 }}>{k.value}</div>
          {k.sub && <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 5, fontFamily: T.font.sans }}>{k.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ═══ Badge — μικρή ετικέτα κατάστασης (Πληρώθηκε, Ενεργό...) ════════════════
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  const tv = toneVars(tone);
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 9px', borderRadius: T.radius.badge, background: tv.bg, border: `1px solid ${tv.border}`, color: tv.color, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
      {children}
    </span>
  );
}

// ═══ InfoBanner — η γραμμή ειδοποίησης με την τελεία (dot) των Bills ═══════
export function InfoBanner({ children, tone = 'info' }: { children: ReactNode; tone?: Tone }) {
  const tv = toneVars(tone);
  return (
    <div style={{ background: tv.bg, border: `1px solid ${tv.border}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: tv.color, flexShrink: 0, marginTop: 6 }}/>
      <div style={{ flex: 1, fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

// ═══ StatRow — γραμμή «ετικέτα ... ποσό» με μπάρα αναλογίας (σύνοψη) ═══════
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

// ═══ TotalRow — η τελική γραμμή συνόλου με τη διπλή διαχωριστική ═══════════
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

// ═══ Btn — κουμπιά σε 3 ρόλους ═════════════════════════════════════════════
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

// ═══ ExportButton — κοινό κουμπί εξαγωγής CSV (ίδιο σε όλα τα tabs) ════════
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

// ═══ EmptyState — κενή κατάσταση με πρόσκληση σε δράση (όχι σκέτο «κενό») ══
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div style={{ textAlign: 'center' as const, padding: '40px 20px', color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

// ═══ Grid helpers — τα g2/g3/g4 των Bills, μία φορά για όλους ══════════════
// Ρευστά πλέγματα: «auto-fit + minmax(min(100%, Xpx))» ώστε σε στενές οθόνες
// (κινητό/tablet) να πέφτουν αυτόματα σε λιγότερες στήλες ή μία, ενώ σε desktop
// κρατούν την επιθυμητή διάταξη. Το «min(100%, …)» εγγυάται ότι ποτέ δεν
// ξεπερνούν το πλάτος του γονέα (μηδενική οριζόντια κύλιση).
export const g2: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
export const g3: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
export const g4: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };
