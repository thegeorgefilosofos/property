'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΛΛΑΓΗ ΕΝΕΡΓΟΥ ΑΚΙΝΗΤΟΥ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΠΡΟΒΛΗΜΑ ΠΟΥ ΛΥΝΕΙ, ΜΕΤΡΗΜΕΝΟ. Η πλαϊνή μπάρα απέδιδε ΚΑΘΕ ακίνητο ως
// ξεχωριστή γραμμή 46 εικονοστοιχείων. Με τα πακέτα «Επαγγελματίας» (15
// ακίνητα) και «Επαγγελματίας+» (απεριόριστα) αυτό σημαίνει 690 και 908
// εικονοστοιχεία ΠΑΝΩ από την πρώτη γραμμή πλοήγησης: σε οθόνη 900 ο χρήστης
// κυλούσε για να βρει τις «Δαπάνες», σε οθόνη 768 δεν έβλεπε καμία καρτέλα
// χωρίς κύλιση. Το ύψος του μενού εξαρτιόταν από το πλήθος των ακινήτων —
// δηλαδή όσο πιο πολλά πλήρωνε κανείς, τόσο χειρότερα δούλευε η εφαρμογή.
//
// ΓΙΑΤΙ ΕΔΩ ΚΑΙ ΟΧΙ ΣΤΗ ΜΠΑΡΑ. Το ενεργό ακίνητο είχε ΗΔΗ σπίτι: η πάνω μπάρα
// γράφει το όνομά του, την κατάστασή του και τη διεύθυνσή του. Η πλαϊνή μπάρα
// ξανάλεγε το ίδιο πράγμα 250 εικονοστοιχεία αριστερότερα, με άλλη τελεία και
// άλλο μέγεθος. Δύο σπίτια για ένα αντικείμενο· δεν φτιάχνουμε τρίτο, δίνουμε
// στο υπάρχον τη λειτουργία που του έλειπε. Ο τίτλος ήταν νεκρό <span>.
//
// ΓΙΑΤΙ Η ΚΑΤΑΣΤΑΣΗ ΓΡΑΦΕΤΑΙ ΜΕ ΛΕΞΕΙΣ ΚΑΙ ΟΧΙ ΜΕ ΤΕΛΕΙΑ. Οι επτά καταστάσεις
// είναι επτά ΑΠΟΧΡΩΣΕΙΣ ΤΟΥ ΙΔΙΟΥ χρώματος (statusShade 100 ώς 40 στο
// page.tsx). Σε λίστα τριών τελειών μπορεί να μαντέψει κανείς· σε λίστα
// δεκαπέντε είναι διακόσμηση. Και η κατάσταση είναι ακριβώς αυτό που ορίζει
// ΠΟΙΕΣ ΚΑΡΤΕΛΕΣ θα βρει ο χρήστης μετά την εναλλαγή, άρα διαβάζεται ΠΡΙΝ την
// επιλογή, όχι μετά.
//
// ΤΟ ΠΛΗΚΤΡΟΛΟΓΙΟ ΕΙΝΑΙ ΕΝΑ ΜΟΤΙΒΟ, ΟΧΙ ΔΥΟ. Ο πειρασμός ήταν «μενού όταν είναι
// λίγα, combobox όταν είναι πολλά». Δύο μοτίβα σημαίνει δύο συμπεριφορές που ο
// χρήστης μαθαίνει χωριστά. Εδώ υπάρχει πάντα ΕΝΑ listbox· η αναζήτηση είναι
// ένα προαιρετικό πεδίο από πάνω του που στέλνει τα ίδια πλήκτρα στον ίδιο
// χειριστή. Το `aria-activedescendant` ζει σε όποιο από τα δύο έχει την εστίαση.
// ═══════════════════════════════════════════════════════════════════════════
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { T } from '@/components/Theme';

export interface SwitchItem {
  id: string;
  name: string;
  /** Η κατάσταση με λέξεις («Μακροχρόνια μίσθωση»), όχι κωδικός. */
  status: string;
  /** Διεύθυνση, αν υπάρχει. Ξεχωρίζει δύο ακίνητα με το ίδιο όνομα. */
  address?: string | null;
}

/**
 * Πάνω από πόσα ακίνητα εμφανίζεται η αναζήτηση.
 *
 * ΔΕΝ ΤΟ ΕΦΕΥΡΙΣΚΟΥΜΕ ΕΔΩ: το ίδιο κατώφλι το έχει ήδη αποφασίσει το προϊόν
 * στο PropertyPicker. Δύο διαφορετικά κατώφλια για την ίδια ερώτηση («πότε
 * είναι πολλά;») θα ήταν δύο απαντήσεις που κανείς δεν συνέκρινε ποτέ.
 */
export const SEARCH_FROM = 6;

export default function PropertySwitcher({ items, activeId, onSelect, onAdd, canAdd = true }: {
  items: SwitchItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  canAdd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const active = items.find(i => i.id === activeId) || null;
  const searchable = items.length > SEARCH_FROM;

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter(i =>
      i.name.toLowerCase().includes(t) || (i.address || '').toLowerCase().includes(t));
  }, [items, q]);

  // Το άνοιγμα ξεκινά ΠΑΝΤΑ από το ενεργό: το ↓ μετά το άνοιγμα πάει στο
  // επόμενο ακίνητο, όχι στην κορυφή μιας λίστας που ο χρήστης δεν κοίταξε.
  const openPanel = () => {
    const at = Math.max(0, items.findIndex(i => i.id === activeId));
    setQ('');
    setCursor(at);
    setOpen(true);
  };
  const closePanel = (refocus = true) => {
    setOpen(false);
    if (refocus) btnRef.current?.focus();
  };

  // Η εστίαση μπαίνει στο πάνελ μόλις ανοίξει — στο πεδίο αν υπάρχει, αλλιώς
  // στην ίδια τη λίστα. Χωρίς αυτό, το Tab συνεχίζει πίσω από το ανοιχτό πάνελ.
  useEffect(() => {
    if (!open) return;
    (searchable ? inputRef.current : listRef.current)?.focus();
  }, [open, searchable]);

  // Κλείσιμο με κλικ έξω. Το Escape το χειρίζεται ο ίδιος ο διάλογος παρακάτω,
  // ώστε να μη σβήνει ταυτόχρονα και άλλα ανοιχτά πράγματα της σελίδας.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const choose = (id: string) => {
    closePanel();
    if (id !== activeId) onSelect(id);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePanel(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setCursor(c => (c + step + shown.length) % shown.length);
      return;
    }
    if (e.key === 'Home') { e.preventDefault(); setCursor(0); return; }
    if (e.key === 'End') { e.preventDefault(); setCursor(Math.max(0, shown.length - 1)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const pick = shown[Math.min(cursor, shown.length - 1)];
      if (pick) choose(pick.id);
    }
  };

  // Ο δρομέας δεν πρέπει να δείχνει έξω από τη φιλτραρισμένη λίστα.
  const at = shown.length ? Math.min(cursor, shown.length - 1) : -1;
  const activeOptionId = at >= 0 ? `${listId}-${shown[at].id}` : undefined;

  const panel: React.CSSProperties = {
    position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 100,
    width: 320, maxWidth: 'calc(100vw - 32px)',
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 12, boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* ΜΕ ΕΝΑ ΑΚΙΝΗΤΟ ΚΑΙ ΓΕΜΑΤΟ ΠΑΚΕΤΟ ΔΕΝ ΕΙΝΑΙ ΚΟΥΜΠΙ, ΕΙΝΑΙ ΤΙΤΛΟΣ.
          Ο συνδρομητής «Ιδιοκτήτης» έχει όριο ένα ακίνητο: δεν υπάρχει τίποτα
          να εναλλάξει και τίποτα να προσθέσει. Ενα βελάκι που ανοίγει μενού με
          μία γραμμή —τη γραμμή στην οποία ήδη βρίσκεσαι— είναι τελετουργία.
          Σε κάθε άλλη περίπτωση το βελάκι ΜΕΝΕΙ ορατό: η αφή δεν έχει
          «πέρασμα από πάνω», οπότε ένα σήμα που εμφανίζεται μόνο στο hover δεν
          εμφανίζεται ΠΟΤΕ σε κινητό — ακριβώς εκεί που δεν υπάρχει πλαϊνή
          μπάρα και η εναλλαγή γίνεται μόνο από εδώ. */}
      {items.length <= 1 && !canAdd ? (
        <span className="topbar-switch-name po-elide" style={{ display: 'block' }}>{active?.name || 'Κανένα ακίνητο ακόμη'}</span>
      ) : (
      <button ref={btnRef} type="button" className="topbar-switch"
        onClick={() => (open ? closePanel(false) : openPanel())}
        aria-haspopup="listbox" aria-expanded={open}
        title={items.length > 1 ? 'Αλλαγή ακινήτου' : 'Ακίνητα'}>
        <span className="topbar-switch-face">
          <span className="topbar-switch-name po-elide">{active?.name || 'Κανένα ακίνητο ακόμη'}</span>
          <svg className="topbar-switch-caret" width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      )}

      {open && (
        <div style={panel} onKeyDown={onKeyDown}>
          {searchable && (
            <div style={{ padding: 8, borderBottom: '1px solid var(--border-subtle)' }}>
              <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setCursor(0); }}
                placeholder="Όνομα ή διεύθυνση"
                aria-label="Αναζήτηση ακινήτου"
                aria-controls={listId} aria-activedescendant={activeOptionId}
                style={{
                  width: '100%', height: 36, padding: '0 10px', borderRadius: 8,
                  border: '1px solid var(--border-default)', background: 'var(--bg-base)',
                  color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 13,
                }} />
            </div>
          )}

          <div ref={listRef} id={listId} role="listbox" aria-label="Ακίνητα"
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={searchable ? undefined : activeOptionId}
            style={{ maxHeight: 'min(340px, calc(100vh - 180px))', overflowY: 'auto', overscrollBehavior: 'contain', padding: 4, outline: 'none' }}>
            {shown.length === 0 ? (
              <p style={{ margin: 0, padding: '14px 12px', fontFamily: T.font.sans, fontSize: 13, color: 'var(--text-tertiary)' }}>
                Κανένα ακίνητο δεν ταιριάζει.
              </p>
            ) : shown.map((it, k) => {
              const isActive = it.id === activeId;
              const isCursor = k === at;
              return (
                <div key={it.id} id={`${listId}-${it.id}`} role="option" aria-selected={isActive}
                  onClick={() => choose(it.id)} onMouseEnter={() => setCursor(k)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, minHeight: 44,
                    padding: '6px 10px', borderRadius: 8, cursor: 'pointer',
                    background: isCursor ? 'var(--bg-hover)' : 'transparent',
                  }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="po-elide" style={{
                      display: 'block', fontFamily: T.font.sans, fontSize: 14,
                      fontWeight: isActive ? 600 : 400, color: 'var(--text-primary)',
                    }}>{it.name}</span>
                    <span className="po-elide" style={{
                      display: 'block', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1,
                    }}>{[it.status, it.address].filter(Boolean).join(' · ')}</span>
                  </span>
                  {isActive && (
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.4"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </div>
              );
            })}
          </div>

          {canAdd && (
            <button type="button" onClick={() => { closePanel(false); onAdd(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44,
                padding: '0 14px', border: 'none', borderTop: '1px solid var(--border-subtle)',
                background: 'transparent', cursor: 'pointer', textAlign: 'left',
                fontFamily: T.font.sans, fontSize: 14, color: 'var(--accent)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Προσθήκη ακινήτου
            </button>
          )}
        </div>
      )}
    </div>
  );
}
