'use client';

// ═══════════════════════════════════════════════════════════════════════════
// InsightsBoard, ο «σύμβουλος» στην Επισκόπηση. Ήρεμη, ευανάγνωστη κάρτα με
// προτεραιοποιημένα, ενεργήσιμα μηνύματα. Ουδέτερο χρώμα· η σοβαρότητα φαίνεται
// από μια διακριτική κουκκίδα, όχι από θόρυβο.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import type { Insight, InsightKind } from '@/lib/insights/engine';
import { greeting } from '@/lib/insights/engine';

const DOT: Record<InsightKind, string> = {
  urgent: 'var(--negative)',
  attention: 'var(--warning)',
  opportunity: 'var(--accent)',
  positive: 'var(--positive)',
};

export default function InsightsBoard({ insights, name, onNavigate }: {
  insights: Insight[];
  name?: string | null;
  onNavigate: (tab: string) => void;
}) {
  // Ο χαιρετισμός εξαρτάται από την ώρα → μόνο στον client (αποφυγή hydration mismatch).
  const [hello, setHello] = useState<string>('');
  useEffect(() => { setHello(greeting(Date.now(), name)); }, [name]);

  const urgent = insights.filter(i => i.kind === 'urgent' || i.kind === 'attention').length;
  const sub = insights.length === 0
    ? 'Όλα σε τάξη. Δεν υπάρχει κάτι που να χρειάζεται την προσοχή σου.'
    : urgent > 0
      ? `${urgent} ${urgent === 1 ? 'θέμα χρειάζεται' : 'θέματα χρειάζονται'} την προσοχή σου.`
      : 'Εδώ θα βρεις μερικές ευκαιρίες για να βγάλεις περισσότερα χρήματα από το ακίνητό σου.';

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 'clamp(18px, 2.4vw, 24px)', marginBottom: 20, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: insights.length ? 18 : 0 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0 }}>
          {hello || 'Η εικόνα σου'}
        </h2>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{sub}</span>
      </div>

      {insights.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {insights.map((it, idx) => (
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
                <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', lineHeight: 1.5, marginTop: 3, maxWidth: 640 }}>{it.detail}</div>
              </div>
              {it.action && (
                <button onClick={() => onNavigate(it.action!.tab)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 34, padding: '0 14px', borderRadius: 100, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 600, fontFamily: "'Inter', sans-serif", cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s, color 0.15s, border-color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 45%, transparent)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-default)'; }}>
                  {it.action.label}
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
