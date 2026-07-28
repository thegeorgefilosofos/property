'use client';

// ═══════════════════════════════════════════════════════════════════════════
// InsightsBoard, ο «σύμβουλος» στην Επισκόπηση. Ήρεμη, ευανάγνωστη κάρτα με
// προτεραιοποιημένα, ενεργήσιμα μηνύματα. Ουδέτερο χρώμα· η σοβαρότητα φαίνεται
// από μια διακριτική κουκκίδα, όχι από θόρυβο.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import type { Insight, InsightKind } from '@/lib/insights/engine';
import { greeting } from '@/lib/insights/engine';
import { vocative } from '@/lib/greekName';
import { T } from '@/components/Theme';

const DOT: Record<InsightKind, string> = {
  urgent: 'var(--negative)',
  attention: 'var(--warning)',
  opportunity: 'var(--accent)',
  positive: 'var(--positive)',
};

export default function InsightsBoard({ insights, name, onSaveName, onNavigate, maxVisible }: {
  insights: Insight[];
  name?: string | null;
  onSaveName?: (n: string) => void | Promise<void>;
  onNavigate: (tab: string) => void;
  maxVisible?: number;   // αν οριστεί, δείχνει τα πρώτα N με «δες όλα» (εστιασμένο hero)
}) {
  const [expanded, setExpanded] = useState(false);
  // Το χρονικό μέρος του χαιρετισμού εξαρτάται από την ώρα → μόνο στον client
  // (αποφυγή hydration mismatch). Το όνομα προστίθεται ξεχωριστά, στην κλητική.
  const [timePart, setTimePart] = useState<string>('');
  useEffect(() => { setTimePart(greeting(Date.now(), '')); }, []);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const startEdit = () => { setDraft((name || '').trim()); setEditing(true); };
  const save = () => { setEditing(false); onSaveName?.(draft.trim()); };

  const urgent = insights.filter(i => i.kind === 'urgent' || i.kind === 'attention').length;
  const sub = insights.length === 0
    ? 'Όλα σε τάξη. Δεν υπάρχει κάτι που να χρειάζεται την προσοχή σου.'
    : urgent > 0
      ? `${urgent} ${urgent === 1 ? 'θέμα χρειάζεται' : 'θέματα χρειάζονται'} την προσοχή σου.`
      : 'Εδώ θα βρεις μερικές ευκαιρίες για να βγάλεις περισσότερα χρήματα από το ακίνητό σου.';

  const heading = timePart ? `${timePart}${name && name.trim() ? `, ${vocative(name)}` : ''}` : 'Η εικόνα σου';

  // Εστιασμένο hero: δείξε τα πιο σημαντικά (ήδη ταξινομημένα κατά προτεραιότητα),
  // με διακριτικό «δες όλα» όταν υπάρχουν περισσότερα.
  const cap = maxVisible && maxVisible > 0 ? maxVisible : insights.length;
  const shown = expanded ? insights : insights.slice(0, cap);
  const hidden = insights.length - shown.length;

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 'clamp(18px, 2.4vw, 24px)', marginBottom: 20, fontFamily: T.font.sans }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: insights.length ? 18 : 0 }}>
        {editing ? (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); else if (e.key === 'Escape') setEditing(false); }}
            onBlur={save} placeholder="Το όνομά σου" maxLength={40}
            style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', background: 'var(--bg-elevated)', border: '1px solid var(--accent)', boxShadow: '0 0 0 3px var(--accent-dim)', borderRadius: 6, padding: '4px 10px', outline: 'none', fontFamily: T.font.sans, minWidth: 180 }} />
        ) : (
          <h2 onClick={onSaveName ? startEdit : undefined} title={onSaveName ? 'Άλλαξε το όνομά σου' : undefined}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text-primary)', margin: 0, cursor: onSaveName ? 'pointer' : 'default' }}>
            {heading}
            {onSaveName && (name && name.trim()
              ? <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              : <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>· πρόσθεσε το όνομά σου</span>)}
          </h2>
        )}
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sub}</span>
      </div>

      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shown.map((it, idx) => (
            <div key={it.id} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 14,
              padding: '14px 4px', borderTop: idx === 0 ? 'none' : '1px solid var(--border-subtle)',
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT[it.kind], flexShrink: 0, marginTop: 2, alignSelf: 'start' }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{it.title}</span>
                  {it.metric && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{it.metric}</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, marginTop: 3, maxWidth: 640 }}>{it.detail}</div>
              </div>
              {it.action && (
                <button onClick={() => onNavigate(it.action!.tab)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: T.h.sm, padding: '0 14px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s, color 0.15s, border-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 45%, transparent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}>
                  {it.action.label}
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              )}
            </div>
          ))}
          {(hidden > 0 || expanded) && insights.length > cap && (
            <button onClick={() => setExpanded(e => !e)}
              style={{ alignSelf: 'flex-start', marginTop: 8, background: 'none', border: 'none', padding: '4px 2px', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans }}>
              {expanded ? 'Λιγότερα' : `Δες όλα (${insights.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
