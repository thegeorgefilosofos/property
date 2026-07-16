'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, DatePicker, InfoDot } from './UIComponents';
import { T, fe } from '@/components/Theme';
import { reservePlan } from '@/lib/billing/budgetPro';

// ── Κουμπαράδες / Αποθεματικά (sinking funds) ─────────────────────────────────
// Εικονικοί κουμπαράδες ανά ακίνητο: ΕΝΦΙΑ, λέβητας, κενές περίοδοι, ανακαίνιση.
// Κάθε κουμπαράς έχει στόχο και (προαιρετικά) ημερομηνία — υπολογίζεται η μηνιαία
// εισφορά που χρειάζεται και το ποσοστό κάλυψης. Google-minimal, μονόχρωμο, με
// γαλάζιο μόνο στο πέρασμα του κέρσορα και επεξηγήσεις πίσω από ⓘ.

interface Vault { id: string; name: string; target: number; current: number; due?: string }

interface Props { propertyId: string; userId?: string }

const uid = () => `v_${Date.now().toString(36)}_${Math.round(Math.random() * 1e6).toString(36)}`;
const monthsUntil = (due?: string): number => {
  if (!due) return 0;
  const d = new Date(due), now = new Date();
  return Math.max(0, (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth()));
};
const monthLabel = (due?: string): string => {
  if (!due) return '';
  try { return new Date(due).toLocaleDateString('el-GR', { month: 'short', year: 'numeric' }); } catch { return ''; }
};
// Προτεινόμενη ημερομηνία-στόχος ΕΝΦΙΑ: τέλος Φεβρουαρίου (τελευταία δόση).
const nextFeb = (): string => {
  const now = new Date();
  const y = now.getMonth() >= 1 ? now.getFullYear() + 1 : now.getFullYear();
  return `${y}-02-28`;
};

export default function BudgetVaults({ propertyId, userId = '' }: Props) {
  const supabase = createClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [enfiaAnnual, setEnfiaAnnual] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [hoverPct, setHoverPct] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const [vRes, pRes] = await Promise.all([
        supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'vaults').maybeSingle(),
        supabase.from('user_properties').select('enfia').eq('id', propertyId).maybeSingle(),
      ]);
      const arr = (vRes.data?.data as { vaults?: Vault[] } | null)?.vaults;
      if (Array.isArray(arr)) setVaults(arr);
      const enfia = parseFloat(String(pRes.data?.enfia ?? 0)) || 0;
      setEnfiaAnnual(enfia);
      setLoaded(true);
    })();
  }, [propertyId]);

  const persist = useCallback((next: Vault[]) => {
    setVaults(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('bills_settings').upsert(
        { property_id: propertyId, user_id: userId, section: 'vaults', data: { vaults: next } },
        { onConflict: 'property_id,section' },
      );
    }, 700);
  }, [propertyId, userId]);

  const update = (id: string, patch: Partial<Vault>) => persist(vaults.map(v => v.id === id ? { ...v, ...patch } : v));
  const remove = (id: string) => { persist(vaults.filter(v => v.id !== id)); if (editId === id) setEditId(null); };
  const addVault = (v?: Partial<Vault>) => {
    const nv: Vault = { id: uid(), name: v?.name ?? '', target: v?.target ?? 0, current: v?.current ?? 0, due: v?.due };
    persist([...vaults, nv]);
    setEditId(nv.id);
  };

  const hasEnfiaVault = vaults.some(v => /ενφια|enfia/i.test(v.name));
  const totalSaved = vaults.reduce((s, v) => s + (v.current || 0), 0);
  const totalMonthly = vaults.reduce((s, v) => s + reservePlan(v.target, v.current, monthsUntil(v.due)).requiredMonthly, 0);

  if (!loaded) return null;

  const card: React.CSSProperties = { background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '14px 16px' };

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: T.font.sans }}>Κουμπαράδες</span>
        <InfoDot text="Εικονικοί κουμπαράδες για μελλοντικά έξοδα (ΕΝΦΙΑ, λέβητας, ανακαίνιση, κενές περίοδοι). Ορίζεις στόχο και ημερομηνία· υπολογίζεται πόσο πρέπει να βάζεις κάθε μήνα ώστε να είναι έτοιμος όταν χρειαστεί." />
        {vaults.length > 0 && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
            Σύνολο {fe(totalSaved, 0)}{totalMonthly > 0 ? ` · ${fe(totalMonthly, 0)}/μήνα` : ''}
          </span>
        )}
      </div>

      {/* Πρόταση κουμπαρά ΕΝΦΙΑ */}
      {enfiaAnnual > 0 && !hasEnfiaVault && (
        <button onClick={() => addVault({ name: 'ΕΝΦΙΑ', target: Math.round(enfiaAnnual), due: nextFeb() })}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 12, background: 'var(--bg-elevated)', border: '1px dashed var(--border-default)', borderRadius: T.radius.inner, cursor: 'pointer', textAlign: 'left', fontFamily: T.font.sans }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Δημιούργησε κουμπαρά <strong style={{ color: 'var(--text-primary)' }}>ΕΝΦΙΑ</strong> — στόχος {fe(enfiaAnnual, 0)} έως Φεβρουάριο, ~{fe(reservePlan(enfiaAnnual, 0, monthsUntil(nextFeb())).requiredMonthly, 0)}/μήνα</span>
        </button>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 10 }}>
        {vaults.map(v => {
          const plan = reservePlan(v.target, v.current, monthsUntil(v.due));
          const funded = plan.fundedPct;
          const done = funded >= 100;
          const col = done ? 'var(--accent)' : 'var(--text-secondary)';
          const editing = editId === v.id;
          const on = hoverPct === v.id;

          if (editing) return (
            <div key={v.id} style={{ ...card, gridColumn: '1 / -1' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
                <TextInput label="Όνομα" value={v.name} onChange={val => update(v.id, { name: val })} placeholder="π.χ. Λέβητας" />
                <NumberInput label="Στόχος" value={String(v.target || '')} onChange={val => update(v.id, { target: parseFloat(val) || 0 })} suffix="€" step={50} />
                <NumberInput label="Έχω μαζέψει" value={String(v.current || '')} onChange={val => update(v.id, { current: parseFloat(val) || 0 })} suffix="€" step={20} />
                <DatePicker label="Έως (προαιρετικό)" value={v.due || ''} onChange={val => update(v.id, { due: val })} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setEditId(null)} style={{ height: 34, padding: '0 16px', borderRadius: T.radius.btn, background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600, fontFamily: T.font.sans, cursor: 'pointer' }}>Έτοιμο</button>
                <button onClick={() => remove(v.id)} style={{ height: 34, padding: '0 14px', borderRadius: T.radius.btn, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: 12.5, fontWeight: 500, fontFamily: T.font.sans, cursor: 'pointer' }}>Διαγραφή</button>
              </div>
            </div>
          );

          return (
            <div key={v.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name || 'Κουμπαράς'}</span>
                {done && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Καλυμμένο</span>}
                <button onClick={() => setEditId(v.id)} aria-label="Επεξεργασία κουμπαρά" title="Επεξεργασία" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 6, margin: -4, display: 'flex' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{fe(v.current || 0, 0)}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>/ {fe(v.target || 0, 0)}</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${funded}%`, background: col, borderRadius: 3, transition: 'width 0.5s ease' }}/>
              </div>
              <div onMouseEnter={() => setHoverPct(v.id)} onMouseLeave={() => setHoverPct(null)} onTouchStart={() => setHoverPct(v.id)} onTouchEnd={() => setHoverPct(null)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, fontFamily: T.font.sans }}>
                <span style={{ color: on ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 700, fontFamily: T.font.mono, transition: 'color 0.15s' }}>{funded}%</span>
                {!done && plan.requiredMonthly > 0 && (
                  <span style={{ color: 'var(--text-tertiary)' }}>{fe(plan.requiredMonthly, 0)}/μήνα{v.due ? ` έως ${monthLabel(v.due)}` : ''}</span>
                )}
                {done && <span style={{ color: 'var(--text-tertiary)' }}>Έτοιμος</span>}
              </div>
            </div>
          );
        })}

        {/* Νέος κουμπαράς */}
        <button onClick={() => addVault()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 96, background: 'transparent', border: '1px dashed var(--border-default)', borderRadius: T.radius.card, cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: T.font.sans }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Νέος κουμπαράς</span>
        </button>
      </div>
    </div>
  );
}
