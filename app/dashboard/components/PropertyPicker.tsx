'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PropertyPicker — καθαρό Google-style multi-select για ακίνητα χαρτοφυλακίου.
// Αντικαθιστά τα «pills + Όλα/Κανένα» με ένα ήρεμο dropdown που μαζεύεται και
// δεν προκαλεί θόρυβο: σύνοψη επιλογής, αναζήτηση όταν υπάρχουν πολλά, «Όλα»
// μέσα στο panel. Κλείνει με κλικ έξω ή Escape. Theme-aware, μηδέν εξαρτήσεις.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '@/components/Theme';

interface Item { id: string; name: string }

export default function PropertyPicker({ items, selected, onChange, loading, placeholder = 'Επιλογή ακινήτων' }: {
  items: Item[]; selected: Set<string>; onChange: (s: Set<string>) => void; loading?: boolean; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const allOn = items.length > 0 && selected.size === items.length;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter(i => i.name.toLowerCase().includes(t)) : items;
  }, [items, q]);

  const toggle = (id: string) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); onChange(n); };
  const toggleAll = () => onChange(allOn ? new Set() : new Set(items.map(i => i.id)));

  const summary = loading ? 'Φόρτωση…'
    : items.length === 0 ? 'Δεν υπάρχουν ακίνητα'
    : selected.size === 0 ? placeholder
    : allOn ? `Όλα τα ακίνητα · ${items.length}`
    : selected.size === 1 ? (items.find(i => selected.has(i.id))?.name || '1 ακίνητο')
    : `${selected.size} από ${items.length} ακίνητα`;

  const box = (on: boolean, mixed = false): React.CSSProperties => ({
    width: 17, height: 17, borderRadius: 6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: `1.5px solid ${on || mixed ? 'var(--accent)' : 'var(--border-default)'}`,
    background: on || mixed ? 'var(--accent)' : 'var(--bg-surface)', transition: 'border-color 0.14s, background 0.14s',
  });
  const check = <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>;
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '9px 13px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans, fontSize: 13, color: 'var(--text-primary)' };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => !loading && items.length > 0 && setOpen(o => !o)} disabled={loading || items.length === 0}
        style={{ width: '100%', height: 40, padding: '0 13px', borderRadius: 10, border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`, background: 'var(--bg-surface)', color: selected.size ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 10, cursor: (loading || !items.length) ? 'default' : 'pointer', transition: 'border-color 0.15s', opacity: (loading || !items.length) ? 0.6 : 1 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{summary}</span>
        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-tertiary)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="M6 9l6 6 6-6"/></svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 60, background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 12, boxShadow: 'var(--elev-3, 0 12px 30px rgba(0,0,0,0.18))', overflow: 'hidden' }}>
          {items.length > 6 && (
            <div style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)' }}>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Αναζήτηση ακινήτου…"
                style={{ width: '100%', height: 32, padding: '0 11px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 13, outline: 'none' }} />
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
            <button type="button" onClick={toggleAll} style={{ ...row, fontWeight: 600 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <span style={box(allOn, selected.size > 0 && !allOn)}>{allOn ? check : (selected.size > 0 ? <span style={{ width: 8, height: 2, borderRadius: 3, background: 'var(--accent-text)' }} /> : null)}</span>
              Όλα τα ακίνητα
            </button>
            <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
            {filtered.map(i => {
              const on = selected.has(i.id);
              return (
                <button key={i.id} type="button" onClick={() => toggle(i.id)} style={row}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                  <span style={box(on)}>{on ? check : null}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
                </button>
              );
            })}
            {filtered.length === 0 && <div style={{ padding: '12px 13px', fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Κανένα ακίνητο δεν ταιριάζει.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
