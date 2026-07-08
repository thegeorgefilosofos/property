'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Πελατολόγιο (CRM): πλήρης σχέση & αρχείο φιλοξενίας ανά πελάτη/επισκέπτη.
// Βαθμολογία, σχόλια/χρονολόγιο, ΑΦΜ, επικοινωνία, διεύθυνση, ιστορικό διαμονών,
// φθορές, τιμή/έσοδα, ανάγκες/προϋπολογισμός (μεσίτες). Cross-property (ανά χρήστη).
// Σχεδίαση: near-monochrome μπλε· χρώμα μόνο σε γνήσια σήματα (φθορές/μαύρη λίστα).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  T, PageTitle, KPIGrid, Badge, InfoBanner, Btn, ExportButton, EmptyState, Spinner, SecHdr, fe, fd,
} from '@/components/Theme';
import { NumberInput, TextInput, CustomSelect, DatePicker, Textarea } from './UIComponents';
import { downloadCsv } from './exportCsv';
import {
  CLIENT_TYPES, CLIENT_TYPE_LABELS, PIPELINE_STAGES, STAGE_LABELS,
  isValidAfm, stayNights, clientStats, normalizePhone,
  clientMatches, STAY_CHANNELS, STAY_CHANNEL_LABELS, NOTE_KINDS, NOTE_KIND_LABELS,
  type ClientType, type Stage,
} from '@/lib/clients/clients';

// ── Τύποι εγγραφών (καθρέφτης πινάκων Supabase) ─────────────────────────────
interface Client {
  id: string; user_id: string; type: ClientType; full_name: string;
  afm: string | null; phone: string | null; email: string | null; notes: string | null;
  stage: Stage; deal_value: number | null; next_action: string | null; next_date: string | null;
  created_at: string; updated_at: string;
  rating: number | null; tags: string[] | null; do_not_rent: boolean | null;
  address: string | null; id_number: string | null; nationality: string | null;
  budget: number | null; needs: string | null; source: string | null;
}
interface Stay {
  id: string; user_id: string; client_id: string; property_id: string | null;
  check_in: string | null; check_out: string | null; nights: number | null; guests: number | null;
  nightly_rate: number | null; total: number | null; channel: string | null; rating: number | null;
  damages: boolean | null; damage_cost: number | null; damage_note: string | null;
  notes: string | null; created_at: string;
}
interface Note { id: string; user_id: string; client_id: string; kind: string; body: string; created_at: string; }
interface PropRow { id: string; name: string; prop_type: string | null; status_detail: string | null; client_id: string | null; }

// Τύπος & στάδιο: κατηγορικά → ουδέτερα badges (χωρίς διακοσμητικό χρώμα).
const TYPE_TONE: Record<ClientType, 'neutral'> = { owner: 'neutral', lead: 'neutral', client: 'neutral' };
const STAGE_TONE: Record<Stage, 'neutral' | 'positive'> = { lead: 'neutral', viewing: 'neutral', offer: 'neutral', closed: 'positive' };
const todayStr = () => new Date().toISOString().slice(0, 10);

// Deep-links μηνυμάτων. Το normalizePhone αφαιρεί +30/0030· για 10ψήφιο κινητό
// προσθέτουμε ξανά τον κωδικό χώρας 30 ώστε τα wa.me/viber links να λειτουργούν.
const msgDigits = (p?: string | null) => { const d = normalizePhone(p); return d.length === 10 ? '30' + d : d; };
const waLink = (p?: string | null) => `https://wa.me/${msgDigits(p)}`;
const viberLink = (p?: string | null) => `viber://chat?number=%2B${msgDigits(p)}`;

const typeOptions = CLIENT_TYPES.map(t => ({ value: t, label: CLIENT_TYPE_LABELS[t] }));
const stageOptions = PIPELINE_STAGES.map(s => ({ value: s, label: STAGE_LABELS[s] }));
const channelOptions = STAY_CHANNELS.map(c => ({ value: c, label: STAY_CHANNEL_LABELS[c] }));
const noteKindOptions = NOTE_KINDS.map(k => ({ value: k, label: NOTE_KIND_LABELS[k] }));

// ── Κατάσταση φόρμας πελάτη (αριθμοί ως strings για τα NumberInput) ──────────
interface FormState {
  type: ClientType; full_name: string; afm: string; phone: string; email: string; notes: string;
  stage: Stage; deal_value: string; next_action: string; next_date: string;
  rating: number; tags: string[]; do_not_rent: boolean; address: string; id_number: string;
  nationality: string; source: string; budget: string; needs: string;
}
const emptyForm = (): FormState => ({
  type: 'lead', full_name: '', afm: '', phone: '', email: '', notes: '',
  stage: 'lead', deal_value: '', next_action: '', next_date: '',
  rating: 0, tags: [], do_not_rent: false, address: '', id_number: '',
  nationality: '', source: '', budget: '', needs: '',
});

interface StayForm {
  id?: string; property_id: string; check_in: string; check_out: string; nights: string;
  guests: string; nightly_rate: string; total: string; channel: string; rating: number;
  damages: boolean; damage_cost: string; damage_note: string; notes: string;
}
const emptyStay = (): StayForm => ({
  property_id: '', check_in: '', check_out: '', nights: '', guests: '', nightly_rate: '',
  total: '', channel: 'direct', rating: 0, damages: false, damage_cost: '', damage_note: '', notes: '',
});

// ── Βαθμολογία με αστέρια (γεμάτο = accent, κενό = border-default· χωρίς χρυσό) ─
function Stars({ value, max = 5, onSet, size = 15 }: { value: number; max?: number; onSet?: (n: number) => void; size?: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1, alignItems: 'center' }} title={onSet ? 'Ορισμός βαθμολογίας' : undefined}>
      {Array.from({ length: max }).map((_, i) => {
        const n = i + 1;
        const filled = n <= value;
        const star = (
          <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'var(--accent)' : 'var(--border-default)'} style={{ display: 'block' }}>
            <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z" />
          </svg>
        );
        return onSet ? (
          <button key={n} onClick={() => onSet(value === n ? 0 : n)} title={`${n}`}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 0 }}>{star}</button>
        ) : <span key={n} style={{ lineHeight: 0 }}>{star}</span>;
      })}
    </span>
  );
}

// ── Διακόπτης σήματος (μαύρη λίστα / φθορές) σε var(--negative) ─────────────
function FlagSwitch({ on, onChange, onLabel, offLabel, tone = 'negative' }: { on: boolean; onChange: (v: boolean) => void; onLabel: string; offLabel: string; tone?: 'negative' | 'warning' }) {
  const c = `var(--${tone})`;
  return (
    <button onClick={() => onChange(!on)} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
      <span style={{ width: 42, height: 24, borderRadius: 12, background: on ? c : 'transparent', border: `2px solid ${on ? c : 'var(--border-default)'}`, position: 'relative', transition: 'all .2s', flexShrink: 0, display: 'inline-block' }}>
        <span style={{ position: 'absolute', top: '50%', left: on ? 'calc(100% - 20px)' : 2, transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: '50%', background: on ? '#fff' : 'var(--text-secondary)', transition: 'all .2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)' }} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: on ? c : 'var(--text-secondary)', fontFamily: T.font.sans }}>{on ? onLabel : offLabel}</span>
    </button>
  );
}

// ── Επεξεργαστής ετικετών (chips) ───────────────────────────────────────────
function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => { const t = input.trim(); if (t && !tags.includes(t)) onChange([...tags, t]); setInput(''); };
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {tags.map(t => (
            <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '3px 9px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {t}
              <button onClick={() => onChange(tags.filter(x => x !== t))} title="Αφαίρεση" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add} placeholder="Ετικέτα και Enter (π.χ. VIP, ήσυχος)"
        style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, height: 42, outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans }} />
    </div>
  );
}

export default function TabClients({ userId, onSelectProperty }: { userId: string; onSelectProperty?: (id: string) => void }) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [props, setProps] = useState<PropRow[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ClientType>('all');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [view, setView] = useState<'list' | 'board'>('list');

  // Φόρμα νέου/επεξεργασίας πελάτη
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // Ντοσιέ (drawer)
  const [openId, setOpenId] = useState<string | null>(null);
  const openIdRef = useRef<string | null>(null);
  useEffect(() => { openIdRef.current = openId; }, [openId]);

  // Φόρμα διαμονής
  const [stayForm, setStayForm] = useState<StayForm>(emptyStay());
  const [stayFormOpen, setStayFormOpen] = useState(false);
  const [savingStay, setSavingStay] = useState(false);

  // Φόρμα σχολίου
  const [noteForm, setNoteForm] = useState<{ kind: string; body: string }>({ kind: 'note', body: '' });

  const load = useCallback(async () => {
    const [{ data: cl }, { data: pr }] = await Promise.all([
      supabase.from('clients').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('user_properties').select('id,name,prop_type,status_detail,client_id').eq('user_id', userId).order('created_at'),
    ]);
    setClients((cl || []) as Client[]);
    setProps((pr || []) as PropRow[]);
    setLoading(false);
  }, [userId]);

  const loadStays = useCallback(async () => {
    const { data } = await supabase.from('client_stays').select('*').eq('user_id', userId);
    setStays((data || []) as Stay[]);
  }, [userId]);

  const loadNotes = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('client_notes').select('*').eq('user_id', userId).eq('client_id', clientId).order('created_at', { ascending: false });
    setNotes((data || []) as Note[]);
  }, [userId]);

  useEffect(() => { load(); loadStays(); }, [load, loadStays]);

  // Real-time: clients / client_stays / client_notes
  useEffect(() => {
    const ch = supabase.channel('clients-crm-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_notes', filter: `user_id=eq.${userId}` }, () => { if (openIdRef.current) loadNotes(openIdRef.current); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_properties', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load, loadStays, loadNotes]);

  useEffect(() => { if (openId) loadNotes(openId); else setNotes([]); }, [openId, loadNotes]);

  const propsByClient = useMemo(() => {
    const m = new Map<string, PropRow[]>();
    props.forEach(p => { if (p.client_id) { const a = m.get(p.client_id) || []; a.push(p); m.set(p.client_id, a); } });
    return m;
  }, [props]);
  const propName = useCallback((id: string | null) => (id ? (props.find(p => p.id === id)?.name || id) : ''), [props]);

  const staysByClient = useMemo(() => {
    const m = new Map<string, Stay[]>();
    stays.forEach(s => { const a = m.get(s.client_id) || []; a.push(s); m.set(s.client_id, a); });
    return m;
  }, [stays]);
  const statsByClient = useMemo(() => {
    const m = new Map<string, ReturnType<typeof clientStats>>();
    staysByClient.forEach((arr, id) => m.set(id, clientStats(arr)));
    return m;
  }, [staysByClient]);

  const isFlagged = useCallback((c: Client) => !!c.do_not_rent || !!statsByClient.get(c.id)?.hasDamage, [statsByClient]);

  const filtered = useMemo(() => clients.filter(c =>
    (typeFilter === 'all' || c.type === typeFilter) &&
    (!flaggedOnly || isFlagged(c)) &&
    clientMatches(c, search)
  ), [clients, search, typeFilter, flaggedOnly, isFlagged]);

  const kpis = useMemo(() => {
    const revenue = clientStats(stays).revenue;
    const repeat = clients.filter(c => (staysByClient.get(c.id) || []).length >= 2).length;
    const flagged = clients.filter(isFlagged).length;
    return [
      { label: 'Σύνολο πελατών', value: String(clients.length) },
      { label: 'Έσοδα φιλοξενίας', value: fe(revenue, 0) },
      { label: 'Επαναλαμβανόμενοι', value: String(repeat), sub: 'με 2+ διαμονές' },
      { label: 'Επισήμανση', value: String(flagged), sub: 'μαύρη λίστα ή φθορές', tone: flagged > 0 ? 'warning' as const : 'neutral' as const },
    ];
  }, [clients, stays, staysByClient, isFlagged]);

  // ── Φόρμα πελάτη ──────────────────────────────────────────────────────────
  const openNew = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      type: c.type, full_name: c.full_name, afm: c.afm || '', phone: c.phone || '', email: c.email || '',
      notes: c.notes || '', stage: c.stage, deal_value: c.deal_value != null ? String(c.deal_value) : '',
      next_action: c.next_action || '', next_date: c.next_date || '',
      rating: c.rating || 0, tags: c.tags || [], do_not_rent: !!c.do_not_rent, address: c.address || '',
      id_number: c.id_number || '', nationality: c.nationality || '', source: c.source || '',
      budget: c.budget != null ? String(c.budget) : '', needs: c.needs || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };
    const payload = {
      user_id: userId, type: form.type, full_name: form.full_name.trim(),
      afm: form.afm.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null,
      notes: form.notes.trim() || null, stage: form.stage, deal_value: num(form.deal_value),
      next_action: form.next_action.trim() || null, next_date: form.next_date || null,
      rating: form.rating || 0, tags: form.tags, do_not_rent: form.do_not_rent,
      address: form.address.trim() || null, id_number: form.id_number.trim() || null,
      nationality: form.nationality.trim() || null, source: form.source.trim() || null,
      budget: num(form.budget), needs: form.needs.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) await supabase.from('clients').update(payload).eq('id', editing.id);
    else await supabase.from('clients').insert(payload);
    setSaving(false); setModalOpen(false); load();
  };

  const del = async (c: Client) => {
    if (!confirm('Να διαγραφεί η καταχώρηση;')) return;
    await supabase.from('clients').delete().eq('id', c.id);
    if (openId === c.id) setOpenId(null);
    load();
  };

  const setStage = async (c: Client, stage: Stage) => {
    await supabase.from('clients').update({ stage, updated_at: new Date().toISOString() }).eq('id', c.id);
    load();
  };

  // Άμεση αποθήκευση από το ντοσιέ (βαθμολογία / μαύρη λίστα / ετικέτες)
  const patchClient = async (id: string, patch: Partial<Client>) => {
    await supabase.from('clients').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
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

  // ── Διαμονές ──────────────────────────────────────────────────────────────
  const openStayNew = () => { setStayForm(emptyStay()); setStayFormOpen(true); };
  const openStayEdit = (s: Stay) => {
    setStayForm({
      id: s.id, property_id: s.property_id || '', check_in: s.check_in || '', check_out: s.check_out || '',
      nights: s.nights != null ? String(s.nights) : '', guests: s.guests != null ? String(s.guests) : '',
      nightly_rate: s.nightly_rate != null ? String(s.nightly_rate) : '', total: s.total != null ? String(s.total) : '',
      channel: s.channel || 'direct', rating: s.rating || 0, damages: !!s.damages,
      damage_cost: s.damage_cost != null ? String(s.damage_cost) : '', damage_note: s.damage_note || '', notes: s.notes || '',
    });
    setStayFormOpen(true);
  };
  const onStayDates = (patch: Partial<StayForm>) => setStayForm(f => {
    const nf = { ...f, ...patch };
    const n = stayNights(nf.check_in, nf.check_out);
    const rate = parseFloat(nf.nightly_rate) || 0;
    return { ...nf, nights: n ? String(n) : nf.nights, total: n && rate ? String(n * rate) : nf.total };
  });
  const onStayNights = (v: string) => setStayForm(f => { const n = parseFloat(v) || 0; const rate = parseFloat(f.nightly_rate) || 0; return { ...f, nights: v, total: n && rate ? String(n * rate) : f.total }; });
  const onStayRate = (v: string) => setStayForm(f => { const n = parseFloat(f.nights) || 0; const rate = parseFloat(v) || 0; return { ...f, nightly_rate: v, total: n && rate ? String(n * rate) : f.total }; });

  const saveStay = async () => {
    if (!openId) return;
    setSavingStay(true);
    const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };
    const nights = parseInt(stayForm.nights, 10) || stayNights(stayForm.check_in, stayForm.check_out) || null;
    const rate = num(stayForm.nightly_rate);
    const total = num(stayForm.total) ?? ((nights || 0) * (rate || 0) || null);
    const payload = {
      user_id: userId, client_id: openId, property_id: stayForm.property_id || null,
      check_in: stayForm.check_in || null, check_out: stayForm.check_out || null, nights,
      guests: parseInt(stayForm.guests, 10) || null, nightly_rate: rate, total,
      channel: stayForm.channel || null, rating: stayForm.rating || null, damages: stayForm.damages,
      damage_cost: stayForm.damages ? num(stayForm.damage_cost) : null,
      damage_note: stayForm.damages ? (stayForm.damage_note.trim() || null) : null,
      notes: stayForm.notes.trim() || null,
    };
    if (stayForm.id) await supabase.from('client_stays').update(payload).eq('id', stayForm.id);
    else await supabase.from('client_stays').insert(payload);
    setSavingStay(false); setStayFormOpen(false); loadStays();
  };
  const delStay = async (s: Stay) => { if (!confirm('Να διαγραφεί η διαμονή;')) return; await supabase.from('client_stays').delete().eq('id', s.id); loadStays(); };

  // ── Σχόλια ────────────────────────────────────────────────────────────────
  const saveNote = async () => {
    if (!openId || !noteForm.body.trim()) return;
    await supabase.from('client_notes').insert({ user_id: userId, client_id: openId, kind: noteForm.kind, body: noteForm.body.trim() });
    setNoteForm({ kind: 'note', body: '' }); loadNotes(openId);
  };
  const delNote = async (n: Note) => { await supabase.from('client_notes').delete().eq('id', n.id); if (openId) loadNotes(openId); };

  // ── Εξαγωγή CSV (εμπλουτισμένη) ────────────────────────────────────────────
  const exportCsv = () => {
    const rows = clients.map(c => {
      const st = statsByClient.get(c.id) || clientStats([]);
      return [
        CLIENT_TYPE_LABELS[c.type] || c.type, c.full_name, c.afm || '', c.phone || '', c.email || '',
        c.address || '', c.id_number || '', c.nationality || '', c.source || '',
        STAGE_LABELS[c.stage] || c.stage, c.deal_value != null ? String(Math.round(c.deal_value)) : '',
        c.rating != null ? String(c.rating) : '', (c.tags || []).join(' | '), c.do_not_rent ? 'ΝΑΙ' : '',
        String(st.stayCount), String(st.nights), String(Math.round(st.revenue)), String(Math.round(st.adr)),
        st.avgRating != null ? String(st.avgRating) : '', st.lastVisit || '', st.damageTotal ? String(Math.round(st.damageTotal)) : '',
        c.budget != null ? String(Math.round(c.budget)) : '', c.needs || '',
        (propsByClient.get(c.id) || []).map(p => p.name).join(' | '),
      ];
    });
    downloadCsv(`pelatologio_${todayStr()}`, [
      'Τύπος', 'Ονοματεπώνυμο', 'ΑΦΜ', 'Τηλέφωνο', 'Email', 'Διεύθυνση', 'Ταυτότητα', 'Εθνικότητα', 'Πηγή',
      'Στάδιο', 'Αξία ευκαιρίας', 'Βαθμολογία', 'Ετικέτες', 'Μαύρη λίστα',
      'Διαμονές', 'Νύχτες', 'Έσοδα', 'ADR', 'Μέση βαθμολογία', 'Τελευταία επίσκεψη', 'Φθορές',
      'Προϋπολογισμός', 'Ανάγκες', 'Ακίνητα',
    ], rows);
  };

  // ── Κοινά inline styles ────────────────────────────────────────────────────
  const inp: React.CSSProperties = { background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '10px 14px', color: 'var(--text-primary)', fontSize: 14, height: 42, width: '100%', outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', display: 'block', marginBottom: 7, fontFamily: T.font.sans };
  const chip = (active: boolean): React.CSSProperties => ({ padding: '7px 14px', borderRadius: 20, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500, whiteSpace: 'nowrap' });
  const msgLink: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', padding: '3px 9px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'var(--accent-soft)', whiteSpace: 'nowrap' };

  const overdue = (c: Client) => c.next_date != null && c.stage !== 'closed' && c.next_date <= todayStr();

  if (loading) return <Spinner label="Φόρτωση…" />;

  const unlinkedProps = props.filter(p => !p.client_id);
  const dc = openId ? clients.find(c => c.id === openId) || null : null;
  const dcStays = dc ? (staysByClient.get(dc.id) || []).slice().sort((a, b) => (b.check_in || '').localeCompare(a.check_in || '')) : [];
  const dcStats = dc ? clientStats(dcStays) : null;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle title="Πελατολόγιο" sub="Πλήρες αρχείο πελατών, επισκεπτών και ιδιοκτητών: βαθμολογία, ιστορικό διαμονών, φθορές και επικοινωνία σε ένα σημείο."
        right={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><ExportButton onClick={exportCsv} /><Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn></div>} />

      <KPIGrid items={kpis} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, ΑΦΜ, τηλεφώνου…"
          style={{ ...inp, maxWidth: 280, width: 'auto', flex: '1 1 220px' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={chip(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>Όλοι</button>
          {CLIENT_TYPES.map(t => <button key={t} style={chip(typeFilter === t)} onClick={() => setTypeFilter(t)}>{CLIENT_TYPE_LABELS[t]}</button>)}
          <button style={chip(flaggedOnly)} onClick={() => setFlaggedOnly(v => !v)}>Με επισήμανση</button>
        </div>
        <div style={{ display: 'flex', gap: 0, marginLeft: 'auto', border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden' }}>
          {(['list', 'board'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: '7px 16px', border: 'none', background: view === v ? 'var(--accent)' : 'transparent', color: view === v ? 'var(--accent-text)' : 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, fontWeight: 500 }}>{v === 'list' ? 'Λίστα' : 'Στάδια'}</button>
          ))}
        </div>
      </div>

      {clients.length === 0 ? (
        <EmptyState title="Δεν υπάρχουν καταχωρήσεις ακόμη" hint="Πρόσθεσε ιδιοκτήτες, υποψήφιους ή πελάτες, κατέγραψε τις διαμονές τους και σύνδεσέ τους με τα ακίνητά σου." action={<Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn>} />
      ) : view === 'list' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 14 }}>
          {filtered.map(c => {
            const linked = propsByClient.get(c.id) || [];
            const st = statsByClient.get(c.id) || clientStats([]);
            const broker = (c.type === 'client' || c.type === 'lead') && (c.budget != null || (c.needs && c.needs.trim()));
            return (
              <div key={c.id} style={{ background: 'var(--bg-surface)', border: `1px solid ${c.do_not_rent ? 'var(--negative-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</span>
                      {(c.rating || 0) > 0 && <Stars value={c.rating || 0} size={13} />}
                    </div>
                    {c.afm && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono, marginTop: 2 }}>ΑΦΜ {c.afm}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Badge tone={TYPE_TONE[c.type]}>{CLIENT_TYPE_LABELS[c.type]}</Badge>
                    {c.do_not_rent && <Badge tone="negative">Προσοχή</Badge>}
                    {st.hasDamage && !c.do_not_rent && <Badge tone="negative">Φθορές</Badge>}
                  </div>
                </div>

                {(c.tags || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(c.tags || []).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>{t}</span>)}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {c.phone && <a href={`tel:${c.phone}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</a>}
                  {c.phone && <a href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" style={msgLink}>WhatsApp</a>}
                  {c.phone && <a href={viberLink(c.phone)} style={msgLink}>Viber</a>}
                </div>

                {st.stayCount > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{st.stayCount} διαμονές</span><span style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span>{st.nights} νύχτες</span><span style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600, fontFamily: T.font.num }}>{fe(st.revenue, 0)}</span><span style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span title="Μέση τιμή ανά διανυκτέρευση">ADR {fe(st.adr, 0)}</span>
                    {st.lastVisit && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>τελ. {fd(st.lastVisit)}</span></>}
                  </div>
                )}

                {broker && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.budget != null && <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num }}>Προϋπ/σμός {fe(c.budget, 0)}</span>}
                    {c.needs && c.needs.trim() && <span style={{ marginLeft: c.budget != null ? 8 : 0 }}>{c.needs}</span>}
                  </div>
                )}

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
                    {linked.length === 0 && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>-</span>}
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

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Btn variant="ghost" onClick={() => del(c)}>Διαγραφή</Btn>
                  <Btn variant="secondary" onClick={() => openEdit(c)}>Επεξεργασία</Btn>
                  <Btn variant="primary" onClick={() => setOpenId(c.id)}>Άνοιγμα</Btn>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 6, alignItems: 'flex-start' }}>
                        <button onClick={() => setOpenId(c.id)} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600, padding: 0, textAlign: 'left', fontFamily: T.font.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</button>
                        {c.do_not_rent ? <Badge tone="negative">Προσοχή</Badge> : <Badge tone={TYPE_TONE[c.type]}>{CLIENT_TYPE_LABELS[c.type]}</Badge>}
                      </div>
                      {c.deal_value != null && <div style={{ fontSize: 12, fontWeight: 700, fontFamily: T.font.num, marginBottom: 6 }}>{fe(c.deal_value, 0)}</div>}
                      {c.next_action && <div style={{ fontSize: 11, color: overdue(c) ? 'var(--negative)' : 'var(--text-tertiary)', marginBottom: 8 }}>{c.next_action}</div>}
                      <select value={c.stage} onChange={e => setStage(c, e.target.value as Stage)} style={{ ...inp, cursor: 'pointer', fontSize: 11, padding: '5px 8px' }}>
                        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                      </select>
                    </div>
                  ))}
                  {col.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: '12px 0' }}>-</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Ντοσιέ πελάτη (drawer) ─────────────────────────────────────────── */}
      {dc && dcStats && (
        <div onClick={() => { setOpenId(null); setStayFormOpen(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 900, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', width: 'min(720px, 100%)', height: '100%', overflowY: 'auto', padding: 24, boxShadow: 'var(--elev-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{dc.full_name}</span>
                  <Badge tone={TYPE_TONE[dc.type]}>{CLIENT_TYPE_LABELS[dc.type]}</Badge>
                  {dc.do_not_rent && <Badge tone="negative">Μαύρη λίστα</Badge>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Stars value={dc.rating || 0} onSet={n => patchClient(dc.id, { rating: n })} size={20} />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{dc.rating ? `${dc.rating}/5` : 'Χωρίς βαθμολογία'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Btn variant="secondary" onClick={() => openEdit(dc)}>Επεξεργασία στοιχείων</Btn>
                <button onClick={() => setOpenId(null)} title="Κλείσιμο" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}>×</button>
              </div>
            </div>

            {dc.do_not_rent && <InfoBanner tone="negative">Ο πελάτης βρίσκεται στη μαύρη λίστα. Απαιτείται προσοχή πριν από νέα κράτηση ή συμφωνία.</InfoBanner>}

            {/* Μαύρη λίστα + ετικέτες */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20, marginTop: 14 }}>
              <FlagSwitch on={!!dc.do_not_rent} onChange={v => patchClient(dc.id, { do_not_rent: v })} onLabel="Στη μαύρη λίστα / Προσοχή" offLabel="Μαύρη λίστα / Προσοχή" />
              <div>
                <div style={lbl}>Ετικέτες</div>
                <TagEditor tags={dc.tags || []} onChange={t => patchClient(dc.id, { tags: t })} />
              </div>
            </div>

            {/* Επικοινωνία */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 14, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                {[
                  ['Τηλέφωνο', dc.phone ? <a href={`tel:${dc.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{dc.phone}</a> : '-'],
                  ['Email', dc.email ? <a href={`mailto:${dc.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{dc.email}</a> : '-'],
                  ['Διεύθυνση', dc.address || '-'],
                  ['ΑΦΜ', dc.afm ? <span style={{ fontFamily: T.font.mono }}>{dc.afm}</span> : '-'],
                  ['Ταυτότητα', dc.id_number || '-'],
                  ['Εθνικότητα', dc.nationality || '-'],
                  ['Πηγή', dc.source || '-'],
                ].map(([k, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 3 }}>{k as string}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{v as React.ReactNode}</div>
                  </div>
                ))}
              </div>
              {dc.phone && (
                <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <a href={waLink(dc.phone)} target="_blank" rel="noopener noreferrer" style={msgLink}>WhatsApp</a>
                  <a href={viberLink(dc.phone)} style={msgLink}>Viber</a>
                </div>
              )}
              {(dc.type === 'client' || dc.type === 'lead') && (dc.budget != null || (dc.needs && dc.needs.trim())) && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {dc.budget != null && <div><span style={{ color: 'var(--text-tertiary)' }}>Προϋπολογισμός: </span><span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num }}>{fe(dc.budget, 0)}</span></div>}
                  {dc.needs && dc.needs.trim() && <div style={{ marginTop: 4 }}><span style={{ color: 'var(--text-tertiary)' }}>Ανάγκες: </span>{dc.needs}</div>}
                </div>
              )}
              {dc.notes && dc.notes.trim() && <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{dc.notes}</div>}
            </div>

            {/* Αναλυτικά */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 24 }}>
              {([
                { l: 'Έσοδα', v: fe(dcStats.revenue, 0) },
                { l: 'Διανυκτερεύσεις', v: String(dcStats.nights) },
                { l: 'Διαμονές', v: String(dcStats.stayCount) },
                { l: 'Μέση βαθμολογία', v: dcStats.avgRating != null ? `${dcStats.avgRating}/5` : '-' },
                { l: 'ADR', v: fe(dcStats.adr, 0), t: 'Μέση τιμή ανά διανυκτέρευση' },
                { l: 'Τελευταία επίσκεψη', v: dcStats.lastVisit ? fd(dcStats.lastVisit) : '-' },
                { l: 'Φθορές', v: fe(dcStats.damageTotal, 0), neg: dcStats.damageTotal > 0 },
              ] as { l: string; v: string; t?: string; neg?: boolean }[]).map((s, i) => (
                <div key={i} title={s.t} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 12 }}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6 }}>{s.l}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.font.num, color: s.neg ? 'var(--negative)' : 'var(--text-primary)' }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Διαμονές / Επισκέψεις */}
            <div style={{ marginBottom: 24 }}>
              <SecHdr label="Διαμονές / Επισκέψεις" right={!stayFormOpen ? <Btn variant="secondary" onClick={openStayNew}>Νέα διαμονή</Btn> : undefined} />
              {stayFormOpen && (
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                    <div style={{ gridColumn: '1 / -1' }}>
                      <CustomSelect label="Ακίνητο" value={stayForm.property_id} onChange={v => setStayForm(f => ({ ...f, property_id: v }))} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Χωρίς ακίνητο" />
                    </div>
                    <DatePicker label="Άφιξη" value={stayForm.check_in} onChange={v => onStayDates({ check_in: v })} />
                    <DatePicker label="Αναχώρηση" value={stayForm.check_out} onChange={v => onStayDates({ check_out: v })} />
                    <NumberInput label="Διανυκτερεύσεις" value={stayForm.nights} onChange={onStayNights} />
                    <NumberInput label="Άτομα" value={stayForm.guests} onChange={v => setStayForm(f => ({ ...f, guests: v }))} />
                    <CustomSelect label="Κανάλι" value={stayForm.channel} onChange={v => setStayForm(f => ({ ...f, channel: v }))} options={channelOptions} />
                    <NumberInput label="Τιμή / νύχτα" value={stayForm.nightly_rate} onChange={onStayRate} suffix="€" />
                    <NumberInput label="Σύνολο" value={stayForm.total} onChange={v => setStayForm(f => ({ ...f, total: v }))} suffix="€" />
                    <div>
                      <div style={lbl}>Βαθμολογία</div>
                      <div style={{ height: 42, display: 'flex', alignItems: 'center' }}><Stars value={stayForm.rating} onSet={n => setStayForm(f => ({ ...f, rating: n }))} size={20} /></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                      <FlagSwitch on={stayForm.damages} onChange={v => setStayForm(f => ({ ...f, damages: v }))} onLabel="Καταγράφηκαν φθορές" offLabel="Χωρίς φθορές" />
                    </div>
                    {stayForm.damages && <NumberInput label="Κόστος φθοράς" value={stayForm.damage_cost} onChange={v => setStayForm(f => ({ ...f, damage_cost: v }))} suffix="€" />}
                    {stayForm.damages && <div><TextInput label="Σημείωση φθοράς" value={stayForm.damage_note} onChange={v => setStayForm(f => ({ ...f, damage_note: v }))} /></div>}
                    <div style={{ gridColumn: '1 / -1' }}>
                      <TextInput label="Σημειώσεις" value={stayForm.notes} onChange={v => setStayForm(f => ({ ...f, notes: v }))} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
                    <Btn variant="ghost" onClick={() => setStayFormOpen(false)}>Ακύρωση</Btn>
                    <Btn variant="primary" onClick={saveStay} disabled={savingStay}>{savingStay ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
                  </div>
                </div>
              )}
              {dcStays.length === 0 && !stayFormOpen ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Δεν έχουν καταγραφεί διαμονές.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dcStays.map(s => {
                    const n = s.nights ?? stayNights(s.check_in, s.check_out);
                    return (
                      <div key={s.id} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{s.property_id ? propName(s.property_id) : 'Χωρίς ακίνητο'}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                              {s.check_in && <span>{fd(s.check_in)}{s.check_out ? ` - ${fd(s.check_out)}` : ''}</span>}
                              <span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{n} νύχτες</span>
                              {s.guests != null && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{s.guests} άτομα</span></>}
                              {s.channel && <><span style={{ color: 'var(--text-tertiary)' }}>·</span><span>{STAY_CHANNEL_LABELS[s.channel as keyof typeof STAY_CHANNEL_LABELS] || s.channel}</span></>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: T.font.num }}>{fe(s.total ?? (n * (s.nightly_rate || 0)), 0)}</div>
                            {s.nightly_rate != null && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num }}>{fe(s.nightly_rate, 0)} / νύχτα</div>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            {(s.rating || 0) > 0 && <Stars value={s.rating || 0} size={13} />}
                            {s.damages && <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--negative)' }}>Φθορά {fe(s.damage_cost || 0, 0)}{s.damage_note ? ` · ${s.damage_note}` : ''}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => openStayEdit(s)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Επεξεργασία</button>
                            <button onClick={() => delStay(s)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Διαγραφή</button>
                          </div>
                        </div>
                        {s.notes && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>{s.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Χρονολόγιο (σχόλια) */}
            <div>
              <SecHdr label="Χρονολόγιο" sub="Σχόλια, τηλεφωνήματα, επισκέψεις" />
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ width: 150 }}>
                  <CustomSelect value={noteForm.kind} onChange={v => setNoteForm(f => ({ ...f, kind: v }))} options={noteKindOptions} />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <TextInput value={noteForm.body} onChange={v => setNoteForm(f => ({ ...f, body: v }))} placeholder="Νέο σχόλιο…" />
                </div>
                <Btn variant="primary" onClick={saveNote} disabled={!noteForm.body.trim()}>Προσθήκη</Btn>
              </div>
              {notes.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>Δεν υπάρχουν σχόλια ακόμη.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notes.map(nt => (
                    <div key={nt.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                          <Badge tone={nt.kind === 'damage' ? 'negative' : 'neutral'}>{NOTE_KIND_LABELS[nt.kind as keyof typeof NOTE_KIND_LABELS] || nt.kind}</Badge>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{fd(nt.created_at)}</span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{nt.body}</div>
                      </div>
                      <button onClick={() => delNote(nt)} title="Διαγραφή" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 16, padding: 0, flexShrink: 0 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Φόρμα νέου/επεξεργασίας πελάτη ──────────────────────────────────── */}
      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 24, width: 'min(620px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 18 }}>{editing ? 'Επεξεργασία καταχώρησης' : 'Νέα καταχώρηση'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} />
              </div>
              <CustomSelect label="Τύπος" value={form.type} onChange={v => setForm(f => ({ ...f, type: v as ClientType }))} options={typeOptions} />
              <div>
                <TextInput label="ΑΦΜ" value={form.afm} onChange={v => setForm(f => ({ ...f, afm: v.replace(/[^0-9]/g, '').slice(0, 9) }))} />
                {form.afm.length === 9 && !isValidAfm(form.afm) && <div style={{ fontSize: 10, color: 'var(--negative)', marginTop: 4 }}>Μη έγκυρο ΑΦΜ (9 ψηφία)</div>}
              </div>
              <TextInput label="Τηλέφωνο" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
              <TextInput label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" />
              <TextInput label="Διεύθυνση" value={form.address} onChange={v => setForm(f => ({ ...f, address: v }))} />
              <TextInput label="Αριθμός ταυτότητας" value={form.id_number} onChange={v => setForm(f => ({ ...f, id_number: v }))} />
              <TextInput label="Εθνικότητα" value={form.nationality} onChange={v => setForm(f => ({ ...f, nationality: v }))} />
              <TextInput label="Πηγή" value={form.source} onChange={v => setForm(f => ({ ...f, source: v }))} />
              <CustomSelect label="Στάδιο" value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v as Stage }))} options={stageOptions} />
              <NumberInput label="Αξία ευκαιρίας" value={form.deal_value} onChange={v => setForm(f => ({ ...f, deal_value: v }))} suffix="€" />
              <NumberInput label="Προϋπολογισμός" value={form.budget} onChange={v => setForm(f => ({ ...f, budget: v }))} suffix="€" />
              <TextInput label="Επόμενη ενέργεια" value={form.next_action} onChange={v => setForm(f => ({ ...f, next_action: v }))} placeholder="π.χ. Επίσκεψη ακινήτου" />
              <DatePicker label="Ημερομηνία ενέργειας" value={form.next_date} onChange={v => setForm(f => ({ ...f, next_date: v }))} />
              <div>
                <div style={lbl}>Βαθμολογία</div>
                <div style={{ height: 42, display: 'flex', alignItems: 'center' }}><Stars value={form.rating} onSet={n => setForm(f => ({ ...f, rating: n }))} size={22} /></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                <FlagSwitch on={form.do_not_rent} onChange={v => setForm(f => ({ ...f, do_not_rent: v }))} onLabel="Στη μαύρη λίστα" offLabel="Μαύρη λίστα / Προσοχή" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={lbl}>Ετικέτες</div>
                <TagEditor tags={form.tags} onChange={t => setForm(f => ({ ...f, tags: t }))} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Textarea label="Ανάγκες (μεσίτης)" value={form.needs} onChange={v => setForm(f => ({ ...f, needs: v }))} placeholder="π.χ. 2ΔΚΛ, κέντρο, έως 3ος όροφος" rows={2} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <Textarea label="Σημειώσεις" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <Btn variant="ghost" onClick={() => setModalOpen(false)}>Ακύρωση</Btn>
              <Btn variant="primary" onClick={save} disabled={saving || !form.full_name.trim()}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
