'use client';

// ═══════════════════════════════════════════════════════════════════════════
// DateField — καθαρό, ελληνικό, theme-aware date picker. Αντικαθιστά το native
// <input type="date"> (αγγλικό ημερολόγιο του browser) με minimal popover:
// εβδομάδα Δευτέρα-πρώτη, ελληνικοί μήνες/ημέρες, «Σήμερα», επιλογή σε accent.
//
// Το popover ζωγραφίζεται σε PORTAL με fixed θέση (και αναποδογυρίζει προς τα
// πάνω αν δεν χωράει κάτω), ώστε να ΜΗΝ κόβεται από modals με overflow.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '@/components/Theme';
import { MONTHS_GEN, MONTHS_NOM } from '@/lib/core/months';

const WD = ['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σά', 'Κυ'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string): Date | null => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; };

const POP_W = 288, POP_H = 340;

export default function DateField({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  const sel = parse(value);
  const [view, setView] = useState<Date>(() => sel || new Date());
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const up = b.bottom + POP_H + 8 > window.innerHeight && b.top - POP_H - 8 > 0;
    const left = Math.min(Math.max(8, b.left), window.innerWidth - POP_W - 8);
    setPos({ top: up ? b.top - POP_H - 6 : b.bottom + 6, left });
  };

  const toggle = () => {
    if (!open) { if (sel) setView(new Date(sel.getFullYear(), sel.getMonth(), 1)); place(); }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return; setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const reflow = () => place();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reflow);
    window.addEventListener('scroll', reflow, true);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', reflow); window.removeEventListener('scroll', reflow, true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const y = view.getFullYear(), m = view.getMonth();
  const startOffset = (new Date(y, m, 1).getDay() + 6) % 7; // Δευτέρα-πρώτη
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const todayIso = iso(new Date());
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const label = sel ? `${sel.getDate()} ${MONTHS_GEN[sel.getMonth()]} ${sel.getFullYear()}` : 'Επιλογή ημερομηνίας';

  const field: React.CSSProperties = { height: T.h.lg, padding: '0 13px', borderRadius: T.radius.inner, border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`, background: 'var(--bg-surface)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', transition: 'border-color 0.14s', ...style };
  const navBtn: React.CSSProperties = { width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 17, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' };

  const nav = (delta: number) => setView(new Date(y, m + delta, 1));

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} style={field}>
        <span style={{ color: sel ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{label}</span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{ position: 'fixed', top: pos.top, left: pos.left, width: POP_W, zIndex: 2000, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, boxShadow: 'var(--elev-3)', padding: 14, fontFamily: T.font.sans }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" onClick={() => nav(-1)} aria-label="Προηγούμενος μήνας" style={navBtn} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>‹</button>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{MONTHS_NOM[m]} {y}</span>
            <button type="button" onClick={() => nav(1)} aria-label="Επόμενος μήνας" style={navBtn} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
            {WD.map(w => <span key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', padding: '2px 0' }}>{w}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
            {cells.map((d, i) => {
              if (d == null) return <span key={i} />;
              const dIso = iso(new Date(y, m, d));
              const isSel = value === dIso, isToday = todayIso === dIso;
              return (
                <button key={i} type="button" onClick={() => { onChange(dIso); setOpen(false); }}
                  style={{ height: T.h.sm, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontFamily: T.font.sans, fontVariantNumeric: 'tabular-nums', background: isSel ? 'var(--accent)' : 'transparent', color: isSel ? 'var(--accent-text)' : 'var(--text-primary)', fontWeight: (isSel || isToday) ? 700 : 500, boxShadow: !isSel && isToday ? 'inset 0 0 0 1px var(--border-default)' : 'none', transition: 'background 0.12s' }}
                  onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                  onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = 'transparent'; }}>{d}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={() => { onChange(todayIso); setOpen(false); }} style={{ background: 'none', border: 'none', padding: 0, fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>Σήμερα</button>
          </div>
        </div>, document.body)}
    </>
  );
}
