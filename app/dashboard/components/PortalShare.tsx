'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortalShare, πλευρά ιδιοκτήτη για την Πύλη Ενοικιαστή. Δημιουργεί/κοινοποιεί
// τον σύνδεσμο και εμφανίζει τα εισερχόμενα αιτήματα βλάβης (cross-tab).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fd } from '@/components/Theme';

interface Req { id: string; title: string; description: string | null; contact: string | null; status: string; created_at: string; }

export default function PortalShare({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [synced, setSynced] = useState<Set<string>>(new Set());   // αιτήματα που πήγαν στο Ημερολόγιο (τρέχουσα συνεδρία)
  const [costFor, setCostFor] = useState<string | null>(null);    // ποιο αίτημα καταχωρεί δαπάνη
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 3500); };

  const load = useCallback(async () => {
    const { data: link } = await supabase.from('portal_links').select('token').eq('property_id', propertyId).eq('user_id', userId).maybeSingle();
    setToken(link?.token || null);
    const { data: r } = await supabase.from('maintenance_requests').select('*').eq('property_id', propertyId).eq('user_id', userId).order('created_at', { ascending: false });
    setReqs((r as Req[]) || []);
  }, [propertyId, userId]);

  useEffect(() => { load(); }, [load]);

  const enable = async () => {
    setBusy(true);
    const { data, error } = await supabase.from('portal_links').insert({ property_id: propertyId, user_id: userId }).select('token').single();
    setBusy(false);
    if (!error && data) setToken(data.token);
    else if (error) alert('Σφάλμα: ' + error.message);
  };

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/portal/${token}` : '';
  const copy = () => { if (url) { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const setStatus = async (id: string, status: string) => { await supabase.from('maintenance_requests').update({ status }).eq('id', id); load(); };

  // Cross-tab: αίτημα βλάβης → Ημερολόγιο (προγραμματισμός επισκευής)
  const toCalendar = async (r: Req) => {
    const today = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('calendar_events').insert({
      property_id: propertyId, user_id: userId,
      title: `Επισκευή: ${r.title}`, category: 'maintenance',
      event_date: today, amount: null, priority: 'high', status: 'pending',
      recurring: false, notes: r.description ? `Αίτημα ενοικιαστή, ${r.description}` : 'Αίτημα ενοικιαστή', source: 'portal',
    });
    if (error) { flash('Σφάλμα μεταφοράς στο Ημερολόγιο'); return; }
    setSynced(prev => new Set(prev).add(r.id));
    if (r.status === 'new') setStatus(r.id, 'in_progress');
    flash(`«${r.title}» προστέθηκε στο Ημερολόγιο (σήμερα), άλλαξε ημερομηνία από την καρτέλα Ημερολόγιο.`);
  };

  // Cross-tab: ολοκληρωμένο αίτημα → Δαπάνη (κόστος επισκευής)
  const toExpense = async (r: Req) => {
    const amt = parseFloat(cost.replace(',', '.'));
    if (!amt || amt <= 0) { flash('Βάλε έγκυρο ποσό'); return; }
    const { error } = await supabase.from('expenses').insert({
      property_id: propertyId, user_id: userId,
      description: `Επισκευή: ${r.title}`, amount: amt,
      category: 'Συντήρηση & Επισκευές', expense_group: 'maintenance',
      date: new Date().toISOString().split('T')[0], paid_by: 'owner', paid: true,
      notes: r.description ? `Από αίτημα ενοικιαστή, ${r.description}` : 'Από αίτημα ενοικιαστή',
    });
    if (error) { flash('Σφάλμα καταχώρησης δαπάνης'); return; }
    setCostFor(null); setCost('');
    flash(`Δαπάνη ${amt.toFixed(2).replace('.', ',')} € καταχωρήθηκε στις Δαπάνες.`);
  };

  const pending = reqs.filter(r => r.status !== 'done');
  const STATUS_META: Record<string, { label: string; tone: string }> = {
    new:         { label: 'Νέο',          tone: 'negative' },
    in_progress: { label: 'Σε εξέλιξη',   tone: 'warning' },
    done:        { label: 'Ολοκληρώθηκε', tone: 'positive' },
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {msg && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--bg-surface)', border: `1px solid ${msg.startsWith('Σφάλμα') ? 'var(--negative)' : 'var(--positive)'}`, borderRadius: T.radius.card, padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10, fontFamily: T.font.sans, boxShadow: '0 8px 32px rgba(0,0,0,0.25)', maxWidth: 340 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: msg.startsWith('Σφάλμα') ? 'var(--negative)' : 'var(--positive)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.5 }}>{msg}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Πύλη Ενοικιαστή</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Κοινοποίησε σύνδεσμο & δες αιτήματα βλάβης</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {pending.length > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--negative)', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', fontFamily: T.font.sans }}>{pending.length}</span>}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {!token ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, flex: 1, minWidth: 200 }}>Ενεργοποίησε έναν ασφαλή σύνδεσμο που μπορεί να μοιραστεί ο ενοικιαστής σου, βλέπει ενοίκιο/σύμβαση και στέλνει αιτήματα.</div>
              <button onClick={enable} disabled={busy} style={{ height: 36, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση πύλης'}</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <input readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 200, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, outline: 'none' }} />
                <button onClick={copy} style={{ height: 36, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'Αντιγράφηκε ✓' : 'Αντιγραφή'}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ height: 36, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Άνοιγμα</a>
              </div>

              <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>Αιτήματα ({pending.length} εκκρεμή)</div>
              {reqs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, padding: '8px 0' }}>Κανένα αίτημα ακόμη.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reqs.slice(0, 8).map(r => {
                    const st = STATUS_META[r.status] || STATUS_META.new;
                    const done = r.status === 'done';
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: done ? 'var(--bg-elevated)' : `var(--${st.tone}-soft)`, border: `1px solid ${done ? 'var(--border-subtle)' : `var(--${st.tone}-border)`}`, borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{r.title}</span>
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: `var(--${st.tone})`, background: `var(--${st.tone}-soft)`, border: `1px solid var(--${st.tone}-border)`, borderRadius: T.radius.badge, padding: '2px 7px', fontFamily: T.font.sans }}>{st.label}</span>
                          </div>
                          {r.description && <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>{r.description}</div>}
                          <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{fd(r.created_at)}{r.contact ? ` · ${r.contact}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                          {r.status === 'new' && <button onClick={() => setStatus(r.id, 'in_progress')} style={{ height: 26, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--warning-border)', background: 'var(--bg-surface)', color: 'var(--warning)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ξεκίνησε</button>}
                          {r.status === 'in_progress' && <button onClick={() => setStatus(r.id, 'done')} style={{ height: 26, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--positive-border)', background: 'var(--bg-surface)', color: 'var(--positive)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ολοκλήρωση</button>}
                          {!done && <button onClick={() => toCalendar(r)} disabled={synced.has(r.id)} style={{ height: 26, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'transparent', color: synced.has(r.id) ? 'var(--text-tertiary)' : 'var(--accent)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: synced.has(r.id) ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: synced.has(r.id) ? 0.6 : 1 }}>{synced.has(r.id) ? 'Στο Ημερολόγιο ✓' : '→ Ημερολόγιο'}</button>}
                          {done && costFor !== r.id && <button onClick={() => { setCostFor(r.id); setCost(''); }} style={{ height: 26, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'transparent', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>→ Δαπάνη</button>}
                          {done && costFor === r.id && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input autoFocus value={cost} onChange={e => setCost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') toExpense(r); if (e.key === 'Escape') setCostFor(null); }} placeholder="€" inputMode="decimal" style={{ width: 56, height: 26, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: T.radius.badge, padding: '0 8px', fontSize: 11, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none', textAlign: 'right' }} />
                              <button onClick={() => toExpense(r)} style={{ height: 26, padding: '0 8px', borderRadius: T.radius.badge, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                            </div>
                          )}
                          {done && <button onClick={() => setStatus(r.id, 'new')} style={{ height: 26, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Επαναφορά</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
