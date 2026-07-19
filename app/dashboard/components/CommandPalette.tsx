'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CommandPalette, καθολική γρήγορη πλοήγηση/αναζήτηση (⌘K / Ctrl+K).
// Δέχεται μια λίστα εντολών· φιλτράρει με πληκτρολόγηση, πλοηγείται με βελάκια,
// εκτελεί με Enter, κλείνει με Esc. Καμία εξάρτηση, καθαρό React.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;       // δευτερεύον κείμενο δεξιά (π.χ. «Ρεύμα», «Ακίνητο»)
  group?: string;      // προαιρετική ομαδοποίηση
  icon?: React.ReactNode;
  keywords?: string;   // επιπλέον όροι αναζήτησης (π.χ. λατινικά)
  action: () => void;
}

// Απλή, ανεκτική σε τόνους/πεζά-κεφαλαία αναζήτηση (ελληνικά + λατινικά).
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: CommandItem[] }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return items;
    return items.filter(it => norm(`${it.label} ${it.hint || ''} ${it.keywords || ''}`).includes(nq));
  }, [q, items]);

  useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[active]; if (it) { it.action(); onClose(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active, onClose]);

  // Κράτα το ενεργό στοιχείο ορατό
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  return (
    <div className="cmdk-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true">
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Αναζήτηση ή μετάβαση… (ακίνητο, καρτέλα, ενέργεια)"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div className="cmdk-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="cmdk-empty">Κανένα αποτέλεσμα για «{q}»</div>
          ) : (
            filtered.map((it, i) => (
              <div
                key={it.id}
                data-idx={i}
                className={`cmdk-item ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => { it.action(); onClose(); }}
              >
                {it.icon && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--text-secondary)' }}>{it.icon}</span>}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                {it.hint && <span className="cmdk-item-hint">{it.hint}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
