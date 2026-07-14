'use client';

import { useState, useRef, useEffect, ReactNode, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { T } from '@/components/Theme';

// ── ΕΝΙΑΙΟ σύστημα πεδίων (ένα μέγεθος/σχήμα/focus παντού) ───────────────────
// Ύψος 42, γωνία 10 (ταιριάζει με τις κάρτες), 1px border + accent focus-ring
// (χωρίς μετατόπιση layout — δεν αλλάζει πάχος border/padding στο focus).
export const FIELD_HEIGHT = 42;
export const FIELD_RADIUS = 10;
export const fieldBorderColor = (active: boolean) => (active ? 'var(--accent)' : 'var(--border-default)');
export const fieldRing = (active: boolean) => (active ? '0 0 0 3px var(--accent-dim)' : 'none');

const mdInputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: FIELD_RADIUS,
  padding: '10px 14px',
  color: 'var(--text-primary)',
  fontSize: 14,
  fontFamily: "'Inter', sans-serif",
  letterSpacing: 0,
  outline: 'none',
  boxSizing: 'border-box' as const,
  height: FIELD_HEIGHT,
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const mdLabelBase: React.CSSProperties = {
  display: 'block',
  fontFamily: "'Inter', sans-serif",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-secondary)',
  marginBottom: 7,
};

// ─── Number Input ─────────────────────────────────────────────────────────────
interface NumberInputProps {
  label?: string;
  labelInfo?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  prefix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
}

export function NumberInput({
  label, labelInfo, value, onChange, placeholder = '0', suffix, prefix,
  min = 0, max, step = 1, disabled, className,
}: NumberInputProps) {
  const [focused, setFocused] = useState(false);
  const [local, setLocal] = useState(String(value ?? ''));

  useEffect(() => {
    if (!focused) setLocal(String(value ?? ''));
  }, [value, focused]);

  const handleChange = (raw: string) => {
    const normalized = raw.replace(',', '.');
    if (normalized === '' || normalized === '.') { setLocal(normalized); return; }
    if (!/^(\d+\.?\d*|\.\d+)$/.test(normalized)) return;
    const n = parseFloat(normalized);
    if (!isNaN(n) && min !== undefined && n < min) return;
    if (!isNaN(n) && max !== undefined && n > max) return;
    setLocal(normalized);
    if (!isNaN(n)) onChange(normalized);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocused(true);
    if (local === '0') setLocal('');
    setTimeout(() => e.target.select(), 0);
  };

  const handleBlur = () => {
    setFocused(false);
    const n = parseFloat(local.replace(',', '.'));
    if (isNaN(n) || local === '' || local === '.') {
      const fallback = String(min ?? 0);
      setLocal(fallback); onChange(fallback);
    } else {
      const clamped = min !== undefined && n < min ? min : max !== undefined && n > max ? max : n;
      setLocal(String(clamped)); onChange(String(clamped));
    }
  };

  // FIX: calculate suffix padding based on string length
  // Short suffixes (€, %, η, ω) → 12px each side
  // Medium (kWh, τετραγωνικά μέτρα, Mbps) → 10px each side, slightly more space
  // Long (άτομα, kWp, τεμ.) → 8px each side, ensure min content fits
  const getSuffixPadding = (s: string) => {
    const len = s.length;
    if (len <= 2) return '0 12px';
    if (len <= 4) return '0 10px';
    return '0 8px';
  };

  return (
    <div className={className}>
      {label && <label style={{ ...mdLabelBase, display: 'flex', alignItems: 'center' }}>{label}{labelInfo}</label>}
      <div style={{
        width: '100%',
        background: 'var(--bg-surface)',
        border: `1px solid ${fieldBorderColor(focused)}`,
        boxShadow: fieldRing(focused),
        borderRadius: FIELD_RADIUS,
        display: 'flex',
        alignItems: 'center',
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.5 : 1,
        height: FIELD_HEIGHT,
      }}>
        {prefix && (
          <span style={{
            padding: '0 12px',
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            borderRight: `1px solid var(--border-subtle)`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>{prefix}</span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={local}
          onChange={e => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontSize: 14,
            fontFamily: T.font.mono,
            letterSpacing: 0,
            minWidth: 0,
          }}
        />
        {suffix && (
          <span style={{
            // FIX: dynamic padding + never shrink below content width
            padding: getSuffixPadding(suffix),
            fontFamily: "'Inter', sans-serif",
            fontSize: suffix.length > 4 ? 12 : 14,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            borderLeft: `1px solid var(--border-subtle)`,
            whiteSpace: 'nowrap',
            flexShrink: 0,
            // FIX: ensure enough width for the content
            minWidth: 'max-content',
          }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ─── Custom Select Dropdown ───────────────────────────────────────────────────
interface SelectOption {
  value: string;
  label: string;
  description?: string;
  color?: string;
  dot?: string;
  header?: string; // προαιρετική επικεφαλίδα ομάδας (εμφανίζεται πριν από αυτή την επιλογή)
}

interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

let selectSeq = 0;
export function CustomSelect({
  label, value, onChange, options, placeholder = 'Επιλογή...', disabled,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const optRefs = useRef<(HTMLDivElement | null)[]>([]);
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = `sel-${++selectSeq}`;
  const listId = `${idRef.current}-list`;
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Κράτα ορατή την επιλογή που «φωτίζεται» με το πληκτρολόγιο.
  useEffect(() => {
    if (open && activeIndex >= 0) optRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const openList = (to?: number) => {
    setOpen(true);
    setActiveIndex(to ?? Math.max(0, options.findIndex(o => o.value === value)));
  };
  const close = () => { setOpen(false); triggerRef.current?.focus(); };
  const selectAt = (i: number) => {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value); setOpen(false); triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!open) openList(); else if (activeIndex >= 0) selectAt(activeIndex);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActiveIndex(i => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList(options.length - 1);
        else setActiveIndex(i => Math.max(0, i - 1));
        break;
      case 'Home':
        if (open) { e.preventDefault(); setActiveIndex(0); }
        break;
      case 'End':
        if (open) { e.preventDefault(); setActiveIndex(options.length - 1); }
        break;
      case 'Escape':
        if (open) { e.preventDefault(); close(); }
        break;
      case 'Tab':
        if (open) setOpen(false);
        break;
    }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <label style={mdLabelBase} id={`${idRef.current}-label`}>{label}</label>}
      <div
        ref={triggerRef}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled || undefined}
        aria-labelledby={label ? `${idRef.current}-label` : undefined}
        aria-label={label ? undefined : (selected?.label || placeholder)}
        onClick={() => !disabled && (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        style={{
          ...mdInputBase,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          border: `1px solid ${fieldBorderColor(open)}`,
          boxShadow: fieldRing(open),
          padding: '10px 14px',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          {selected?.dot && <div style={{ width: 8, height: 8, borderRadius: '50%', background: selected.dot, flexShrink: 0 }}/>}
          {selected?.color && <div style={{ width: 10, height: 10, borderRadius: 2, background: selected.color, flexShrink: 0 }}/>}
          <span style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            letterSpacing: '0.25px',
            color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {selected?.label || placeholder}
          </span>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-secondary)" style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }} aria-hidden="true">
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </div>
      {open && (
        <div role="listbox" id={listId} aria-labelledby={label ? `${idRef.current}-label` : undefined} style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0,
          right: 0,
          background: 'var(--bg-surface)',
          borderRadius: 12,
          zIndex: 200,
          boxShadow: 'var(--elev-3)',
          border: '1px solid var(--border-subtle)',
          maxHeight: 240,
          overflowY: 'auto',
          padding: '6px',
        }}>
          {options.map((opt, i) => (
            <Fragment key={opt.value}>
            {opt.header && (
              <div style={{
                padding: '10px 12px 5px', fontFamily: "'Inter', sans-serif", fontSize: 10.5,
                fontWeight: 600, letterSpacing: '0.6px', textTransform: 'uppercase',
                color: 'var(--text-tertiary)', userSelect: 'none', pointerEvents: 'none',
              }}>{opt.header}</div>
            )}
            <div
              ref={el => { optRefs.current[i] = el; }}
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => { setHovered(opt.value); setActiveIndex(i); }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => { onChange(opt.value); setOpen(false); triggerRef.current?.focus(); }}
              style={{
                padding: '9px 12px',
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                fontSize: 14,
                letterSpacing: 0,
                color: opt.value === value ? 'var(--accent)' : 'var(--text-primary)',
                background: opt.value === value ? 'var(--accent-dim)' : (hovered === opt.value || activeIndex === i) ? 'var(--bg-hover)' : 'transparent',
                outline: activeIndex === i && opt.value !== value ? '1px solid var(--border-accent)' : 'none',
                transition: 'background 0.1s',
              }}
            >
              {opt.dot && <div style={{ width: 8, height: 8, borderRadius: '50%', background: opt.dot, flexShrink: 0 }}/>}
              {opt.color && <div style={{ width: 10, height: 10, borderRadius: 2, background: opt.color, flexShrink: 0 }}/>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{opt.label}</div>
                {opt.description && (
                  <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, letterSpacing: '0.4px' }}>{opt.description}</div>
                )}
              </div>
              {opt.value === value && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
              )}
            </div>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Date Picker ─────────────────────────────────────────────────────────────
const MONTHS_GR = ['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος'];
const DAYS_GR = ['Δε','Τρ','Τε','Πε','Πα','Σά','Κυ'];

interface DatePickerProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DatePicker({ label, value, onChange, disabled, placeholder = 'Επιλογή ημερομηνίας' }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => value ? new Date(value).getMonth() : new Date().getMonth());
  const [year, setYear] = useState(() => value ? new Date(value).getFullYear() : new Date().getFullYear());
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  // Το ημερολόγιο ζωγραφίζεται μέσω portal στο body ώστε να μην «κόβεται» από modal
  // ή scroll container (overflow) — σταθερές συντεταγμένες από το κουμπί ενεργοποίησης.
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const reposition = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const PANEL_H = 348, PANEL_W = 280;
    const openUp = r.bottom + PANEL_H + 8 > window.innerHeight && r.top - PANEL_H - 8 > 0;
    const left = Math.min(r.left, window.innerWidth - PANEL_W - 8);
    setCoords({ top: openUp ? r.top - PANEL_H - 4 : r.bottom + 4, left: Math.max(8, left) });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current && !ref.current.contains(t) && popupRef.current && !popupRef.current.contains(t)) setOpen(false);
    };
    const onScroll = () => reposition();
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const fmtDisplay = (d: string) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const pick = (day: number) => {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(d); setOpen(false);
  };

  const prevMonth = () => month === 0 ? (setMonth(11), setYear(y => y-1)) : setMonth(m => m-1);
  const nextMonth = () => month === 11 ? (setMonth(0), setYear(y => y+1)) : setMonth(m => m+1);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && <label style={mdLabelBase}>{label}</label>}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={`${label ? label + ': ' : ''}${value ? fmtDisplay(value) : placeholder}`}
        onClick={() => !disabled && setOpen(v => !v)}
        onKeyDown={e => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); }
          else if (e.key === 'Escape' && open) { e.preventDefault(); setOpen(false); }
        }}
        style={{
          ...mdInputBase,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          border: `1px solid ${fieldBorderColor(open)}`,
          boxShadow: fieldRing(open),
          padding: '10px 14px',
          userSelect: 'none',
        }}
      >
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, letterSpacing: 0, color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          {value ? fmtDisplay(value) : placeholder}
        </span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--text-secondary)" aria-hidden="true">
          <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
        </svg>
      </div>
      {open && createPortal(
        <div ref={popupRef} style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: 16,
          zIndex: 2000,
          width: 280,
          boxShadow: 'var(--shadow-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <button onClick={prevMonth} aria-label="Προηγούμενος μήνας" style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6z"/></svg>
            </button>
            <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '0.1px' }}>
              {MONTHS_GR[month]} {year}
            </span>
            <button onClick={nextMonth} aria-label="Επόμενος μήνας" style={{ width: 32, height: 32, borderRadius: 16, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0, marginBottom: 4 }}>
            {DAYS_GR.map(d => (
              <div key={d} style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'center', padding: '4px 0', letterSpacing: '0.5px' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 0 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={`b${i}`}/>)}
            {Array(daysInMonth).fill(null).map((_,i) => {
              const day = i + 1;
              const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const isSelected = value === iso;
              const isToday = today === iso;
              return (
                <button
                  key={day}
                  onClick={() => pick(day)}
                  aria-label={new Date(iso).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })}
                  aria-current={isToday ? 'date' : undefined}
                  aria-pressed={isSelected}
                  style={{
                    width: '100%', aspectRatio: '1',
                    borderRadius: '50%',
                    border: 'none',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? 'var(--accent-text)' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    fontWeight: isToday ? 700 : 400,
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day}
                  {isToday && !isSelected && (
                    <div style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }}/>
                  )}
                </button>
              );
            })}
          </div>
          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 8, paddingTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button onClick={() => { onChange(''); setOpen(false); }}
              style={{ height: 36, padding: '0 16px', borderRadius: 18, border: 'none', background: 'transparent', color: 'var(--accent)', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              Εκκαθάριση
            </button>
            <button onClick={() => { onChange(today); setOpen(false); }}
              style={{ height: 36, padding: '0 16px', borderRadius: 18, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
              Σήμερα
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Toggle, Google MD3 Switch ───────────────────────────────────────────────
interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  labelOff?: string;
  size?: 'sm' | 'md';
}

export function Toggle({ on, onChange, label, labelOff, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 36 : 52;
  const h = size === 'sm' ? 20 : 32;
  const thumbOff = size === 'sm' ? 12 : 16;
  const thumbOn  = size === 'sm' ? 16 : 24;

  const text = on ? (label || 'Ναι') : (labelOff || label || 'Όχι');
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, userSelect: 'none' }}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label || labelOff || 'Εναλλαγή'}
        onClick={() => onChange(!on)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(!on); } }}
        style={{
          width: w, height: h, borderRadius: h,
          background: on ? 'var(--accent)' : 'transparent',
          border: `2px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
          position: 'relative', flexShrink: 0, padding: 0,
          transition: 'background 0.2s, border-color 0.2s',
          cursor: 'pointer',
        }}
      >
        <span style={{
          display: 'block',
          width: on ? thumbOn : thumbOff,
          height: on ? thumbOn : thumbOff,
          borderRadius: '50%',
          background: on ? '#fff' : 'var(--text-secondary)',
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          left: on ? `calc(100% - ${on ? thumbOn : thumbOff}px - 2px)` : '2px',
          transition: 'all 0.2s cubic-bezier(0.2,0,0,1)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}/>
      </button>
      {(label || labelOff) && (
        <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: on ? 'var(--positive)' : 'var(--text-secondary)', letterSpacing: '0.25px', transition: 'color 0.15s' }}>
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Text Input ───────────────────────────────────────────────────────────────
interface TextInputProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function TextInput({ label, value, onChange, placeholder, type='text', disabled, prefix, suffix }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      {label && <label style={mdLabelBase}>{label}</label>}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: 'var(--bg-surface)',
        border: `1px solid ${fieldBorderColor(focused)}`,
        boxShadow: fieldRing(focused),
        borderRadius: FIELD_RADIUS,
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        opacity: disabled ? 0.5 : 1,
        height: FIELD_HEIGHT,
      }}>
        {prefix && (
          <div style={{ padding: '0 12px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 14, background: 'var(--bg-elevated)', alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            {prefix}
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontFamily: "'Inter', sans-serif",
            fontSize: 14,
            letterSpacing: 0,
            minWidth: 0,
          }}
        />
        {suffix && (
          <div style={{ padding: '0 12px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 14, background: 'var(--bg-elevated)', alignSelf: 'stretch', display: 'flex', alignItems: 'center', borderLeft: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Textarea ─────────────────────────────────────────────────────────────────
export function Textarea({
  label, value, onChange, placeholder, rows = 3,
}: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      {label && <label style={mdLabelBase}>{label}</label>}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: '100%',
          background: 'var(--bg-surface)',
          border: `1px solid ${fieldBorderColor(focused)}`,
          boxShadow: fieldRing(focused),
          borderRadius: FIELD_RADIUS,
          padding: '10px 14px',
          color: 'var(--text-primary)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          letterSpacing: 0,
          boxSizing: 'border-box',
          outline: 'none',
          resize: 'vertical',
          minHeight: 80,
          transition: 'border-color 0.15s, box-shadow 0.15s',
          lineHeight: '20px',
        }}
      />
    </div>
  );
}

// ─── Service By Selector ──────────────────────────────────────────────────────
type ServiceBy = 'owner' | 'tenant' | 'split';
const SB_LABELS: Record<ServiceBy, string> = { owner: 'Ιδιοκτήτης', tenant: 'Ενοικιαστής', split: '50 / 50' };
const SB_COLORS: Record<ServiceBy, string> = { owner: 'var(--warning)', tenant: 'var(--positive)', split: 'var(--accent)' };

export function ServiceBySelect({ label, value, onChange }: { label: string; value: ServiceBy; onChange: (v: ServiceBy) => void }) {
  return (
    <div>
      <label style={mdLabelBase}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        {(['owner', 'tenant', 'split'] as ServiceBy[]).map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              flex: 1,
              height: 36,
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.1px',
              cursor: 'pointer',
              borderRadius: 18,
              border: `1px solid ${value === v ? SB_COLORS[v] : 'var(--border-default)'}`,
              background: value === v ? `var(--accent-dim)` : 'transparent',
              color: value === v ? SB_COLORS[v] : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {SB_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Frequency Select ─────────────────────────────────────────────────────────
export const FREQ_OPTIONS = [
  { value: '', label: 'Χωρίς' },
  { value: 'monthly', label: 'Μηνιαία' },
  { value: 'quarterly', label: 'Τριμηνιαία' },
  { value: 'biannual', label: 'Εξαμηνιαία' },
  { value: 'annual', label: 'Ετήσια' },
];

// ─── Segment Control, Google Tabs style ─────────────────────────────────────
interface SegmentOption { value: string; label: string; }

export function SegmentControl({ options, value, onChange }: { options: SegmentOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: 4,
      gap: 2,
    }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex: 1,
            height: 32,
            paddingLeft: 16,
            paddingRight: 16,
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: value === o.value ? 500 : 400,
            letterSpacing: '0.1px',
            cursor: 'pointer',
            borderRadius: 6,
            border: 'none',
            background: value === o.value ? 'var(--bg-surface)' : 'transparent',
            color: value === o.value ? 'var(--accent)' : 'var(--text-secondary)',
            transition: 'all 0.15s',
            whiteSpace: 'nowrap',
            boxShadow: value === o.value ? 'var(--shadow-sm)' : 'none',
          }}
          onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}