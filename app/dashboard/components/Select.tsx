'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Select — καθαρό, theme-aware dropdown (Google/Apple αίσθηση). Το native
// <select> ανοίγει τη λίστα του OS (άστυλη, κακή σε dark). Εδώ η λίστα είναι
// δικό μας popover σε PORTAL με fixed θέση (δεν κόβεται από modals με overflow),
// με επιλεγμένη τιμή σε accent και ✓. Ομοιόμορφο με το DateField.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { T } from '@/components/Theme';

export interface SelectOption { value: string; label: string }

const MAXH = 264;

export default function Select({ value, onChange, options, style, placeholder }: {
  value: string; onChange: (v: string) => void; options: SelectOption[]; style?: React.CSSProperties; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const h = Math.min(MAXH, options.length * 37 + 12);
    const up = b.bottom + h + 8 > window.innerHeight && b.top - h - 8 > 0;
    setPos({ top: up ? b.top - h - 6 : b.bottom + 6, left: b.left, width: b.width });
  };
  const toggle = () => { if (!open) place(); setOpen(o => !o); };

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

  const cur = options.find(o => o.value === value);
  const field: React.CSSProperties = { height: 40, padding: '0 13px', borderRadius: T.radius.inner, border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`, background: 'var(--bg-surface)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, cursor: 'pointer', transition: 'border-color 0.14s', ...style };

  return (
    <>
      <button ref={btnRef} type="button" onClick={toggle} style={field}>
        <span style={{ color: cur ? 'var(--text-primary)' : 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur ? cur.label : (placeholder || 'Επιλογή')}</span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && pos && createPortal(
        <div ref={popRef} role="listbox" style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: MAXH, overflowY: 'auto', zIndex: 2000, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, boxShadow: 'var(--elev-3)', padding: 6, fontFamily: T.font.sans }}>
          {options.map(o => {
            const on = o.value === value;
            return (
              <button key={o.value} type="button" role="option" aria-selected={on} onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 8, border: 'none', background: on ? 'var(--bg-elevated)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13, fontWeight: on ? 600 : 500, cursor: 'pointer', fontFamily: T.font.sans }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = 'transparent'; }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {on && <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M20 6 9 17l-5-5" /></svg>}
              </button>
            );
          })}
        </div>, document.body)}
    </>
  );
}
