'use client';

// ─────────────────────────────────────────────────────────────────────────────
// ActionMenu — the canonical dropdown for toolbar actions across the app.
//
// One standardized, Google-clean menu: a pill trigger with a rotating chevron,
// and a downward-opening card of icon + label + one-line description rows. Closes
// on outside-click or Esc, with a subtle fade/slide entrance. Uses the design
// tokens and Inter, so every toolbar reads as one system instead of a row of ten
// loose buttons. Reuse this anywhere several related actions crowd a header.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { T } from '@/components/Theme';

export interface ActionMenuItem {
  key: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  danger?: boolean;
}

export function ActionMenu({
  label,
  icon,
  items,
  align = 'right',
  title,
}: {
  label: string;
  icon?: React.ReactNode;
  items: ActionMenuItem[];
  align?: 'left' | 'right';
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // rAF and cleanup run outside the effect body, so no synchronous setState here.
    const raf = requestAnimationFrame(() => setShown(true));
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      setShown(false);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, height: 32, padding: '0 13px', borderRadius: 18,
          border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`, background: 'var(--bg-surface)',
          color: open ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          fontFamily: T.font.sans, transition: 'all 0.13s', whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; } }}
      >
        {icon}
        {label}
        <ChevronDown size={14} style={{ transition: 'transform 0.18s ease', transform: open ? 'rotate(180deg)' : 'none', opacity: 0.7 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', ...(align === 'left' ? { left: 0 } : { right: 0 }),
            minWidth: 258, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12,
            boxShadow: '0 12px 34px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.07)', padding: 6, zIndex: 200,
            opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(-4px)',
            transition: 'opacity 0.14s ease, transform 0.14s ease',
          }}
        >
          {items.map(it => {
            const inert = it.disabled || it.busy;
            return (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                disabled={inert}
                onClick={() => { if (inert) return; setOpen(false); it.onClick(); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '9px 10px',
                  borderRadius: 8, border: 'none', background: 'transparent', cursor: inert ? 'default' : 'pointer',
                  opacity: it.disabled ? 0.5 : 1, fontFamily: T.font.sans, transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!inert) e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {it.icon && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8,
                    background: 'var(--bg-elevated)', color: it.danger ? 'var(--negative)' : 'var(--text-secondary)', flexShrink: 0,
                  }}>{it.icon}</span>
                )}
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: it.danger ? 'var(--negative)' : 'var(--text-primary)', lineHeight: 1.3 }}>
                    {it.busy ? (it.busyLabel || 'Δημιουργία…') : it.label}
                  </span>
                  {it.description && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.35, marginTop: 1 }}>
                      {it.description}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
