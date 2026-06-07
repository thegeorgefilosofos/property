'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, CustomSelect } from './UIComponents';

interface Comparable {
  id?: string;
  property_id: string;
  user_id: string;
  title: string;
  area: string;
  sqm: number;
  rent: number;
  rent_per_sqm: number;
  distance: string;
  condition: string;
  source: string;
  url: string;
  notes: string;
}

const CONDITIONS = [
  {value:'new',label:'Νεόδμητο / Άριστο'},
  {value:'renovated',label:'Ανακαινισμένο'},
  {value:'good',label:'Καλή Κατάσταση'},
  {value:'average',label:'Μέτρια Κατάσταση'},
  {value:'needs_work',label:'Χρειάζεται Εργασίες'},
];

const SOURCES = [
  {value:'spitogatos',label:'Spitogatos'},
  {value:'xe',label:'XE.gr'},
  {value:'immowelt',label:'Immowelt'},
  {value:'uniko',label:'Uniko'},
  {value:'agent',label:'Μεσίτης'},
  {value:'other',label:'Άλλο'},
];

const fe = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

export default function RentComparables({ propertyId, userId, actualRent, sqm }: { propertyId: string; userId: string; actualRent: number; sqm?: number }) {
  const supabase = createClient();
  const [comps, setComps] = useState<Comparable[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Comparable>>({
    title: '', area: '', sqm: 0, rent: 0, rent_per_sqm: 0,
    distance: '< 500μ', condition: 'good', source: 'spitogatos', url: '', notes: '',
  });
  const sf = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const { data } = await supabase.from('rent_comparables')
      .select('*').eq('property_id', propertyId).order('created_at', { ascending: false });
    setComps(data || []);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  // Auto-calc rent per sqm
  useEffect(() => {
    if (form.rent && form.sqm && parseFloat(String(form.sqm)) > 0)
      sf('rent_per_sqm', (parseFloat(String(form.rent)) / parseFloat(String(form.sqm))).toFixed(2));
  }, [form.rent, form.sqm]);

  const save = async () => {
    if (!form.title || !form.rent) return;
    const payload = {
      property_id: propertyId, user_id: userId,
      title: form.title, area: form.area || '',
      sqm: parseFloat(String(form.sqm)) || 0,
      rent: parseFloat(String(form.rent)) || 0,
      rent_per_sqm: parseFloat(String(form.rent_per_sqm)) || 0,
      distance: form.distance || '', condition: form.condition || 'good',
      source: form.source || 'spitogatos', url: form.url || '', notes: form.notes || '',
    };
    await supabase.from('rent_comparables').insert(payload);
    setShowForm(false);
    setForm({ title: '', area: '', sqm: 0, rent: 0, rent_per_sqm: 0, distance: '< 500μ', condition: 'good', source: 'spitogatos', url: '', notes: '' });
    load();
  };

  const del = async (id: string) => {
    await supabase.from('rent_comparables').delete().eq('id', id);
    setComps(c => c.filter(x => x.id !== id));
  };

  const avgRent = comps.length > 0 ? comps.reduce((s, c) => s + c.rent, 0) / comps.length : 0;
  const avgPerSqm = comps.filter(c => c.rent_per_sqm > 0).length > 0
    ? comps.filter(c => c.rent_per_sqm > 0).reduce((s, c) => s + c.rent_per_sqm, 0) / comps.filter(c => c.rent_per_sqm > 0).length : 0;
  const diff = actualRent > 0 && avgRent > 0 ? ((actualRent - avgRent) / avgRent) * 100 : 0;

  const condLabel = (v: string) => CONDITIONS.find(c => c.value === v)?.label || v;
  const srcLabel = (v: string) => SOURCES.find(s => s.value === v)?.label || v;

  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', marginBottom: '16px' };
  const g3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };
  const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '12px' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '16px' }}>🔍</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Συγκριτικά Ακίνητα (Comparables)</span>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          style={{ background: showForm ? 'transparent' : 'var(--accent)', color: showForm ? 'var(--text-secondary)' : 'var(--bg-base)', border: `1px solid ${showForm ? 'var(--border-subtle)' : 'var(--accent)'}`, borderRadius: '8px', padding: '7px 14px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
          {showForm ? '✕ Κλείσιμο' : '+ Προσθήκη Comparable'}
        </button>
      </div>

      {/* Summary KPIs */}
      {comps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Μέσο Ενοίκιο Αγοράς', value: fe(avgRent), color: 'var(--info)' },
            { label: 'Μέσο €/τ.μ.', value: avgPerSqm > 0 ? `${avgPerSqm.toFixed(2)} €/τ.μ.` : '—', color: 'var(--accent)' },
            { label: 'Το Ενοίκιό σου', value: actualRent > 0 ? fe(actualRent) : '—', color: 'var(--text-primary)' },
            {
              label: 'vs Αγορά',
              value: diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—',
              color: diff > 5 ? 'var(--positive)' : diff < -5 ? 'var(--negative)' : 'var(--warning)'
            },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '12px 14px' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: k.color, fontFamily: "'JetBrains Mono',monospace", marginBottom: '3px' }}>{k.value}</div>
              <div style={{ fontSize: '9px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {diff > 5 && comps.length > 0 && (
        <div style={{ background: 'rgba(52,217,123,0.08)', border: '1px solid var(--positive)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--positive)', marginBottom: '12px' }}>
          ✅ Το ενοίκιό σου είναι <strong>{diff.toFixed(1)}%</strong> πάνω από τον μέσο όρο της αγοράς — εξαιρετική τιμολόγηση!
        </div>
      )}
      {diff < -5 && comps.length > 0 && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid var(--warning)', borderRadius: '8px', padding: '10px 14px', fontSize: '11px', color: 'var(--warning)', marginBottom: '12px' }}>
          ⚠️ Το ενοίκιό σου είναι <strong>{Math.abs(diff).toFixed(1)}%</strong> κάτω από τον μέσο όρο — ίσως να μπορείς να αυξήσεις κατά <strong>{fe(avgRent - actualRent)}/μήνα</strong>.
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div style={{ background: 'var(--bg-elevated)', borderRadius: '10px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '14px' }}>Νέο Συγκριτικό Ακίνητο</div>
          <div style={g4}>
            <TextInput label="Τίτλος / Περιγραφή" value={form.title || ''} onChange={v => sf('title', v)} placeholder="π.χ. 2άρι Παγκράτι"/>
            <TextInput label="Περιοχή" value={form.area || ''} onChange={v => sf('area', v)} placeholder="π.χ. Παγκράτι"/>
            <NumberInput label="Τετραγωνικά (τ.μ.)" value={String(form.sqm || '')} onChange={v => sf('sqm', v)} suffix="τ.μ." step={5}/>
            <NumberInput label="Ενοίκιο €/μήνα" value={String(form.rent || '')} onChange={v => sf('rent', v)} suffix="€" step={50}/>
          </div>
          <div style={g4}>
            <CustomSelect label="Πηγή" value={form.source || 'spitogatos'} onChange={v => sf('source', v)} options={SOURCES}/>
            <CustomSelect label="Κατάσταση Ακινήτου" value={form.condition || 'good'} onChange={v => sf('condition', v)} options={CONDITIONS}/>
            <TextInput label="Απόσταση από ακίνητό σου" value={form.distance || ''} onChange={v => sf('distance', v)} placeholder="π.χ. < 500μ"/>
            <div>
              <label style={{ fontSize: '9px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>€/τ.μ. (αυτόματο)</label>
              <div style={{ padding: '9px 12px', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '13px', color: 'var(--accent)', fontFamily: "'JetBrains Mono',monospace" }}>
                {form.rent_per_sqm ? `${parseFloat(String(form.rent_per_sqm)).toFixed(2)} €/τ.μ.` : '—'}
              </div>
            </div>
          </div>
          <TextInput label="URL Αγγελίας (προαιρετικό)" value={form.url || ''} onChange={v => sf('url', v)} placeholder="https://www.spitogatos.gr/..."/>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button onClick={() => setShowForm(false)}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: '8px', padding: '8px 14px', fontSize: '11px', cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Ακύρωση
            </button>
            <button onClick={save} disabled={!form.title || !form.rent}
              style={{ background: 'var(--accent)', color: 'var(--bg-base)', border: 'none', borderRadius: '8px', padding: '9px 18px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'Inter,sans-serif' }}>
              Αποθήκευση
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {comps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-tertiary)' }}>
          <div style={{ fontSize: '28px', opacity: 0.3, marginBottom: '8px' }}>🔍</div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Δεν έχεις προσθέσει comparables ακόμα</div>
          <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '6px' }}>Βρες παρόμοια ακίνητα στο Spitogatos/XE και πρόσθεσέ τα για σύγκριση</div>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
          <thead>
            <tr>
              {['Ακίνητο', 'Περιοχή', 'Τ.Μ.', 'Ενοίκιο', '€/τ.μ.', 'Κατάσταση', 'Πηγή', 'vs Δικό σου', ''].map((h, i) => (
                <th key={i} style={{ fontSize: '8px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comps.map(c => {
              const rentDiff = actualRent > 0 ? ((actualRent - c.rent) / c.rent) * 100 : 0;
              return (
                <tr key={c.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <td style={{ padding: '8px 8px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.title}</div>
                    {c.distance && <div style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{c.distance}</div>}
                  </td>
                  <td style={{ padding: '8px 8px', color: 'var(--text-secondary)' }}>{c.area || '—'}</td>
                  <td style={{ padding: '8px 8px', color: 'var(--text-secondary)' }}>{c.sqm > 0 ? `${c.sqm} τ.μ.` : '—'}</td>
                  <td style={{ padding: '8px 8px', fontWeight: 700, color: 'var(--info)', fontFamily: "'JetBrains Mono',monospace" }}>{fe(c.rent)}</td>
                  <td style={{ padding: '8px 8px', color: 'var(--text-secondary)', fontFamily: "'JetBrains Mono',monospace" }}>{c.rent_per_sqm > 0 ? `${c.rent_per_sqm.toFixed(2)} €` : '—'}</td>
                  <td style={{ padding: '8px 8px' }}><span style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-overlay)', color: 'var(--text-secondary)' }}>{condLabel(c.condition)}</span></td>
                  <td style={{ padding: '8px 8px', color: 'var(--text-tertiary)', fontSize: '10px' }}>{srcLabel(c.source)}</td>
                  <td style={{ padding: '8px 8px' }}>
                    {actualRent > 0 ? (
                      <span style={{ fontSize: '11px', fontWeight: 700, color: rentDiff > 0 ? 'var(--positive)' : 'var(--negative)', fontFamily: "'JetBrains Mono',monospace" }}>
                        {rentDiff > 0 ? '+' : ''}{rentDiff.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '8px 8px' }}>
                    <button onClick={() => del(c.id!)}
                      style={{ width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '5px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '11px' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--negative)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)'; }}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}