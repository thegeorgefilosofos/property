'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Πελατολόγιο (CRM) — ιδιοκτήτες / υποψήφιοι / πελάτες με ελαφρύ pipeline
// ευκαιριών και σύνδεση ακινήτων ανά πελάτη. Cross-property tab (ανά χρήστη).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, PageTitle, KPIGrid, Badge, InfoBanner, Btn, ExportButton, EmptyState, Spinner, fe } from '@/components/Theme';
import { DatePicker } from './UIComponents';
import { downloadCsv } from './exportCsv';
import {
  CLIENT_TYPES, CLIENT_TYPE_LABELS, PIPELINE_STAGES, STAGE_LABELS,
  isValidAfm, pipelineValue, dueActions, type ClientType, type Stage,
} from '@/lib/clients/clients';

interface Client {
  id: string; user_id: string; type: ClientType; full_name: string;
  afm: string | null; phone: string | null; email: string | null; notes: string | null;
  stage: Stage; deal_value: number | null; next_action: string | null; next_date: string | null;
  created_at: string; updated_at: string;
}
interface PropRow { id: string; name: string; prop_type: string | null; status_detail: string | null; client_id: string | null; }

// Τύπος πελάτη = καθαρά κατηγορικό → ουδέτερο badge (χωρίς διακοσμητικό χρώμα).
const TYPE_TONE: Record<ClientType, 'neutral'> = { owner: 'neutral', lead: 'neutral', client: 'neutral' };
// Στάδιο: μόνο το «κλεισμένο» κρατά θετικό χρώμα ως γνήσια θετική έκβαση· τα υπόλοιπα ουδέτερα.
const STAGE_TONE: Record<Stage, 'neutral' | 'info' | 'warning' | 'positive'> = { lead: 'neutral', viewing: 'neutral', offer: 'neutral', closed: 'positive' };
const todayStr = () => new Date().toISOString().slice(0, 10);

const emptyForm = (): Partial<Client> => ({
  type: 'lead', full_name: '', afm: '', phone: '', email: '', notes: '',
  stage: 'lead', deal_value: null, next_action: '', next_date: null,
});

export default function TabClients({ userId, onSelectProperty }: { userId: string; onSelectProperty?: (id: string) => void }) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [props, setProps] = useState<PropRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ClientType>('all');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<Partial<Client>>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [{ data: cl }, { data: pr }] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('user_properties').select('id,name,prop_type,status_detail,client_id').eq('user_id', userId).order('created_at'),
    ]);
    setClients((cl || []) as Client[]);
    setProps((pr || []) as PropRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel('clients-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  const propsByClient = useMemo(() => {
    const m = new Map<string, PropRow[]>();
    props.forEach(p => { if (p.client_id) { const a = m.get(p.client_id) || []; a.push(p); m.set(p.client_id, a); } });
    return m;
  }, [props]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients.filter(c =>
      (typeFilter === 'all' || c.type === typeFilter) &&
      (!q || [c.full_name, c.afm, c.phone, c.email].some(v => (v || '').toLowerCase().includes(q))));
  }, [clients, search, typeFilter]);

  const kpis = useMemo(() => {
    const due = dueActions(clients, new Date());
    return [
      { label: 'Σύνολο επαφών', value: String(clients.length) },
      { label: 'Υποψήφιοι', value: String(clients.filter(c => c.type === 'lead').length) },
      { label: 'Αξία ευκαιριών', value: fe(pipelineValue(clients), 0) },
      { label: 'Ενέργειες που λήγουν', value: String(due), tone: due > 0 ? 'warning' as const : 'neutral' as const },
    ];
  }, [clients]);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (c: Client) => { setEditing(c); setForm({ ...c, afm: c.afm || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '', next_action: c.next_action || '' }); setModalOpen(true); };

  const save = async () => {
    if (!form.full_name?.trim()) return;
    setSaving(true);
    const payload = {
      user_id: userId, type: form.type || 'lead', full_name: form.full_name.trim(),
      afm: form.afm?.trim() || null, phone: form.phone?.trim() || null, email: form.email?.trim() || null,
      notes: form.notes?.trim() || null, stage: form.stage || 'lead',
      deal_value: typeof form.deal_value === 'number' ? form.deal_value : (form.deal_value ? parseFloat(String(form.deal_value)) : null),
      next_action: form.next_action?.trim() || null, next_date: form.next_date || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) await supabase.from('clients').update(payload).eq('id', editing.id);
    else await supabase.from('clients').insert(payload);
    setSaving(false); setModalOpen(false); load();
  };

  const del = async (c: Client) => {
    if (!confirm('Να διαγραφεί η καταχώρηση;')) return;
    await supabase.from('clients').delete().eq('id', c.id);
    load();
  };

  const setStage = async (c: Client, stage: Stage) => {
    await supabase.from('clients').update({ stage, updated_at: new Date().toISOString() }).eq('id', c.id);
    load();
  };

  const linkProperty = async (clientId: string, propId: string) => {
    await supabase.from('user_properties').update({ client_id: propId ? clientId : null }).eq('id', propId);
    load();
  };
  const unlinkProperty = async (propId: string) => {
    await supabase.from('user_properties').update({ client_id: null }).eq('id', propId);
    load();
  };

  const exportCsv = () => {
    const rows = clients.map(c => [
      CLIENT_TYPE_LABELS[c.type] || c.type, c.full_name, c.afm || '', c.phone || '', c.email || '',
      STAGE_LABELS[c.stage] || c.stage, c.deal_value != null ? String(Math.round(c.deal_value)) : '',
      c.next_action || '', c.next_date || '', (propsByClient.get(c.id) || []).map(p => p.name).join(' | '),
    ]);
    downloadCsv(`pelatologio_${todayStr()}`, ['Τύπος', 'Ονοματεπώνυμο', 'ΑΦΜ', 'Τηλέφωνο', 'Email', 'Στάδιο', 'Αξία ευκαιρίας', 'Επόμενη ενέργεια', 'Ημερομηνία', 'Ακίνητα'], rows);
  };

  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, letterSpacing: 0, height: 42, width: '100%', outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block', marginBottom: 7, fontFamily: T.font.sans };
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: 20, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500, whiteSpace: 'nowrap' });

  const overdue = (c: Client) => c.next_date != null && c.stage !== 'closed' && c.next_date <= todayStr();

  if (loading) return <Spinner label="Φόρτωση…" />;

  const unlinkedProps = props.filter(p => !p.client_id);

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle title="Πελατολόγιο" sub="Ιδιοκτήτες, υποψήφιοι και πελάτες, με τις ευκαιρίες και τα ακίνητά τους σε ένα σημείο."
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ExportButton onClick={exportCsv} /><Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn></div>} />

      <KPIGrid items={kpis} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, ΑΦΜ, τηλεφώνου…"
          style={{ ...inp, maxWidth: 280, width: 'auto', flex: '1 1 220px' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={chip(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>Όλοι</button>
          {CLIENT_TYPES.map(t => <button key={t} style={chip(typeFilter === t)} onClick={() => setTypeFilter(t)}>{CLIENT_TYPE_LABELS[t]}</button>)}
        </div>
        <div style={{ display: 'flex', gap: 0, marginLeft: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden' }}>
          {(['list', 'board'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '7px 16px', border: 'none', background: view === v ? 'var(--accent)' : 'transparent', color: view === v ? 'var(--accent-text)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500 }}>{v === 'list' ? 'Λίστα' : 'Στάδια'}</button>
          ))}
        </div>
      </div>

      {clients.length === 0 ? (
        <EmptyState title="Δεν υπάρχουν καταχωρήσεις ακόμη" hint="Πρόσθεσε ιδιοκτήτες, υποψήφιους ή πελάτες και σύνδεσέ τους με τα ακίνητά σου." action={<Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn>} />
      ) : view === 'list' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 14 }}>
          {filtered.map(c => {
            const linked = propsByClient.get(c.id) || [];
            return (
              <div key={c.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                    {c.afm && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, marginTop: 2 }}>ΑΦΜ {c.afm}</div>}
                  </div>
                  <Badge tone={TYPE_TONE[c.type]}>{CLIENT_TYPE_LABELS[c.type]}</Badge>
                </div>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</a>}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <Badge tone={STAGE_TONE[c.stage]}>{STAGE_LABELS[c.stage]}</Badge>
                  {c.deal_value != null && <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num }}>{fe(c.deal_value, 0)}</span>}
                </div>

                {c.next_action && (
                  <div style={{ fontSize: 12, color: overdue(c) ? 'var(--negative)' : 'var(--text-secondary)' }}>
                    {c.next_action}{c.next_date && <span style={{ marginLeft: 6, fontSize: 11 }}>· {overdue(c) ? 'Εκπρόθεσμο' : 'Λήγει'} {new Date(c.next_date).toLocaleDateString('el-GR')}</span>}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 10 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-tertiary)', marginBottom: 6 }}>Ακίνητα</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {linked.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>}
                    {linked.map(p => (
                      <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                        <button onClick={() => onSelectProperty?.(p.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 11, padding: 0, fontFamily: T.font.sans }}>{p.name}</button>
                        <button onClick={() => unlinkProperty(p.id)} title="Αποσύνδεση" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>
                  {unlinkedProps.length > 0 && (
                    <select value="" onChange={e => { if (e.target.value) linkProperty(c.id, e.target.value); }} style={{ ...inp, cursor: 'pointer', fontSize: 12 }}>
                      <option value="">Σύνδεση ακινήτου…</option>
                      {unlinkedProps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Btn variant="ghost" onClick={() => del(c)}>Διαγραφή</Btn>
                  <Btn variant="secondary" onClick={() => openEdit(c)}>Επεξεργασία</Btn>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12 }}>
          {PIPELINE_STAGES.map(stage => {
            const col = filtered.filter(c => c.stage === stage);
            const sum = col.reduce((s, c) => s + (c.deal_value || 0), 0);
            return (
              <div key={stage} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 12, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{STAGE_LABELS[stage]} · {col.length}</span>
                  {sum > 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num }}>{fe(sum, 0)}</span>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {col.map(c => (
                    <div key={c.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                        <button onClick={() => openEdit(c)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, textAlign: 'left', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</button>
                        <Badge tone={TYPE_TONE[c.type]}>{CLIENT_TYPE_LABELS[c.type]}</Badge>
                      </div>
                      {c.deal_value != null && <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.num, marginBottom: 6 }}>{fe(c.deal_value, 0)}</div>}
                      {c.next_action && <div style={{ fontSize: 11, color: overdue(c) ? 'var(--negative)' : 'var(--text-tertiary)', marginBottom: 8 }}>{c.next_action}</div>}
                      <select value={c.stage} onChange={e => setStage(c, e.target.value as Stage)} style={{ ...inp, cursor: 'pointer', fontSize: 11, padding: '5px 8px' }}>
                        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </div>
                  ))}
                  {col.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, width: 'min(560px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>{editing ? 'Επεξεργασία καταχώρησης' : 'Νέα καταχώρηση'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Ονοματεπώνυμο *</label>
                <input style={inp} value={form.full_name || ''} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} autoFocus />
              </div>
              <div>
                <label style={lbl}>Τύπος</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={form.type || 'lead'} onChange={e => setForm(f => ({ ...f, type: e.target.value as ClientType }))}>
                  {CLIENT_TYPES.map(t => <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>ΑΦΜ</label>
                <input style={inp} value={form.afm || ''} onChange={e => setForm(f => ({ ...f, afm: e.target.value.replace(/[^0-9]/g, '').slice(0, 9) }))} inputMode="numeric" />
                {form.afm && form.afm.length === 9 && !isValidAfm(form.afm) && <div style={{ fontSize: 10, color: 'var(--negative)', marginTop: 4 }}>Μη έγκυρο ΑΦΜ (9 ψηφία)</div>}
              </div>
              <div>
                <label style={lbl}>Τηλέφωνο</label>
                <input style={inp} value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} inputMode="tel" />
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input style={inp} type="email" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <label style={lbl}>Στάδιο</label>
                <select style={{ ...inp, cursor: 'pointer' }} value={form.stage || 'lead'} onChange={e => setForm(f => ({ ...f, stage: e.target.value as Stage }))}>
                  {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Αξία ευκαιρίας (€)</label>
                <input style={inp} type="number" inputMode="decimal" value={form.deal_value ?? ''} onChange={e => setForm(f => ({ ...f, deal_value: e.target.value ? parseFloat(e.target.value) : null }))} />
              </div>
              <div>
                <label style={lbl}>Επόμενη ενέργεια</label>
                <input style={inp} value={form.next_action || ''} onChange={e => setForm(f => ({ ...f, next_action: e.target.value }))} placeholder="π.χ. Επίσκεψη ακινήτου" />
              </div>
              <div>
                <label style={lbl}>Ημερομηνία ενέργειας</label>
                <DatePicker value={form.next_date || ''} onChange={v => setForm(f => ({ ...f, next_date: v || null }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={lbl}>Σημειώσεις</label>
                <textarea style={{ ...inp, height: 'auto', resize: 'vertical', minHeight: 70 }} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <Btn variant="ghost" onClick={() => setModalOpen(false)}>Ακύρωση</Btn>
              <Btn variant="primary" onClick={save} disabled={saving || !form.full_name?.trim()}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
