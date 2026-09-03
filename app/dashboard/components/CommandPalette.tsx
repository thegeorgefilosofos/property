'use client';

// ═══════════════════════════════════════════════════════════════════════════
// CommandPalette, καθολική γρήγορη πλοήγηση/αναζήτηση (⌘K / Ctrl+K).
// Δέχεται μια λίστα εντολών· φιλτράρει με πληκτρολόγηση, πλοηγείται με βελάκια,
// εκτελεί με Enter, κλείνει με Esc. Καμία εξάρτηση, καθαρό React.
//
// Κενή αναζήτηση: δεν «ξερνάει» όλη τη λίστα. Δείχνει πρώτα τις ΠΡΟΣΦΑΤΕΣ
// επιλογές (localStorage) και μετά λίγα ΠΡΟΤΕΙΝΟΜΕΝΑ, ώστε η αρχική εικόνα να
// είναι καθαρή και χρήσιμη. Με την πληκτρολόγηση, ψάχνει σε όλα.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '@/components/Theme';

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

const RECENT_KEY = 'po_cmdk_recent';
const RECENT_MAX = 3;    // πρόσφατες: το πολύ 3
const SUGGEST_MAX = 3;   // προτεινόμενα: το πολύ 3

function loadRecent(): string[] {
  try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function pushRecent(id: string) {
  try {
    const r = loadRecent().filter(x => x !== id);
    r.unshift(id);
    localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, RECENT_MAX)));
  } catch { /* ignore */ }
}

export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: CommandItem[] }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Ομάδες προς εμφάνιση: με κενή αναζήτηση → Πρόσφατα + Προτεινόμενα· αλλιώς αποτελέσματα.
  const { rows, groups } = useMemo(() => {
    const nq = norm(q.trim());
    if (nq) {
      const res = items.filter(it => norm(`${it.label} ${it.hint || ''} ${it.keywords || ''}`).includes(nq));
      return { rows: res, groups: [{ label: '', items: res }] };
    }
    const recent = (recentIds.map(id => items.find(it => it.id === id)).filter(Boolean) as CommandItem[]).slice(0, RECENT_MAX);
    const seen = new Set(recent.map(it => it.id));
    const suggested = items.filter(it => !seen.has(it.id)).slice(0, SUGGEST_MAX);
    const gs: { label: string; items: CommandItem[] }[] = [];
    if (recent.length) gs.push({ label: 'Πρόσφατα', items: recent });
    if (suggested.length) gs.push({ label: recent.length ? 'Προτεινόμενα' : 'Γρήγορη μετάβαση', items: suggested });
    return { rows: [...recent, ...suggested], groups: gs };
  }, [q, items, recentIds]);

  // ΤΟ ΑΝΟΙΓΜΑ ΚΑΘΑΡΙΖΕΙ ΤΗΝ ΠΑΛΕΤΑ ΚΑΤΑ ΤΗΝ ΑΠΟΔΟΣΗ. Ηταν effect: η παλέτα
  // ζωγραφιζόταν ΜΙΑ φορά με το ερώτημα της προηγούμενης φοράς και μετά άδεια.
  // Στα 20ms του focus δεν φαίνεται πάντα· φαίνεται σε αργή συσκευή, που είναι
  // ακριβώς η συσκευή όπου το γρήγορο άνοιγμα μετράει.
  const [openSeen, setOpenSeen] = useState(open);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) { setQ(''); setActive(0); setRecentIds(loadRecent()); }
  }
  // Το focus είναι παρενέργεια στο DOM, όχι κατάσταση: μένει σε effect.
  useEffect(() => { if (open) { const t = setTimeout(() => inputRef.current?.focus(), 20); return () => clearTimeout(t); } }, [open]);
  // Ο δείκτης της επιλεγμένης γραμμής μηδενιζόταν με effect: σε κάθε γράμμα που
  // πληκτρολογεί ο χρήστης, η παλέτα αποδιδόταν ΔΥΟ φορές — μία με τα νέα
  // αποτελέσματα και τον παλιό δείκτη (που μπορεί να δείχνει σε γραμμή που δεν
  // υπάρχει πια) και μία με τον μηδενισμένο. Η προσαρμογή γίνεται στην ίδια
  // απόδοση, μόλις αλλάξει το ερώτημα.
  const [lastQ, setLastQ] = useState(q);
  if (q !== lastQ) { setLastQ(q); setActive(0); }

  const run = (it: CommandItem) => { pushRecent(it.id); it.action(); onClose(); };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, rows.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = rows[active]; if (it) run(it); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows, active, onClose]);

  // Κράτα το ενεργό στοιχείο ορατό
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  let idx = -1;
  return (
    <div className="cmdk-scrim" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmdk" role="dialog" aria-modal="true">
        <input
          ref={inputRef}
          aria-label="Αναζήτηση ή μετάβαση"
          className="cmdk-input"
          placeholder="Αναζήτηση ή μετάβαση… (ακίνητο, καρτέλα, ενέργεια)"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div className="cmdk-list" ref={listRef}>
          {rows.length === 0 ? (
            <div className="cmdk-empty">Κανένα αποτέλεσμα για «{q}»</div>
          ) : (
            groups.map((g, gi) => (
              <div key={gi}>
                {g.label && (
                  <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '10px 16px 4px', fontFamily: T.font.sans }}>{g.label}</div>
                )}
                {g.items.map(it => {
                  idx++;
                  const i = idx;
                  return (
                    <div
                      key={it.id}
                      data-idx={i}
                      className={`cmdk-item ${i === active ? 'active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => run(it)}
                    >
                      {it.icon && <span style={{ display: 'flex', flexShrink: 0, color: 'var(--text-secondary)' }}>{it.icon}</span>}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                      {it.hint && <span className="cmdk-item-hint">{it.hint}</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
