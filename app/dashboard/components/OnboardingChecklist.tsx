'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OnboardingChecklist, καθοδήγηση πρώτης χρήσης. Εμφανίζεται στην Επισκόπηση
// όσο το ακίνητο είναι «άδειο» και σβήνει μόλις ολοκληρωθούν τα βήματα (ή με
// «Απόκρυψη», που θυμάται ανά ακίνητο). Κάθε βήμα οδηγεί στο σχετικό tab.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T } from '@/components/Theme';

export interface SetupStep { key: string; label: string; hint: string; done: boolean; nav: string; }

export default function OnboardingChecklist({ propertyId, steps, onNavigate }: {
  propertyId: string; steps: SetupStep[]; onNavigate: (tab: string) => void;
}) {
  const dismissKey = `pos-onboarding-${propertyId}`;
  const [dismissed, setDismissed] = useState(() => { try { return !!localStorage.getItem(dismissKey); } catch { return false; } });

  const doneCount = steps.filter(s => s.done).length;
  if (dismissed || doneCount === steps.length) return null;

  const dismiss = () => { try { localStorage.setItem(dismissKey, '1'); } catch {} setDismissed(true); };
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent-border)', background: 'var(--accent-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: T.font.sans, fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Ας ρυθμίσουμε το ακίνητό σου</div>
          <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{doneCount} από {steps.length} βήματα ολοκληρωμένα, λίγο ακόμα!</div>
        </div>
        <button onClick={dismiss} title="Απόκρυψη" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, fontFamily: T.font.sans, fontWeight: 600, flexShrink: 0 }}>Απόκρυψη</button>
      </div>

      {/* Progress */}
      <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.4s cubic-bezier(0.2,0,0,1)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {steps.map(s => (
          <button key={s.key} onClick={() => !s.done && onNavigate(s.nav)}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', cursor: s.done ? 'default' : 'pointer', textAlign: 'left', width: '100%' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? 'var(--positive)' : 'var(--bg-elevated)', border: s.done ? 'none' : '1.5px solid var(--border-default)' }}>
              {s.done
                ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)' }} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: s.done ? 'line-through' : 'none', opacity: s.done ? 0.6 : 1 }}>{s.label}</div>
              {!s.done && <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{s.hint}</div>}
            </div>
            {!s.done && <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m9 18 6-6-6-6"/></svg>}
          </button>
        ))}
      </div>
    </div>
  );
}
