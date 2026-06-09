'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

// ─── Number Input ─────────────────────────────────────────────────────────────
interface NumberInputProps {
  label?: string;
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
  label, value, onChange, placeholder = '0', suffix, prefix,
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

  const containerStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-base)',
    border: `1px solid ${focused ? 'var(--accent)' : 'var(--border-default)'}`,
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
    opacity: disabled ? 0.5 : 1,
  };

  const affixStyle: React.CSSProperties = {
    padding: '0 10px',
    fontSize: '12px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)',
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    borderRight: prefix ? `1px solid var(--border-subtle)` : 'none',
    borderLeft: suffix ? `1px solid var(--border-subtle)` : 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    padding: '9px 12px',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontFamily: 'JetBrains Mono, monospace',
    minWidth: 0,
  };

  return (
    <div className={className}>
      {label && (
        <label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'5px' }}>
          {label}
        </label>
      )}
      <div style={containerStyle}>
        {prefix && <span style={affixStyle}>{prefix}</span>}
        <input
          type="text"
          inputMode="decimal"
          value={local}
          onChange={e => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          style={inputStyle}
        />
        {suffix && (
          <span style={{ ...affixStyle, borderRight: 'none', borderLeft: `1px solid var(--border-subtle)` }}>
            {suffix}
          </span>
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
}

interface CustomSelectProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

export function CustomSelect({
  label, value, onChange, options, placeholder = 'Επιλογή...', disabled,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const triggerStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-base)',
    border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`,
    borderRadius: open ? '8px 8px 0 0' : '8px',
    padding: '9px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'border-color 0.15s',
    userSelect: 'none',
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    background: 'var(--bg-surface)',
    border: '1px solid var(--accent)',
    borderTop: 'none',
    borderRadius: '0 0 10px 10px',
    zIndex: 200,
    overflow: 'hidden',
    boxShadow: 'var(--shadow-md)',
    maxHeight: '240px',
    overflowY: 'auto',
  };

  const optionStyle = (isSelected: boolean, isHovered: boolean): React.CSSProperties => ({
    padding: '9px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
    background: isSelected ? 'var(--accent-dim)' : isHovered ? 'var(--bg-hover)' : 'transparent',
    transition: 'background 0.1s',
  });

  const chevronStyle: React.CSSProperties = {
    width: '16px',
    height: '16px',
    flexShrink: 0,
    color: 'var(--text-secondary)',
    transition: 'transform 0.2s',
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && (
        <label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'5px' }}>
          {label}
        </label>
      )}
      <div style={triggerStyle} onClick={() => !disabled && setOpen(v => !v)}>
        <div style={{ display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0 }}>
          {selected?.dot && <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:selected.dot, flexShrink:0 }}/>}
          {selected?.color && <div style={{ width:'10px', height:'10px', borderRadius:'3px', background:selected.color, flexShrink:0 }}/>}
          <span style={{ fontSize:'13px', color: selected ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
            {selected?.label || placeholder}
          </span>
        </div>
        <svg style={chevronStyle} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {open && (
        <div style={dropdownStyle}>
          {options.map(opt => (
            <div
              key={opt.value}
              style={optionStyle(opt.value === value, hovered === opt.value)}
              onMouseEnter={() => setHovered(opt.value)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.dot && <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:opt.dot, flexShrink:0 }}/>}
              {opt.color && <div style={{ width:'10px', height:'10px', borderRadius:'3px', background:opt.color, flexShrink:0 }}/>}
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'13px' }}>{opt.label}</div>
                {opt.description && (
                  <div style={{ fontSize:'11px', color:'var(--text-secondary)', marginTop:'1px' }}>{opt.description}</div>
                )}
              </div>
              {opt.value === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <path d="M2.5 7l3 3 6-6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Custom Date Picker ───────────────────────────────────────────────────────
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fmtDisplay = (d: string) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('el-GR', { day:'2-digit', month:'2-digit', year:'numeric' });
  };

  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const pick = (day: number) => {
    const d = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    onChange(d);
    setOpen(false);
  };

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const triggerStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg-base)',
    border: `1px solid ${open ? 'var(--accent)' : 'var(--border-default)'}`,
    borderRadius: '8px',
    padding: '9px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'border-color 0.15s',
    userSelect: 'none',
  };

  const calendarStyle: React.CSSProperties = {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-accent)',
    borderRadius: '12px',
    padding: '16px',
    zIndex: 300,
    width: '280px',
    boxShadow: 'var(--shadow-lg)',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {label && (
        <label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'5px' }}>
          {label}
        </label>
      )}
      <div style={triggerStyle} onClick={() => !disabled && setOpen(v => !v)}>
        <span style={{ fontSize:'13px', color: value ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
          {value ? fmtDisplay(value) : placeholder}
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <rect x="1.5" y="2.5" width="13" height="12" rx="2"/>
          <path d="M5 1v3M11 1v3M1.5 6.5h13"/>
        </svg>
      </div>
      {open && (
        <div style={calendarStyle}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
            <button
              onClick={prevMonth}
              style={{ width:'28px', height:'28px', borderRadius:'7px', border:'1px solid var(--border-default)', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7.5 2l-4 4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <div style={{ fontSize:'13px', fontWeight:600, color:'var(--text-primary)' }}>{MONTHS_GR[month]} {year}</div>
            <button
              onClick={nextMonth}
              style={{ width:'28px', height:'28px', borderRadius:'7px', border:'1px solid var(--border-default)', background:'transparent', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4.5 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px', marginBottom:'6px' }}>
            {DAYS_GR.map(d => (
              <div key={d} style={{ fontSize:'10px', color:'var(--text-tertiary)', textAlign:'center', padding:'3px', letterSpacing:'0.04em' }}>{d}</div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px' }}>
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
                  style={{
                    width:'100%', aspectRatio:'1', borderRadius:'7px',
                    border: isToday && !isSelected ? '1px solid var(--accent)' : 'none',
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? 'var(--accent-text)' : isToday ? 'var(--accent)' : 'var(--text-primary)',
                    fontSize:'12px', cursor:'pointer', fontFamily:'Inter,sans-serif',
                    fontWeight: isSelected ? 700 : 400, transition:'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div style={{ borderTop:'1px solid var(--border-subtle)', marginTop:'12px', paddingTop:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <button
              onClick={() => { onChange(''); setOpen(false); }}
              style={{ fontSize:'11px', color:'var(--text-secondary)', background:'none', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', padding:'4px 8px', borderRadius:'5px' }}
            >
              Εκκαθάριση
            </button>
            <button
              onClick={() => { onChange(today); setOpen(false); }}
              style={{ fontSize:'11px', color:'var(--accent)', background:'var(--accent-dim)', border:'none', cursor:'pointer', fontFamily:'Inter,sans-serif', padding:'4px 10px', borderRadius:'5px', fontWeight:600 }}
            >
              Σήμερα
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
interface ToggleProps {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  labelOff?: string;
  size?: 'sm' | 'md';
}

export function Toggle({ on, onChange, label, labelOff, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 32 : 40;
  const h = size === 'sm' ? 18 : 22;
  const th = size === 'sm' ? 12 : 16;
  const offset = 3;
  const travel = w - th - offset * 2;

  return (
    <label style={{ display:'inline-flex', alignItems:'center', gap:'10px', cursor:'pointer', userSelect:'none' }}>
      <div
        onClick={() => onChange(!on)}
        style={{
          width:`${w}px`, height:`${h}px`, borderRadius:`${h}px`,
          background: on ? 'var(--positive)' : 'var(--bg-overlay)',
          border: `1px solid ${on ? 'var(--positive)' : 'var(--border-default)'}`,
          position:'relative', flexShrink:0,
          transition:'background 0.2s, border-color 0.2s',
          cursor:'pointer',
        }}
      >
        <div style={{
          width:`${th}px`, height:`${th}px`, borderRadius:'50%',
          background: on ? '#fff' : 'var(--text-tertiary)',
          position:'absolute', top:`${offset}px`,
          left: on ? `${offset + travel}px` : `${offset}px`,
          transition:'left 0.2s, background 0.2s',
          boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
        }}/>
      </div>
      {(label || labelOff) && (
        <span style={{ fontSize:'12px', color: on ? 'var(--positive)' : 'var(--text-secondary)', transition:'color 0.15s' }}>
          {on ? (label || 'Ναι') : (labelOff || label || 'Όχι')}
        </span>
      )}
    </label>
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
      {label && (
        <label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'5px' }}>
          {label}
        </label>
      )}
      <div style={{ display:'flex', alignItems:'center', background:'var(--bg-base)', border:`1px solid ${focused?'var(--accent)':'var(--border-default)'}`, borderRadius:'8px', overflow:'hidden', transition:'border-color 0.15s', opacity:disabled?0.5:1 }}>
        {prefix && (
          <div style={{ padding:'0 10px', color:'var(--text-secondary)', background:'var(--bg-elevated)', alignSelf:'stretch', display:'flex', alignItems:'center', borderRight:'1px solid var(--border-subtle)', flexShrink:0, fontSize:'12px' }}>
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
          style={{ flex:1, background:'transparent', border:'none', outline:'none', padding:'9px 12px', color:'var(--text-primary)', fontSize:'13px', fontFamily:'Inter,sans-serif', minWidth:0 }}
        />
        {suffix && (
          <div style={{ padding:'0 10px', color:'var(--text-secondary)', background:'var(--bg-elevated)', alignSelf:'stretch', display:'flex', alignItems:'center', borderLeft:'1px solid var(--border-subtle)', flexShrink:0, fontSize:'12px' }}>
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
      {label && (
        <label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'5px' }}>
          {label}
        </label>
      )}
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ width:'100%', background:'var(--bg-base)', border:`1px solid ${focused?'var(--accent)':'var(--border-default)'}`, borderRadius:'8px', padding:'9px 12px', color:'var(--text-primary)', fontSize:'13px', fontFamily:'Inter,sans-serif', boxSizing:'border-box', outline:'none', resize:'vertical', minHeight:'64px', transition:'border-color 0.15s' }}
      />
    </div>
  );
}

// ─── Service By Selector ──────────────────────────────────────────────────────
type ServiceBy = 'owner' | 'tenant' | 'split';
const SB_LABELS: Record<ServiceBy, string> = { owner:'Ιδιοκτήτης', tenant:'Ενοικιαστής', split:'50 / 50' };
const SB_COLORS: Record<ServiceBy, string> = { owner:'var(--warning)', tenant:'var(--positive)', split:'var(--accent)' };

export function ServiceBySelect({ label, value, onChange }: { label: string; value: ServiceBy; onChange: (v: ServiceBy) => void }) {
  return (
    <div>
      <label style={{ fontSize:'9px', letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-secondary)', display:'block', marginBottom:'6px' }}>
        {label}
      </label>
      <div style={{ display:'flex', gap:'4px' }}>
        {(['owner','tenant','split'] as ServiceBy[]).map(v => (
          <button
            key={v}
            onClick={() => onChange(v)}
            style={{
              flex:1, padding:'8px 6px', fontSize:'10px', letterSpacing:'0.04em',
              fontFamily:'Inter,sans-serif', cursor:'pointer', borderRadius:'7px',
              border: `1px solid ${value===v ? SB_COLORS[v] : 'var(--border-default)'}`,
              background: value===v ? `color-mix(in srgb, ${SB_COLORS[v]} 15%, transparent)` : 'transparent',
              color: value===v ? SB_COLORS[v] : 'var(--text-secondary)',
              transition:'all 0.15s', textAlign:'center' as const,
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
  { value:'', label:'Χωρίς' },
  { value:'monthly', label:'Μηνιαία' },
  { value:'quarterly', label:'Τριμηνιαία' },
  { value:'biannual', label:'Εξαμηνιαία' },
  { value:'annual', label:'Ετήσια' },
];

// ─── Segment Control ──────────────────────────────────────────────────────────
interface SegmentOption { value: string; label: string; }

export function SegmentControl({ options, value, onChange }: { options: SegmentOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display:'flex', background:'var(--bg-elevated)', border:'1px solid var(--border-subtle)', borderRadius:'10px', padding:'3px', gap:'2px' }}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          style={{
            flex:1, padding:'7px 12px', fontSize:'11px',
            fontWeight: value===o.value ? 600 : 400,
            fontFamily:'Inter,sans-serif', cursor:'pointer', borderRadius:'7px',
            border:'none',
            background: value===o.value ? 'var(--bg-surface)' : 'transparent',
            color: value===o.value ? 'var(--accent)' : 'var(--text-secondary)',
            transition:'all 0.15s', whiteSpace:'nowrap' as const,
            boxShadow: value===o.value ? 'var(--shadow-sm)' : 'none',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}