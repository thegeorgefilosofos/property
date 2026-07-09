'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Φορολογική Ανάλυση — μεταφέρθηκε από τις Δαπάνες στη «Συγκριτική Ανάλυση».
// Δίνει καθαρή, ειλικρινή εικόνα: ακαθάριστα έσοδα, εκπιπτόμενες δαπάνες,
// εκτιμώμενος φόρος εισοδήματος από ενοίκια (κλίμακα 2026) και πραγματικός
// συντελεστής. Όλα ΕΝΔΕΙΚΤΙΚΑ — με σαφή προτροπή για λογιστή.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, PageTitle, KPIGrid, Badge, InfoBanner, SkeletonKPIs, Skeleton } from '@/components/Theme';
import { rentalIncomeTax, effectiveRentalRate, RENTAL_TAX_ROWS_2026 } from '@/lib/billing/greekTax';
import { resolveRent } from '@/lib/billing/propertyFacts';
import { stayTotal } from '@/lib/clients/clients';

interface Props { propertyId: string; userId: string; propertyRent?: number; }

// Ομάδες δαπανών που θεωρούνται εκπιπτόμενες (ίδια λογική με την καρτέλα Δαπάνες).
const DEDUCTIBLE_GROUPS = new Set(['fixed', 'appliance_lease', 'maintenance', 'vehicle_lease', 'commercial', 'broker', 'legal']);
const eur = (n: number) => `${Math.round(n).toLocaleString('el-GR')} €`;

export default function TabTaxAnalysis({ propertyId, userId, propertyRent }: Props) {
  const supabase = createClient();
  const year = new Date().getFullYear();
  const [expenses, setExpenses] = useState<{ amount: number; expense_group: string | null }[]>([]);
  const [rent, setRent] = useState(0);
  const [hosting, setHosting] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: exp }, { data: ten }, { data: stays }] = await Promise.all([
      supabase.from('expenses').select('amount,expense_group').eq('property_id', propertyId).eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('tenants').select('monthly_rent').eq('property_id', propertyId).eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
      supabase.from('client_stays').select('total,nights,nightly_rate,check_in,check_out').eq('property_id', propertyId).eq('user_id', userId),
    ]);
    setExpenses(exp || []);
    setRent(resolveRent({ tenantRent: ten?.[0]?.monthly_rent, targetRent: propertyRent }).value);
    const hy = (stays || []).filter((s: any) => ((s.check_in || s.check_out || '').slice(0, 4)) === String(year)).reduce((sum: number, s: any) => sum + stayTotal(s), 0);
    setHosting(hy);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, userId, propertyRent, year]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return (
    <div>
      <PageTitle title="Φορολογική Ανάλυση" sub="Εκτίμηση φόρου εισοδήματος από ενοίκια και εκπιπτόμενων δαπανών" />
      <SkeletonKPIs n={4} />
      <div style={{ marginTop: 12 }}><Skeleton h={200} /></div>
    </div>
  );

  const totalExp = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const deductible = expenses.filter(e => DEDUCTIBLE_GROUPS.has(e.expense_group || '')).reduce((s, e) => s + (e.amount || 0), 0);
  const grossIncome = rent * 12 + hosting;
  const tax = grossIncome > 0 ? rentalIncomeTax(grossIncome) : 0;
  const effRate = grossIncome > 0 ? effectiveRentalRate(grossIncome) : 0;
  const netAfterTax = grossIncome - tax - totalExp;

  return (
    <div>
      <PageTitle title="Φορολογική Ανάλυση" sub={`Έτος ${year} · εκτίμηση φόρου εισοδήματος από ενοίκια και εκπιπτόμενων δαπανών`} />

      <KPIGrid columns={4} items={[
        { label: 'Ακαθάριστα έσοδα', value: grossIncome > 0 ? eur(grossIncome) : '—', sub: hosting > 0 ? `ενοίκιο + φιλοξενία` : 'ετήσιο ενοίκιο' },
        { label: 'Εκτιμώμενος φόρος', value: grossIncome > 0 ? eur(tax) : '—', sub: grossIncome > 0 ? `πραγματικός συντελεστής ${(effRate * 100).toFixed(1)}%` : 'κλίμακα 2026', tone: 'warning' },
        { label: 'Εκπιπτόμενες δαπάνες', value: eur(deductible), sub: totalExp > 0 ? `από ${eur(totalExp)} σύνολο` : 'καμία δαπάνη', tone: 'positive' },
        { label: 'Καθαρό μετά φόρου & δαπανών', value: eur(netAfterTax), tone: netAfterTax >= 0 ? 'positive' : 'negative' },
      ]} />

      {grossIncome === 0 && <InfoBanner tone="info">Δεν έχει καταχωρηθεί ενοίκιο ή έσοδα φιλοξενίας για φέτος. Μόλις προσθέσεις ενοικιαστή ή διαμονές, θα δεις εδώ την εκτίμηση φόρου.</InfoBanner>}

      {/* Κλίμακα φόρου εισοδήματος από ενοίκια 2026 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 4 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Κλίμακα φόρου εισοδήματος από ακίνητα (2026)</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 380 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                {['Κλιμάκιο εισοδήματος', 'Συντελεστής'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i ? 'right' : 'left', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RENTAL_TAX_ROWS_2026.map((r, i) => {
                const active = grossIncome > r.from && (r.to === Infinity || grossIncome <= r.to);
                return (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)', background: active ? 'var(--accent-soft)' : 'transparent' }}>
                    <td style={{ padding: '11px 16px', fontFamily: T.font.sans, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      {r.range}{active && <Badge tone="accent">εδώ</Badge>}
                    </td>
                    <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: active ? 700 : 400, color: 'var(--text-primary)' }}>{r.rate}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <InfoBanner tone="warning">Οι υπολογισμοί είναι ΕΝΔΕΙΚΤΙΚΟΙ, βάσει της κλίμακας φόρου εισοδήματος από ακίνητα. Για την τελική δήλωση (Ε2/Ε1) και τις εκπτώσεις που ισχύουν στην περίπτωσή σου, συμβουλέψου λογιστή ή την ΑΑΔΕ. Η αναλυτική εξαγωγή ανά δαπάνη γίνεται από την καρτέλα «Δαπάνες».</InfoBanner>
      </div>
    </div>
  );
}
