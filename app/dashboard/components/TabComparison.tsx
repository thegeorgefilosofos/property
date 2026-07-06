'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, fn, Spinner } from '@/components/Theme';
import { downloadCsv } from './exportCsv';

interface Property {
  id: string; name: string; prop_type: string | null; address: string | null;
  sqm: number | null; value: number | null; target_rent: number | null;
  status_detail: string | null;
}
interface Props { properties: Property[]; userId: string; }

interface Agg {
  expensesYTD: number; monthlyBills: number; monthlyRent: number;
}

const STATUS_LABELS: Record<string, string> = {
  rented: 'Ενοικιάζεται', vacant: 'Κενό', own_use: 'Ιδιοχρησία', renovation: 'Ανακαίνιση',
  for_sale: 'Προς Πώληση', seasonal: 'Εποχιακό', disputed: 'Αμφισβητούμενο',
};

export default function TabComparison({ properties, userId }: Props) {
  const supabase = createClient();
  const [agg, setAgg] = useState<Record<string, Agg>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const ids = properties.map(p => p.id);
    if (!ids.length) { setLoading(false); return; }
    const year = new Date().getFullYear();
    const [{ data: exp }, { data: bil }, { data: ten }] = await Promise.all([
      supabase.from('expenses').select('amount,property_id').in('property_id', ids).eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('bills').select('amount,recurring,property_id').in('property_id', ids).eq('user_id', userId),
      supabase.from('tenants').select('monthly_rent,property_id').in('property_id', ids).eq('user_id', userId),
    ]);
    const m: Record<string, Agg> = {};
    ids.forEach(id => { m[id] = { expensesYTD: 0, monthlyBills: 0, monthlyRent: 0 }; });
    (exp || []).forEach((e: any) => { if (m[e.property_id]) m[e.property_id].expensesYTD += e.amount || 0; });
    (bil || []).forEach((b: any) => { if (m[b.property_id] && b.recurring) m[b.property_id].monthlyBills += b.amount || 0; });
    (ten || []).forEach((t: any) => { if (m[t.property_id]) m[t.property_id].monthlyRent = t.monthly_rent || 0; });
    setAgg(m);
    setLoading(false);
  }, [properties, userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (properties.length < 2) {
    return (
      <div style={{ fontFamily: T.font.sans }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 20px' }}>Σύγκριση Ακινήτων</h1>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Χρειάζονται τουλάχιστον δύο ακίνητα</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
            Πρόσθεσε ένα δεύτερο ακίνητο για να τα συγκρίνεις ως προς αξία, ενοίκιο, απόδοση, λογαριασμούς και δαπάνες.
          </div>
        </div>
      </div>
    );
  }

  // Μετρικές ανά ακίνητο
  const rowsData = properties.map(p => {
    const a = agg[p.id] || { expensesYTD: 0, monthlyBills: 0, monthlyRent: 0 };
    const value = p.value || 0;
    const sqm = p.sqm || 0;
    const rent = a.monthlyRent || p.target_rent || 0;
    const perSqm = sqm > 0 ? value / sqm : 0;
    const grossYield = value > 0 ? (rent * 12 / value) * 100 : 0;
    const netMonthly = rent - a.monthlyBills - a.expensesYTD / 12;
    return { p, value, sqm, rent, perSqm, grossYield, monthlyBills: a.monthlyBills, expensesYTD: a.expensesYTD, netMonthly };
  });

  type Dir = 'high' | 'low' | 'none';
  const metrics: { label: string; get: (r: typeof rowsData[number]) => number; fmt: (n: number) => string; dir: Dir }[] = [
    { label: 'Εμπορική Αξία',        get: r => r.value,       fmt: n => fe(n, 0),               dir: 'none' },
    { label: 'Εμβαδόν',              get: r => r.sqm,         fmt: n => `${fn(n)} τετραγωνικά`, dir: 'none' },
    { label: 'Τιμή ανά τετραγωνικό', get: r => r.perSqm,      fmt: n => fe(n, 0),               dir: 'none' },
    { label: 'Μηνιαίο Ενοίκιο',      get: r => r.rent,        fmt: n => fe(n, 0),               dir: 'high' },
    { label: 'Μεικτή Απόδοση',       get: r => r.grossYield,  fmt: n => `${n.toFixed(1)}%`,     dir: 'high' },
    { label: 'Μηνιαίοι Λογαριασμοί', get: r => r.monthlyBills,fmt: n => fe(n, 0),               dir: 'low'  },
    { label: 'Δαπάνες Έτους',        get: r => r.expensesYTD, fmt: n => fe(n, 0),               dir: 'low'  },
    { label: 'Καθαρό ανά μήνα (εκτ.)', get: r => r.netMonthly, fmt: n => fe(n, 0),              dir: 'high' },
  ];

  const bestId = (m: typeof metrics[number]): string | null => {
    if (m.dir === 'none') return null;
    const vals = rowsData.map(r => ({ id: r.p.id, v: m.get(r) })).filter(x => x.v !== 0 || m.dir === 'low');
    if (!vals.length) return null;
    return vals.reduce((best, x) => (m.dir === 'high' ? x.v > best.v : x.v < best.v) ? x : best).id;
  };

  // ── Εξαγωγή CSV (μορφή Ελληνικού Excel: διαχωριστικό «;», κόμμα δεκαδικών,
  //    UTF-8 BOM ώστε να φαίνονται σωστά τα ελληνικά). Χρήσιμο για λογιστή. ──
  const exportCSV = () => {
    const money = (n: number) => String(Math.round(n));               // ακέραια ευρώ, χωρίς χιλιάδες
    const dec1  = (n: number) => n.toFixed(1).replace('.', ',');       // π.χ. 5,2
    const cols = ['Ακίνητο', 'Κατάσταση', 'Εμπορική Αξία (€)', 'Εμβαδόν (τ.μ.)', 'Τιμή/τ.μ. (€)', 'Μηνιαίο Ενοίκιο (€)', 'Ετήσιο Ενοίκιο (€)', 'Μεικτή Απόδοση (%)', 'Μηνιαίοι Λογαριασμοί (€)', 'Δαπάνες Έτους (€)', 'Καθαρό/μήνα εκτ. (€)', 'Καθαρό/έτος εκτ. (€)', 'Εκτ. Φόρος 15% (€)'];
    const rows = rowsData.map(r => {
      const annualRent = r.rent * 12;
      const netYear = r.netMonthly * 12;
      const tax = annualRent * 0.15;
      return [r.p.name, STATUS_LABELS[r.p.status_detail || ''] || r.p.prop_type || '', money(r.value), money(r.sqm), money(r.perSqm), money(r.rent), money(annualRent), dec1(r.grossYield), money(r.monthlyBills), money(r.expensesYTD), money(r.netMonthly), money(netYear), money(tax)];
    });
    // Γραμμή συνόλων χαρτοφυλακίου
    const sum = (f: (r: typeof rowsData[number]) => number) => rowsData.reduce((s, r) => s + f(r), 0);
    const totAnnualRent = sum(r => r.rent * 12);
    rows.push(['ΣΥΝΟΛΟ', '', money(sum(r => r.value)), money(sum(r => r.sqm)), '', money(sum(r => r.rent)), money(totAnnualRent), '', money(sum(r => r.monthlyBills)), money(sum(r => r.expensesYTD)), money(sum(r => r.netMonthly)), money(sum(r => r.netMonthly * 12)), money(totAnnualRent * 0.15)]);
    // Κοινός, θωρακισμένος exporter (BOM, «;», escaping + εξουδετέρωση formula-injection).
    downloadCsv(`xartofylakio_${new Date().toISOString().slice(0, 10)}`, cols, rows);
  };

  const th: React.CSSProperties = { fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 12, whiteSpace: 'nowrap' };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.15 }}>Σύγκριση Ακινήτων</h1>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {properties.length} ακίνητα, αξία, ενοίκιο, απόδοση, λογαριασμοί και δαπάνες δίπλα-δίπλα. Με πράσινο η καλύτερη τιμή ανά γραμμή.
          </div>
        </div>
        {!loading && (
          <button onClick={exportCSV} title="Εξαγωγή για λογιστή (CSV)" style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            Εξαγωγή CSV
          </button>
        )}
      </div>

      {loading ? (
        <Spinner label="Φόρτωση…" />
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 8, overflowX: 'auto' }}>
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 120 + properties.length * 160 }}>
            <thead>
              <tr>
                <th style={{ ...th, position: 'sticky', left: 0, zIndex: 1 }}>Μετρική</th>
                {rowsData.map(r => (
                  <th key={r.p.id} style={th}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'none', letterSpacing: 0 }}>{r.p.name}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>{STATUS_LABELS[r.p.status_detail || ''] || r.p.prop_type || ''}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {metrics.map((m, i) => {
                const best = bestId(m);
                return (
                  <tr key={i}>
                    <td style={{ ...td, fontFamily: T.font.sans, color: 'var(--text-secondary)', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>{m.label}</td>
                    {rowsData.map(r => {
                      const isBest = best === r.p.id;
                      return (
                        <td key={r.p.id} style={{ ...td, color: isBest ? 'var(--positive)' : 'var(--text-primary)', fontWeight: isBest ? 700 : 400, background: isBest ? 'var(--positive-soft)' : 'transparent' }}>
                          {m.fmt(m.get(r))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
        Το «Καθαρό ανά μήνα» είναι εκτίμηση: ενοίκιο − μηνιαίοι λογαριασμοί − (δαπάνες έτους ÷ 12). Δεν περιλαμβάνει δόσεις δανείου, φόρους ή έκτακτα.
      </div>
    </div>
  );
}
