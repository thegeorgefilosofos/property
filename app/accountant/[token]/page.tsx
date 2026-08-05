'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Accountant portal, read-only πύλη λογιστή (χωρίς login). Διαβάζει μέσω
// ασφαλούς RPC (get_accountant_data) εικόνα εσόδων/δαπανών ανά ακίνητο για μια
// χρονιά. Ο φόρος υπολογίζεται ενδεικτικά με την κλίμακα ενοικίων. Theme-aware.
// ═══════════════════════════════════════════════════════════════════════════

import BrandMark from '@/components/BrandMark';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { rentalIncomeTax, rentalBracketsForYear, bracketsLabelForYear, RENTAL_TAX_SUMMARY_2026 } from '@/lib/billing/greekTax';
import { presumptiveDeductionRate, PRESUMPTIVE_RULE_2026 } from '@/lib/billing/consolidate';
import { T, feAuto, Card } from '@/components/Theme';

interface Expense { category: string; amount: number; date: string }
interface Stay { check_in: string | null; check_out: string | null; nights: number | null; total: number | null }
interface Prop { name: string; atak: string | null; address: string | null; prop_type: string | null; rent: number | null; expenses: Expense[]; stays: Stay[] }
interface Data { owner: string | null; year: number; properties: Prop[] }

const sum = (a: number[]) => a.reduce((s, v) => s + (v || 0), 0);

export default function AccountantPortal() {
  const params = useParams();
  const token = String(params?.token || '');
  const supabase = createClient();
  const nowYear = new Date().getFullYear();

  const [year, setYear] = useState(nowYear - 1); // ο λογιστής συνήθως δουλεύει την προηγούμενη χρονιά
  const [data, setData] = useState<Data | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  useEffect(() => {
    setState('loading');
    (async () => {
      const { data: d, error } = await supabase.rpc('get_accountant_data', { p_token: token, p_year: year });
      if (error || !d) { setState('notfound'); return; }
      setData(d as Data); setState('ok');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, year]);

  const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)' };

  // Σύνολα (ο φόρος εισοδήματος είναι προοδευτικός στο ΣΥΝΟΛΟ των ενοικίων)
  const props = data?.properties || [];
  const perProp = props.map(p => {
    const rentAnnual = (p.rent || 0) * 12;
    const shortGross = sum((p.stays || []).map(s => s.total || 0));
    const income = rentAnnual + shortGross;
    const expenses = sum((p.expenses || []).map(e => e.amount || 0));
    return { p, rentAnnual, shortGross, income, expenses };
  });
  const totalIncome = sum(perProp.map(x => x.income));
  const totalExpenses = sum(perProp.map(x => x.expenses));
  // Η ΜΟΝΗ ΟΘΟΝΗ ΠΟΥ ΒΛΕΠΕΙ ΕΠΑΓΓΕΛΜΑΤΙΑΣ ΗΤΑΝ Η ΜΟΝΗ ΧΩΡΙΣ ΤΗΝ ΕΚΠΤΩΣΗ 5%.
  // Το `rentalIncomeTax(totalIncome)` φορολογούσε το 100% των ενοικίων, ενώ
  // κάθε άλλη διαδρομή του app εφαρμόζει την τεκμαρτή έκπτωση του άρθρου 39
  // παρ.4 ΚΦΕ. Σε 20.000 € ενοίκια η διαφορά είναι 250 € (+7%) — και ο λογιστής
  // τη διαβάζει δίπλα σε μια περιγραφή κλίμακας που δεν ίσχυσε ποτέ.
  // Η έκπτωση προϋποθέτει τραπεζική είσπραξη (ν.5246/2025)· εδώ δεν ξέρουμε τον
  // τρόπο είσπραξης, οπότε εφαρμόζεται και δηλώνεται ρητά η προϋπόθεση.
  const taxableIncome = totalIncome * (1 - presumptiveDeductionRate(true));
  // Ο λογιστής ξεκινά στην ΠΡΟΗΓΟΥΜΕΝΗ χρονιά (γρ. 29) — δηλαδή ακριβώς εκεί
  // όπου ίσχυε άλλη κλίμακα. Χωρίς αυτό, η μοναδική οθόνη που βλέπει
  // επαγγελματίας έδειχνε φόρο 2026 σε δήλωση 2025.
  const estTax = rentalIncomeTax(taxableIncome, rentalBracketsForYear(year));

  const row = (k: string, v: string, strong?: boolean) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: strong ? 700 : 600, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{v}</span>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: T.font.sans, paddingBottom: 40 }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', marginBottom: 24 }}>
        <div style={{ ...wrap, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BrandMark />
            <span style={{ fontSize: 16, fontWeight: 700 }}>Πύλη Λογιστή</span>
          </div>
          {state === 'ok' && (
            <select value={year} onChange={e => setYear(parseInt(e.target.value, 10))} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '10px 16px', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.mono, fontWeight: 700 }}>
              {[nowYear, nowYear - 1, nowYear - 2, nowYear - 3].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </div>
      </header>

      <div style={wrap}>
        {state === 'loading' && <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>Φόρτωση…</div>}

        {state === 'notfound' && (
          <Card style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Ο σύνδεσμος δεν είναι έγκυρος</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>Ζήτησε από τον ιδιοκτήτη έναν ενημερωμένο σύνδεσμο.</div>
          </Card>
        )}

        {state === 'ok' && data && (
          <>
            <Card>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 2 }}>{data.owner || 'Ιδιοκτήτης'}</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Οικονομική εικόνα ακινήτων · φορολογικό έτος {year}</div>
            </Card>

            <Card>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Σύνοψη έτους</div>
              {row('Συνολικά έσοδα από ενοίκια/βραχυχρόνια', feAuto(totalIncome))}
              {row('Συνολικές καταγεγραμμένες δαπάνες', feAuto(totalExpenses))}
              {row('Εκτιμώμενος φόρος εισοδήματος (ενδεικτικά)', feAuto(estTax), true)}
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10, lineHeight: 1.6 }}>
                Οι αριθμοί είναι ενδεικτικοί, βάσει των καταχωρήσεων του ιδιοκτήτη. Εφαρμόστηκε η {bracketsLabelForYear(year)} για εισοδήματα {year}. {PRESUMPTIVE_RULE_2026} Επιβεβαιώστε με τα επίσημα παραστατικά και το myAADE.
              </div>
            </Card>

            {perProp.map((x, i) => (
              <Card key={i}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{x.p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>{[x.p.address, x.p.atak ? `ΑΤΑΚ ${x.p.atak}` : null].filter(Boolean).join(' · ') || 'Χωρίς στοιχεία'}</div>
                {x.rentAnnual > 0 && row('Ενοίκια (ετήσια)', feAuto(x.rentAnnual))}
                {x.shortGross > 0 && row('Βραχυχρόνια (καταγεγραμμένο ποσό)', feAuto(x.shortGross))}
                {row('Δαπάνες έτους', feAuto(x.expenses))}
                {(x.p.expenses || []).length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Δαπάνες ανά κατηγορία</div>
                    {Object.entries((x.p.expenses || []).reduce<Record<string, number>>((m, e) => { m[e.category || 'Άλλο'] = (m[e.category || 'Άλλο'] || 0) + (e.amount || 0); return m; }, {})).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{cat}</span>
                        <span style={{ fontFamily: T.font.mono, color: 'var(--text-primary)' }}>{feAuto(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}

            {props.length === 0 && <Card style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Δεν υπάρχουν ακίνητα για αυτή τη χρονιά.</Card>}
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Powered by Property OS · read-only · <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>Απόρρητο</a></div>
          </>
        )}
      </div>
    </div>
  );
}
