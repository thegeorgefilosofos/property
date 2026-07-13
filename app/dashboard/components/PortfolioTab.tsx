'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortfolioTab — συγκεντρωτική εικόνα ΟΛΩΝ των ακινήτων, για επαγγελματίες
// διαχειριστές με πολλά ακίνητα. Έσοδα / δαπάνες / καθαρό / πληρότητα /
// εκκρεμότητες ανά ακίνητο, με ένα κλικ στην πλήρη Επισκόπηση του καθενός.
// Καμία εφεύρεση: μόνο πραγματικά δεδομένα που έχει καταχωρήσει ο χρήστης.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, PageTitle, KPIGrid, Badge, Btn, ExportButton, EmptyState, SecHdr, SkeletonKPIs, Skeleton } from '@/components/Theme';
import { resolveRent } from '@/lib/billing/propertyFacts';
import { stayTotal } from '@/lib/clients/clients';
import { portfolioReturns } from '@/lib/market/portfolio';
import { downloadCsv } from './exportCsv';

interface PropLite { id: string; name: string; prop_type: string | null; address: string | null; target_rent: number | null; value: number | null; }
interface Props { properties: PropLite[]; userId: string; onSelectProperty: (id: string) => void; }

const eur = (n: number) => `${Math.round(n).toLocaleString('el-GR')} €`;
type Mode = 'short' | 'long' | 'vacant';

interface Row {
  id: string; name: string; typeLabel: string; mode: Mode;
  revenue: number; expenses: number; net: number;
  occupancy: number | null; nights: number; pending: number;
  value: number; annualRevenue: number; annualExpenses: number;
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
  const [propOwners, setPropOwners] = useState<{ id: string; client_id: string | null }[]>([]);
  const [clients, setClients] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortKey>('net');
  const [asc, setAsc] = useState(false);

  // Μαζικές ενέργειες σε επιλεγμένα ακίνητα
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulk, setShowBulk] = useState(false);
  const [bulkDesc, setBulkDesc] = useState('');
  const [bulkCat, setBulkCat] = useState('maintenance');
  const [bulkPriority, setBulkPriority] = useState('normal');
  const [bulkSaving, setBulkSaving] = useState(false);
  // Καταστάσεις ιδιοκτήτη
  const [showStatements, setShowStatements] = useState(false);
  const [stmtOwner, setStmtOwner] = useState('');
  const [toast, setToast] = useState('');

  const showToast = useCallback((msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 3200); }, []);

  const load = useCallback(async () => {
    const [{ data: st }, { data: bl }, { data: ex }, { data: tn }, { data: ci }, { data: po }, { data: cl }] = await Promise.all([
      supabase.from('client_stays').select('property_id,check_in,check_out,total,nights,nightly_rate').eq('user_id', userId),
      supabase.from('bills').select('property_id,paid,amount,due_date').eq('user_id', userId),
      supabase.from('expenses').select('property_id,amount,date').eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('tenants').select('property_id,monthly_rent,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
      supabase.from('checklist_items').select('property_id,status,priority,due_date').eq('user_id', userId).neq('status', 'done').neq('status', 'skipped'),
      supabase.from('user_properties').select('id,client_id').eq('user_id', userId),
      supabase.from('clients').select('id,full_name').eq('user_id', userId),
    ]);
    setStays(st || []); setBills(bl || []); setExp(ex || []); setTenants(tn || []); setChk(ci || []); setPropOwners(po || []); setClients(cl || []); setLoading(false);
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
      // Ετησιοποίηση (εκτίμηση ρυθμού): μακροχρόνια = ενοίκιο×12· βραχυχρόνια = έσοδα ανά
      // ημέρα × 365· έξοδα ετησιοποιημένα με τους μήνες που πέρασαν (ομαλότερα από τις ημέρες).
      const annualRevenue = mode === 'long' ? rent * 12 : mode === 'short' ? Math.round(revenue * (365 / daysElapsed)) : 0;
      const annualExpenses = Math.round(expenses * (12 / monthsElapsed));
      return {
        id: p.id, name: p.name, typeLabel: PROP_LABEL[p.prop_type || ''] || p.prop_type || 'Ακίνητο', mode,
        revenue, expenses, net: revenue - expenses, occupancy, nights, pending: unpaid + chkAtt,
        value: p.value || 0, annualRevenue, annualExpenses,
      };
    });
  }, [properties, stays, bills, exp, tenants, chk, year, monthsElapsed, daysElapsed, nowMs]);

  const agg = useMemo(() => portfolioReturns(rows.map(r => ({ value: r.value, annualRevenue: r.annualRevenue, annualExpenses: r.annualExpenses }))), [rows]);

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

  // ── Μαζική επιλογή ──────────────────────────────────────────────────────
  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));
  const clearSelection = () => setSelected(new Set());

  // Μία εργασία ανά επιλεγμένο ακίνητο — ίδια πεδία με το insert του TabChecklist.
  const createBulkTask = async () => {
    const desc = bulkDesc.trim();
    if (!desc || selected.size === 0) return;
    setBulkSaving(true);
    const inserts = [...selected].map(pid => ({
      property_id: pid, user_id: userId, description: desc, category: bulkCat,
      priority: bulkPriority, recurring: 'none', status: 'pending', completed: false,
      note: null as string | null, estimated_cost: 0, actual_cost: 0, sort_order: 0,
    }));
    const { error } = await supabase.from('checklist_items').insert(inserts);
    setBulkSaving(false);
    if (error) { showToast('Κάτι πήγε στραβά — δοκίμασε ξανά'); return; }
    const n = inserts.length;
    setShowBulk(false); setBulkDesc(''); clearSelection();
    showToast(`Η εργασία προστέθηκε σε ${n} ${n === 1 ? 'ακίνητο' : 'ακίνητα'}`);
  };

  // ── Καταστάσεις ιδιοκτήτη ───────────────────────────────────────────────
  const ownerByProp = useMemo(() => {
    const m = new Map<string, string | null>();
    propOwners.forEach(p => m.set(p.id, p.client_id));
    return m;
  }, [propOwners]);
  const clientName = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach(c => m.set(c.id, c.full_name));
    return m;
  }, [clients]);

  const NO_OWNER = '__none__';
  interface OwnerGroup { id: string; name: string; rows: Row[]; revenue: number; expenses: number; net: number; }
  const owners: OwnerGroup[] = useMemo(() => {
    const groups = new Map<string, OwnerGroup>();
    rows.forEach(r => {
      const cid = ownerByProp.get(r.id) || null;
      const key = cid || NO_OWNER;
      const name = cid ? (clientName.get(cid) || 'Ιδιοκτήτης') : 'Χωρίς ιδιοκτήτη';
      const g = groups.get(key) || { id: key, name, rows: [], revenue: 0, expenses: 0, net: 0 };
      g.rows.push(r); g.revenue += r.revenue; g.expenses += r.expenses; g.net += r.net;
      groups.set(key, g);
    });
    return [...groups.values()].sort((a, b) =>
      a.id === NO_OWNER ? 1 : b.id === NO_OWNER ? -1 : a.name.localeCompare(b.name, 'el'));
  }, [rows, ownerByProp, clientName]);

  const stmt = useMemo(() => owners.find(o => o.id === stmtOwner) || owners[0], [owners, stmtOwner]);

  const openStatements = () => { if (!stmtOwner && owners.length) setStmtOwner(owners[0].id); setShowStatements(true); };

  const exportStatement = () => {
    if (!stmt) return;
    const head = ['Ακίνητο', 'Έσοδα έτους', 'Δαπάνες έτους', 'Καθαρό'];
    const lines: (string | number)[][] = stmt.rows.map(r => [r.name, Math.round(r.revenue), Math.round(r.expenses), Math.round(r.net)]);
    lines.push(['ΣΥΝΟΛΟ', Math.round(stmt.revenue), Math.round(stmt.expenses), Math.round(stmt.net)]);
    // Ασφαλής εξαγωγή (csvSafe: εξουδετερώνει =,+,-,@ ώστε να μη γίνει CSV/formula injection στο Excel).
    downloadCsv(`katastasi_${stmt.name.replace(/\s+/g, '_')}_${year}`, head, lines);
  };

  const printStatement = () => {
    if (!stmt) return;
    const w = window.open('', '_blank'); if (!w) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = stmt.rows.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${eur(r.revenue)}</td><td class="n">${eur(r.expenses)}</td><td class="n">${eur(r.net)}</td></tr>`).join('');
    w.document.write(`<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Κατάσταση ιδιοκτήτη — ${esc(stmt.name)}</title>
      <style>*{font-family:Inter,system-ui,Arial,sans-serif}body{margin:40px;color:#111}h1{font-size:20px;margin:0 0 4px}.sub{color:#666;font-size:12px;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px 10px;border-bottom:1px solid #e5e5e5}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
      tr.total td{font-weight:700;border-top:2px solid #111;border-bottom:none}</style></head>
      <body><h1>Κατάσταση ιδιοκτήτη — ${esc(stmt.name)}</h1><div class="sub">Έσοδα &amp; δαπάνες ${year} · ${stmt.rows.length} ${stmt.rows.length === 1 ? 'ακίνητο' : 'ακίνητα'}</div>
      <table><thead><tr><th>Ακίνητο</th><th class="n">Έσοδα</th><th class="n">Δαπάνες</th><th class="n">Καθαρό</th></tr></thead>
      <tbody>${body}<tr class="total"><td>Σύνολο</td><td class="n">${eur(stmt.revenue)}</td><td class="n">${eur(stmt.expenses)}</td><td class="n">${eur(stmt.net)}</td></tr></tbody></table></body></html>`);
    w.document.close(); w.focus(); w.print();
  };

  const fieldStyle: CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: T.radius.inner, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: T.font.sans, fontSize: 13, outline: 'none' };

  const exportCsv = () => {
    const head = ['Ακίνητο', 'Τύπος', 'Κατάσταση', 'Έσοδα έτους', 'Δαπάνες έτους', 'Καθαρό', 'Πληρότητα %', 'Νύχτες', 'Εκκρεμότητες'];
    const lines: (string | number)[][] = sorted.map(r => [r.name, r.typeLabel, MODE_LABEL[r.mode], Math.round(r.revenue), Math.round(r.expenses), Math.round(r.net), r.occupancy ?? '', r.nights, r.pending]);
    downloadCsv(`xartofylakio_${year}`, head, lines);
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
        right={<>
          <Btn variant="ghost" onClick={openStatements}>Καταστάσεις ιδιοκτήτη</Btn>
          <ExportButton onClick={exportCsv} label="Εξαγωγή CSV" />
        </>} />

      <KPIGrid columns={5} items={[
        { label: 'Ακίνητα', value: String(properties.length) },
        { label: `Έσοδα ${year}`, value: eur(totalRevenue), tone: 'positive' },
        { label: `Καθαρό ${year}`, value: eur(totalRevenue - totalExpenses), sub: `δαπάνες ${eur(totalExpenses)}`, tone: (totalRevenue - totalExpenses) >= 0 ? 'positive' : 'negative' },
        { label: 'Μέση πληρότητα', value: avgOcc != null ? `${avgOcc}%` : '—', sub: shortRows.length ? `${shortRows.length} βραχυχρόνια` : 'χωρίς βραχυχρόνια' },
        { label: 'Εκκρεμότητες', value: String(totalPending), tone: totalPending > 0 ? 'warning' : 'positive' },
      ]} />

      {/* Συγκεντρωτική απόδοση χαρτοφυλακίου (σταθμισμένη με την αξία) */}
      {agg.valuedCount > 0 && (
        <div className="card" style={{ marginTop: 12, padding: '16px 18px' }}>
          <SecHdr label="Απόδοση χαρτοφυλακίου" sub={`Σε ετήσια βάση (εκτίμηση ρυθμού) · ${agg.valuedCount} από ${agg.count} ${agg.count === 1 ? 'ακίνητο' : 'ακίνητα'} με καταχωρημένη αξία`} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 16, marginTop: 14 }}>
            <PStat label="Αξία χαρτοφυλακίου" value={eur(agg.totalValue)} />
            <PStat label="Ετήσια έσοδα" value={eur(agg.totalRevenue)} />
            <PStat label="Μεικτή απόδοση" value={`${agg.grossYield.toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
            <PStat label="Καθαρή απόδοση" value={`${agg.netYield.toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`} />
          </div>
        </div>
      )}

      {/* Πίνακας ανά ακίνητο, με οριζόντια κύλιση σε στενή οθόνη */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ width: 42, padding: '11px 0 11px 16px' }}>
                  <SelectBox checked={allSelected} indeterminate={selected.size > 0 && !allSelected} onChange={toggleAll} label="Επιλογή όλων" />
                </th>
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
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', background: selected.has(r.id) ? 'var(--accent-soft)' : undefined }}>
                  <td style={{ padding: '13px 0 13px 16px' }} onClick={e => e.stopPropagation()}>
                    <SelectBox checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} label={`Επιλογή ${r.name}`} />
                  </td>
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

      {/* Ήρεμη μπάρα μαζικών ενεργειών (Gmail/Linear style) */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 500, display: 'flex', alignItems: 'center', gap: 0, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 28, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', minWidth: 'min(480px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)' }}>
          <div style={{ padding: '12px 18px', borderRight: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
            <div style={{ minWidth: 24, height: 24, padding: '0 6px', borderRadius: 6, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--accent-text)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{selected.size}</div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontFamily: T.font.sans }}>{allSelected ? 'όλα επιλεγμένα' : 'επιλεγμένα'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            {[
              { label: allSelected ? 'Καθαρισμός' : `Επιλογή όλων (${rows.length})`, fn: toggleAll, color: 'var(--text-secondary)', hoverBg: 'var(--bg-surface)' },
              { label: 'Νέα εργασία σε επιλεγμένα', fn: () => setShowBulk(true), color: 'var(--accent)', hoverBg: 'var(--accent-soft)' },
            ].map((a, i, arr) => (
              <button key={i} type="button" onClick={a.fn}
                style={{ flex: 1, padding: '12px 6px', border: 'none', borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: a.color, fontWeight: 600, fontSize: 13, transition: 'background 0.15s', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}
                onMouseEnter={e => e.currentTarget.style.background = a.hoverBg}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {a.label}
              </button>
            ))}
          </div>
          <button type="button" aria-label="Ακύρωση επιλογής" onClick={clearSelection}
            style={{ padding: '12px 16px', border: 'none', borderLeft: '1px solid var(--border-subtle)', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-surface)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>✕</button>
        </div>
      )}

      {/* Modal: νέα εργασία σε επιλεγμένα ακίνητα */}
      {showBulk && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => !bulkSaving && setShowBulk(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 460, border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
            <h3 style={{ color: 'var(--text-primary)', margin: '0 0 4px', fontSize: 18, fontWeight: 700, fontFamily: T.font.sans }}>Νέα εργασία σε επιλεγμένα</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 12, margin: '0 0 20px', fontFamily: T.font.sans }}>Δημιουργείται μία ίδια εργασία σε {selected.size} {selected.size === 1 ? 'ακίνητο' : 'ακίνητα'}.</p>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6 }}>Περιγραφή</label>
            <input autoFocus value={bulkDesc} onChange={e => setBulkDesc(e.target.value)} placeholder="π.χ. Έλεγχος κλιματιστικών" style={{ ...fieldStyle, marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6 }}>Κατηγορία</label>
                <select value={bulkCat} onChange={e => setBulkCat(e.target.value)} style={fieldStyle}>
                  {TASK_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6 }}>Προτεραιότητα</label>
                <select value={bulkPriority} onChange={e => setBulkPriority(e.target.value)} style={fieldStyle}>
                  {TASK_PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="secondary" onClick={() => setShowBulk(false)} disabled={bulkSaving}>Ακύρωση</Btn>
              <Btn variant="primary" onClick={createBulkTask} disabled={bulkSaving || !bulkDesc.trim()}>{bulkSaving ? 'Δημιουργία…' : 'Δημιουργία'}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Modal: κατάσταση ιδιοκτήτη */}
      {showStatements && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }} onClick={() => setShowStatements(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-elevated)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 640, maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', border: '1px solid var(--border-subtle)', boxShadow: '0 24px 64px rgba(0,0,0,0.45)' }}>
            <SecHdr label="Καταστάσεις ιδιοκτήτη" sub={`Έσοδα, δαπάνες & καθαρό ανά ακίνητο · ${year}`}
              right={<button type="button" aria-label="Κλείσιμο" onClick={() => setShowStatements(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, lineHeight: 1 }}>✕</button>} />
            <select value={stmt?.id || ''} onChange={e => setStmtOwner(e.target.value)} style={{ ...fieldStyle, marginBottom: 18 }}>
              {owners.map(o => <option key={o.id} value={o.id}>{o.name} · {o.rows.length} {o.rows.length === 1 ? 'ακίνητο' : 'ακίνητα'}</option>)}
            </select>

            {stmt && (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 440 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <Th label="Ακίνητο" align="left" />
                        <Th label="Έσοδα" align="right" />
                        <Th label="Δαπάνες" align="right" />
                        <Th label="Καθαρό" align="right" />
                      </tr>
                    </thead>
                    <tbody>
                      {stmt.rows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                          <td style={{ padding: '11px 14px', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</td>
                          <Num v={eur(r.revenue)} />
                          <Num v={eur(r.expenses)} muted />
                          <Num v={eur(r.net)} tone={r.net >= 0 ? 'var(--positive)' : 'var(--negative)'} bold />
                        </tr>
                      ))}
                      <tr style={{ borderTop: '2px solid var(--border-subtle)' }}>
                        <td style={{ padding: '13px 14px', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Σύνολο</td>
                        <Num v={eur(stmt.revenue)} bold />
                        <Num v={eur(stmt.expenses)} muted bold />
                        <Num v={eur(stmt.net)} tone={stmt.net >= 0 ? 'var(--positive)' : 'var(--negative)'} bold />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                  <Btn variant="secondary" onClick={printStatement}>Εκτύπωση / PDF</Btn>
                  <ExportButton onClick={exportStatement} label="Εξαγωγή CSV" />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Διακριτικό μήνυμα επιβεβαίωσης */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 1100, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '10px 18px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: 'calc(100vw - 24px)' }}>
          {toast}
        </div>
      )}

      <style>{`.portfolio-row:hover{background:var(--bg-hover)}`}</style>
    </div>
  );
}

const TASK_CATEGORIES = [
  { id: 'maintenance', label: 'Συντήρηση' },
  { id: 'legal', label: 'Νομικά / ΑΑΔΕ' },
  { id: 'financial', label: 'Οικονομικά' },
  { id: 'checkin', label: 'Παράδοση Ακινήτου' },
  { id: 'checkout', label: 'Αποχώρηση Ενοικιαστή' },
  { id: 'airbnb', label: 'Short-term / Airbnb' },
  { id: 'other', label: 'Άλλο' },
];
const TASK_PRIORITIES = [
  { value: 'normal', label: 'Κανονική' },
  { value: 'high', label: 'Υψηλή' },
  { value: 'critical', label: 'Κρίσιμο' },
  { value: 'low', label: 'Χαμηλή' },
];

// Ήσυχο checkbox επιλογής (ίδιο ύφος με το TabChecklist)
function SelectBox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string }) {
  const on = checked || indeterminate;
  return (
    <button type="button" aria-label={label} onClick={e => { e.stopPropagation(); onChange(); }}
      style={{ width: 18, height: 18, borderRadius: 5, border: '2px solid ' + (on ? 'var(--accent)' : 'var(--border-default)'), background: on ? 'var(--accent)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', flexShrink: 0 }}>
      {checked
        ? <svg width="10" height="10" viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3" fill="none" stroke="var(--accent-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        : indeterminate ? <div style={{ width: 8, height: 2, borderRadius: 1, background: 'var(--accent-text)' }} /> : null}
    </button>
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

function PStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: T.font.sans, fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)' }}>{label}</div>
      <div style={{ fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', marginTop: 3 }}>{value}</div>
    </div>
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
