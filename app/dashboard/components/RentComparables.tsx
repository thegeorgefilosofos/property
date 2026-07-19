'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, CustomSelect, SegmentControl } from './UIComponents';
import { median, saleStats } from './comparableStats';
import { Card, SecHdr, KPIGrid, Badge, feAuto } from '@/components/Theme';

interface Comparable {
  id?: string;
  property_id: string;
  user_id: string;
  listing_type: 'rent' | 'sale';
  title: string;
  area: string;
  sqm: number;
  rent: number;
  rent_per_sqm: number;
  asking_price: number;
  price_per_sqm: number;
  days_on_market: number;
  sold_price: number;
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

const LISTING_MODES = [
  { value: 'rent', label: 'Ενοικίαση' },
  { value: 'sale', label: 'Πώληση' },
];

export default function RentComparables({
  propertyId, userId, actualRent,
}: {
  propertyId: string; userId: string; actualRent: number; sqm?: number;
}) {
  const supabase = createClient();
  const [comps, setComps] = useState<Comparable[]>([]);
  const [mode, setMode] = useState<'rent' | 'sale'>('rent');
  const [postalCode, setPostalCode] = useState('');
  const [showForm, setShowForm] = useState(false);
  const emptyForm: Partial<Comparable> = {
    title: '', area: '', sqm: 0, rent: 0, rent_per_sqm: 0,
    asking_price: 0, price_per_sqm: 0, days_on_market: 0, sold_price: 0,
    distance: '< 500μ', condition: 'good', source: 'spitogatos', url: '', notes: '',
  };
  const [form, setForm] = useState<Partial<Comparable>>(emptyForm);
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
    supabase
      .from('user_properties')
      .select('postal_code')
      .eq('id', propertyId)
      .single()
      .then(({ data }) => setPostalCode((data?.postal_code as string) || ''));
  }, [propertyId]);

  useEffect(() => {
    const sqm = parseFloat(String(form.sqm));
    if (!(sqm > 0)) return;
    if (mode === 'rent' && form.rent)
      sf('rent_per_sqm', (parseFloat(String(form.rent)) / sqm).toFixed(2));
    if (mode === 'sale' && form.asking_price)
      sf('price_per_sqm', String(Math.round(parseFloat(String(form.asking_price)) / sqm)));
  }, [form.rent, form.asking_price, form.sqm, mode]);

  const save = async () => {
    const valid = mode === 'rent' ? (form.title && form.rent) : (form.title && form.asking_price);
    if (!valid) return;
    const payload = {
      property_id: propertyId, user_id: userId, listing_type: mode,
      title: form.title, area: form.area || '',
      sqm: parseFloat(String(form.sqm)) || 0,
      rent: parseFloat(String(form.rent)) || 0,
      rent_per_sqm: parseFloat(String(form.rent_per_sqm)) || 0,
      asking_price: parseFloat(String(form.asking_price)) || 0,
      price_per_sqm: parseFloat(String(form.price_per_sqm)) || 0,
      days_on_market: parseInt(String(form.days_on_market)) || 0,
      sold_price: parseFloat(String(form.sold_price)) || 0,
      distance: form.distance || '', condition: form.condition || 'good',
      source: form.source || 'spitogatos', url: form.url || '', notes: form.notes || '',
    };
    await supabase.from('rent_comparables').insert(payload);
    setShowForm(false);
    setForm(emptyForm);
    load();
  };

  const del = async (id: string) => {
    await supabase.from('rent_comparables').delete().eq('id', id);
    setComps(c => c.filter(x => x.id !== id));
  };

  const view = comps.filter(c => (c.listing_type || 'rent') === mode);

  // ── Ενοικίαση: μέσος όρος, €/τ.μ., απόκλιση, εύρος ──
  const avgRent = view.length > 0 ? view.reduce((sum, c) => sum + c.rent, 0) / view.length : 0;
  const perSqm = view.filter(c => c.rent_per_sqm > 0);
  const avgPerSqm = perSqm.length > 0 ? perSqm.reduce((sum, c) => sum + c.rent_per_sqm, 0) / perSqm.length : 0;
  const diff = actualRent > 0 && avgRent > 0 ? ((actualRent - avgRent) / avgRent) * 100 : 0;
  const rentsSorted = view.map(c => c.rent).filter(r => r > 0).sort((a, b) => a - b);
  const minRent = rentsSorted[0] || 0;
  const maxRent = rentsSorted[rentsSorted.length - 1] || 0;
  const medianRent = median(view.map(c => c.rent));
  const posPct = maxRent > minRent && actualRent > 0
    ? Math.max(0, Math.min(100, ((actualRent - minRent) / (maxRent - minRent)) * 100))
    : 50;

  // ── Πώληση: στατιστικά €/τ.μ. ανά ΤΚ (καθαρή λογική: comparableStats.ts) ──
  const s = saleStats(view);

  const condLabel = (v: string) => CONDITIONS.find(c => c.value === v)?.label || v;
  const srcLabel = (v: string) => SOURCES.find(x => x.value === v)?.label || v;
  const fps = (n: number) => `${n.toLocaleString('el-GR', { maximumFractionDigits: 0 })} €/τ.μ.`;

  const g4: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 12, marginBottom: 12 };

  return (
    <Card>
      <SecHdr
        label={mode === 'rent' ? 'Συγκριτικά Ακίνητα Ενοικίασης' : 'Συγκριτικά Ακίνητα Πώλησης'}
        right={
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              background: showForm ? 'transparent' : 'var(--accent)',
              color: showForm ? 'var(--text-secondary)' : 'var(--accent-text)',
              border: `1px solid ${showForm ? 'var(--border-default)' : 'var(--accent)'}`,
              borderRadius: 20, padding: '6px 14px', fontSize: 11, fontWeight: 500,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}
          >
            {showForm ? 'Κλείσιμο' : '+ Προσθήκη'}
          </button>
        }
      />

      {/* Εναλλαγή Ενοικίαση / Πώληση */}
      <div style={{ maxWidth: 260, marginBottom: 12 }}>
        <SegmentControl
          options={LISTING_MODES}
          value={mode}
          onChange={v => { setMode(v as 'rent' | 'sale'); setShowForm(false); setForm(emptyForm); }}
        />
      </div>

      {/* Ειλικρινής προέλευση δεδομένων */}
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5, marginBottom: 16 }}>
        Τα συγκριτικά καταχωρούνται χειροκίνητα από εσένα. Δεν γίνεται αυτόματη άντληση δεδομένων (scraping) από τις πλατφόρμες.
      </div>

      {/* Rent KPIs */}
      {mode === 'rent' && view.length > 0 && (
        <KPIGrid items={[
          { label: 'Μέσο Ενοίκιο Αγοράς', value: feAuto(avgRent), tone: 'info' },
          { label: 'Μέσο € ανά τετραγωνικό', value: avgPerSqm > 0 ? `${avgPerSqm.toFixed(2)} € ανά τετραγωνικό` : '—', tone: 'accent' },
          { label: 'Ενοίκιό σου', value: actualRent > 0 ? feAuto(actualRent) : '—' },
          { label: 'vs Αγορά', value: diff !== 0 ? `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%` : '—', tone: diff > 5 ? 'positive' : diff < -5 ? 'negative' : 'warning' },
        ]} />
      )}

      {/* Sale KPIs */}
      {mode === 'sale' && view.length > 0 && (
        <KPIGrid items={[
          { label: 'Μέση Ζητούμενη Τιμή', value: s.avgPrice > 0 ? feAuto(s.avgPrice) : '—', tone: 'info' },
          { label: 'Μέσο €/τ.μ. Πώλησης', value: s.avgPriceSqm > 0 ? fps(s.avgPriceSqm) : '—', tone: 'accent' },
          { label: 'Διάμεσο €/τ.μ.', value: s.medPriceSqm > 0 ? fps(s.medPriceSqm) : '—' },
          { label: 'Μέσος Χρόνος στην Αγορά', value: s.avgDom > 0 ? `${s.avgDom} ημέρες` : '—', tone: 'warning' },
        ]} />
      )}

      {/* Θέση στην αγορά (ενοικίαση) */}
      {mode === 'rent' && view.length >= 2 && maxRent > minRent && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>Θέση στην αγορά</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>Διάμεσος <strong style={{ color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>{feAuto(medianRent)}</strong></span>
          </div>
          <div style={{ position: 'relative', height: 6, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 10 }}>
            <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${maxRent > minRent ? ((medianRent - minRent) / (maxRent - minRent)) * 100 : 50}%`, width: 2, background: 'var(--border-strong)', transform: 'translateX(-1px)' }} />
            {actualRent > 0 && (
              <div style={{ position: 'absolute', top: '50%', left: `${posPct}%`, width: 14, height: 14, borderRadius: '50%', background: diff >= 0 ? 'var(--positive)' : 'var(--warning)', border: '2px solid var(--bg-surface)', boxShadow: 'var(--elev-1)', transform: 'translate(-50%, -50%)' }} />
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>
            <span>{feAuto(minRent)}</span>
            <span>{feAuto(maxRent)}</span>
          </div>
          {actualRent > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
              Το ενοίκιό σου (<strong style={{ color: diff >= 0 ? 'var(--positive)' : 'var(--warning)', fontFamily: "'Inter', sans-serif" }}>{feAuto(actualRent)}</strong>) βρίσκεται στο <strong>{posPct.toFixed(0)}%</strong> του εύρους της αγοράς, {posPct >= 66 ? 'στο ανώτερο τρίτο' : posPct >= 33 ? 'στο μέσο' : 'στο κατώτερο τρίτο'}.
            </div>
          )}
        </div>
      )}

      {/* Εύρος €/τ.μ. πώλησης ανά ΤΚ */}
      {mode === 'sale' && s.count >= 2 && s.maxPriceSqm > s.minPriceSqm && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>Εύρος €/τ.μ. Πώλησης</span>
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>{postalCode ? `ΤΚ ${postalCode}` : 'Περιοχή'} · Διάμεσος <strong style={{ color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif" }}>{fps(s.medPriceSqm)}</strong></span>
          </div>
          <div style={{ position: 'relative', height: 6, background: 'var(--bg-elevated)', borderRadius: 3, marginBottom: 10 }}>
            <div style={{ position: 'absolute', top: -3, bottom: -3, left: `${((s.medPriceSqm - s.minPriceSqm) / (s.maxPriceSqm - s.minPriceSqm)) * 100}%`, width: 2, background: 'var(--border-strong)', transform: 'translateX(-1px)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>
            <span>{fps(s.minPriceSqm)}</span>
            <span>{fps(s.maxPriceSqm)}</span>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", lineHeight: 1.5 }}>
            Μέσος όρος <strong style={{ color: 'var(--accent)', fontFamily: "'Inter', sans-serif" }}>{fps(s.avgPriceSqm)}</strong> από {s.count} αγγελίες πώλησης{s.soldCount > 0 ? `, ${s.soldCount} με καταγεγραμμένη τιμή πώλησης` : ''}.
          </div>
        </div>
      )}

      {/* Banners (ενοικίαση μόνο) */}
      {mode === 'rent' && diff > 5 && view.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--positive)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: "'Inter', sans-serif" }}>
          Το ενοίκιό σου είναι <strong style={{ color: 'var(--positive)' }}>{diff.toFixed(1)}%</strong> πάνω από τον μέσο όρο της αγοράς, εξαιρετική τιμολόγηση.
        </div>
      )}
      {mode === 'rent' && diff < -5 && view.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderLeft: '3px solid var(--warning)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, fontFamily: "'Inter', sans-serif" }}>
          Το ενοίκιό σου είναι <strong style={{ color: 'var(--warning)' }}>{Math.abs(diff).toFixed(1)}%</strong> κάτω από τον μέσο όρο, ίσως να μπορείς να αυξήσεις κατά <strong style={{ color: 'var(--warning)' }}>{feAuto(avgRent - actualRent)}/μήνα</strong>.
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, marginBottom: 16, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, fontFamily: "'Inter', sans-serif" }}>
            {mode === 'rent' ? 'Νέο Συγκριτικό Ενοικίασης' : 'Νέο Συγκριτικό Πώλησης'}
          </div>
          <div style={g4}>
            <TextInput label="Τίτλος / Περιγραφή" value={form.title || ''} onChange={v => sf('title', v)} placeholder="π.χ. 2άρι Παγκράτι" />
            <TextInput label="Περιοχή" value={form.area || ''} onChange={v => sf('area', v)} placeholder="π.χ. Παγκράτι" />
            <NumberInput label="Τετραγωνικά (τετραγωνικά μέτρα)" value={String(form.sqm || '')} onChange={v => sf('sqm', v)} suffix="τετραγωνικά μέτρα" step={5} />
            {mode === 'rent'
              ? <NumberInput label="Ενοίκιο €/μήνα" value={String(form.rent || '')} onChange={v => sf('rent', v)} suffix="€" step={50} />
              : <NumberInput label="Ζητούμενη Τιμή" value={String(form.asking_price || '')} onChange={v => sf('asking_price', v)} suffix="€" step={5000} />}
          </div>
          <div style={g4}>
            <CustomSelect label="Πηγή" value={form.source || 'spitogatos'} onChange={v => sf('source', v)} options={SOURCES} />
            <CustomSelect label="Κατάσταση Ακινήτου" value={form.condition || 'good'} onChange={v => sf('condition', v)} options={CONDITIONS} />
            {mode === 'rent'
              ? <TextInput label="Απόσταση" value={form.distance || ''} onChange={v => sf('distance', v)} placeholder="π.χ. < 500μ" />
              : <NumberInput label="Ημέρες στην Αγορά" value={String(form.days_on_market || '')} onChange={v => sf('days_on_market', v)} suffix="ημέρες" step={5} />}
            <div>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontFamily: "'Inter', sans-serif", display: 'block', marginBottom: 6 }}>{mode === 'rent' ? '€ ανά τετραγωνικό (αυτόματο)' : '€/τ.μ. (αυτόματο)'}</span>
              <div style={{ height: 42, display: 'flex', alignItems: 'center', padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 10, fontSize: 14, letterSpacing: 0, color: 'var(--accent)', fontFamily: "'Inter', sans-serif", boxSizing: 'border-box' }}>
                {mode === 'rent'
                  ? (form.rent_per_sqm ? `${parseFloat(String(form.rent_per_sqm)).toFixed(2)} € ανά τετραγωνικό` : '—')
                  : (form.price_per_sqm ? fps(parseFloat(String(form.price_per_sqm))) : '—')}
              </div>
            </div>
          </div>
          {mode === 'sale' && (
            <div style={g4}>
              <TextInput label="Απόσταση" value={form.distance || ''} onChange={v => sf('distance', v)} placeholder="π.χ. < 500μ" />
              <NumberInput label="Τιμή Πώλησης (προαιρετικό)" value={String(form.sold_price || '')} onChange={v => sf('sold_price', v)} suffix="€" step={5000} />
            </div>
          )}
          <TextInput label="URL Αγγελίας (προαιρετικό)" value={form.url || ''} onChange={v => sf('url', v)} placeholder="https://www.spitogatos.gr/..." />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
            <button onClick={() => setShowForm(false)} style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: '8px 16px', fontSize: 11, cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontWeight: 500 }}>Ακύρωση</button>
            <button onClick={save} disabled={mode === 'rent' ? (!form.title || !form.rent) : (!form.title || !form.asking_price)} style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 20, padding: '9px 20px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Αποθήκευση</button>
          </div>
        </div>
      )}

      {/* Empty state / table */}
      {view.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", marginBottom: 4 }}>{mode === 'rent' ? 'Δεν έχεις προσθέσει συγκριτικά ενοικίασης ακόμα' : 'Δεν έχεις προσθέσει συγκριτικά πώλησης ακόμα'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif" }}>{mode === 'rent' ? 'Βρες παρόμοια ακίνητα στο Spitogatos ή XE και πρόσθεσέ τα για σύγκριση' : 'Βρες παρόμοια ακίνητα προς πώληση στο Spitogatos ή XE και πρόσθεσέ τα για ανάλυση €/τ.μ.'}</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {(mode === 'rent'
                  ? ['Ακίνητο', 'Περιοχή', 'Τ.Μ.', 'Ενοίκιο', '€ ανά τετραγωνικό', 'Κατάσταση', 'Πηγή', 'vs Δικό σου', '']
                  : ['Ακίνητο', 'Περιοχή', 'Τ.Μ.', 'Ζητούμενη', '€/τ.μ.', 'Ημ. Αγοράς', 'Πωλήθηκε', 'Κατάσταση', 'Πηγή', '']
                ).map((h, i) => (
                  <th key={i} style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map(c => {
                const rentDiff = actualRent > 0 ? ((actualRent - c.rent) / c.rent) * 100 : 0;
                const soldDiff = c.sold_price > 0 && c.asking_price > 0 ? ((c.sold_price - c.asking_price) / c.asking_price) * 100 : 0;
                return (
                  <tr key={c.id} style={{ transition: 'background 0.15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-surface)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '9px 8px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{c.title}</div>
                      {c.distance && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: "'Inter', sans-serif", marginTop: 1 }}>{c.distance}</div>}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{c.area || '—'}</td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{c.sqm > 0 ? `${c.sqm} τετραγωνικά μέτρα` : '—'}</td>
                    {mode === 'rent' ? (<>
                      <td style={{ padding: '9px 8px', fontWeight: 700, color: 'var(--info)', fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{feAuto(c.rent)}</td>
                      <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 11 }}>{c.rent_per_sqm > 0 ? `${c.rent_per_sqm.toFixed(2)} €` : '—'}</td>
                    </>) : (<>
                      <td style={{ padding: '9px 8px', fontWeight: 700, color: 'var(--info)', fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{c.asking_price > 0 ? feAuto(c.asking_price) : '—'}</td>
                      <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 11 }}>{c.price_per_sqm > 0 ? fps(c.price_per_sqm) : '—'}</td>
                      <td style={{ padding: '9px 8px', color: 'var(--text-secondary)', fontFamily: "'Inter', sans-serif", fontSize: 11 }}>{c.days_on_market > 0 ? `${c.days_on_market} ημ.` : '—'}</td>
                      <td style={{ padding: '9px 8px' }}>
                        {c.sold_price > 0 ? (
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--positive)', fontFamily: "'Inter', sans-serif", fontSize: 12 }}>{feAuto(c.sold_price)}</div>
                            {soldDiff !== 0 && <div style={{ fontSize: 10, color: soldDiff >= 0 ? 'var(--positive)' : 'var(--negative)', fontFamily: "'Inter', sans-serif", marginTop: 1 }}>{soldDiff > 0 ? '+' : ''}{soldDiff.toFixed(1)}% vs ζητούμενη</div>}
                          </div>
                        ) : <Badge tone="neutral">Διαθέσιμο</Badge>}
                      </td>
                    </>)}
                    <td style={{ padding: '9px 8px' }}>
                      <Badge tone="neutral">{condLabel(c.condition)}</Badge>
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--text-tertiary)', fontSize: 11, fontFamily: "'Inter', sans-serif" }}>{srcLabel(c.source)}</td>
                    {mode === 'rent' && (
                      <td style={{ padding: '9px 8px' }}>
                        {actualRent > 0 ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: rentDiff > 0 ? 'var(--positive)' : 'var(--negative)', fontFamily: "'Inter', sans-serif" }}>{rentDiff > 0 ? '+' : ''}{rentDiff.toFixed(1)}%</span>
                        ) : '—'}
                      </td>
                    )}
                    <td style={{ padding: '9px 8px' }}>
                      <button onClick={() => del(c.id!)} style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', transition: 'all 0.15s' }} onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--negative-soft)'; b.style.color = 'var(--negative)'; b.style.borderColor = 'var(--negative)'; }} onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'transparent'; b.style.color = 'var(--text-tertiary)'; b.style.borderColor = 'var(--border-subtle)'; }}>
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
    </Card>
  );
}
