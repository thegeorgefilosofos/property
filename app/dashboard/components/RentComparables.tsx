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
  { value: 'new', label: 'Νεόδμητο / Άριστο' },
  { value: 'renovated', label: 'Ανακαινισμένο' },
  { value: 'good', label: 'Καλή Κατάσταση' },
  { value: 'average', label: 'Μέτρια Κατάσταση' },
  { value: 'needs_work', label: 'Χρειάζεται Εργασίες' },
];

const SOURCES = [
  { value: 'spitogatos', label: 'Spitogatos' },
  { value: 'xe', label: 'XE.gr' },
  { value: 'immowelt', label: 'Immowelt' },
  { value: 'uniko', label: 'Uniko' },
  { value: 'agent', label: 'Μεσίτης' },
  { value: 'other', label: 'Άλλο' },
];

const fe = (n: number) => `${n.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
};

const SectionLabel = ({ label, right }: { label: string; right?: React.ReactNode }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block', flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }}>
        {label}
      </span>
    </div>
    {right}
  </div>
);

export default function RentComparables({
  propertyId, userId, actualRent,
}: {
  propertyId: string; userId: string; actualRent: number; sqm?: number;
}) {
  const supabase = createClient();
  const [comps, setComps] = useState<Comparable[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Partial<Comparable>>({
    title: '', area: '', sqm: 0, rent: 0, rent_per_sqm: 0,
    distance: '< 500μ', condition: 'good', source: 'spitogatos', url: '', notes: '',
  });
  const sf = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('rent_comparables')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false });
    setComps(data || []);
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

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
    ? comps.filter(c => c.rent_per_sqm > 0).reduce((s, c) => s + c.rent_per_sqm, 0) / comps.filter(c => c.rent_per_sqm > 0).length
    : 0;
  const diff = actualRent > 0 && avgRent > 0 ? ((actualRent - avgRent) / avgRent) * 100 : 0;

  // Θέση στην αγορά — εύρος (χαμηλό/υψηλό) + διάμεσος από τα comparables
  const rentsSorted = comps.map(c => c.rent).filter(r => r > 0).sort((a, b) => a - b);
  const minRent = rentsSorted[0] || 0;
  const maxRent = rentsSorted[rentsSorted.length - 1] || 0;
  const medianRent = rentsSorted.length
    ? (rentsSorted.length % 2
        ? rentsSorted[(rentsSorted.length - 1) / 2]
        : (rentsSorted[rentsSorted.length / 2 - 1] + rentsSorted[rentsSorted.length / 2]) / 2)
    : 0;
  // Θέση του ενοικίου σου μέσα στο εύρος (0–100%), clamped
  const posPct = maxRent > minRent && actualRent > 0
    ? Math.max(0, Math.min(100, ((actualRent - minRent) / (maxRent - minRent)) * 100))
    : 50;

  const condLabel = (v: string) => CONDITIONS.find(c => c.value === v)?.label || v;
  const srcLabel = (v: string) => SOURCES.find(s => s.value === v)?.label || v;

  const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 12, marginBottom: 12 };

  return (
    <div style={cardStyle}>
      <SectionLabel
        label="Συγκριτικά Ακίνητα (Comparables)"
        right={
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              background: showForm ? 'transparent' : 'var(--accent)',
              color: showForm ? 'var(--text-secondary)' : '#fff',
              border: `1px solid ${showForm ? 'var(--border-default)' : 'var(--accent)'}`,
              borderRadius: 20, padding: '6px 14px', fontSize: 11, fontWeight: 500,
              cursor: 'pointer', fontFamily: "'Google Sans', sans-serif",
            }}
          >
            {showForm ? 'Κλείσιμο' : '+ Προσθήκη'}
          </button>
        }
      />

      {/* Summary KPIs */}
      {comps.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Μέσο Ενοίκιο Αγοράς', value: fe(avgRent), color: 'var(--info)' },
            { label: 'Μέσο € ανά τετραγωνικό', value: avgPerSqm > 0 ? `${avgPerSqm.toFixed(2)} € ανά τετραγωνικό` : '—', color: 'var(--accent)' },
            { label: 'Ενοίκιό σου', value: actualRent > 0 ? fe(actualRent) : '—', color: 'var(--text-primary)' },
            {
              label: 'vs Αγορά',
              value: diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—',
              color: diff > 5 ? 'var(--positive)' : diff < -5 ? 'var(--negative)' : 'var(--warning)',
            },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: "'Roboto Mono', monospace", marginBottom: 3 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Θέση στην αγορά — εύρος + διάμεσος + η θέση σου */}
      {comps.length >= 2 && maxRent > minRent && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }}>Θέση στην αγορά</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Roboto', sans-serif" }}>Διάμεσος <strong style={{ color: 'var(--text-primary)', fontFamily: "'Roboto Mono', monospace" }}>{fe(medianRent)}</strong></span>
          </div>
          {/* Track */}
          <div style={{ position: 'relative', height: 6, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 10 }}>
            {/* διάμεσος marker */}
            <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${maxRent > minRent ? ((medianRent - minRent) / (maxRent - minRent)) * 100 : 50}%`, width: 2, background: 'var(--border-strong)', transform: 'translateX(-1px)' }} />
            {/* η θέση σου */}
            {actualRent > 0 && (
              <div style={{ position: 'absolute', top: '50%', left: `${posPct}%`, width: 14, height: 14, borderRadius: '50%', background: diff >= 0 ? 'var(--positive)' : 'var(--warning)', border: '2px solid var(--bg-surface)', boxShadow: '0 1px 4px rgba(0,0,0,0.3)', transform: 'translate(-50%, -50%)' }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Roboto Mono', monospace" }}>
            <span>{fe(minRent)}</span>
            <span>{fe(maxRent)}</span>
          </div>
          {actualRent > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif", lineHeight: 1.5 }}>
              Το ενοίκιό σου (<strong style={{ color: diff >= 0 ? 'var(--positive)' : 'var(--warning)', fontFamily: "'Roboto Mono', monospace" }}>{fe(actualRent)}</strong>) βρίσκεται στο <strong>{posPct.toFixed(0)}%</strong> του εύρους της αγοράς — {posPct >= 66 ? 'στο ανώτερο τρίτο' : posPct >= 33 ? 'στο μέσο' : 'στο κατώτερο τρίτο'}.
            </div>
          )}
        </div>
      )}

      {/* Comparison banners */}
      {diff > 5 && comps.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--positive)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: "'Roboto', sans-serif" }}>
          Το ενοίκιό σου είναι <strong style={{ color: 'var(--positive)' }}>{diff.toFixed(1)}%</strong> πάνω από τον μέσο όρο της αγοράς — εξαιρετική τιμολόγηση.
        </div>
      )}
      {diff < -5 && comps.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--warning)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: "'Roboto', sans-serif" }}>
          Το ενοίκιό σου είναι <strong style={{ color: 'var(--warning)' }}>{Math.abs(diff).toFixed(1)}%</strong> κάτω από τον μέσο όρο — ίσως να μπορείς να αυξήσεις κατά <strong style={{ color: 'var(--warning)' }}>{fe(avgRent - actualRent)}/μήνα</strong>.
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 14, fontFamily: "'Google Sans', sans-serif" }}>
            Νέο Συγκριτικό Ακίνητο
          </div>
          <div style={g4}>
            <TextInput label="Τίτλος / Περιγραφή" value={form.title || ''} onChange={v => sf('title', v)} placeholder="για παράδειγμα 2άρι Παγκράτι" />
            <TextInput label="Περιοχή" value={form.area || ''} onChange={v => sf('area', v)} placeholder="για παράδειγμα Παγκράτι" />
            <NumberInput label="Τετραγωνικά (τετραγωνικά μέτρα)" value={String(form.sqm || '')} onChange={v => sf('sqm', v)} suffix="τετραγωνικά μέτρα" step={5} />
            <NumberInput label="Ενοίκιο €/μήνα" value={String(form.rent || '')} onChange={v => sf('rent', v)} suffix="€" step={50} />
          </div>
          <div style={g4}>
            <CustomSelect label="Πηγή" value={form.source || 'spitogatos'} onChange={v => sf('source', v)} options={SOURCES} />
            <CustomSelect label="Κατάσταση Ακινήτου" value={form.condition || 'good'} onChange={v => sf('condition', v)} options={CONDITIONS} />
            <TextInput label="Απόσταση" value={form.distance || ''} onChange={v => sf('distance', v)} placeholder="για παράδειγμα < 500μ" />
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 500, fontFamily: "'Google Sans', sans-serif", display: 'block', marginBottom: 6 }}>€ ανά τετραγωνικό (αυτόματο)</span>
              <div style={{ padding: '9px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 13, color: 'var(--accent)', fontFamily: "'Roboto Mono', monospace" }}>
                {form.rent_per_sqm ? `${parseFloat(String(form.rent_per_sqm)).toFixed(2)} € ανά τετραγωνικό` : '—'}
              </div>
            </div>
          </div>
          <TextInput label="URL Αγγελίας (προαιρετικό)" value={form.url || ''} onChange={v => sf('url', v)} placeholder="https://www.spitogatos.gr/..." />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '8px 16px', fontSize: 11, cursor: 'pointer', fontFamily: "'Google Sans', sans-serif", fontWeight: 500 }}
            >
              Ακύρωση
            </button>
            <button
              onClick={save}
              disabled={!form.title || !form.rent}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 20, padding: '9px 20px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'Google Sans', sans-serif" }}
            >
              Αποθήκευση
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {comps.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: "'Google Sans', sans-serif", marginBottom: 4 }}>Δεν έχεις προσθέσει comparables ακόμα</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Roboto', sans-serif" }}>Βρες παρόμοια ακίνητα στο Spitogatos ή XE και πρόσθεσέ τα για σύγκριση</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {['Ακίνητο', 'Περιοχή', 'Τ.Μ.', 'Ενοίκιο', '€ ανά τετραγωνικό', 'Κατάσταση', 'Πηγή', 'vs Δικό σου', ''].map((h, i) => (
                  <th key={i} style={{ fontSize: 10, letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 500, fontFamily: "'Google Sans', sans-serif" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comps.map(c => {
                const rentDiff = actualRent > 0 ? ((actualRent - c.rent) / c.rent) * 100 : 0;
                return (
                  <tr
                    key={c.id}
                    style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '9px 8px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: "'Roboto', sans-serif", fontSize: 12 }}>{c.title}</div>
                      {c.distance && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Roboto', sans-serif", marginTop: 1 }}>{c.distance}</div>}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif", fontSize: 12 }}>{c.area || '—'}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Roboto', sans-serif", fontSize: 12 }}>{c.sqm > 0 ? `${c.sqm} τετραγωνικά μέτρα` : '—'}</td>
                    <td style={{ padding: '9px 8px', fontWeight: 700, color: 'var(--info)', fontFamily: "'Roboto Mono', monospace", fontSize: 12 }}>{fe(c.rent)}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Roboto Mono', monospace", fontSize: 11 }}>{c.rent_per_sqm > 0 ? `${c.rent_per_sqm.toFixed(2)} €` : '—'}</td>
                    <td style={{ padding: '9px 8px' }}>
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)', fontFamily: "'Roboto', sans-serif", whiteSpace: 'nowrap' }}>
                        {condLabel(c.condition)}
                      </span>
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: "'Roboto', sans-serif" }}>{srcLabel(c.source)}</td>
                    <td style={{ padding: '9px 8px' }}>
                      {actualRent > 0 ? (
                        <span style={{ fontSize: 12, fontWeight: 700, color: rentDiff > 0 ? 'var(--positive)' : 'var(--negative)', fontFamily: "'Roboto Mono', monospace" }}>
                          {rentDiff > 0 ? '+' : ''}{rentDiff.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '9px 8px' }}>
                      <button
                        onClick={() => del(c.id!)}
                        style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.15s' }}
                        onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'rgba(239,68,68,0.08)'; b.style.color = 'var(--negative)'; b.style.borderColor = 'var(--negative)'; }}
                        onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--text-tertiary)'; b.style.borderColor = 'var(--border-subtle)'; }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}