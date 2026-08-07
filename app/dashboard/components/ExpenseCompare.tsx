'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΤΙ ΑΛΛΑΞΕ ΑΠΟ ΤΟΝ ΠΡΟΗΓΟΥΜΕΝΟ ΜΗΝΑ — Η ΟΘΟΝΗ.
//
// Η μηχανή (lib/expenses/compare.ts) ξέρει ήδη να λέει την αλήθεια: σημειώνει τον
// ημιτελή μήνα, αρνείται να βγάλει ποσοστό πάνω στο μηδέν, και ξεχωρίζει την
// έκτακτη δαπάνη από την υπέρβαση. Εδώ δεν υπολογίζεται ΤΙΠΟΤΑ ξανά — ό,τι
// δείχνει αυτή η οθόνη το είπε η μηχανή. Αν εκείνη δεν έχει κάτι να πει
// (`meaningful === false`), η κάρτα δεν εμφανίζεται· δεν εφευρίσκουμε νούμερα.
//
// ΓΙΑΤΙ ΔΕΝ ΕΧΕΙ ΧΡΩΜΑ Η ΔΙΑΦΟΡΑ: η μηχανή δεν κρίνει. Το «ξόδεψες 25 € πάνω»
// δεν είναι κακό — μπορεί να άλλαξε ο θερμοσίφωνας. Κόκκινο και πράσινο θα
// έβαζαν κρίση εκεί που υπάρχει μόνο μέτρηση. Η κατεύθυνση φαίνεται από τη θέση
// της ράβδου γύρω από τον άξονα και από το πρόσημο, όχι από χρώμα.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo, useState } from 'react';
import { T, Card } from '@/components/Theme';
import {
  compareMonth, history, monthKey, monthPhrase,
  type Basis, type Comparison, type MonthPoint, type Spend,
} from '@/lib/expenses/compare';

interface Props {
  spends: readonly Spend[];
  /** Περνιέται ως όρισμα, δεν διαβάζεται από το ρολόι — ίδιος κανόνας με τη μηχανή. */
  today?: Date;
}

// ── Ποσά ───────────────────────────────────────────────────────────────────
// Τα λεπτά μία απόχρωση πιο σβηστά από τα ευρώ: το μάτι διαβάζει πρώτα το ποσό
// που μετράει. Το `currentColor` κρατά τη σχέση σωστή σε κάθε συμφραζόμενο,
// φωτεινό ή σκοτεινό θέμα.
const CENTS_DIM = 'color-mix(in srgb, currentColor 52%, transparent)';

function Eur({ value, sign = false }: { value: number; sign?: boolean }) {
  const abs = Math.abs(value);
  const [int, dec] = abs.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',');
  const pre = sign ? (value > 0 ? '+' : value < 0 ? '−' : '') : '';
  return (
    <span style={{ fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
      {pre}{int}<span style={{ color: CENTS_DIM }}>,{dec}</span>{' €'}
    </span>
  );
}

const LABEL: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: T.font.sans,
};

// ── Η εναλλαγή βάσης ───────────────────────────────────────────────────────
// Δύο επιλογές, όχι πέντε. Η βάση που δεν έχει δεδομένα μένει απενεργοποιημένη
// και το λέει στο tooltip: καλύτερα από μια καρτέλα που ανοίγει και είναι άδεια.
function BasisSwitch({ value, onChange, enabled }: {
  value: Basis; onChange: (b: Basis) => void; enabled: Record<Basis, boolean>;
}) {
  const opts: { id: Basis; label: string }[] = [
    { id: 'previous_month', label: 'Προηγούμενος μήνας' },
    { id: 'same_month_last_year', label: 'Ίδιος μήνας πέρσι' },
  ];
  return (
    <div style={{ display: 'inline-flex', gap: 2, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, padding: 3 }}>
      {opts.map(o => {
        const on = value === o.id;
        const can = enabled[o.id];
        return (
          <button key={o.id} type="button" disabled={!can}
            onClick={() => can && onChange(o.id)}
            title={can ? undefined : 'Δεν υπάρχουν καταχωρημένες δαπάνες σε αυτή την περίοδο.'}
            style={{
              padding: '5px 12px', borderRadius: T.radius.pill, border: 'none',
              cursor: can ? 'pointer' : 'not-allowed', opacity: can ? 1 : 0.45,
              fontSize: 11, fontWeight: on ? 700 : 500, fontFamily: T.font.sans,
              background: on ? 'var(--accent)' : 'transparent',
              color: on ? 'var(--accent-text)' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s', whiteSpace: 'nowrap',
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Πού πήγε η διαφορά ─────────────────────────────────────────────────────
// Άξονας στη μέση: δεξιά ό,τι ανέβηκε, αριστερά ό,τι έπεσε. Καμία χρωματική
// κρίση — η θέση και το πρόσημο λένε την κατεύθυνση.
function Drivers({ c }: { c: Comparison }) {
  const max = Math.max(...c.drivers.map(d => Math.abs(d.diff)), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {c.drivers.map(d => {
        const ratio = Math.min(Math.abs(d.diff) / max, 1);
        const up = d.diff > 0;
        return (
          <div key={d.slug} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 128px) minmax(60px, 1fr) auto', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
            </span>
            <span style={{ position: 'relative', display: 'block', height: 8 }}>
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: -2, width: 1, height: 12, background: 'var(--border-default)' }} />
              <span style={{
                position: 'absolute', top: 0, height: 8, borderRadius: 2,
                width: `${ratio * 50}%`,
                left: up ? '50%' : `${50 - ratio * 50}%`,
                background: 'color-mix(in srgb, var(--text-primary) 30%, transparent)',
              }} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>
              <Eur value={d.diff} sign />
              {d.isNew && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: 400 }}>νέο</span>}
              {d.vanished && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontWeight: 400 }}>σταμάτησε</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Το ιστορικό ────────────────────────────────────────────────────────────
// Ράβδοι με ΚΛΕΙΔΩΜΕΝΟ πλάτος και ελαστικό κενό: σε μεγάλη οθόνη οι ράβδοι δεν
// γίνονται μπλοκ, σε μικρή δεν στριμώχνονται μεταξύ τους. Η ανάγνωση του ποσού
// γίνεται σε σταθερή θέση πάνω από το γράφημα — τίποτα δεν αναπηδά στο hover.
const M1 = ['Ι', 'Φ', 'Μ', 'Α', 'Μ', 'Ι', 'Ι', 'Α', 'Σ', 'Ο', 'Ν', 'Δ'];

function HistoryBars({ points, currentKey }: { points: MonthPoint[]; currentKey: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...points.map(p => p.total), 1);
  const sel = points.find(p => p.key === (hover ?? currentKey)) ?? points[points.length - 1];
  const months = points.filter(p => p.total > 0).length;
  const avg = months > 0 ? points.reduce((s, p) => s + p.total, 0) / months : 0;

  return (
    <div>
      {/* Σταθερή θέση ανάγνωσης: ό,τι δείχνει ο κέρσορας γράφεται εδώ. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{sel.label}</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}><Eur value={sel.total} /></span>
          {sel.yoy !== null && Math.abs(sel.yoy) >= 1 && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              <Eur value={sel.yoy} sign /> από πέρσι
            </span>
          )}
        </div>
        {avg > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>
            μέσος όρος <span style={{ color: 'var(--text-secondary)' }}><Eur value={avg} /></span>
          </span>
        )}
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
        height: 116, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 0,
      }}>
        {points.map(p => {
          const isCur = p.key === currentKey;
          const isSel = p.key === sel.key;
          const h = p.total > 0 ? Math.max((p.total / max) * 100, 3) : 0;
          return (
            <div key={p.key}
              onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(p.key)} onBlur={() => setHover(null)}
              tabIndex={0} title={`${p.label}: ${p.total.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
              style={{ width: 14, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', outline: 'none', cursor: 'default' }}>
              <span style={{
                display: 'block', width: 14, height: `${h}%`, minHeight: p.total > 0 ? 3 : 0,
                borderRadius: '3px 3px 0 0',
                background: isCur ? 'var(--accent)'
                  : isSel ? 'color-mix(in srgb, var(--text-primary) 42%, transparent)'
                  : 'color-mix(in srgb, var(--text-primary) 22%, transparent)',
                transition: 'height 0.35s cubic-bezier(0.2,0,0,1), background 0.15s',
              }} />
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {points.map(p => {
          const isSel = p.key === sel.key;
          const m = Number(p.key.slice(5, 7)) - 1;
          return (
            <span key={p.key} style={{
              width: 14, textAlign: 'center', fontSize: 10, fontFamily: T.font.sans,
              fontWeight: isSel ? 700 : 400,
              color: isSel ? 'var(--text-secondary)' : 'var(--text-tertiary)',
            }}>{M1[m]}</span>
          );
        })}
      </div>
    </div>
  );
}

// ── Η κάρτα ────────────────────────────────────────────────────────────────
export default function ExpenseCompare({ spends, today }: Props) {
  const now = useMemo(() => today ?? new Date(), [today]);
  const [basis, setBasis] = useState<Basis>('previous_month');

  const currentKey = monthKey(now);
  const prev = useMemo(() => compareMonth(spends, currentKey, { today: now, basis: 'previous_month' }), [spends, currentKey, now]);
  const year = useMemo(() => compareMonth(spends, currentKey, { today: now, basis: 'same_month_last_year' }), [spends, currentKey, now]);
  const points = useMemo(() => history(spends, now, 12), [spends, now]);

  const enabled: Record<Basis, boolean> = { previous_month: prev.meaningful, same_month_last_year: year.meaningful };
  const anyBasis = prev.meaningful || year.meaningful;
  // Η προεπιλογή πέφτει στη βάση που ΕΧΕΙ δεδομένα, χωρίς να το ζητήσει ο χρήστης.
  const active: Basis = enabled[basis] ? basis : (prev.meaningful ? 'previous_month' : 'same_month_last_year');
  const c = active === 'previous_month' ? prev : year;
  const hasHistory = points.some(p => p.total > 0);

  // Καμία μέτρηση, καμία κάρτα. Ο ιδιοκτήτης δεν χρειάζεται ένα πλαίσιο που του
  // λέει ότι δεν ξέρουμε τίποτα — η κενή κατάσταση των Δαπανών το λέει ήδη.
  if (!anyBasis && !hasHistory) return null;

  return (
    <Card pad="lg" style={{ marginBottom: 16 }}>
      {anyBasis && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <span style={LABEL}>Τον {monthPhrase(currentKey)} σε σχέση με</span>
            <BasisSwitch value={active} onChange={setBasis} enabled={enabled} />
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
              <Eur value={c.current} />
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
              <Eur value={c.diff} sign />
              {/* Ποσοστό ΜΟΝΟ όταν ορίζεται. Στο μηδέν δεν υπάρχει «+∞%». */}
              {c.pct !== null && Math.abs(c.pct) >= 1 && (
                <span style={{ marginLeft: 8, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)' }}>
                  {c.pct > 0 ? '+' : '−'}{Math.abs(Math.round(c.pct))}%
                </span>
              )}
            </span>
          </div>

          <p style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)', fontFamily: T.font.sans, margin: '0 0 12px' }}>
            {c.sentence}
          </p>

          {c.caveats.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: c.drivers.length > 0 ? 16 : 0 }}>
              {c.caveats.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span aria-hidden style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-tertiary)', flexShrink: 0, marginTop: 7 }} />
                  <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{t}</span>
                </div>
              ))}
            </div>
          )}

          {c.drivers.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>Πού πήγε η διαφορά</div>
              <Drivers c={c} />
            </div>
          )}
        </>
      )}

      {anyBasis && hasHistory && (
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '20px 0' }} />
      )}

      {hasHistory && (
        <>
          <div style={{ ...LABEL, marginBottom: 12 }}>Δώδεκα μήνες</div>
          <HistoryBars points={points} currentKey={currentKey} />
        </>
      )}
    </Card>
  );
}
