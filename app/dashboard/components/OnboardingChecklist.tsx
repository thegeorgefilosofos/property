'use client';

// ═══════════════════════════════════════════════════════════════════════════
// OnboardingChecklist, καθοδήγηση πρώτης χρήσης. Εμφανίζεται στην Επισκόπηση
// όσο το ακίνητο είναι «άδειο» και σβήνει μόνο όταν ολοκληρωθούν τα βήματα.
// Το «Ελαχιστοποίηση» ΔΕΝ το εξαφανίζει: το μαζεύει σε μια λεπτή γραμμή που
// μπορείς να ξανανοίξεις (η κατάσταση θυμάται ανά ακίνητο). Google-minimal.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { T } from '@/components/Theme';

export interface SetupStep { key: string; label: string; hint: string; done: boolean; nav: string; }

export default function OnboardingChecklist({ propertyId, steps, onNavigate }: {
  propertyId: string; steps: SetupStep[]; onNavigate: (tab: string) => void;
}) {
  const minKey = `pos-onboarding-min-${propertyId}`;
  const [minimized, setMinimized] = useState(() => { try { return !!localStorage.getItem(minKey); } catch { return false; } });

  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return null; // ολοκληρώθηκε → φεύγει μόνο του

  const setMin = (v: boolean) => { try { v ? localStorage.setItem(minKey, '1') : localStorage.removeItem(minKey); } catch {} setMinimized(v); };
  const pct = Math.round((doneCount / steps.length) * 100);

  // ── Ελαχιστοποιημένη μορφή: λεπτή γραμμή, ανοίγει με ένα κλικ ──────────────
  if (minimized) {
    return (
      <button onClick={() => setMin(false)}
        style={{ width: '100%', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 14, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans }}>
        <div style={{ position: 'relative', width: 26, height: 26, flexShrink: 0 }}>
          <svg width={26} height={26} viewBox="0 0 26 26" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="13" cy="13" r="11" fill="none" stroke="var(--border-subtle)" strokeWidth="2.5" />
            <circle cx="13" cy="13" r="11" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 69.1} 69.1`} />
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Ρύθμιση ακινήτου</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>{doneCount} από {steps.length} βήματα · πάτησε για να συνεχίσεις</div>
        </div>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="m6 9 6 6 6-6" /></svg>
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16, borderColor: 'var(--accent-border)', background: 'var(--accent-soft)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: T.font.sans, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Ρύθμισε το ακίνητό σου</div>
          <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>{doneCount === 0 ? 'Λίγα βήματα για να δουλέψει πλήρως' : `Ολοκλήρωσες ${doneCount} από ${steps.length} βήματα`}</div>
        </div>
        <button onClick={() => setMin(true)} title="Ελαχιστοποίηση"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 12, fontFamily: T.font.sans, fontWeight: 600, flexShrink: 0, padding: 2 }}>
          Ελαχιστοποίηση
        </button>
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
                ? <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="var(--text-inverse)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
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
