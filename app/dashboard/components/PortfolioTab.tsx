'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioTab — συγκεντρωτική εικόνα ΟΛΩΝ των ακινήτων, για επαγγελματίες
// διαχειριστές με πολλά ακίνητα. Έσοδα / δαπάνες / καθαρό / πληρότητα /
// εκκρεμότητες ανά ακίνητο, με ένα κλικ στην πλήρη Επισκόπηση του καθενός.
// Καμία εφεύρεση: μόνο πραγματικά δεδομένα που έχει καταχωρήσει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, PageTitle, KPIGrid, Badge, ExportButton, EmptyState, SkeletonKPIs, Skeleton } from '@/components/Theme';
import { resolveRent } from '@/lib/billing/propertyFacts';
import { stayTotal } from '@/lib/clients/clients';

interface PropLite { id: string; name: string; prop_type: string | null; address: string | null; target_rent: number | null; value: number | null; }
interface Props { properties: PropLite[]; userId: string; onSelectProperty: (id: string) => void; }

const eur = (n: number) => `${Math.round(n).toLocaleString('el-GR')} €`;
type Mode = 'short' | 'long' | 'vacant';

interface Row {
  id: string; name: string; typeLabel: string; mode: Mode;
  revenue: number; expenses: number; net: number;
  occupancy: number | null; nights: number; pending: number;
}

type SortKey = 'name' | 'revenue' | 'net' | 'occupancy' | 'pending';

export default function PortfolioTab({ properties, userId, onSelectProperty }: Props) {
  const supabase = createClient();
  // Σταθερό «τώρα» ανά mount, ώστε τα useMemo να μην ξαναϋπολογίζονται σε κάθε render.
  const nowMs = useMemo(() => Date.now(), []);
  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const year = now.getFullYear();
  const monthsElapsed = now.getMonth() + 1;
  const daysElapsed = Math.max(1, Math.ceil((nowMs - new Date(year, 0, 1).getTime()) / 86400000));

  const [stays, setStays] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [exp, setExp] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [chk, setChk] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('net');
  const [asc, setAsc] = useState(false);

  const load = useCallback(async () => {
    const [{ data: st }, { data: bl }, { data: ex }, { data: tn }, { data: ci }] = await Promise.all([
      supabase.from('client_stays').select('property_id,check_in,check_out,total,nights,nightly_rate').eq('user_id', userId),
      supabase.from('bills').select('property_id,paid,amount,due_date').eq('user_id', userId),
      supabase.from('expenses').select('property_id,amount,date').eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('tenants').select('property_id,monthly_rent,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
      supabase.from('checklist_items').select('property_id,status,priority,due_date').eq('user_id', userId).neq('status', 'done').neq('status', 'skipped'),
    ]);
    setStays(st || []); setBills(bl || []); setExp(ex || []); setTenants(tn || []); setChk(ci || []); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, year]);

  useEffect(() => {
    setLoading(true); load();
    const ch = supabase.channel(`portfolio_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_items' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, load]);

  const rows: Row[] = useMemo(() => {
    // Πιο πρόσφατο ενοίκιο ανά ακίνητο (η λίστα tenants έρχεται φθίνουσα κατά updated_at).
    const rentByProp = new Map<string, number>();
    tenants.forEach(t => { if (!rentByProp.has(t.property_id)) rentByProp.set(t.property_id, Number(t.monthly_rent) || 0); });

    return properties.map(p => {
      const staysY = stays.filter(s => s.property_id === p.id && ((s.check_in || s.check_out || '').slice(0, 4)) === String(year));
      const hostingY = staysY.reduce((sum, s) => sum + stayTotal(s), 0);
      const nights = staysY.reduce((sum, s) => sum + (Number(s.nights) || 0), 0);
      const rent = resolveRent({ tenantRent: rentByProp.get(p.id), targetRent: p.target_rent }).value;
      const hasTenant = (rentByProp.get(p.id) || 0) > 0;
      const mode: Mode = staysY.length ? 'short' : hasTenant ? 'long' : 'vacant';
      const revenue = mode === 'short' ? hostingY : mode === 'long' ? rent * monthsElapsed : 0;
      const expenses = exp.filter(e => e.property_id === p.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const occupancy = mode === 'short' ? Math.min(100, Math.round((nights / daysElapsed) * 100)) : null;
      const unpaid = bills.filter(b => b.property_id === p.id && !b.paid).length;
      const chkAtt = chk.filter(c => c.property_id === p.id && ((c.due_date && new Date(c.due_date).getTime() < nowMs) || c.priority === 'critical')).length;
      return {
        id: p.id, name: p.name, typeLabel: PROP_LABEL[p.prop_type || ''] || p.prop_type || 'Ακίνητο', mode,
        revenue, expenses, net: revenue - expenses, occupancy, nights, pending: unpaid + chkAtt,
      };
    });
  }, [properties, stays, bills, exp, tenants, chk, year, monthsElapsed, daysElapsed, nowMs]);

  const sorted = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name, 'el') * dir;
      const av = sort === 'occupancy' ? (a.occupancy ?? -1) : a[sort];
      const bv = sort === 'occupancy' ? (b.occupancy ?? -1) : b[sort];
      return (av - bv) * dir;
    });
  }, [rows, sort, asc]);

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = rows.reduce((s, r) => s + r.expenses, 0);
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);
  const shortRows = rows.filter(r => r.occupancy != null);
  const avgOcc = shortRows.length ? Math.round(shortRows.reduce((s, r) => s + (r.occupancy || 0), 0) / shortRows.length) : null;

  const toggleSort = (key: SortKey) => { if (sort === key) setAsc(a => !a); else { setSort(key); setAsc(key === 'name'); } };

  const exportCsv = () => {
    const head = ['Ακίνητο', 'Τύπος', 'Κατάσταση', 'Έσοδα έτους', 'Δαπάνες έτους', 'Καθαρό', 'Πληρότητα %', 'Νύχτες', 'Εκκρεμότητες'];
    const lines = sorted.map(r => [r.name, r.typeLabel, MODE_LABEL[r.mode], Math.round(r.revenue), Math.round(r.expenses), Math.round(r.net), r.occupancy ?? '', r.nights, r.pending]);
    const csv = [head, ...lines].map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `xartofylakio_${year}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  if (loading) return (
    <div>
      <PageTitle title="Χαρτοφυλάκιο" sub="Συγκεντρωτική εικόνα όλων των ακινήτων σου" />
      <SkeletonKPIs n={4} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[0, 1, 2, 3].map(i => <Skeleton key={i} h={54} />)}</div>
    </div>
  );

  if (!properties.length) return (
    <div>
      <PageTitle title="Χαρτοφυλάκιο" sub="Συγκεντρωτική εικόνα όλων των ακινήτων σου" />
      <EmptyState title="Δεν υπάρχουν ακόμη ακίνητα" hint="Πρόσθεσε το πρώτο σου ακίνητο για να δεις τη συγκεντρωτική εικόνα εδώ." />
    </div>
  );

  return (
    <div>
      <PageTitle title="Χαρτοφυλάκιο" sub={`${properties.length} ${properties.length === 1 ? 'ακίνητο' : 'ακίνητα'} · έσοδα & εκκρεμότητες ${year}`}
        right={<ExportButton onClick={exportCsv} label="Εξαγωγή CSV" />} />

      <KPIGrid columns={5} items={[
        { label: 'Ακίνητα', value: String(properties.length) },
        { label: `Έσοδα ${year}`, value: eur(totalRevenue), tone: 'positive' },
        { label: `Καθαρό ${year}`, value: eur(totalRevenue - totalExpenses), sub: `δαπάνες ${eur(totalExpenses)}`, tone: (totalRevenue - totalExpenses) >= 0 ? 'positive' : 'negative' },
        { label: 'Μέση πληρότητα', value: avgOcc != null ? `${avgOcc}%` : '—', sub: shortRows.length ? `${shortRows.length} βραχυχρόνια` : 'χωρίς βραχυχρόνια' },
        { label: 'Εκκρεμότητες', value: String(totalPending), tone: totalPending > 0 ? 'warning' : 'positive' },
      ]} />

      {/* Πίνακας ανά ακίνητο, με οριζόντια κύλιση σε στενή οθόνη */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <Th label="Ακίνητο" k="name" sort={sort} asc={asc} onSort={toggleSort} align="left" />
                <Th label="Κατάσταση" align="left" />
                <Th label="Έσοδα" k="revenue" sort={sort} asc={asc} onSort={toggleSort} />
                <Th label="Δαπάνες" align="right" />
                <Th label="Καθαρό" k="net" sort={sort} asc={asc} onSort={toggleSort} />
                <Th label="Πληρότητα" k="occupancy" sort={sort} asc={asc} onSort={toggleSort} />
                <Th label="Εκκρεμ." k="pending" sort={sort} asc={asc} onSort={toggleSort} />
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} onClick={() => onSelectProperty(r.id)} className="portfolio-row"
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}>
                  <td style={{ padding: '13px 14px' }}>
                    <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
                    <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)' }}>{r.typeLabel}</div>
                  </td>
                  <td style={{ padding: '13px 14px' }}>
                    <Badge tone={r.mode === 'short' ? 'accent' : r.mode === 'long' ? 'positive' : 'neutral'}>{MODE_LABEL[r.mode]}</Badge>
                  </td>
                  <Num v={eur(r.revenue)} />
                  <Num v={eur(r.expenses)} muted />
                  <Num v={eur(r.net)} tone={r.net >= 0 ? 'var(--positive)' : 'var(--negative)'} bold />
                  <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                    {r.occupancy != null
                      ? <span style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 13, color: 'var(--text-primary)' }}>{r.occupancy}%</span>
                      : <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                    {r.pending > 0
                      ? <span style={{ display: 'inline-flex', minWidth: 22, height: 22, borderRadius: 11, background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontFamily: T.font.sans, fontSize: 11, fontWeight: 700, alignItems: 'center', justifyContent: 'center', padding: '0 7px' }}>{r.pending}</span>
                      : <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>}
                  </td>
                  <td style={{ padding: '13px 14px', textAlign: 'right' }}>
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 10, fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        Έσοδα βραχυχρόνιας από τις καταχωρημένες διαμονές· μακροχρόνιας από το ενοίκιο επί τους μήνες του έτους. Πληρότητα = νύχτες προς τις ημέρες που έχουν περάσει φέτος. Κλικ σε ακίνητο για την πλήρη Επισκόπηση.
      </div>

      <style>{`.portfolio-row:hover{background:var(--bg-hover)}`}</style>
    </div>
  );
}

function Th({ label, k, sort, asc, onSort, align = 'right' }: { label: string; k?: SortKey; sort?: SortKey; asc?: boolean; onSort?: (k: SortKey) => void; align?: 'left' | 'right' }) {
  const active = k && sort === k;
  return (
    <th onClick={k && onSort ? () => onSort(k) : undefined}
      style={{ padding: '11px 14px', textAlign: align, fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: active ? 'var(--accent)' : 'var(--text-tertiary)', cursor: k ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
      {label}{active ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  );
}

function Num({ v, muted, bold, tone }: { v: string; muted?: boolean; bold?: boolean; tone?: string }) {
  return (
    <td style={{ padding: '13px 14px', textAlign: 'right', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: bold ? 700 : 400, color: tone || (muted ? 'var(--text-secondary)' : 'var(--text-primary)') }}>{v}</td>
  );
}

const MODE_LABEL: Record<Mode, string> = { short: 'Βραχυχρόνια', long: 'Μισθωμένο', vacant: 'Κενό' };
const PROP_LABEL: Record<string, string> = {
  apartment: 'Διαμέρισμα', house: 'Μονοκατοικία', maisonette: 'Μεζονέτα', studio: 'Στούντιο',
  shop: 'Κατάστημα', office: 'Γραφείο', warehouse: 'Αποθήκη', land: 'Οικόπεδο', parking: 'Θέση στάθμευσης', other: 'Άλλο',
};
