'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, fn, Skeleton, ExportButton, EmptyState, InfoBanner } from '@/components/Theme';
import { Building2 } from 'lucide-react';
import { comparableGroups } from '@/lib/property/visibility';
import { downloadCsv } from './exportCsv';
import { money, dec2, percent } from './xlsxStyle';
import { runE2Export } from './e2Export';
import { rentalIncomeTax } from '@/lib/billing/greekTax';
import { notifyError } from '@/components/Toast';

interface Property {
  id: string; name: string; prop_type: string | null; address: string | null;
  sqm: number | null; value: number | null; target_rent: number | null;
  status_detail: string | null;
  // Χρειάζονται για να κριθεί αν η σύγκριση είναι έντιμη: έτος κατασκευής και
  // περιοχή αλλάζουν το συμπέρασμα όσο και το ίδιο το ακίνητο.
  year_built?: number | null; postal_code?: string | null; rental_mode?: string | null;
}
interface Props { properties: Property[]; userId: string; }

interface Agg {
  expensesYTD: number; monthlyBills: number; monthlyRent: number; budgetMonthly: number;
}

// Μηνιαίος στόχος προϋπολογισμού από τις ρυθμίσεις: το ρητό «total», αλλιώς το άθροισμα
// των στόχων ανά κατηγορία (αγνοώντας μεταδεδομένα/διακόπτες).
const BUDGET_META = new Set(['total', 'notifyOverspend', 'rollover', 'participants', 'strPlatformPct', 'strMgmtPct', 'strTaxPct']);
const budgetTotalOf = (data: Record<string, unknown> | null | undefined): number => {
  if (!data) return 0;
  const t = parseFloat(String(data.total ?? ''));
  if (!isNaN(t) && String(data.total).trim() !== '') return t;
  return Object.entries(data)
    .filter(([k, v]) => !k.startsWith('__') && !BUDGET_META.has(k) && !isNaN(parseFloat(String(v))))
    .reduce((s, [, v]) => s + parseFloat(String(v)), 0);
};

const STATUS_LABELS: Record<string, string> = {
  rented: 'Ενοικιάζεται', vacant: 'Κενό', own_use: 'Ιδιοχρησία', renovation: 'Ανακαίνιση',
  for_sale: 'Προς Πώληση', seasonal: 'Εποχιακό', disputed: 'Αμφισβητούμενο',
};

// Ο τύπος ακινήτου με ανθρώπινα λόγια, για τον τίτλο της ομάδας. Ό,τι δεν
// αναγνωρίζεται εμφανίζεται όπως το έγραψε ο χρήστης.
const TYPE_LABELS: Record<string, string> = {
  apartment: 'Διαμερίσματα', house: 'Μονοκατοικίες', studio: 'Στούντιο',
  maisonette: 'Μεζονέτες', office: 'Γραφεία', shop: 'Καταστήματα',
  warehouse: 'Αποθήκες', land: 'Οικόπεδα', parking: 'Θέσεις parking',
  storage: 'Αποθήκες κτιρίου', villa: 'Βίλες', other: 'Άλλα',
};

// Ελληνικές επεξηγήσεις για όρους/συντομογραφίες (εμφανίζονται ως tooltip στη μετρική)
const METRIC_TIPS: Record<string, string> = {
  'Τιμή ανά τετραγωνικό': 'Εμπορική αξία ανά τετραγωνικό μέτρο (€/τ.μ.)',
  'Μεικτή Απόδοση': 'Ακαθάριστη ετήσια απόδοση: (μηνιαίο ενοίκιο × 12) ÷ εμπορική αξία',
  'Μηνιαίος Στόχος': 'Ο μηνιαίος στόχος δαπανών από τον Προϋπολογισμό του ακινήτου (συνολικός στόχος ή άθροισμα των στόχων ανά κατηγορία).',
  'Καθαρό ανά μήνα (εκτ.)': 'Εκτίμηση: ενοίκιο − μηνιαίοι λογαριασμοί − (δαπάνες έτους ÷ 12)',
};

export default function TabComparison({ properties, userId }: Props) {
  const supabase = createClient();
  const [agg, setAgg] = useState<Record<string, Agg>>({});
  const [loading, setLoading] = useState(true);
  // Ποια ομάδα κοιτάζει ο χρήστης. `null` σημαίνει «η μεγαλύτερη», που είναι και
  // η πιο χρήσιμη προεπιλογή: εκεί έχει τα περισσότερα να συγκρίνει.
  const [groupKey, setGroupKey] = useState<string | null>(null);

  // ΜΟΝΟ ΟΜΟΕΙΔΗ ΣΥΓΚΡΙΝΟΝΤΑΙ. Ένα διαμέρισμα κι ένα κατάστημα δεν έχουν κοινή
  // αγορά: η «καλύτερη απόδοση» ανάμεσά τους είναι αριθμός χωρίς νόημα. Η
  // ομαδοποίηση και η κρίση του πόσο διαφέρουν ζουν στο lib/property/visibility.ts,
  // ώστε το μενού και αυτή η οθόνη να λένε πάντα το ίδιο πράγμα.
  const groups = useMemo(() => comparableGroups(properties), [properties]);
  const group = groups.find(g => g.key === groupKey) ?? groups[0] ?? null;
  const inGroup = group ? properties.filter(p => group.ids.includes(p.id)) : [];
  const typeLabel = (key: string, sample: Property | undefined) =>
    TYPE_LABELS[key] ?? sample?.prop_type ?? key;

  const load = useCallback(async () => {
    const ids = properties.map(p => p.id);
    if (!ids.length) { setLoading(false); return; }
    const year = new Date().getFullYear();
    const [{ data: exp }, { data: bil }, { data: ten }, { data: bud }] = await Promise.all([
      supabase.from('expenses').select('amount,property_id').in('property_id', ids).eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('bills').select('amount,recurring,property_id').in('property_id', ids).eq('user_id', userId),
      supabase.from('tenants').select('monthly_rent,property_id').in('property_id', ids).eq('user_id', userId),
      supabase.from('bills_settings').select('property_id,data').in('property_id', ids).eq('section', 'budgets'),
    ]);
    const m: Record<string, Agg> = {};
    ids.forEach(id => { m[id] = { expensesYTD: 0, monthlyBills: 0, monthlyRent: 0, budgetMonthly: 0 }; });
    (exp || []).forEach((e: any) => { if (m[e.property_id]) m[e.property_id].expensesYTD += e.amount || 0; });
    (bil || []).forEach((b: any) => { if (m[b.property_id] && b.recurring) m[b.property_id].monthlyBills += b.amount || 0; });
    (ten || []).forEach((t: any) => { if (m[t.property_id]) m[t.property_id].monthlyRent = t.monthly_rent || 0; });
    (bud || []).forEach((r: any) => { if (m[r.property_id]) m[r.property_id].budgetMonthly = budgetTotalOf(r.data); });
    setAgg(m);
    setLoading(false);
  }, [properties, userId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (!group) {
    // Δύο διαφορετικές ελλείψεις, δύο διαφορετικές απαντήσεις: άλλο «δεν έχεις
    // δεύτερο ακίνητο» και άλλο «τα δύο σου ακίνητα δεν συγκρίνονται μεταξύ τους».
    const single = properties.length < 2;
    return (
      <div style={{ fontFamily: T.font.sans }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0 0 20px' }}>Σύγκριση Ακινήτων</h1>
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 8 }}>
          <EmptyState icon={<Building2 size={20} />}
            title={single ? 'Χρειάζονται τουλάχιστον δύο ακίνητα' : 'Δεν υπάρχουν δύο ακίνητα ίδιου τύπου'}
            hint={single
              ? 'Πρόσθεσε ένα δεύτερο ακίνητο για να τα συγκρίνεις ως προς αξία, ενοίκιο, απόδοση, λογαριασμούς και δαπάνες.'
              : 'Η σύγκριση γίνεται μόνο ανάμεσα σε ακίνητα του ίδιου τύπου — ένα διαμέρισμα κι ένα κατάστημα δεν έχουν κοινή αγορά. Συμπλήρωσε τον τύπο στα στοιχεία κάθε ακινήτου ή πρόσθεσε ένα δεύτερο ίδιου τύπου.'} />
        </div>
      </div>
    );
  }

  // Μετρικές ανά ακίνητο (μόνο της ομάδας που κοιτάζει ο χρήστης)
  const rowsData = inGroup.map(p => {
    const a = agg[p.id] || { expensesYTD: 0, monthlyBills: 0, monthlyRent: 0, budgetMonthly: 0 };
    const value = p.value || 0;
    const sqm = p.sqm || 0;
    const rent = a.monthlyRent || p.target_rent || 0;
    const perSqm = sqm > 0 ? value / sqm : 0;
    const grossYield = value > 0 ? (rent * 12 / value) * 100 : 0;
    const netMonthly = rent - a.monthlyBills - a.expensesYTD / 12;
    return { p, value, sqm, rent, perSqm, grossYield, monthlyBills: a.monthlyBills, expensesYTD: a.expensesYTD, netMonthly, budgetMonthly: a.budgetMonthly };
  });

  type Dir = 'high' | 'low' | 'none';
  const metrics: { label: string; get: (r: typeof rowsData[number]) => number; fmt: (n: number) => string; dir: Dir }[] = [
    { label: 'Εμπορική Αξία',        get: r => r.value,       fmt: n => fe(n, 0),               dir: 'none' },
    { label: 'Εμβαδόν',              get: r => r.sqm,         fmt: n => `${fn(n)} τετραγωνικά`, dir: 'none' },
    { label: 'Τιμή ανά τετραγωνικό', get: r => r.perSqm,      fmt: n => fe(n, 0),               dir: 'none' },
    { label: 'Μηνιαίο Ενοίκιο',      get: r => r.rent,        fmt: n => fe(n, 0),               dir: 'high' },
    { label: 'Μεικτή Απόδοση',       get: r => r.grossYield,  fmt: n => `${n.toFixed(1)}%`,     dir: 'high' },
    { label: 'Μηνιαίοι Λογαριασμοί', get: r => r.monthlyBills,fmt: n => fe(n, 0),               dir: 'low'  },
    { label: 'Μηνιαίος Στόχος',      get: r => r.budgetMonthly, fmt: n => n > 0 ? fe(n, 0) : '—', dir: 'none' },
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
    // Κοινοί, τυποποιημένοι formatters: «1.234,56 €», «5,20 %», «85,5» (τ.μ.).
    const cols = ['Ακίνητο', 'Κατάσταση', 'Εμπορική Αξία (€)', 'Εμβαδόν (τ.μ.)', 'Τιμή/τ.μ. (€)', 'Μηνιαίο Ενοίκιο (€)', 'Ετήσιο Ενοίκιο (€)', 'Μεικτή Απόδοση (%)', 'Μηνιαίοι Λογαριασμοί (€)', 'Δαπάνες Έτους (€)', 'Καθαρό/μήνα εκτ. (€)', 'Καθαρό/έτος εκτ. (€)', 'Εκτ. Φόρος Ενοικίου (€)'];
    const rows = rowsData.map(r => {
      const annualRent = r.rent * 12;
      const netYear = r.netMonthly * 12;
      const tax = rentalIncomeTax(annualRent);
      return [r.p.name, STATUS_LABELS[r.p.status_detail || ''] || r.p.prop_type || '', money(r.value), dec2(r.sqm), money(r.perSqm), money(r.rent), money(annualRent), percent(r.grossYield), money(r.monthlyBills), money(r.expensesYTD), money(r.netMonthly), money(netYear), money(tax)];
    });
    // Γραμμή συνόλων της ομάδας (όχι όλου του χαρτοφυλακίου: εξάγεται ό,τι φαίνεται).
    const sum = (f: (r: typeof rowsData[number]) => number) => rowsData.reduce((s, r) => s + f(r), 0);
    const totAnnualRent = sum(r => r.rent * 12);
    rows.push(['ΣΥΝΟΛΟ', '', money(sum(r => r.value)), dec2(sum(r => r.sqm)), '', money(sum(r => r.rent)), money(totAnnualRent), '', money(sum(r => r.monthlyBills)), money(sum(r => r.expensesYTD)), money(sum(r => r.netMonthly)), money(sum(r => r.netMonthly * 12)), money(rentalIncomeTax(totAnnualRent))]);
    // Η προειδοποίηση ταξιδεύει ΜΑΖΙ με τα νούμερα. Ένα αρχείο που φτάνει στον
    // λογιστή χωρίς αυτή είναι ακριβώς η παραπλανητική σύγκριση που θέλαμε να
    // αποφύγουμε — μόνο που τώρα δεν υπάρχει οθόνη να την εξηγήσει.
    if (group.warning) rows.push([group.warning]);
    // Κοινός, θωρακισμένος exporter (BOM, «;», escaping + εξουδετέρωση formula-injection).
    downloadCsv(`sygkrisi_akiniton_${new Date().toISOString().slice(0, 10)}`, cols, rows);
  };

  const th: React.CSSProperties = { fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 700, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 12, whiteSpace: 'nowrap' };

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.15 }}>Σύγκριση Ακινήτων</h1>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {rowsData.length} {typeLabel(group.key, inGroup[0]).toLowerCase()}, αξία, ενοίκιο, απόδοση, λογαριασμοί και δαπάνες δίπλα-δίπλα. Με πράσινο η καλύτερη τιμή ανά γραμμή.
          </div>
        </div>
        {!loading && (
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
            <ExportButton label="Εξαγωγή Ε2" onClick={async () => { const y = new Date().getFullYear() - 1; const n = await runE2Export(supabase, userId, y); if (!n) notifyError('Δεν βρέθηκαν ακίνητα για εξαγωγή.'); }} />
            <ExportButton onClick={exportCSV} />
          </div>
        )}
      </div>

      {/* Περισσότερες από μία ομάδες: ο χρήστης διαλέγει ποια κοιτάζει. Η επιλογή
          μπαίνει μόνο όταν υπάρχει κάτι να επιλεγεί — με μία ομάδα θα ήταν θόρυβος. */}
      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {groups.map(g => {
            const on = g.key === group.key;
            return (
              <button key={g.key} type="button" onClick={() => setGroupKey(g.key)} aria-pressed={on}
                style={{ height: T.h.sm, padding: '0 12px', borderRadius: 8, cursor: 'pointer', fontFamily: T.font.sans, fontSize: 12, fontWeight: on ? 700 : 500,
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border-default)'}`,
                  background: on ? 'var(--accent-dim)' : 'transparent',
                  color: on ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {typeLabel(g.key, properties.find(p => p.id === g.ids[0]))} ({g.ids.length})
              </button>
            );
          })}
        </div>
      )}

      {/* Η ΠΡΟΕΙΔΟΠΟΙΗΣΗ ΔΕΝ ΕΙΝΑΙ ΨΙΛΑ ΓΡΑΜΜΑΤΑ. Δύο διαμερίσματα είναι συγκρίσιμα
          ως κατηγορία, αλλά 45 τ.μ. του 1975 δίπλα σε 140 τ.μ. του 2018 βγάζουν
          «το δεύτερο αποδίδει καλύτερα» — αληθές και εντελώς άχρηστο. Ο χρήστης
          έχει δικαίωμα να δει τη σύγκριση· έχει και δικαίωμα να ξέρει τι κοιτάζει. */}
      {group.warning && <InfoBanner tone="warning">{group.warning}</InfoBanner>}

      {loading ? (
        // Σκελετός αντί για spinner: το σχήμα του πίνακα σύγκρισης είναι γνωστό εκ
        // των προτέρων, οπότε ο χώρος δεσμεύεται από την αρχή και η σελίδα δεν
        // «πηδά» όταν φτάνουν τα δεδομένα.
        <Skeleton h={320} r={14} />
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 8, overflowX: 'auto' }}>
          <div className="table-wrap">
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 120 + rowsData.length * 160 }}>
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
                    <td title={METRIC_TIPS[m.label]} style={{ ...td, fontFamily: T.font.sans, color: 'var(--text-secondary)', fontWeight: 500, position: 'sticky', left: 0, background: 'var(--bg-surface)', zIndex: 1 }}>{m.label}</td>
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
        Συγκρίνονται μόνο ακίνητα ίδιου τύπου. Το «Καθαρό ανά μήνα» είναι εκτίμηση: ενοίκιο − μηνιαίοι λογαριασμοί − (δαπάνες έτους ÷ 12). Δεν περιλαμβάνει δόσεις δανείου, φόρους ή έκτακτα.
      </div>
    </div>
  );
}
