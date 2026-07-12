'use client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadCsv } from './exportCsv';
import { E2_HEADERS, buildE2Row, e2RowToCells, buildE1Summary, e1LineToCells, E1_HEADERS, type E2Property, type E2Tenant, type E2Payment } from '@/lib/billing/e2';

/** Κατεβάζει την Αναλυτική Κατάσταση Ε2 (μία γραμμή ανά ακίνητο) για το `year`. Επιστρέφει πλήθος γραμμών. */
export async function runE2Export(supabase: SupabaseClient, userId: string, year: number): Promise<number> {
  const { data: props } = await supabase.from('user_properties')
    .select('id, atak, address, postal_code, ownership, prop_type, status_detail, target_rent')
    .eq('user_id', userId).order('created_at');
  const properties = (props || []) as E2Property[];
  if (!properties.length) return 0;
  const ids = properties.map(p => p.id);
  const [{ data: tenants }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from('tenants').select('property_id, afm, monthly_rent, lease_start, lease_end, lease_type, created_at').in('property_id', ids).eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('rent_payments').select('property_id, amount, period_year, period_month').in('property_id', ids).eq('user_id', userId).eq('period_year', year),
    supabase.from('property_settings').select('property_id, owner_afm').in('property_id', ids).eq('user_id', userId),
  ]);
  const tenantByProp = new Map<string, E2Tenant>();
  (tenants || []).forEach((t: E2Tenant) => { if (!tenantByProp.has(t.property_id)) tenantByProp.set(t.property_id, t); });
  const paymentsByProp = new Map<string, E2Payment[]>();
  (payments || []).forEach((p: E2Payment) => { const a = paymentsByProp.get(p.property_id) || []; a.push(p); paymentsByProp.set(p.property_id, a); });
  const afmByProp = new Map<string, string>();
  (settings || []).forEach((s: { property_id: string; owner_afm: string | null }) => { if (s.owner_afm) afmByProp.set(s.property_id, s.owner_afm); });
  const e2rows = properties.map(p => buildE2Row(p, tenantByProp.get(p.id) || null, paymentsByProp.get(p.id) || [], afmByProp.get(p.id) || '', year));
  const rows: (string | number)[][] = e2rows.map((r, i) => e2RowToCells(r, i + 1));
  // Παράρτημα: σύνοψη Ε1 (Πίνακας 4Δ1) — άθροισμα ακαθάριστου ανά κωδικό, στο ίδιο αρχείο.
  const e1 = buildE1Summary(e2rows);
  if (e1.lines.length) {
    const pad = (arr: (string | number)[]) => { const a = [...arr]; while (a.length < E2_HEADERS.length) a.push(''); return a; };
    rows.push(pad([]));
    rows.push(pad(['— ΣΥΝΟΨΗ Ε1 (Πίνακας 4Δ1) —']));
    rows.push(pad([...E1_HEADERS]));
    for (const l of e1.lines) rows.push(pad(e1LineToCells(l)));
    rows.push(pad(['Σύνολο ακαθάριστου', '', '', String(e1.totalGross)]));
    rows.push(pad([e1.note]));
  }
  downloadCsv(`e2_e1_${year}_${new Date().toISOString().slice(0, 10)}`, [...E2_HEADERS], rows);
  return e2rows.length;
}
