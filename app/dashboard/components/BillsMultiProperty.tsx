'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, TextInput, CustomSelect } from './UIComponents';

const T = {
  radius: { card: 14, inner: 10, badge: 6, btn: 10, pill: 100 },
  font:   { sans: "Inter, 'Google Sans', sans-serif", mono: "'JetBrains Mono', monospace" },
};
const mdLabel: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 500, letterSpacing: '0.5px',
  textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 6, fontFamily: T.font.sans,
};
const fe = (n: number, d = 2) => `${n.toLocaleString('el-GR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;

interface Property { id: string; name: string; address: string; city?: string; type: string; sqm?: number; }
interface PropertyCosts { propertyId: string; providers: number; insurance: number; services: number; common: number; total: number; unpaid: number; }

const CAT_KEYS   = ['providers','insurance','services','common'] as const;
const CAT_LABELS: Record<string, string> = { providers: 'Πάροχοι', insurance: 'Ασφάλεια & Συνδρομές', services: 'Υπηρεσίες', common: 'Κοινόχρηστα' };
const CAT_COLORS: Record<string, string> = { providers: '#3b82f6', insurance: '#8b5cf6', services: '#10b981', common: '#ec4899' };

const PROPERTY_TYPES = [
  { value: 'apartment',   label: 'Διαμέρισμα'   },
  { value: 'house',       label: 'Μονοκατοικία'  },
  { value: 'studio',      label: 'Στούντιο'       },
  { value: 'maisonette',  label: 'Μεζονέτα'       },
  { value: 'office',      label: 'Γραφείο'         },
  { value: 'shop',        label: 'Κατάστημα'       },
  { value: 'warehouse',   label: 'Αποθήκη'         },
  { value: 'land',        label: 'Οικόπεδο'        },
  { value: 'other',       label: 'Άλλο'            },
];

interface Props { userId: string; currentPropertyId: string; onNavigate?: (id: string) => void; }

export default function BillsMultiProperty({ userId, currentPropertyId, onNavigate }: Props) {
  const supabase = createClient();
  const [properties,  setProperties]  = useState<Property[]>([]);
  const [costs,       setCosts]       = useState<Record<string, PropertyCosts>>({});
  const [loading,     setLoading]     = useState(true);
  const [sortBy,      setSortBy]      = useState<'total'|'name'|'sqm'>('total');
  const [view,        setView]        = useState<'cards'|'table'|'chart'>('cards');
  const [showCreate,  setShowCreate]  = useState(false);
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');
  const [newProp,     setNewProp]     = useState({ name: '', address: '', city: '', type: 'apartment', sqm: '', status: 'vacant' });

  const loadAll = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data: props } = await supabase.from('properties').select('id,name,address,city,type,sqm').eq('user_id', userId).order('name');
      if (!props) return;
      setProperties(props);

      const costMap: Record<string, PropertyCosts> = {};
      await Promise.all(props.map(async (prop) => {
        const [settRes, billsRes] = await Promise.all([
          supabase.from('bills_settings').select('section,data').eq('property_id', prop.id),
          supabase.from('bills').select('amount,paid,category').eq('property_id', prop.id),
        ]);
        const bills   = billsRes.data ?? [];
        const getSett = (s: string) => (settRes.data ?? []).find(x => x.section === s)?.data as Record<string, unknown> | undefined;
        const prov    = getSett('providers');
        const ins     = getSett('insurance');
        const svc     = getSett('services');
        const common  = getSett('common');

        const providersCost =
          (parseFloat(String(prov?.internetPrice)) || 0) +
          (prov?.hasTV ? parseFloat(String(prov?.tvPrice)) || 0 : 0) +
          (prov?.waterBiMonthly ? (parseFloat(String(prov.waterBiMonthly)) || 0) / 2 : parseFloat(String(prov?.waterMonthly)) || 0) +
          (parseFloat(String(prov?.heatingMonthly)) || 0) +
          (parseFloat(String(prov?.gasMonthly)) || 0) +
          (parseFloat(String(prov?.securityMonthly)) || 0);

        const insCost =
          (parseFloat(String(ins?.insCustomPrice)) || 0) +
          (Array.isArray(ins?.activeStreaming) ? (ins.activeStreaming as any[]).reduce((s: number, a: any) => s + (parseFloat(a.customPrice) || 0), 0) : 0);

        const enfiaPer  = parseFloat(String(svc?.enfiaAnnual)) / 12 || parseFloat(String(svc?.enfiaMonthly)) || 0;
        const hist      = Array.isArray(svc?.dimotikaHistory) ? svc.dimotikaHistory as string[] : [];
        const valid     = hist.filter(v => parseFloat(v) > 0);
        const dimM      = valid.length ? valid.reduce((s, v) => s + parseFloat(v), 0) / valid.length : 0;
        const svcCost   = enfiaPer + dimM + (parseFloat(String(svc?.cleaningCostPerVisit)) || 0) + (parseFloat(String(svc?.elevatorMonthly)) || 0);
        const commonCost = parseFloat(String(common?.monthlyFee)) || 0;
        const unpaid    = bills.filter(b => !b.paid).reduce((s, b) => s + (b.amount ?? 0), 0);

        costMap[prop.id] = { propertyId: prop.id, providers: providersCost, insurance: insCost, services: svcCost, common: commonCost, total: providersCost + insCost + svcCost + commonCost, unpaid };
      }));
      setCosts(costMap);
    } catch (_) {}
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, [userId]);

  const createProperty = async () => {
    if (!newProp.name.trim() || !newProp.address.trim()) { setCreateError('Συμπλήρωσε όνομα και διεύθυνση'); return; }
    setCreating(true); setCreateError('');
    try {
      const { data, error } = await supabase.from('properties').insert({
        user_id: userId,
        name:    newProp.name.trim(),
        address: newProp.address.trim(),
        city:    newProp.city.trim() || null,
        type:    newProp.type,
        sqm:     newProp.sqm ? parseFloat(newProp.sqm) : null,
        status:  newProp.status,
      }).select().single();
      if (error) throw error;
      setShowCreate(false);
      setNewProp({ name: '', address: '', city: '', type: 'apartment', sqm: '', status: 'vacant' });
      await loadAll();
      // Navigate to new property if callback available
      if (data && onNavigate) onNavigate(data.id);
    } catch (e: any) {
      setCreateError(e.message || 'Σφάλμα δημιουργίας ακινήτου');
    } finally { setCreating(false); }
  };

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }}/>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Φόρτωση ακινήτων...</div>;

  const sorted    = [...properties].sort((a, b) => sortBy === 'total' ? (costs[b.id]?.total || 0) - (costs[a.id]?.total || 0) : sortBy === 'name' ? a.name.localeCompare(b.name) : (b.sqm || 0) - (a.sqm || 0));
  const maxTotal  = Math.max(...properties.map(p => costs[p.id]?.total || 0), 1);
  const totalAll  = properties.reduce((s, p) => s + (costs[p.id]?.total || 0), 0);
  const avg       = properties.length ? totalAll / properties.length : 0;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>Σύγκριση Ακινήτων</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {properties.length} ακίνητα{properties.length > 1 ? ` · Μέσο μηνιαίο κόστος ${fe(avg, 0)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {properties.length > 1 && (['cards','table','chart'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ padding: '6px 14px', fontSize: 11, borderRadius: T.radius.btn, border: `1px solid ${view === v ? 'var(--accent)' : 'var(--border-default)'}`, background: view === v ? 'rgba(212,175,66,0.1)' : 'transparent', color: view === v ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: view === v ? 700 : 400, fontFamily: T.font.sans }}>
              {v === 'cards' ? 'Κάρτες' : v === 'table' ? 'Πίνακας' : 'Γράφημα'}
            </button>
          ))}
          <button onClick={() => setShowCreate(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: T.radius.btn, border: 'none', background: 'var(--accent)', color: '#000', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Νέο Ακίνητο
          </button>
        </div>
      </div>

      {/* Create property panel */}
      {showCreate && (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: T.radius.card, padding: 24, marginBottom: 20 }}>
          {secHdr('Προσθήκη Νέου Ακινήτου')}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <TextInput label="Όνομα Ακινήτου" value={newProp.name} onChange={v => setNewProp(p => ({ ...p, name: v }))} placeholder="π.χ. Αρύββου 45"/>
            <TextInput label="Διεύθυνση" value={newProp.address} onChange={v => setNewProp(p => ({ ...p, address: v }))} placeholder="π.χ. Αρύββου 45, Βύρωνας"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <TextInput   label="Πόλη"       value={newProp.city}  onChange={v => setNewProp(p => ({ ...p, city: v  }))} placeholder="π.χ. Αθήνα"/>
            <CustomSelect label="Τύπος"     value={newProp.type}  onChange={v => setNewProp(p => ({ ...p, type: v  }))} options={PROPERTY_TYPES}/>
            <NumberInput  label="Εμβαδόν (τ.μ.)" value={newProp.sqm} onChange={v => setNewProp(p => ({ ...p, sqm: v }))} suffix="τ.μ." step={5}/>
            <CustomSelect label="Κατάσταση" value={newProp.status} onChange={v => setNewProp(p => ({ ...p, status: v }))} options={[{ value: 'rented', label: 'Ενοικιάζεται' },{ value: 'vacant', label: 'Κενό' },{ value: 'owner_use', label: 'Ιδιοχρησία' },{ value: 'for_sale', label: 'Προς Πώληση' }]}/>
          </div>
          {createError && <div style={{ fontSize: 12, color: 'var(--negative)', marginBottom: 12, fontFamily: T.font.sans }}>{createError}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }}
              style={{ padding: '8px 20px', borderRadius: T.radius.btn, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans }}>
              Ακύρωση
            </button>
            <button onClick={createProperty} disabled={creating}
              style={{ padding: '8px 24px', borderRadius: T.radius.btn, border: 'none', background: creating ? 'var(--bg-elevated)' : 'var(--accent)', color: creating ? 'var(--text-tertiary)' : '#000', cursor: creating ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, fontFamily: T.font.sans }}>
              {creating ? 'Δημιουργία...' : 'Δημιουργία Ακινήτου'}
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {properties.length === 0 && !showCreate && (
        <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: T.font.sans }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M2 22h20M10 10h4M10 14h4M10 6h4"/></svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Δεν υπάρχουν ακίνητα</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>Πρόσθεσε το πρώτο σου ακίνητο για να ξεκινήσεις</div>
          <button onClick={() => setShowCreate(true)}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.pill, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
            Προσθήκη Ακινήτου
          </button>
        </div>
      )}

      {properties.length === 1 && !showCreate && (
        <div style={{ textAlign: 'center', padding: '40px 0', fontFamily: T.font.sans }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>Πρόσθεσε τουλάχιστον ένα ακόμη ακίνητο για συγκριτική ανάλυση κόστους</div>
          <button onClick={() => setShowCreate(true)}
            style={{ background: 'var(--accent)', color: '#000', border: 'none', borderRadius: T.radius.pill, padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
            Προσθήκη Ακινήτου
          </button>
        </div>
      )}

      {/* Main content — only when 2+ properties */}
      {properties.length >= 2 && (
        <>
          {/* Sort + KPIs */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: T.font.sans }}>Ταξινόμηση</span>
            {(['total','name','sqm'] as const).map(s => (
              <button key={s} onClick={() => setSortBy(s)}
                style={{ padding: '5px 12px', fontSize: 10, borderRadius: T.radius.pill, border: `1px solid ${sortBy === s ? 'var(--accent)' : 'var(--border-subtle)'}`, background: sortBy === s ? 'rgba(212,175,66,0.1)' : 'transparent', color: sortBy === s ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: sortBy === s ? 700 : 400, fontFamily: T.font.sans }}>
                {s === 'total' ? 'Κόστος' : s === 'name' ? 'Όνομα' : 'Τετραγωνικά'}
              </button>
            ))}
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
            {[
              { label: 'Συνολικό / μήνα',   value: fe(totalAll, 0)                                                        },
              { label: 'Μέσο / ακίνητο',    value: fe(avg, 0)                                                             },
              { label: 'Ακριβότερο',          value: sorted[0]?.name || '—'                                               },
              { label: 'Ανεξόφλητα',          value: fe(properties.reduce((s, p) => s + (costs[p.id]?.unpaid || 0), 0), 0) },
            ].map((k, i) => (
              <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
                <div style={{ fontSize: i === 2 ? 13 : 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: i === 2 ? T.font.sans : T.font.mono, lineHeight: 1 }}>{k.value}</div>
              </div>
            ))}
          </div>

          {/* Cards */}
          {view === 'cards' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
              {sorted.map((prop, rank) => {
                const c     = costs[prop.id] || {} as PropertyCosts;
                const isCur = prop.id === currentPropertyId;
                const isTop = rank === 0;
                const isBot = rank === sorted.length - 1 && sorted.length > 1;
                const pct   = maxTotal > 0 ? (c.total / maxTotal) * 100 : 0;
                const perSqm = prop.sqm && c.total ? c.total / prop.sqm : null;
                return (
                  <div key={prop.id} style={{ background: isCur ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid ${isCur ? 'var(--accent)' : isTop ? 'rgba(197,34,31,0.2)' : 'var(--border-subtle)'}`, borderRadius: T.radius.card, padding: 18, position: 'relative', transition: 'all 0.15s' }}>
                    {isCur && <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 8, fontWeight: 700, color: 'var(--accent)', background: 'rgba(212,175,66,0.1)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Τρέχον</div>}
                    {isTop && !isCur && <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 8, fontWeight: 700, color: 'var(--negative)', background: 'rgba(197,34,31,0.08)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Ακριβότερο</div>}
                    {isBot && !isCur && <div style={{ position: 'absolute', top: 12, right: 12, fontSize: 8, fontWeight: 700, color: 'var(--positive)', background: 'rgba(52,168,83,0.08)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Οικονομικότερο</div>}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, fontFamily: T.font.sans }}>{prop.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{prop.address}</div>
                      {prop.sqm && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: T.font.sans }}>{prop.sqm} τ.μ.{perSqm ? ` · ${fe(perSqm, 1)} / τ.μ. / μήνα` : ''}</div>}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Μηνιαίο κόστος</span>
                      <span style={{ fontSize: 18, fontWeight: 700, color: isTop ? 'var(--negative)' : 'var(--text-primary)', fontFamily: T.font.mono }}>{fe(c.total || 0, 0)}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: isTop ? 'var(--negative)' : isCur ? 'var(--accent)' : 'rgba(26,115,232,0.6)', borderRadius: 3, transition: 'width 0.5s ease' }}/>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {CAT_KEYS.map(cat => {
                        const val = (c as any)[cat] || 0;
                        if (val === 0) return null;
                        return (
                          <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS[cat], flexShrink: 0 }}/>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', flex: 1, fontFamily: T.font.sans }}>{CAT_LABELS[cat]}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{fe(val, 0)}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {(c.unpaid || 0) > 0 && <div style={{ fontSize: 10, color: 'var(--negative)', fontFamily: T.font.sans }}>Ανεξόφλητα: <strong style={{ fontFamily: T.font.mono }}>{fe(c.unpaid, 0)}</strong></div>}
                      {!isCur && onNavigate && (
                        <button onClick={() => onNavigate(prop.id)}
                          style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: T.radius.pill, padding: '4px 14px', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: 600 }}>Μετάβαση</button>
                      )}
                      {isCur && <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto', fontFamily: T.font.sans }}>Τρέχον ακίνητο</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          {view === 'table' && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 700 }}>
                <thead>
                  <tr>{['Ακίνητο','Τ.μ.',...CAT_KEYS.map(k => CAT_LABELS[k]),'Σύνολο / μήνα','Σύνολο / έτος','Ανεξόφλητα'].map((h, i) => (
                    <th key={i} style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {sorted.map((prop, rank) => {
                    const c = costs[prop.id] || {} as PropertyCosts;
                    const isCur = prop.id === currentPropertyId;
                    return (
                      <tr key={prop.id} style={{ background: isCur ? 'rgba(212,175,66,0.04)' : 'transparent', cursor: !isCur && onNavigate ? 'pointer' : 'default' }}
                        onClick={() => !isCur && onNavigate && onNavigate(prop.id)}>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: isCur ? 700 : 500, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{prop.name}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1, fontFamily: T.font.sans }}>{prop.address}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontSize: 10 }}>{prop.sqm ?? '—'}</td>
                        {CAT_KEYS.map(cat => <td key={cat} style={{ padding: '10px 14px', fontFamily: T.font.mono, color: (c as any)[cat] > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{(c as any)[cat] > 0 ? fe((c as any)[cat], 0) : '—'}</td>)}
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: rank === 0 ? 'var(--negative)' : isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, whiteSpace: 'nowrap' }}>{fe(c.total || 0, 0)}</td>
                        <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontSize: 10, whiteSpace: 'nowrap' }}>{fe((c.total || 0) * 12, 0)}</td>
                        <td style={{ padding: '10px 14px', color: (c.unpaid || 0) > 0 ? 'var(--negative)' : 'var(--text-tertiary)', fontFamily: T.font.mono }}>{(c.unpaid || 0) > 0 ? fe(c.unpaid, 0) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--bg-elevated)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, fontFamily: T.font.sans, color: 'var(--text-primary)' }} colSpan={2}>Σύνολο</td>
                    {CAT_KEYS.map(cat => <td key={cat} style={{ padding: '10px 14px', fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{fe(properties.reduce((s, p) => s + ((costs[p.id] as any)?.[cat] || 0), 0), 0)}</td>)}
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono }}>{fe(totalAll, 0)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: T.font.mono }}>{fe(totalAll * 12, 0)}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--negative)', fontFamily: T.font.mono }}>{fe(properties.reduce((s, p) => s + (costs[p.id]?.unpaid || 0), 0), 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Chart */}
          {view === 'chart' && (
            <div style={{ background: 'var(--bg-surface)', borderRadius: T.radius.card, border: '1px solid var(--border-subtle)', padding: 24 }}>
              {secHdr('Μηνιαίο Κόστος ανά Ακίνητο')}
              {sorted.map(prop => {
                const c = costs[prop.id] || {} as PropertyCosts;
                const isCur = prop.id === currentPropertyId;
                return (
                  <div key={prop.id} style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: isCur ? 700 : 500, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{prop.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.mono, color: 'var(--text-primary)' }}>{fe(c.total || 0, 0)}</span>
                    </div>
                    <div style={{ display: 'flex', height: 22, borderRadius: T.radius.badge, overflow: 'hidden', background: 'var(--bg-elevated)' }}>
                      {CAT_KEYS.map(cat => {
                        const val = (c as any)[cat] || 0;
                        const pct = maxTotal > 0 ? (val / maxTotal) * 100 : 0;
                        if (pct < 0.5) return null;
                        return (
                          <div key={cat} title={`${CAT_LABELS[cat]}: ${fe(val, 0)}`}
                            style={{ width: `${pct}%`, background: CAT_COLORS[cat], transition: 'width 0.5s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {pct > 10 && <span style={{ fontSize: 8, color: '#fff', fontWeight: 700, textShadow: '0 1px 2px rgba(0,0,0,0.4)', whiteSpace: 'nowrap' }}>{fe(val, 0)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 16, marginTop: 20, flexWrap: 'wrap' }}>
                {CAT_KEYS.map(cat => (
                  <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[cat] }}/>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{CAT_LABELS[cat]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}