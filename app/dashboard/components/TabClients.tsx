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
  isValidAfm, stayNights, stayTotal, clientStats, normalizePhone,
  clientMatches, STAY_CHANNELS, STAY_CHANNEL_LABELS, NOTE_KINDS, NOTE_KIND_LABELS,
  type ClientType, type Stage,
} from '@/lib/clients/clients';
import { MSG_TEMPLATES, buildMessage, whatsappLink, viberLink as viberTextLink } from '@/lib/clients/messages';
import { revenueByChannel, revenueByMonth, occupancyPct, totals } from '@/lib/clients/reports';
import { parseICal, guessChannel, icalToStayDrafts, stayKey, type ICalEvent } from '@/lib/clients/ical';

// ── Τύποι εγγραφών (καθρέφτης πινάκων Supabase) ─────────────────────────────
interface Client {
  id: string; user_id: string; type: ClientType; full_name: string;
  afm: string | null; phone: string | null; email: string | null; notes: string | null;
  stage: Stage; deal_value: number | null; next_action: string | null; next_date: string | null;
  created_at: string; updated_at: string;
  rating: number | null; tags: string[] | null; do_not_rent: boolean | null; vip: boolean | null;
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
interface ClientDoc {
  id: string; user_id: string; client_id: string; name: string; file_path: string;
  mime: string | null; size: number | null; kind: string; created_at: string;
  signedUrl?: string;
}
interface IcalFeed {
  id: string; user_id: string; property_id: string; channel: string; url: string;
  include_blocked: boolean; active: boolean; last_synced_at: string | null; last_status: string | null; created_at: string;
}

// Είδη εγγράφων πελάτη (ταυτότητα, συμβόλαιο, απόδειξη, άλλο).
const DOC_KINDS = ['id', 'contract', 'receipt', 'other'] as const;
const DOC_KIND_LABELS: Record<string, string> = { id: 'Ταυτότητα / Διαβατήριο', contract: 'Συμβόλαιο', receipt: 'Απόδειξη', other: 'Άλλο' };
const fmtBytes = (n?: number | null) => {
  if (!n || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

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
  rating: number; tags: string[]; do_not_rent: boolean; vip: boolean; address: string; id_number: string;
  nationality: string; source: string; budget: string; needs: string;
}
const emptyForm = (): FormState => ({
  type: 'lead', full_name: '', afm: '', phone: '', email: '', notes: '',
  stage: 'lead', deal_value: '', next_action: '', next_date: '',
  rating: 0, tags: [], do_not_rent: false, vip: false, address: '', id_number: '',
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
function FlagSwitch({ on, onChange, onLabel, offLabel, tone = 'negative' }: { on: boolean; onChange: (v: boolean) => void; onLabel: string; offLabel: string; tone?: 'negative' | 'warning' | 'accent' | 'positive' }) {
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

// ── Τυποποιημένα κοινά στοιχεία (avatar / πλακίδιο στατιστικού) ──────────────
// Αρχικά ονόματος: έως 2 λέξεις, κεφαλαία· fallback «?».
const initialsOf = (name: string) =>
  (name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('') || '?').toUpperCase();

// Avatar αρχικών ως απλή συνάρτηση που επιστρέφει JSX (όχι component, ώστε να μη
// γίνεται remount). Στρογγυλεμένο τετράγωνο σε accent-soft με τα αρχικά.
const avatar = (name: string, size: number) => (
  <div style={{
    width: size, height: size, borderRadius: Math.round(size * 0.28), flexShrink: 0,
    background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
    color: 'var(--accent)', fontWeight: 700, fontFamily: T.font.sans,
    fontSize: Math.round(size * 0.36), letterSpacing: '0.02em',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>{initialsOf(name)}</div>
);

// Τυποποιημένο πλακίδιο στατιστικού: ανυψωμένο, ετικέτα (10px κεφαλαία) + τιμή
// (tabular-nums, 700). neg → τιμή σε var(--negative)· title → tooltip.
const statTile = (label: string, value: React.ReactNode, opts?: { neg?: boolean; title?: string }) => (
  <div title={opts?.title} style={{
    background: 'var(--surface-raised)', border: '1px solid var(--border-raised)',
    borderRadius: 12, padding: '10px 12px', minWidth: 0,
    boxShadow: 'var(--highlight-inset), var(--elev-1)',
  }}>
    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: T.font.sans }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: opts?.neg ? 'var(--negative)' : 'var(--text-primary)' }}>{value}</div>
  </div>
);

// Μικρο-γράφημα (sparkline) εσόδων ανά διαμονή. Καθαρό inline SVG, χωρίς βιβλιοθήκη.
const sparkline = (values: number[], h = 34): React.ReactNode => {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values, 0), range = (max - min) || 1, n = values.length;
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => h - 3 - ((v - min) / range) * (h - 6);
  const d = 'M' + values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' L');
  return (
    <svg viewBox={`0 0 100 ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block' }} aria-hidden>
      <path d={`${d} L100,${h} L0,${h} Z`} fill="var(--accent-soft)" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

export default function TabClients({ userId, onSelectProperty }: { userId: string; onSelectProperty?: (id: string) => void }) {
  const supabase = createClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [props, setProps] = useState<PropRow[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ClientType>('all');
  const [segment, setSegment] = useState<'all' | 'vip' | 'repeat' | 'flagged'>('all');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportYearMenu, setReportYearMenu] = useState(false);

  // Εισαγωγή iCal (Airbnb/Booking): συγχρονισμός κρατήσεων/διαμονών ανά ακίνητο.
  const [icalOpen, setIcalOpen] = useState(false);
  const [icalText, setIcalText] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [icalPropertyId, setIcalPropertyId] = useState('');
  const [icalChannel, setIcalChannel] = useState<'airbnb' | 'booking' | 'other'>('airbnb');
  const [icalIncludeBlocked, setIcalIncludeBlocked] = useState(false);
  const [icalEvents, setIcalEvents] = useState<ICalEvent[] | null>(null);
  const [icalBusy, setIcalBusy] = useState(false);
  const [icalMsg, setIcalMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [icalFeeds, setIcalFeeds] = useState<IcalFeed[]>([]);

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

  // Έγγραφα πελάτη (ταυτότητα, συμβόλαιο, αποδείξεις)
  const [docs, setDocs] = useState<ClientDoc[]>([]);
  const [docKind, setDocKind] = useState<string>('other');
  const [docBusy, setDocBusy] = useState(false);
  const [docMsg, setDocMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

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

  const loadDocs = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('client_documents').select('*').eq('user_id', userId).eq('client_id', clientId).order('created_at', { ascending: false });
    const list = (data || []) as ClientDoc[];
    const paths = list.map(d => d.file_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from('property-files').createSignedUrls(paths, 60 * 60 * 24);
      if (signed) list.forEach((d, i) => { d.signedUrl = signed[i]?.signedUrl ?? undefined; });
    }
    setDocs(list);
  }, [userId]);

  const loadIcalFeeds = useCallback(async () => {
    const { data } = await supabase.from('ical_feeds').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    setIcalFeeds((data || []) as IcalFeed[]);
  }, [userId]);

  useEffect(() => { load(); loadStays(); loadIcalFeeds(); }, [load, loadStays, loadIcalFeeds]);

  // Real-time: clients / client_stays / client_notes
  useEffect(() => {
    const ch = supabase.channel('clients-crm-' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_stays', filter: `user_id=eq.${userId}` }, () => loadStays())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_notes', filter: `user_id=eq.${userId}` }, () => { if (openIdRef.current) loadNotes(openIdRef.current); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_documents', filter: `user_id=eq.${userId}` }, () => { if (openIdRef.current) loadDocs(openIdRef.current); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ical_feeds', filter: `user_id=eq.${userId}` }, () => loadIcalFeeds())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_properties', filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load, loadStays, loadNotes, loadDocs, loadIcalFeeds]);

  useEffect(() => {
    if (openId) { loadNotes(openId); loadDocs(openId); }
    else { setNotes([]); setDocs([]); }
    setDocMsg(null); setDocKind('other');
  }, [openId, loadNotes, loadDocs]);

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
  // Όλες οι διαμονές του χρήστη (για τις Αναφορές), υπολογισμένες μία φορά.
  const allStays = useMemo(() => [...staysByClient.values()].flat(), [staysByClient]);
  const year = new Date().getFullYear();

  const isFlagged = useCallback((c: Client) => !!c.do_not_rent || !!statsByClient.get(c.id)?.hasDamage, [statsByClient]);

  const filtered = useMemo(() => clients.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (!clientMatches(c, search)) return false;
    if (segment !== 'all') {
      const st = statsByClient.get(c.id);
      if (segment === 'vip' && !(c.vip || (c.rating || 0) >= 4 || (st?.revenue || 0) >= 1000)) return false;
      if (segment === 'repeat' && !((st?.stayCount || 0) >= 2)) return false;
      if (segment === 'flagged' && !isFlagged(c)) return false;
    }
    return true;
  }), [clients, search, typeFilter, segment, statsByClient, isFlagged]);

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
      rating: c.rating || 0, tags: c.tags || [], do_not_rent: !!c.do_not_rent, vip: !!c.vip, address: c.address || '',
      id_number: c.id_number || '', nationality: c.nationality || '', source: c.source || '',
      budget: c.budget != null ? String(c.budget) : '', needs: c.needs || '',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.full_name.trim()) return;
    // Εντοπισμός διπλότυπου σε νέα εγγραφή: ίδιο τηλέφωνο ή ίδιο ΑΦΜ.
    if (!editing) {
      const np = normalizePhone(form.phone), afm = form.afm.trim();
      const dup = clients.find(c => (np.length >= 8 && normalizePhone(c.phone) === np) || (afm.length === 9 && (c.afm || '') === afm));
      if (dup) {
        const by = np.length >= 8 && normalizePhone(dup.phone) === np ? 'αυτό το τηλέφωνο' : 'αυτό το ΑΦΜ';
        if (!window.confirm(`Υπάρχει ήδη πελάτης με ${by}: «${dup.full_name}». Θέλεις σίγουρα να δημιουργήσεις νέα εγγραφή;`)) return;
      }
    }
    setSaving(true);
    const num = (s: string) => { const n = parseFloat(s); return isNaN(n) ? null : n; };
    const payload = {
      user_id: userId, type: form.type, full_name: form.full_name.trim(),
      afm: form.afm.trim() || null, phone: form.phone.trim() || null, email: form.email.trim() || null,
      notes: form.notes.trim() || null, stage: form.stage, deal_value: num(form.deal_value),
      next_action: form.next_action.trim() || null, next_date: form.next_date || null,
      rating: form.rating || 0, tags: form.tags, do_not_rent: form.do_not_rent, vip: form.vip,
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

  // ── Έγγραφα πελάτη ────────────────────────────────────────────────────────
  const onDocFile = async (file: File | null | undefined) => {
    if (!file || !openId) return;
    setDocBusy(true); setDocMsg(null);
    const safe = file.name.replace(/[^\w.\-]+/g, '_');
    const path = `${userId}/clients/${openId}/${Date.now()}_${safe}`;
    const { error: upErr } = await supabase.storage.from('property-files').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (upErr) { setDocMsg({ text: `Σφάλμα ανεβάσματος: ${upErr.message}`, error: true }); setDocBusy(false); return; }
    const { error: insErr } = await supabase.from('client_documents').insert({
      user_id: userId, client_id: openId, name: file.name, file_path: path,
      mime: file.type || null, size: file.size, kind: docKind,
    });
    if (insErr) {
      await supabase.storage.from('property-files').remove([path]);
      setDocMsg({ text: `Σφάλμα καταχώρησης: ${insErr.message}`, error: true }); setDocBusy(false); return;
    }
    setDocBusy(false); setDocMsg({ text: 'Το έγγραφο προστέθηκε' });
    setTimeout(() => setDocMsg(null), 3000);
    if (docFileRef.current) docFileRef.current.value = '';
    loadDocs(openId);
  };
  const delDoc = async (d: ClientDoc) => {
    if (!confirm('Να διαγραφεί οριστικά το έγγραφο;')) return;
    await supabase.storage.from('property-files').remove([d.file_path]);
    await supabase.from('client_documents').delete().eq('id', d.id);
    if (openId) loadDocs(openId);
  };

  // ── Εισαγωγή iCal ─────────────────────────────────────────────────────────
  const openIcal = () => {
    setIcalText(''); setIcalUrl(''); setIcalEvents(null); setIcalMsg(null);
    setIcalChannel('airbnb'); setIcalIncludeBlocked(false);
    setIcalPropertyId(props[0]?.id || '');
    setIcalOpen(true);
  };
  // Χειροκίνητη ανάλυση επικολλημένου .ics (τοπικά, χωρίς δίκτυο).
  const parseIcalInput = () => {
    setIcalMsg(null); setIcalEvents(null);
    const text = icalText.trim();
    if (!text) { setIcalMsg({ text: 'Επικόλλησε το περιεχόμενο του .ics ή χρησιμοποίησε τον σύνδεσμο παραπάνω.', error: true }); return; }
    const evs = parseICal(text);
    if (evs.length === 0) { setIcalMsg({ text: 'Δεν βρέθηκαν εγγραφές ημερολογίου στο κείμενο.', error: true }); return; }
    setIcalEvents(evs);
  };
  // Ανάκτηση από URL μέσω edge function (server-side fetch, παρακάμπτει το CORS).
  const fetchIcalFromUrl = async () => {
    const url = icalUrl.trim();
    if (!url) { setIcalMsg({ text: 'Δώσε τον σύνδεσμο iCal (URL).', error: true }); return; }
    setIcalBusy(true); setIcalMsg(null); setIcalEvents(null);
    const ch = guessChannel(url);
    if (ch !== 'other') setIcalChannel(ch);
    try {
      const { data, error } = await supabase.functions.invoke('ical-sync', { body: { action: 'preview', url } });
      if (error || !data?.ok) {
        const detail = data?.error || error?.message || '';
        setIcalMsg({ text: `Δεν ήταν δυνατή η ανάκτηση από το URL${detail ? `: ${detail}` : ''}. Αν δεν έχει ενεργοποιηθεί ο αυτόματος συγχρονισμός, άνοιξε τον σύνδεσμο, αντίγραψε το .ics και επικόλλησέ το κάτω.`, error: true });
        setIcalBusy(false); return;
      }
      setIcalEvents((data.events || []) as ICalEvent[]);
      if (!data.events?.length) setIcalMsg({ text: 'Δεν βρέθηκαν κρατήσεις στο ημερολόγιο.', error: true });
    } catch (e) {
      setIcalMsg({ text: `Σφάλμα ανάκτησης: ${String(e)}`, error: true });
    } finally { setIcalBusy(false); }
  };
  // Αποθήκευση συνδέσμου για αυτόματο συγχρονισμό + άμεσος πρώτος συγχρονισμός.
  const saveIcalFeed = async () => {
    const url = icalUrl.trim();
    if (!url || !icalPropertyId) { setIcalMsg({ text: 'Επίλεξε ακίνητο και δώσε τον σύνδεσμο iCal.', error: true }); return; }
    setIcalBusy(true); setIcalMsg(null);
    const { error } = await supabase.from('ical_feeds').upsert({
      user_id: userId, property_id: icalPropertyId, channel: icalChannel, url, include_blocked: icalIncludeBlocked, active: true,
    }, { onConflict: 'user_id,property_id,url' });
    if (error) { setIcalMsg({ text: `Σφάλμα αποθήκευσης: ${error.message}`, error: true }); setIcalBusy(false); return; }
    await loadIcalFeeds();
    setIcalBusy(false);
    setIcalMsg({ text: 'Ο σύνδεσμος αποθηκεύτηκε. Ο συγχρονισμός θα τρέχει αυτόματα· μπορείς και χειροκίνητα με «Συγχρονισμός τώρα».' });
    syncIcalNow(icalPropertyId);
  };
  // Άμεσος συγχρονισμός των αποθηκευμένων συνδέσμων (όλων ή ενός ακινήτου).
  const syncIcalNow = async (propertyId?: string) => {
    setIcalBusy(true); setIcalMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('ical-sync', { body: { action: 'sync', propertyId } });
      if (error || !data?.ok) {
        setIcalMsg({ text: `Ο συγχρονισμός απέτυχε${data?.error ? `: ${data.error}` : ''}. Βεβαιώσου ότι έχει γίνει deploy η function ical-sync.`, error: true });
      } else {
        const failed = (data.results || []).filter((r: { ok: boolean }) => !r.ok).length;
        setIcalMsg({ text: `Συγχρονισμός ολοκληρώθηκε: ${data.inserted || 0} νέες κρατήσεις από ${data.feeds || 0} συνδέσμους${failed ? ` (${failed} με σφάλμα)` : ''}.`, error: failed > 0 });
        loadStays(); load();
      }
      loadIcalFeeds();
    } catch (e) {
      setIcalMsg({ text: `Σφάλμα συγχρονισμού: ${String(e)}`, error: true });
    } finally { setIcalBusy(false); }
  };
  const delIcalFeed = async (f: IcalFeed) => {
    if (!confirm('Να αφαιρεθεί ο σύνδεσμος αυτόματου συγχρονισμού; Οι ήδη εισαγμένες κρατήσεις παραμένουν.')) return;
    await supabase.from('ical_feeds').delete().eq('id', f.id);
    loadIcalFeeds();
  };
  // Συνθετικός πελάτης ανά κανάλι για τις εισαγόμενες κρατήσεις (το iCal δεν
  // περιέχει ταυτότητα επισκέπτη). Δημιουργείται μία φορά, με σαφή ονομασία.
  const ensureChannelClient = async (channel: 'airbnb' | 'booking' | 'other'): Promise<string | null> => {
    const name = channel === 'airbnb' ? 'Κρατήσεις Airbnb' : channel === 'booking' ? 'Κρατήσεις Booking' : 'Κρατήσεις καναλιού';
    const existing = clients.find(c => c.full_name === name && c.type === 'client');
    if (existing) return existing.id;
    const { data, error } = await supabase.from('clients').insert({
      user_id: userId, type: 'client', full_name: name, stage: 'closed',
      notes: 'Συγκεντρωτικός πελάτης για κρατήσεις που εισάγονται από iCal (χωρίς στοιχεία επισκέπτη).',
    }).select('id').single();
    if (error || !data) return null;
    return (data as { id: string }).id;
  };
  const importIcal = async () => {
    if (!icalEvents || !icalPropertyId) return;
    setIcalBusy(true); setIcalMsg(null);
    const drafts = icalToStayDrafts(icalEvents, { propertyId: icalPropertyId, channel: icalChannel })
      .filter(d => icalIncludeBlocked || !d.blocked);
    if (drafts.length === 0) { setIcalMsg({ text: 'Δεν υπάρχουν κρατήσεις προς εισαγωγή (μόνο μπλοκαρίσματα ημερομηνιών).', error: true }); setIcalBusy(false); return; }
    const clientId = await ensureChannelClient(icalChannel);
    if (!clientId) { setIcalMsg({ text: 'Σφάλμα δημιουργίας πελάτη καναλιού.', error: true }); setIcalBusy(false); return; }
    // Αποφυγή διπλοεγγραφών: κλειδί ακίνητο+άφιξη+αναχώρηση απέναντι στις υπάρχουσες.
    const existingKeys = new Set(stays.map(s => stayKey(s.property_id || '', s.check_in || '', s.check_out || '')));
    const fresh = drafts.filter(d => !existingKeys.has(stayKey(d.property_id, d.check_in, d.check_out)));
    const skipped = drafts.length - fresh.length;
    if (fresh.length === 0) { setIcalMsg({ text: `Όλες οι ${drafts.length} κρατήσεις υπάρχουν ήδη. Καμία νέα εισαγωγή.` }); setIcalBusy(false); loadStays(); return; }
    const rows = fresh.map(d => ({
      user_id: userId, client_id: clientId, property_id: d.property_id,
      check_in: d.check_in, check_out: d.check_out, nights: d.nights, channel: d.channel,
      notes: `Εισαγωγή iCal · ${d.uid}`,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const { error } = await supabase.from('client_stays').insert(rows.slice(i, i + 50));
      if (error) { setIcalMsg({ text: `Σφάλμα εισαγωγής: ${error.message}`, error: true }); setIcalBusy(false); loadStays(); return; }
      inserted += rows.slice(i, i + 50).length;
    }
    setIcalBusy(false);
    setIcalMsg({ text: `Εισήχθησαν ${inserted} κρατήσεις${skipped > 0 ? ` · ${skipped} υπήρχαν ήδη` : ''}.` });
    setIcalEvents(null); setIcalText(''); setIcalUrl('');
    loadStays(); load();
  };

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
  // Chip επικοινωνίας (ίδιο ύφος με msgLink, με inline εικονίδιο).
  const contactChip: React.CSSProperties = { ...msgLink, display: 'inline-flex', alignItems: 'center', gap: 5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' };
  const fGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 };
  // Επικεφαλίδα ενότητας φόρμας (καθαρή, με τελεία accent και λεπτή γραμμή). Απλή
  // συνάρτηση που επιστρέφει JSX (όχι component) ώστε να μη χάνουν focus τα πεδία.
  const secHead = (t: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '22px 0 13px' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', fontFamily: T.font.sans, whiteSpace: 'nowrap' }}>{t}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
  const initials = (form.full_name.trim().split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('') || '+').toUpperCase();

  const overdue = (c: Client) => c.next_date != null && c.stage !== 'closed' && c.next_date <= todayStr();

  if (loading) return <Spinner label="Φόρτωση…" />;

  const unlinkedProps = props.filter(p => !p.client_id);
  const dc = openId ? clients.find(c => c.id === openId) || null : null;
  const dcStays = dc ? (staysByClient.get(dc.id) || []).slice().sort((a, b) => (b.check_in || '').localeCompare(a.check_in || '')) : [];
  const dcStats = dc ? clientStats(dcStays) : null;
  // Πλαίσιο για τα πρότυπα μηνυμάτων: πελάτης + πρώτο συνδεδεμένο ακίνητο + πιο
  // πρόσφατη διαμονή (τα dcStays είναι σε φθίνουσα σειρά, άρα [0] = πιο πρόσφατη).
  const dcFirstProp = dc ? (propsByClient.get(dc.id) || [])[0] : undefined;
  const msgCtx = dc ? { clientName: dc.full_name, propertyName: dcFirstProp?.name, address: undefined, checkIn: dcStays[0]?.check_in, checkOut: dcStays[0]?.check_out } : null;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <PageTitle title="Πελατολόγιο" sub="Πλήρες αρχείο πελατών, επισκεπτών και ιδιοκτητών: βαθμολογία, ιστορικό διαμονών, φθορές και επικοινωνία σε ένα σημείο."
        right={(clients.length > 0 || props.length > 0) ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{props.length > 0 && <Btn variant="ghost" onClick={openIcal}>Εισαγωγή iCal</Btn>}{clients.length > 0 && <Btn variant="ghost" onClick={() => setReportsOpen(true)}>Αναφορές</Btn>}{clients.length > 0 && <ExportButton onClick={exportCsv} />}<Btn variant="primary" onClick={openNew}>Νέα καταχώρηση</Btn></div> : undefined} />

      <KPIGrid items={kpis} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση ονόματος, ΑΦΜ, τηλεφώνου…"
          style={{ ...inp, maxWidth: 280, width: 'auto', flex: '1 1 220px' }} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={chip(typeFilter === 'all')} onClick={() => setTypeFilter('all')}>Όλοι</button>
          {CLIENT_TYPES.map(t => <button key={t} style={chip(typeFilter === t)} onClick={() => setTypeFilter(t)}>{CLIENT_TYPE_LABELS[t]}</button>)}
          <button style={chip(segment === 'vip')} title="Βαθμολογία 4+ ή υψηλά έσοδα" onClick={() => setSegment(s => s === 'vip' ? 'all' : 'vip')}>VIP</button>
          <button style={chip(segment === 'repeat')} onClick={() => setSegment(s => s === 'repeat' ? 'all' : 'repeat')}>Επαναλαμβανόμενοι</button>
          <button style={chip(segment === 'flagged')} title="Μαύρη λίστα ή φθορές" onClick={() => setSegment(s => s === 'flagged' ? 'all' : 'flagged')}>Με επισήμανση</button>
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
              <div key={c.id} className="client-card" role="button" tabIndex={0}
                onClick={() => setOpenId(c.id)}
                onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpenId(c.id); } }}
                style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, outline: 'none', ...(c.do_not_rent ? { borderColor: 'var(--negative-border)' } : null) }}>

                {/* Κεφαλίδα: avatar + όνομα/βαθμολογία/τελ. επίσκεψη + σήματα + ενέργειες */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  {avatar(c.full_name, 42)}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                      {(c.rating || 0) > 0 && <Stars value={c.rating || 0} size={13} />}
                      {st.lastVisit && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>τελ. επίσκεψη {fd(st.lastVisit)}</span>}
                      {c.afm && <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono }}>ΑΦΜ {c.afm}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <Badge tone={TYPE_TONE[c.type]}>{CLIENT_TYPE_LABELS[c.type]}</Badge>
                      {c.vip && <Badge tone="accent">VIP</Badge>}
                      {c.do_not_rent && <Badge tone="negative">Προσοχή</Badge>}
                      {st.hasDamage && !c.do_not_rent && <Badge tone="negative">Φθορές</Badge>}
                    </div>
                    <div className="client-card-act">
                      <button title="Διαγραφή" onClick={e => { e.stopPropagation(); del(c); }}
                        style={{ background: 'none', border: 'none', borderRadius: 8, width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0, flexShrink: 0 }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--negative)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                {(c.tags || []).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(c.tags || []).map(t => <span key={t} style={{ fontSize: 10, padding: '2px 8px', borderRadius: T.radius.pill, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)' }}>{t}</span>)}
                  </div>
                )}

                {/* Λωρίδα στατιστικών: βυθισμένο well με ισομερή micro-stats */}
                {st.stayCount > 0 ? (
                  <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 12, display: 'flex' }}>
                    {([
                      { l: 'Διαμονές', v: String(st.stayCount) },
                      { l: 'Νύχτες', v: String(st.nights) },
                      { l: 'Έσοδα', v: fe(st.revenue, 0), strong: true },
                      { l: 'ADR', v: fe(st.adr, 0), t: 'Μέση τιμή ανά διανυκτέρευση' },
                    ] as { l: string; v: string; strong?: boolean; t?: string }[]).map((m, i) => (
                      <div key={i} title={m.t} style={{ flex: 1, minWidth: 0, paddingLeft: i ? 12 : 0, borderLeft: i ? '1px solid var(--border-subtle)' : 'none' }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-tertiary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.l}</div>
                        <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', color: m.strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{m.v}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Χωρίς διαμονές ακόμη</div>
                )}

                {/* Επικοινωνία: compact chips */}
                {(c.phone || c.email) && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {c.phone && <a onClick={e => e.stopPropagation()} href={`tel:${c.phone}`} style={contactChip}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" /></svg>
                      {c.phone}
                    </a>}
                    {c.email && <a onClick={e => e.stopPropagation()} href={`mailto:${c.email}`} style={contactChip}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span>
                    </a>}
                    {c.phone && <a onClick={e => e.stopPropagation()} href={waLink(c.phone)} target="_blank" rel="noopener noreferrer" style={msgLink}>WhatsApp</a>}
                    {c.phone && <a onClick={e => e.stopPropagation()} href={viberLink(c.phone)} style={msgLink}>Viber</a>}
                  </div>
                )}

                {broker && (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {c.budget != null && <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.num }}>Προϋπολογισμός {fe(c.budget, 0)}</span>}
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

                {linked.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                    {linked.map(p => (
                      <button key={p.id} onClick={e => { e.stopPropagation(); onSelectProperty?.(p.id); }} title={`Άνοιγμα: ${p.name}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '4px 9px', borderRadius: 7, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--accent)', cursor: 'pointer', fontFamily: T.font.sans }}>
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5" /><path d="M5 10v10h14V10" /></svg>{p.name}
                      </button>
                    ))}
                  </div>
                )}
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
                    <div key={c.id} className="client-card" role="button" tabIndex={0}
                      onClick={() => setOpenId(c.id)}
                      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpenId(c.id); } }}
                      style={{ borderRadius: 12, padding: 11, display: 'flex', flexDirection: 'column', gap: 9, borderColor: c.do_not_rent ? 'var(--negative-border)' : undefined }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        {avatar(c.full_name, 30)}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.full_name}</div>
                          {c.deal_value != null && <div style={{ fontSize: 11, fontWeight: 700, fontFamily: T.font.num, color: 'var(--text-secondary)' }}>{fe(c.deal_value, 0)}</div>}
                        </div>
                        {c.do_not_rent && <Badge tone="negative">Προσοχή</Badge>}
                      </div>
                      {c.next_action && <div style={{ fontSize: 11, color: overdue(c) ? 'var(--negative)' : 'var(--text-tertiary)' }}>{c.next_action}</div>}
                      <select value={c.stage} onClick={e => e.stopPropagation()} onChange={e => setStage(c, e.target.value as Stage)} style={{ ...inp, cursor: 'pointer', fontSize: 11, height: 32, padding: '4px 8px' }}>
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
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', width: 'min(720px, 100%)', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
            {/* Sticky header: avatar + όνομα + σήματα + βαθμολογία + ενέργειες */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--bg-surface)' }}>
              {avatar(dc.full_name, 52)}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 20, fontWeight: 700 }}>{dc.full_name}</span>
                  <Badge tone={TYPE_TONE[dc.type]}>{CLIENT_TYPE_LABELS[dc.type]}</Badge>
                  {dc.vip && <Badge tone="accent">VIP</Badge>}
                  {dc.do_not_rent && <Badge tone="negative">Μαύρη λίστα</Badge>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <Stars value={dc.rating || 0} onSet={n => patchClient(dc.id, { rating: n })} size={20} />
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{dc.rating ? `${dc.rating}/5` : 'Χωρίς βαθμολογία'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <Btn variant="secondary" onClick={() => openEdit(dc)}>Επεξεργασία Στοιχείων</Btn>
                <button onClick={() => setOpenId(null)} title="Κλείσιμο" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 10, width: 38, height: 38, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}>×</button>
              </div>
            </div>

            {/* Σώμα με κύλιση */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 24px' }}>
            {dc.do_not_rent && <InfoBanner tone="negative">Ο πελάτης βρίσκεται στη μαύρη λίστα. Απαιτείται προσοχή πριν από νέα κράτηση ή συμφωνία.</InfoBanner>}

            {/* Μαύρη λίστα + ετικέτες */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20, marginTop: 14 }}>
              <FlagSwitch on={!!dc.do_not_rent} onChange={v => patchClient(dc.id, { do_not_rent: v })} onLabel="Στη μαύρη λίστα / Προσοχή" offLabel="Μαύρη λίστα / Προσοχή" />
              <FlagSwitch on={!!dc.vip} onChange={v => patchClient(dc.id, { vip: v })} onLabel="VIP" offLabel="VIP" tone="accent" />
              <div>
                <div style={lbl}>Ετικέτες</div>
                <TagEditor tags={dc.tags || []} onChange={t => patchClient(dc.id, { tags: t })} />
              </div>
            </div>

            {/* Επικοινωνία */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: 14, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 10 }}>
                {([
                  ['Τηλέφωνο', dc.phone ? <a href={`tel:${dc.phone}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{dc.phone}</a> : null],
                  ['Email', dc.email ? <a href={`mailto:${dc.email}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>{dc.email}</a> : null],
                  ['Διεύθυνση', dc.address || null],
                  ['ΑΦΜ', dc.afm ? <span style={{ fontFamily: T.font.mono }}>{dc.afm}</span> : null],
                  ['Ταυτότητα', dc.id_number || null],
                  ['Εθνικότητα', dc.nationality || null],
                  ['Πηγή', dc.source || null],
                ] as [string, React.ReactNode][]).filter(([, v]) => v != null).map(([k, v], i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{v}</div>
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

            {/* Συνδεδεμένα ακίνητα (ο έλεγχος σύνδεσης ζει εδώ, όχι στην κάρτα) */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ ...lbl, marginBottom: 8 }}>Συνδεδεμένα ακίνητα</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {(propsByClient.get(dc.id) || []).map(p => (
                  <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 11px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                    <button onClick={() => onSelectProperty?.(p.id)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 12, padding: 0, fontFamily: T.font.sans }}>{p.name}</button>
                    <button onClick={() => unlinkProperty(p.id)} title="Αποσύνδεση" style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 15 }}>×</button>
                  </span>
                ))}
                {(propsByClient.get(dc.id) || []).length === 0 && unlinkedProps.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Κανένα ακίνητο</span>}
                {unlinkedProps.length > 0 && (
                  <select value="" onChange={e => { if (e.target.value) linkProperty(dc.id, e.target.value); }} style={{ ...inp, cursor: 'pointer', fontSize: 12, height: 36, width: 'auto', minWidth: 170, padding: '4px 12px' }}>
                    <option value="" disabled hidden>Πρόσθεσε Ακίνητο</option>
                    {unlinkedProps.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
              </div>
            </div>

            {/* Αναλυτικά: μόνο όταν υπάρχουν διαμονές (αλλιώς περιττά μηδενικά) */}
            {dcStats.stayCount > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 116px), 1fr))', gap: 10, marginBottom: 24 }}>
                {statTile('Έσοδα', fe(dcStats.revenue, 0))}
                {statTile('Νύχτες', String(dcStats.nights))}
                {statTile('Διαμονές', String(dcStats.stayCount))}
                {statTile('Βαθμολογία', dcStats.avgRating != null ? `${dcStats.avgRating}/5` : '-')}
                {statTile('ADR', fe(dcStats.adr, 0), { title: 'Μέση τιμή ανά διανυκτέρευση' })}
                {statTile('Τελευταία', dcStats.lastVisit ? fd(dcStats.lastVisit) : '-')}
                {dcStats.damageTotal > 0 && statTile('Φθορές', fe(dcStats.damageTotal, 0), { neg: true })}
              </div>
            )}

            {/* Μικρο-γράφημα: πορεία εσόδων ανά διαμονή (μόνο για επαναλαμβανόμενους) */}
            {dcStays.length >= 2 && (
              <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: '12px 14px 8px', marginBottom: 24, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)' }}>Πορεία εσόδων ανά διαμονή</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.num }}>{fe(dcStats.revenue, 0)} συνολικά</span>
                </div>
                {sparkline(dcStays.slice().reverse().map(s => stayTotal(s)), 36)}
              </div>
            )}

            {/* Διαμονές / Επισκέψεις */}
            <div style={{ marginBottom: 24 }}>
              <SecHdr label="Διαμονές / Επισκέψεις" right={!stayFormOpen ? <Btn variant="secondary" onClick={openStayNew}>Νέα διαμονή</Btn> : undefined} />
              {stayFormOpen && (
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16, marginBottom: 14, boxShadow: 'var(--well-inset)' }}>
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
                      <div key={s.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
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

            {/* Μηνύματα (έτοιμα πρότυπα προς τον πελάτη/επισκέπτη) */}
            <div style={{ marginBottom: 24 }}>
              <SecHdr label="Μηνύματα" sub="Έτοιμα πρότυπα για WhatsApp, Viber ή αντιγραφή" />
              {!dc.phone && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>Χωρίς αποθηκευμένο τηλέφωνο θα διαλέξεις επαφή μέσα στην εφαρμογή. Πρόσθεσε τηλέφωνο για αποστολή με ένα άγγιγμα.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {MSG_TEMPLATES.map(t => {
                  const text = buildMessage(t.id, msgCtx!);
                  return (
                    <div key={t.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: '1 1 240px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>{t.label}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{text}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
                          <a href={whatsappLink(dc.phone ? msgDigits(dc.phone) : '', text)} target="_blank" rel="noopener noreferrer" style={msgLink}>WhatsApp</a>
                          <a href={viberTextLink(text)} style={msgLink}>Viber</a>
                          <button onClick={() => navigator.clipboard?.writeText(text)} style={{ ...msgLink, cursor: 'pointer', fontFamily: T.font.sans }}>Αντιγραφή</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Έγγραφα (ταυτότητα, συμβόλαιο, αποδείξεις) */}
            <div style={{ marginBottom: 24 }}>
              <SecHdr label="Έγγραφα" sub="Ταυτότητα, συμβόλαιο, αποδείξεις — ασφαλής αποθήκευση" />
              <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ minWidth: 200, flex: '1 1 200px' }}>
                  <CustomSelect label="Είδος εγγράφου" value={docKind} onChange={setDocKind} options={DOC_KINDS.map(k => ({ value: k, label: DOC_KIND_LABELS[k] }))} />
                </div>
                <input ref={docFileRef} type="file" style={{ display: 'none' }} onChange={e => onDocFile(e.target.files?.[0])} />
                <Btn variant="secondary" onClick={() => docFileRef.current?.click()} disabled={docBusy}>{docBusy ? 'Ανέβασμα…' : 'Ανέβασμα αρχείου'}</Btn>
              </div>
              {docMsg && <div style={{ fontSize: 12, color: docMsg.error ? 'var(--negative)' : 'var(--positive)', marginBottom: 12 }}>{docMsg.text}</div>}
              {docs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Δεν έχουν αποθηκευτεί έγγραφα.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {docs.map(d => (
                    <div key={d.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                          {DOC_KIND_LABELS[d.kind] || 'Άλλο'}{fmtBytes(d.size) ? ` · ${fmtBytes(d.size)}` : ''} · {fd(d.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {d.signedUrl && <a href={d.signedUrl} target="_blank" rel="noopener noreferrer" style={msgLink}>Άνοιγμα</a>}
                        <button onClick={() => delDoc(d)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Διαγραφή</button>
                      </div>
                    </div>
                  ))}
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
                          <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: nt.kind === 'damage' ? 'var(--negative)' : 'var(--accent)' }} />
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
        </div>
      )}

      {/* ── Εισαγωγή iCal (Airbnb/Booking) ────────────────────────────────── */}
      {icalOpen && (
        <div onClick={() => setIcalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(680px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Εισαγωγή iCal</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Συγχρονισμός κρατήσεων από Airbnb ή Booking</div>
              </div>
              <button onClick={() => setIcalOpen(false)} title="Κλείσιμο" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0 }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px 24px' }}>
              <InfoBanner tone="info">Το iCal δίνει μόνο τις ημερομηνίες κράτησης, χωρίς όνομα επισκέπτη ή τιμή. Οι εισαγωγές καταχωρούνται σε συγκεντρωτικό πελάτη ανά κανάλι (π.χ. «Κρατήσεις Airbnb») για σωστή πληρότητα και ιστορικό. Αποθήκευσε τον σύνδεσμο για αυτόματο συγχρονισμό, ή επικόλλησε χειροκίνητα το .ics.</InfoBanner>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14, margin: '16px 0' }}>
                <CustomSelect label="Ακίνητο" value={icalPropertyId} onChange={setIcalPropertyId} options={props.map(p => ({ value: p.id, label: p.name }))} placeholder="Επίλεξε ακίνητο" />
                <CustomSelect label="Κανάλι" value={icalChannel} onChange={v => setIcalChannel(v as 'airbnb' | 'booking' | 'other')} options={[{ value: 'airbnb', label: 'Airbnb' }, { value: 'booking', label: 'Booking' }, { value: 'other', label: 'Άλλο' }]} />
              </div>

              {/* Αυτόματος συγχρονισμός μέσω συνδέσμου (server-side, χωρίς CORS) */}
              {secHead('Αυτόματος συγχρονισμός (σύνδεσμος)')}
              <div style={{ marginBottom: 12 }}>
                <TextInput label="Σύνδεσμος iCal (URL)" value={icalUrl} onChange={setIcalUrl} placeholder="https://www.airbnb.com/calendar/ical/....ics" />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <Btn variant="secondary" onClick={fetchIcalFromUrl} disabled={icalBusy || !icalUrl.trim()}>{icalBusy ? 'Ανάκτηση…' : 'Ανάκτηση & προεπισκόπηση'}</Btn>
                <Btn variant="primary" onClick={saveIcalFeed} disabled={icalBusy || !icalUrl.trim() || !icalPropertyId}>Αποθήκευση & αυτόματος συγχρονισμός</Btn>
              </div>

              {/* Αποθηκευμένοι σύνδεσμοι (ανά επιλεγμένο ακίνητο) */}
              {icalPropertyId && icalFeeds.filter(f => f.property_id === icalPropertyId).length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
                  {icalFeeds.filter(f => f.property_id === icalPropertyId).map(f => (
                    <div key={f.id} style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: 12, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: '1 1 220px' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{f.channel === 'airbnb' ? 'Airbnb' : f.channel === 'booking' ? 'Booking' : 'Άλλο'}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.url}</div>
                          <div style={{ fontSize: 11, color: f.last_status?.startsWith('error') ? 'var(--negative)' : 'var(--text-secondary)', marginTop: 4 }}>
                            {f.last_synced_at ? `Τελευταίος συγχρονισμός: ${fd(f.last_synced_at)}${f.last_status ? ` · ${f.last_status}` : ''}` : 'Δεν έχει συγχρονιστεί ακόμη'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => syncIcalNow(f.property_id)} disabled={icalBusy} style={{ ...msgLink, cursor: 'pointer', fontFamily: T.font.sans }}>Συγχρονισμός τώρα</button>
                          <button onClick={() => delIcalFeed(f)} style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, fontFamily: T.font.sans, padding: 0 }}>Αφαίρεση</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Χειροκίνητη εισαγωγή με επικόλληση */}
              {secHead('Χειροκίνητα (επικόλληση .ics)')}
              <div style={{ marginBottom: 12 }}>
                <Textarea label="Περιεχόμενο .ics" value={icalText} onChange={setIcalText} rows={5} placeholder="BEGIN:VCALENDAR ..." />
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
                <Btn variant="secondary" onClick={parseIcalInput} disabled={icalBusy}>Ανάλυση επικόλλησης</Btn>
                {icalEvents && <FlagSwitch on={icalIncludeBlocked} onChange={setIcalIncludeBlocked} onLabel="Και μπλοκαρίσματα ημερομηνιών" offLabel="Μόνο κρατήσεις" />}
              </div>
              {icalMsg && <div style={{ fontSize: 12, color: icalMsg.error ? 'var(--negative)' : 'var(--positive)', marginBottom: 12, lineHeight: 1.5 }}>{icalMsg.text}</div>}
              {icalEvents && (() => {
                const drafts = icalToStayDrafts(icalEvents, { propertyId: icalPropertyId || 'x', channel: icalChannel });
                const bookings = drafts.filter(d => !d.blocked);
                const blocks = drafts.filter(d => d.blocked);
                const toImport = icalIncludeBlocked ? drafts : bookings;
                const nights = toImport.reduce((s, d) => s + d.nights, 0);
                return (
                  <div style={{ background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 14, marginBottom: 4 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 12 }}>
                      {statTile('Κρατήσεις', String(bookings.length))}
                      {statTile('Μπλοκαρίσματα', String(blocks.length))}
                      {statTile('Νύχτες προς εισαγωγή', String(nights))}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                      {toImport.slice(0, 40).map((d, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: 'var(--text-secondary)', padding: '6px 10px', background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 8 }}>
                          <span>{fd(d.check_in)} - {fd(d.check_out)}</span>
                          <span style={{ color: 'var(--text-tertiary)' }}>{d.nights} νύχτες{d.blocked ? ' · μπλοκάρισμα' : ''}</span>
                        </div>
                      ))}
                      {toImport.length > 40 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', padding: 4 }}>και άλλες {toImport.length - 40}…</div>}
                    </div>
                  </div>
                );
              })()}
            </div>
            {icalEvents && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                <Btn variant="ghost" onClick={() => setIcalOpen(false)}>Κλείσιμο</Btn>
                <Btn variant="primary" onClick={importIcal} disabled={icalBusy || !icalPropertyId}>{icalBusy ? 'Εισαγωγή…' : 'Εισαγωγή κρατήσεων'}</Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Αναφορές (premium modal, ίδιο chrome με τη φόρμα) ──────────────── */}
      {reportsOpen && (
        <div onClick={() => setReportsOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(720px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
            {/* Sticky header: εικονίδιο + τίτλος + κλείσιμο */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="7" /><rect x="12" y="6" width="3" height="11" /><rect x="17" y="13" width="3" height="4" /></svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>Αναφορές</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Έσοδα, κανάλια και πληρότητα φιλοξενίας</div>
              </div>
              <button onClick={() => setReportsOpen(false)} title="Κλείσιμο" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0 }}>×</button>
            </div>
            {/* Σώμα με κύλιση */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2px 24px 24px' }}>
              {allStays.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.6, padding: '52px 16px' }}>
                  Δεν υπάρχουν καταγεγραμμένες διαμονές ακόμη. Πρόσθεσε διαμονές στους πελάτες για να δεις έσοδα ανά κανάλι, ανά μήνα και την πληρότητα της χρονιάς.
                </div>
              ) : (() => {
                const yearOf = (s: Stay) => { const d = s.check_in || s.check_out; return d ? new Date(d).getFullYear() : null; };
                const yearsAvail = Array.from(new Set(allStays.map(yearOf).filter((y): y is number => y != null)));
                if (!yearsAvail.includes(reportYear)) yearsAvail.push(reportYear);
                yearsAvail.sort((a, b) => b - a);
                const yStays = allStays.filter(s => yearOf(s) === reportYear);
                const tot = totals(yStays);
                const adr = tot.nights > 0 ? Math.round(tot.revenue / tot.nights) : 0;
                const chRows = revenueByChannel(yStays);
                const maxCh = Math.max(1, ...chRows.map(r => r.revenue));
                const months = revenueByMonth(yStays, reportYear);
                const maxMonth = Math.max(1, ...months);
                const occ = occupancyPct(yStays, `${reportYear}-01-01`, `${reportYear + 1}-01-01`);
                // Ποιότητα φιλοξενίας
                let ratingSum = 0, ratingCount = 0, damages = 0;
                yStays.forEach(s => { if (typeof s.rating === 'number') { ratingSum += s.rating; ratingCount++; } if (s.damages) damages++; });
                const avgRating = ratingCount ? Math.round((ratingSum / ratingCount) * 10) / 10 : null;
                // Επαναλαμβανόμενοι + κορυφαίοι πελάτες της χρονιάς
                const perClientCount = new Map<string, number>();
                const perClientRev = new Map<string, number>();
                yStays.forEach(s => {
                  perClientCount.set(s.client_id, (perClientCount.get(s.client_id) || 0) + 1);
                  perClientRev.set(s.client_id, (perClientRev.get(s.client_id) || 0) + stayTotal(s));
                });
                const repeatY = [...perClientCount.values()].filter(n => n >= 2).length;
                const topClients = [...perClientRev.entries()]
                  .map(([id, rev]) => ({ id, rev, count: perClientCount.get(id) || 0, name: clients.find(c => c.id === id)?.full_name || 'Πελάτης' }))
                  .sort((a, b) => b.rev - a.rev).slice(0, 5);
                const maxTop = Math.max(1, ...topClients.map(t => t.rev));
                const monthInitials = ['Ι', 'Φ', 'Μ', 'Α', 'Μ', 'Ι', 'Ι', 'Α', 'Σ', 'Ο', 'Ν', 'Δ'];
                const monthNames = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
                return (
                  <>
                    {/* Επιλογή έτους */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>Έτος</span>
                      <div style={{ position: 'relative' }}>
                        <button type="button" onClick={() => setReportYearMenu(m => !m)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontFamily: T.font.mono, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                          {reportYear}
                          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: reportYearMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.7 }}><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                        {reportYearMenu && (
                          <>
                            <div onClick={() => setReportYearMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 10, boxShadow: 'var(--elev-3)', padding: 6, minWidth: 96, maxHeight: 220, overflowY: 'auto' }}>
                              {yearsAvail.map(y => (
                                <button key={y} type="button" onClick={() => { setReportYear(y); setReportYearMenu(false); }}
                                  style={{ display: 'block', width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: y === reportYear ? 'var(--accent-dim)' : 'transparent', color: y === reportYear ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, fontSize: 13, fontWeight: y === reportYear ? 700 : 500, cursor: 'pointer', textAlign: 'left' }}>{y}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {secHead('Σύνοψη')}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 10 }}>
                      {statTile('Έσοδα', fe(tot.revenue, 0))}
                      {statTile('Νύχτες', String(tot.nights))}
                      {statTile('Διαμονές', String(tot.count))}
                      {statTile('Πληρότητα', occ + '%', { title: `1 Ιαν ${reportYear} έως 31 Δεκ ${reportYear}` })}
                    </div>

                    {secHead('Ποιότητα φιλοξενίας')}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))', gap: 10 }}>
                      {statTile('Μέση τιμή / νύχτα', fe(adr, 0), { title: 'Average Daily Rate' })}
                      {statTile('Επαναλαμβανόμενοι', String(repeatY), { title: 'Πελάτες με 2+ διαμονές τη χρονιά' })}
                      {statTile('Μέση βαθμολογία', avgRating != null ? `${avgRating}/5` : '—')}
                      {statTile('Φθορές', String(damages))}
                    </div>

                    {topClients.length > 0 && (<>
                      {secHead('Κορυφαίοι πελάτες')}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 14 }}>
                        {topClients.map(t => (
                          <button key={t.id} onClick={() => { setReportsOpen(false); setOpenId(t.id); }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', display: 'block' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.num, whiteSpace: 'nowrap' }}>{fe(t.rev, 0)}<span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>{t.count} {t.count === 1 ? 'διαμονή' : 'διαμονές'}</span></span>
                            </div>
                            <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.max(2, (t.rev / maxTop) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </>)}

                    {secHead('Έσοδα ανά κανάλι')}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--bg-base)', boxShadow: 'var(--well-inset)', borderRadius: 12, padding: 14 }}>
                      {chRows.map(r => (
                        <div key={r.channel}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{r.label}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.num, whiteSpace: 'nowrap' }}>{fe(r.revenue, 0)}<span style={{ color: 'var(--text-tertiary)', marginLeft: 8 }}>{r.nights} νύχτες · {r.count} διαμονές</span></span>
                          </div>
                          <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(2, (r.revenue / maxCh) * 100)}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {secHead(`Έσοδα ανά μήνα (${reportYear})`)}
                    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: 12, padding: '14px 14px 8px', boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
                        {months.map((v, i) => (
                          <div key={i} title={`${monthNames[i]}: ${fe(v, 0)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%' }}>
                            <div style={{ width: '100%', height: `${(v / maxMonth) * 100}%`, minHeight: v > 0 ? 3 : 0, background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} />
                          </div>
                        ))}
                      </div>
                      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '2px 0 6px' }} />
                      <div style={{ display: 'flex', gap: 6 }}>
                        {monthInitials.map((m, i) => (
                          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{m}</div>
                        ))}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Φόρμα νέου/επεξεργασίας πελάτη (premium, δομημένη σε ενότητες) ───── */}
      {modalOpen && (
        <div onClick={() => setModalOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 18, width: 'min(680px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: 'var(--elev-3)' }}>
            {/* Sticky header με avatar αρχικών */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontWeight: 700, fontSize: 15, fontFamily: T.font.sans, flexShrink: 0, letterSpacing: '0.02em' }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editing ? (form.full_name.trim() || 'Επεξεργασία πελάτη') : 'Νέα καταχώρηση'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{editing ? 'Επεξεργασία στοιχείων και σχέσης' : 'Πελάτης, υποψήφιος ή ιδιοκτήτης'}</div>
              </div>
              <button onClick={() => setModalOpen(false)} title="Κλείσιμο" style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18, flexShrink: 0 }}>×</button>
            </div>
            {/* Σώμα με κύλιση, οργανωμένο σε ενότητες */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '2px 24px 22px' }}>
              {secHead('Στοιχεία & επικοινωνία')}
              <div style={fGrid}>
                <div style={{ gridColumn: '1 / -1' }}><TextInput label="Ονοματεπώνυμο *" value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} /></div>
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
                <TextInput label="Πηγή γνωριμίας" value={form.source} onChange={v => setForm(f => ({ ...f, source: v }))} placeholder="π.χ. Airbnb, σύσταση" />
              </div>

              {secHead('Σχέση & στάδιο')}
              <div style={fGrid}>
                <CustomSelect label="Στάδιο" value={form.stage} onChange={v => setForm(f => ({ ...f, stage: v as Stage }))} options={stageOptions} />
                <NumberInput label="Αξία ευκαιρίας" value={form.deal_value} onChange={v => setForm(f => ({ ...f, deal_value: v }))} suffix="€" />
                <TextInput label="Επόμενη ενέργεια" value={form.next_action} onChange={v => setForm(f => ({ ...f, next_action: v }))} placeholder="π.χ. Επίσκεψη ακινήτου" />
                <DatePicker label="Ημερομηνία ενέργειας" value={form.next_date} onChange={v => setForm(f => ({ ...f, next_date: v }))} />
                <div>
                  <div style={lbl}>Βαθμολογία</div>
                  <div style={{ height: 42, display: 'flex', alignItems: 'center' }}><Stars value={form.rating} onSet={n => setForm(f => ({ ...f, rating: n }))} size={22} /></div>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                  <FlagSwitch on={form.do_not_rent} onChange={v => setForm(f => ({ ...f, do_not_rent: v }))} onLabel="Στη μαύρη λίστα" offLabel="Μαύρη λίστα / Προσοχή" />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 8 }}>
                  <FlagSwitch on={form.vip} onChange={v => setForm(f => ({ ...f, vip: v }))} onLabel="VIP" offLabel="VIP" tone="accent" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={lbl}>Ετικέτες</div>
                  <TagEditor tags={form.tags} onChange={t => setForm(f => ({ ...f, tags: t }))} />
                </div>
              </div>

              {secHead('Αναζήτηση ακινήτου (μεσίτης)')}
              <div style={fGrid}>
                <NumberInput label="Προϋπολογισμός" value={form.budget} onChange={v => setForm(f => ({ ...f, budget: v }))} suffix="€" />
                <div style={{ gridColumn: '1 / -1' }}>
                  <Textarea label="Ανάγκες και επιθυμίες" value={form.needs} onChange={v => setForm(f => ({ ...f, needs: v }))} placeholder="π.χ. 2 δωμάτια, κέντρο, έως 3ος όροφος, μπαλκόνι" rows={2} />
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <Textarea label="Σημειώσεις" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} rows={3} placeholder="Ελεύθερες σημειώσεις για τον πελάτη" />
              </div>
            </div>
            {/* Sticky footer */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--bg-surface)' }}>
              <Btn variant="ghost" onClick={() => setModalOpen(false)}>Ακύρωση</Btn>
              <Btn variant="primary" onClick={save} disabled={saving || !form.full_name.trim()}>{saving ? 'Αποθήκευση…' : 'Αποθήκευση'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
