'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PropertyAssistant — ο προσωπικός βοηθός ακινήτων, ορατός ΠΑΝΤΟΥ στην εφαρμογή.
// Πλωτό κουμπί (FAB) σε κάθε καρτέλα → πάνελ συνομιλίας. Ο χρήστης διαλέγει όνομα
// & φύλο. Απαντά με ανθρώπινη ψυχή σε ΟΤΙΔΗΠΟΤΕ (χαλαρά ή σύνθετα ακινήτων),
// δίνει γνώμη, παραπέμπει στον σωστό επαγγελματία, και καθοδηγεί μέσα στο app.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T } from '@/components/Theme';
import {
  type AssistantIdentity, type Gender, DEFAULT_IDENTITY, GENDER_OPTIONS, NAME_SUGGESTIONS,
  NAV_MAP, buildSystemPrompt, parseAction, loadIdentity, saveIdentity,
  loadHistory, saveHistory, clearHistory,
} from './assistantPersona';

interface PropContext { name: string; propType?: string; address?: string; value?: number; sqm?: number; status?: string; targetRent?: number; }
interface PropSummary { name: string; propType?: string; value?: number; targetRent?: number; sqm?: number; status?: string; }
interface Props { propertyId: string; userId: string; propContext: PropContext; allProperties?: PropSummary[]; onNavigate: (tab: string) => void; onScan: () => void; }
type Action = { type: 'go'; tab: string } | { type: 'scan' };
interface Msg { role: 'user' | 'assistant'; text: string; action?: Action; }

const eur = (n?: number | null) => n == null ? '—' : `${Math.round(n).toLocaleString('el-GR')} €`;
const navLabel = (id: string) => NAV_MAP.find(n => n.id === id)?.label || id;

const SUGGESTED = [
  'Τι εκκρεμεί τώρα;',
  'Πόσα ξόδεψα φέτος και πού;',
  'Πώς φορολογείται το ενοίκιό μου;',
  'Πώς ανεβάζω την αξία του ακινήτου;',
];

export default function PropertyAssistant({ propertyId, userId, propContext, allProperties = [], onNavigate, onScan }: Props) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [identity, setIdentity] = useState<AssistantIdentity>(DEFAULT_IDENTITY);
  const [hasIdentity, setHasIdentity] = useState(true);
  const [editing, setEditing] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ctxStr, setCtxStr] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Ταυτότητα από localStorage (μία φορά)
  useEffect(() => {
    const saved = loadIdentity();
    if (saved) { setIdentity(saved); setHasIdentity(true); }
    else { setHasIdentity(false); }
  }, []);

  // Μνήμη ανά ακίνητο: φόρτωσε προηγούμενη συζήτηση (αν το επιτρέπει ο χρήστης),
  // και ξεκίνα καθαρά όταν αλλάζει ακίνητο. Διαβάζουμε τη ρύθμιση από το storage
  // (πηγή αλήθειας) για να μη «χτυπάει» με το αρχικό state.
  useEffect(() => {
    setCtxStr('');
    const mem = loadIdentity()?.memory !== false;
    setMsgs(mem ? loadHistory(propertyId).map(m => ({ role: m.role, text: m.text })) : []);
  }, [propertyId]);

  // Αποθήκευση συζήτησης όταν η μνήμη είναι ενεργή.
  useEffect(() => {
    if (identity.memory && msgs.length) saveHistory(propertyId, msgs.map(({ role, text }) => ({ role, text })));
  }, [msgs, identity.memory, propertyId]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy, editing]);

  // Σύγκριση ακινήτων — δίνεται στο μοντέλο μόνο αν το ζητήσει ο χρήστης.
  const allPropsContext = identity.compare && allProperties.length > 1
    ? allProperties.map((p, i) => {
        const y = p.value && p.targetRent ? ((p.targetRent * 12 / p.value) * 100).toFixed(1) : null;
        return `${i + 1}. ${p.name}${p.propType ? ` (${p.propType})` : ''}: αξία ${eur(p.value)}, ενοίκιο-στόχος ${eur(p.targetRent)}/μήνα${y ? `, μεικτή απόδοση ~${y}%` : ''}${p.sqm ? `, ${p.sqm} τ.μ.` : ''}${p.status ? `, ${p.status}` : ''}`;
      }).join('\n')
    : undefined;

  // Φόρτωση δεδομένων ακινήτου (μία φορά όταν ανοίξει), για συγκεκριμένες απαντήσεις.
  const loadContext = useCallback(async () => {
    const year = new Date().getFullYear();
    const [{ data: exp }, { data: bil }, { data: ten }, { data: st }, { data: cal }] = await Promise.all([
      supabase.from('expenses').select('amount,category,date,paid').eq('property_id', propertyId).eq('user_id', userId).gte('date', `${year}-01-01`),
      supabase.from('bills').select('name,amount,paid,due_date,category').eq('property_id', propertyId).eq('user_id', userId),
      supabase.from('tenants').select('full_name,monthly_rent,lease_end,deposit_amount').eq('property_id', propertyId).eq('user_id', userId).order('updated_at', { ascending: false }).limit(1),
      supabase.from('property_settings').select('insurance_company,insurance_expiry').eq('property_id', propertyId).maybeSingle(),
      supabase.from('calendar_events').select('title,event_date,amount,status').eq('property_id', propertyId).eq('user_id', userId).gte('event_date', new Date().toISOString().split('T')[0]).order('event_date').limit(10),
    ]);
    const expenses = exp || [];
    const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const paid = expenses.filter(e => (e as any).paid !== false).reduce((s, e) => s + (e.amount || 0), 0);
    const catMap: Record<string, number> = {};
    expenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + (e.amount || 0); });
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const unpaid = (bil || []).filter(b => !b.paid);
    const t = ten?.[0];
    const rent = t?.monthly_rent || propContext.targetRent || 0;
    const value = propContext.value || 0;
    const grossY = value > 0 ? (rent * 12 / value) * 100 : 0;
    const netY = value > 0 ? ((rent * 12 - total) / value) * 100 : 0;
    const leaseEnd = t?.lease_end || null;
    const daysLease = leaseEnd ? Math.ceil((new Date(leaseEnd).getTime() - Date.now()) / 86400000) : null;

    const lines = [
      `Ακίνητο: ${propContext.name}${propContext.propType ? ` (${propContext.propType})` : ''}${propContext.address ? `, ${propContext.address}` : ''}`,
      propContext.sqm ? `Εμβαδόν: ${propContext.sqm} τ.μ.` : '',
      value ? `Εμπορική αξία: ${eur(value)}` : 'Εμπορική αξία: δεν έχει καταχωρηθεί',
      propContext.status ? `Κατάσταση: ${propContext.status}` : '',
      `Ενοίκιο: ${eur(rent)}/μήνα (ετήσιο ${eur(rent * 12)})`,
      value ? `Απόδοση: μεικτή ${grossY.toFixed(1)}%, καθαρή ${netY.toFixed(1)}%` : '',
      `Δαπάνες ${year}: σύνολο ${eur(total)} (πληρωμένες ${eur(paid)}, εκκρεμείς ${eur(total - paid)})`,
      topCats.length ? `Μεγαλύτερες κατηγορίες: ${topCats.map(([c, a]) => `${c} ${eur(a)}`).join(', ')}` : '',
      unpaid.length ? `Απλήρωτοι λογαριασμοί (${unpaid.length}): ${unpaid.slice(0, 12).map(b => `${(b as any).name || 'λογαριασμός'} ${eur(b.amount)}${(b as any).due_date ? ` λήξη ${(b as any).due_date}` : ''}`).join('; ')}` : 'Δεν υπάρχουν απλήρωτοι λογαριασμοί.',
      t ? `Ενοικιαστής: ${t.full_name || 'καταχωρημένος'}${t.deposit_amount ? `, εγγύηση ${eur(t.deposit_amount)}` : ''}` : 'Δεν έχει καταχωρηθεί ενοικιαστής.',
      leaseEnd ? `Λήξη μίσθωσης: ${leaseEnd}${daysLease != null ? ` (σε ${daysLease} ημέρες)` : ''}` : '',
      st?.insurance_company || st?.insurance_expiry ? `Ασφάλεια: ${st?.insurance_company || 'εταιρεία άγνωστη'}${st?.insurance_expiry ? `, λήξη ${st.insurance_expiry}` : ''}` : 'Ασφάλεια: δεν έχει καταχωρηθεί.',
      (cal || []).length ? `Επόμενα στο ημερολόγιο: ${(cal || []).map(c => `${c.event_date} ${c.title}${c.amount ? ` ${eur(c.amount)}` : ''}`).join('; ')}` : '',
    ].filter(Boolean);
    setCtxStr(lines.join('\n'));
  }, [propertyId, userId, propContext, supabase]);

  useEffect(() => { if (open && !ctxStr) loadContext(); }, [open, ctxStr, loadContext]);

  const runAction = (a?: Action, keepOpen = false) => {
    if (!a) return;
    if (a.type === 'scan') onScan();
    else if (a.type === 'go') onNavigate(a.tab);
    if (!keepOpen) setOpen(false);
  };

  // ── Φωνή: ομιλία στα ελληνικά (hands-free) ─────────────────────────────────
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [handsFree, setHandsFree] = useState(false);
  const recRef = useRef<any>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const handsFreeRef = useRef(false);
  const supportsSTT = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const supportsTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;
  useEffect(() => { handsFreeRef.current = handsFree; }, [handsFree]);

  useEffect(() => {
    if (!supportsTTS) return;
    const load = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
    load(); window.speechSynthesis.onvoiceschanged = load;
    return () => { try { window.speechSynthesis.onvoiceschanged = null; window.speechSynthesis.cancel(); } catch { /* ignore */ } };
  }, [supportsTTS]);

  const pickVoice = (): SpeechSynthesisVoice | null => {
    const el = voicesRef.current.filter(v => v.lang && v.lang.toLowerCase().startsWith('el'));
    if (!el.length) return null;
    const find = (re: RegExp) => el.find(v => re.test(v.name));
    if (identity.gender === 'female') return find(/female|woman|γυναι|Melina|Maria/i) || el[0];
    if (identity.gender === 'male') return find(/male|man|άνδρ|ανδρ|Nicolas|Stefanos|Giorgos/i) || el[0];
    return find(/Google/i) || el[0];
  };

  const speak = (text: string, after?: () => void) => {
    if (!supportsTTS || !text) { after?.(); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice(); if (v) u.voice = v;
      u.lang = 'el-GR'; u.rate = 1.0; u.pitch = identity.gender === 'female' ? 1.06 : identity.gender === 'male' ? 0.94 : 1.0;
      u.onstart = () => setSpeaking(true);
      u.onend = () => { setSpeaking(false); after?.(); };
      u.onerror = () => { setSpeaking(false); after?.(); };
      window.speechSynthesis.speak(u);
    } catch { after?.(); }
  };
  const stopSpeaking = () => { try { window.speechSynthesis?.cancel(); } catch { /* ignore */ } setSpeaking(false); };

  const stopListening = () => { try { recRef.current?.stop(); } catch { /* ignore */ } setListening(false); };
  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    stopSpeaking();
    const rec = new SR();
    rec.lang = 'el-GR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += tr; else interim += tr;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => { setListening(false); const t = finalText.trim(); if (t) { setInput(''); ask(t, true); } };
    recRef.current = rec; setInput(''); setListening(true);
    try { rec.start(); } catch { setListening(false); }
  };
  const toggleMic = () => { if (listening) stopListening(); else { setOpen(true); startListening(); } };

  const ask = async (question: string, viaVoice = false) => {
    const q = question.trim();
    if (!q || busy) return;
    setErr(''); setInput('');
    const history = [...msgs, { role: 'user' as const, text: q }];
    setMsgs(history); setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const system = buildSystemPrompt(identity, ctxStr || 'Τα δεδομένα φορτώνονται.', allPropsContext);
      const res = await fetch('/api/anthropic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ max_tokens: 900, system, messages: history.map(m => ({ role: m.role, content: m.text })) }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(String(data?.error || '').includes('ANTHROPIC_API_KEY') ? 'key' : 'service'); setMsgs(m => m.slice(0, -1)); return; }
      const raw: string = data?.content?.find((c: { type: string }) => c.type === 'text')?.text || 'Δεν έχω απάντηση αυτή τη στιγμή.';
      const { clean, action } = parseAction(raw);
      setMsgs(m => [...m, { role: 'assistant', text: clean, action }]);
      // Φωνητική απάντηση + εκτέλεση ενέργειας / συνέχιση συνομιλίας.
      if (viaVoice || handsFreeRef.current) {
        speak(clean, () => {
          if (action) runAction(action, true);
          if (handsFreeRef.current) setTimeout(() => startListening(), 350);
        });
      }
    } catch { setErr('service'); setMsgs(m => m.slice(0, -1)); }
    finally { setBusy(false); }
  };

  const initial = (identity.name || 'A').trim().charAt(0).toUpperCase();
  const greeting = hasIdentity
    ? `Γεια σου! Είμαι ${identity.name}. Ρώτησέ με οτιδήποτε για ${propContext.name} ή για ακίνητα γενικά.`
    : `Γεια σου! Θα είμαι ο βοηθός σου. Πρώτα, πες μου πώς να με λες.`;

  // Χρωματική ταυτότητα avatar ανά φύλο (διακριτικά).
  const avatarBg = identity.gender === 'female' ? 'linear-gradient(135deg,#ec4899,#f9a8d4)'
    : identity.gender === 'male' ? 'linear-gradient(135deg,var(--accent),#8ab4f8)'
    : 'linear-gradient(135deg,#8b5cf6,#22d3ee)';

  return (
    <>
      {/* FAB — ορατό σε κάθε καρτέλα */}
      <button className="pa-fab" onClick={() => setOpen(o => !o)} aria-label="Βοηθός ακινήτου"
        style={{ background: avatarBg }}>
        {open
          ? <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          : <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.3L19 10l-5.1 1.7L12 17l-1.9-5.3L5 10l5.1-1.7z" /></svg>}
      </button>

      {open && (
        <div className="pa-panel">
          {/* Κεφαλίδα */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: T.font.sans, fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{initial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{identity.name}</div>
              <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-secondary)' }}>Ο βοηθός σου για τα ακίνητα</div>
            </div>
            {(supportsSTT || supportsTTS) && (
              <button onClick={() => { const next = !handsFree; setHandsFree(next); if (next && supportsSTT) { setOpen(true); startListening(); } else { stopListening(); stopSpeaking(); } }}
                title={handsFree ? 'Κλείσε τη λειτουργία φωνής' : 'Λειτουργία φωνής (μίλα ελεύθερα)'} aria-label="Λειτουργία φωνής"
                style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: handsFree ? 'var(--accent)' : 'transparent', color: handsFree ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 18 0" /><path d="M21 12v3a2 2 0 0 1-2 2h-1v-5h3z" /><path d="M3 12v3a2 2 0 0 0 2 2h1v-5H3z" /></svg>
              </button>
            )}
            <button onClick={() => setEditing(e => !e)} title="Προσάρμοσε τον βοηθό" aria-label="Ρυθμίσεις βοηθού"
              style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: editing ? 'var(--accent-dim)' : 'transparent', color: editing ? 'var(--accent)' : 'var(--text-tertiary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </button>
          </div>
          {(listening || speaking) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', background: 'var(--accent-dim)', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: listening ? 'var(--negative)' : 'var(--accent)', animation: 'pa-pulse 1.1s infinite' }} />
              <span style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{listening ? 'Ακούω…' : `${identity.name} μιλάει…`}</span>
              {speaking && <button onClick={stopSpeaking} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700 }}>Σταμάτα</button>}
            </div>
          )}

          {/* Επεξεργασία ταυτότητας */}
          {(editing || !hasIdentity) ? (
            <IdentityEditor
              draft={identity}
              hasMemory={msgs.length > 0 || loadHistory(propertyId).length > 0}
              onCancel={hasIdentity ? () => setEditing(false) : undefined}
              onClearMemory={() => { clearHistory(propertyId); setMsgs([]); }}
              onSave={(id) => {
                // Αν έκλεισε τη μνήμη, σβήσε ό,τι έχει αποθηκευτεί (σεβασμός στην επιλογή).
                if (identity.memory && !id.memory) clearHistory(propertyId);
                setIdentity(id); saveIdentity(id); setHasIdentity(true); setEditing(false);
              }}
            />
          ) : (
            <>
              {/* Σώμα */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 11 }}>
                {msgs.length === 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ maxWidth: '90%', padding: '11px 14px', borderRadius: 14, borderBottomLeftRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.55, color: 'var(--text-primary)' }}>{greeting}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {SUGGESTED.map(s => (
                        <button key={s} onClick={() => ask(s)} style={{ fontFamily: T.font.sans, fontSize: 12, padding: '7px 12px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>{s}</button>
                      ))}
                    </div>
                  </div>
                )}
                {msgs.map((m, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
                    <div style={{ maxWidth: '90%', padding: '11px 14px', borderRadius: 14, fontFamily: T.font.sans, fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                      background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-elevated)', color: m.role === 'user' ? 'var(--accent-text)' : 'var(--text-primary)',
                      border: m.role === 'user' ? 'none' : '1px solid var(--border-subtle)', borderBottomRightRadius: m.role === 'user' ? 4 : 14, borderBottomLeftRadius: m.role === 'user' ? 14 : 4 }}>{m.text}</div>
                    {m.action && (
                      <button onClick={() => runAction(m.action)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {m.action.type === 'scan' ? 'Σκάναρε έγγραφο' : `Πήγαινε: ${navLabel(m.action.tab)}`}
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                      </button>
                    )}
                  </div>
                ))}
                {busy && <div style={{ display: 'flex', gap: 5, padding: '4px 2px' }}>{[0, 1, 2].map(i => <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-tertiary)', animation: `pa-bounce 1s ${i * 0.15}s infinite ease-in-out` }} />)}</div>}
                {err && (
                  <div style={{ background: err === 'key' ? 'var(--info-soft)' : 'var(--warning-soft)', border: `1px solid ${err === 'key' ? 'var(--info-border)' : 'var(--warning-border)'}`, borderRadius: T.radius.inner, padding: '10px 13px', fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    {err === 'key' ? `Ο ${identity.name} χρειάζεται ενεργό κλειδί AI για να απαντήσει. Μόλις ενεργοποιηθεί, θα μιλάει ζωντανά για το ακίνητό σου.` : 'Δεν μπόρεσα να απαντήσω τώρα, δοκίμασε ξανά σε λίγο.'}
                  </div>
                )}
              </div>

              {/* Είσοδος */}
              <div style={{ display: 'flex', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', alignItems: 'center' }}>
                {supportsSTT && (
                  <button onClick={toggleMic} disabled={busy} aria-label={listening ? 'Σταμάτα' : 'Μίλα'} title={listening ? 'Σταμάτα' : 'Μίλα στα ελληνικά'}
                    style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: listening ? 'var(--negative)' : 'var(--bg-elevated)', color: listening ? '#fff' : 'var(--text-secondary)', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: listening ? 'pa-pulse 1.1s infinite' : 'none' }}>
                    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v4" /></svg>
                  </button>
                )}
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ask(input); }} placeholder={listening ? 'Ακούω…' : `Ρώτησε τον/την ${identity.name}…`} disabled={busy}
                  style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.pill, padding: '10px 15px', color: 'var(--text-primary)', fontSize: 13, fontFamily: T.font.sans, outline: 'none' }}
                  onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
                <button onClick={() => ask(input)} disabled={busy || !input.trim()} aria-label="Αποστολή"
                  style={{ width: 42, height: 42, flexShrink: 0, borderRadius: '50%', border: 'none', background: input.trim() && !busy ? 'var(--accent)' : 'var(--bg-elevated)', color: input.trim() && !busy ? 'var(--accent-text)' : 'var(--text-tertiary)', cursor: input.trim() && !busy ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" /></svg>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <style>{`
        @keyframes pa-bounce{0%,80%,100%{transform:translateY(0);opacity:.4}40%{transform:translateY(-5px);opacity:1}}
        @keyframes pa-pulse{0%,100%{box-shadow:0 0 0 0 rgba(234,67,53,.4)}50%{box-shadow:0 0 0 6px rgba(234,67,53,0)}}
        .pa-fab{position:fixed;right:24px;bottom:24px;width:58px;height:58px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(60,64,67,.35),0 2px 6px rgba(60,64,67,.2);z-index:1200;transition:transform .12s}
        .pa-fab:hover{transform:scale(1.06)}
        .pa-fab:active{transform:scale(.96)}
        .pa-panel{position:fixed;right:24px;bottom:92px;width:390px;max-width:calc(100vw - 32px);height:min(600px,calc(100vh - 130px));background:var(--bg-surface);border:1px solid var(--border-subtle);border-radius:18px;box-shadow:0 12px 40px rgba(0,0,0,.24);z-index:1200;display:flex;flex-direction:column;overflow:hidden}
        @media (max-width:600px){
          .pa-fab{bottom:78px;right:16px}
          .pa-panel{right:8px;left:8px;bottom:74px;width:auto;max-width:none;height:min(560px,calc(100vh - 96px))}
        }
      `}</style>
    </>
  );
}

// ── Διακόπτης (toggle) ──────────────────────────────────────────────────────
function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} role="switch" aria-checked={on}
      style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', flexShrink: 0, background: on ? 'var(--accent)' : 'var(--border-default)', position: 'relative', transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
    </button>
  );
}

// ── Επεξεργαστής ταυτότητας (όνομα + φύλο + μνήμη + σύγκριση) ────────────────
function IdentityEditor({ draft, onSave, onCancel, onClearMemory, hasMemory }: { draft: AssistantIdentity; onSave: (id: AssistantIdentity) => void; onCancel?: () => void; onClearMemory: () => void; hasMemory: boolean }) {
  const [gender, setGender] = useState<Gender>(draft.gender);
  const [name, setName] = useState(draft.name);
  const [memory, setMemory] = useState(draft.memory);
  const [compare, setCompare] = useState(draft.compare);
  const suggestions = NAME_SUGGESTIONS[gender];
  const row = { display: 'flex', alignItems: 'center', gap: 12 } as const;
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Φτιάξε τον βοηθό σου</div>
        <div style={{ fontFamily: T.font.sans, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>Διάλεξε πώς θέλεις να είναι. Μπορείς να το αλλάξεις όποτε θες.</div>
      </div>

      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Φύλο / ταυτότητα</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {GENDER_OPTIONS.map(g => {
            const active = gender === g.value;
            return (
              <button key={g.value} onClick={() => setGender(g.value)}
                style={{ display: 'inline-flex', alignItems: 'center', fontFamily: T.font.sans, fontSize: 12, fontWeight: active ? 700 : 500, padding: '8px 14px', borderRadius: T.radius.pill, cursor: 'pointer', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--accent-text)' : 'var(--text-secondary)' }}>
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, fontFamily: T.font.sans }}>Όνομα</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Γράψε ένα όνομα…" maxLength={24}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 13px', color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', marginBottom: 10 }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--accent)'} onBlur={e => e.currentTarget.style.borderColor = 'var(--border-default)'} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setName(s)}
              style={{ fontFamily: T.font.sans, fontSize: 12, padding: '6px 11px', borderRadius: T.radius.pill, cursor: 'pointer', border: `1px solid ${name === s ? 'var(--accent)' : 'var(--border-subtle)'}`, background: name === s ? 'var(--accent-dim)' : 'transparent', color: name === s ? 'var(--accent)' : 'var(--text-secondary)' }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Μνήμη & σύγκριση */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Να θυμάται τις συζητήσεις</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>Συνεχίζει από εκεί που μείνατε, ανά ακίνητο. Μένει μόνο στη συσκευή σου.</div>
          </div>
          <Switch on={memory} onToggle={() => setMemory(v => !v)} />
        </div>
        {memory && hasMemory && (
          <button onClick={onClearMemory} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--negative)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 600 }}>Σβήσε τη μνήμη αυτού του ακινήτου</button>
        )}
        <div style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Σύγκριση μεταξύ ακινήτων</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>Να βλέπει και τα άλλα σου ακίνητα για συγκρίσεις (ποιο αποδίδει καλύτερα).</div>
          </div>
          <Switch on={compare} onToggle={() => setCompare(v => !v)} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {onCancel && <button onClick={onCancel} style={{ flex: '0 0 auto', height: 42, padding: '0 18px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Άκυρο</button>}
        <button onClick={() => onSave({ name: name.trim() || DEFAULT_IDENTITY.name, gender, memory, compare })} style={{ flex: 1, height: 42, borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Αποθήκευση</button>
      </div>
    </div>
  );
}
