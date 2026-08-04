'use client';

// ═══════════════════════════════════════════════════════════════════════════
// PortalShare, πλευρά ιδιοκτήτη για την Πύλη Ενοικιαστή. Δημιουργεί/κοινοποιεί
// τον σύνδεσμο και εμφανίζει τα εισερχόμενα αιτήματα βλάβης (cross-tab).
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useCallback } from 'react';
import { Inbox } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { T, fd, fe, EmptyState, Skeleton } from '@/components/Theme';
import { notify, notifyOk, notifyError } from '@/components/Toast';
import { athensToday } from '@/lib/core/time';

interface Req { id: string; title: string; description: string | null; contact: string | null; status: string; created_at: string; photos?: string[] | null; }

export default function PortalShare({ propertyId, userId }: { propertyId: string; userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const [payLink, setPayLink] = useState('');       // σύνδεσμος πληρωμής ιδιοκτήτη
  const [pinSet, setPinSet] = useState(false);       // αν έχει οριστεί PIN πύλης
  const [pinInput, setPinInput] = useState('');
  const [cfgOpen, setCfgOpen] = useState(false);     // πτυσσόμενες ρυθμίσεις πύλης
  const [synced, setSynced] = useState<Set<string>>(new Set());   // αιτήματα που πήγαν στο Ημερολόγιο (τρέχουσα συνεδρία)
  const [costFor, setCostFor] = useState<string | null>(null);    // ποιο αίτημα καταχωρεί δαπάνη
  const [cost, setCost] = useState('');
  // Όσο τρέχουν τα δύο ερωτήματα, το token είναι null και τα reqs κενά: η κάρτα
  // έδειχνε τη ΛΑΘΟΣ κατάσταση («ενεργοποίησε πύλη», «κανένα αίτημα») και μετά
  // αναβόσβηνε στη σωστή. Ο σκελετός κρατά τη θέση μέχρι να μάθουμε την αλήθεια.
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: link } = await supabase.from('portal_links').select('token, payment_link, pin_hash').eq('property_id', propertyId).eq('user_id', userId).maybeSingle();
    setToken(link?.token || null);
    setPayLink(link?.payment_link || '');
    setPinSet(!!link?.pin_hash);
    const { data: r } = await supabase.from('maintenance_requests').select('*').eq('property_id', propertyId).eq('user_id', userId).order('created_at', { ascending: false });
    setReqs((r as Req[]) || []);
    setLoading(false);
  }, [propertyId, userId]);

  const saveLink = async () => {
    setBusy(true);
    const v = payLink.trim();
    await supabase.from('portal_links').update({ payment_link: v || null }).eq('property_id', propertyId).eq('user_id', userId);
    setBusy(false); notifyOk('Ο σύνδεσμος πληρωμής αποθηκεύτηκε');
  };
  const savePin = async () => {
    if (!token) return;
    setBusy(true);
    await supabase.rpc('set_portal_pin', { p_token: token, p_pin: pinInput.trim() });
    setBusy(false); setPinSet(!!pinInput.trim()); setPinInput('');
    notifyOk(pinInput.trim() ? 'Ο κωδικός πύλης ορίστηκε' : 'Ο κωδικός πύλης καταργήθηκε');
  };
  const clearPin = async () => {
    if (!token) return;
    setBusy(true);
    await supabase.rpc('set_portal_pin', { p_token: token, p_pin: '' });
    setBusy(false); setPinSet(false); setPinInput(''); notifyOk('Ο κωδικός πύλης καταργήθηκε');
  };

  useEffect(() => { load(); }, [load]);

  const enable = async () => {
    setBusy(true);
    const { data, error } = await supabase.from('portal_links').insert({ property_id: propertyId, user_id: userId }).select('token').single();
    setBusy(false);
    if (!error && data) setToken(data.token);
    else if (error) notifyError('Σφάλμα: ' + error.message);
  };

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/portal/${token}` : '';
  const copy = () => { if (url) { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } };
  const setStatus = async (id: string, status: string) => { await supabase.from('maintenance_requests').update({ status }).eq('id', id); load(); };

  // Cross-tab: αίτημα βλάβης → Ημερολόγιο (προγραμματισμός επισκευής)
  const toCalendar = async (r: Req) => {
    const today = athensToday();
    const { error } = await supabase.from('calendar_events').insert({
      property_id: propertyId, user_id: userId,
      title: `Επισκευή: ${r.title}`, category: 'maintenance',
      event_date: today, amount: null, priority: 'high', status: 'pending',
      recurring: false, notes: r.description ? `Αίτημα ενοικιαστή, ${r.description}` : 'Αίτημα ενοικιαστή', source: 'portal',
    });
    if (error) { notifyError('Σφάλμα μεταφοράς στο Ημερολόγιο'); return; }
    setSynced(prev => new Set(prev).add(r.id));
    if (r.status === 'new') setStatus(r.id, 'in_progress');
    notifyOk(`«${r.title}» προστέθηκε στο Ημερολόγιο (σήμερα), άλλαξε ημερομηνία από την καρτέλα Ημερολόγιο.`);
  };

  // Cross-tab: ολοκληρωμένο αίτημα → Δαπάνη (κόστος επισκευής)
  const toExpense = async (r: Req) => {
    const amt = parseFloat(cost.replace(',', '.'));
    if (!amt || amt <= 0) { notify('Βάλε έγκυρο ποσό', { tone: 'warning' }); return; }
    const { error } = await supabase.from('expenses').insert({
      property_id: propertyId, user_id: userId,
      description: `Επισκευή: ${r.title}`, amount: amt,
      category: 'Συντήρηση & Επισκευές', expense_group: 'maintenance',
      date: athensToday(), paid_by: 'owner', paid: true,
      notes: r.description ? `Από αίτημα ενοικιαστή, ${r.description}` : 'Από αίτημα ενοικιαστή',
    });
    if (error) { notifyError('Σφάλμα καταχώρησης δαπάνης'); return; }
    setCostFor(null); setCost('');
    notifyOk(`Δαπάνη ${fe(amt)} καταχωρήθηκε στις Δαπάνες.`);
  };

  const pending = reqs.filter(r => r.status !== 'done');
  const STATUS_META: Record<string, { label: string; tone: string }> = {
    new:         { label: 'Νέο',          tone: 'neutral' },
    in_progress: { label: 'Σε εξέλιξη',   tone: 'accent' },
    done:        { label: 'Ολοκληρώθηκε', tone: 'positive' },
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>Πύλη Ενοικιαστή</div>
            <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>Κοινοποίησε σύνδεσμο & δες αιτήματα βλάβης</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {pending.length > 0 && <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px', fontFamily: T.font.sans }}>{pending.length}</span>}
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton h={T.h.md} r={10} />
              {[0, 1].map(i => <Skeleton key={i} h={56} r={10} />)}
            </div>
          ) : !token ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, flex: 1, minWidth: 200 }}>Ενεργοποίησε έναν ασφαλή σύνδεσμο που μπορεί να μοιραστεί ο ενοικιαστής σου, βλέπει ενοίκιο/σύμβαση και στέλνει αιτήματα.</div>
              <button onClick={enable} disabled={busy} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{busy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση πύλης'}</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
                <input readOnly value={url} onFocus={e => e.currentTarget.select()} style={{ flex: 1, minWidth: 200, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.mono, outline: 'none' }} />
                <button onClick={copy} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}</button>
                <a href={url} target="_blank" rel="noopener noreferrer" style={{ height: T.h.md, display: 'inline-flex', alignItems: 'center', padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>Άνοιγμα</a>
              </div>

              {/* Ρυθμίσεις πύλης: κωδικός προστασίας + σύνδεσμος πληρωμής */}
              <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }} onClick={() => setCfgOpen(o => !o)}>
                  <div style={{ fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Ρυθμίσεις πύλης</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontFamily: T.font.sans, color: pinSet ? 'var(--positive)' : 'var(--text-tertiary)' }}>{pinSet ? 'Κωδικός ενεργός' : 'Χωρίς κωδικό'}</span>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: cfgOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
                {cfgOpen && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, fontFamily: T.font.sans, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6 }}>Σύνδεσμος πληρωμής (προαιρετικό)</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 8, lineHeight: 1.5 }}>Επικόλλησε τον δικό σου σύνδεσμο πληρωμής (Stripe, Viva, PayPal, Revolut). Ο ενοικιαστής θα δει κουμπί «Πληρωμή τώρα» στην πύλη. Η εφαρμογή δεν διαχειρίζεται την πληρωμή.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input value={payLink} onChange={e => setPayLink(e.target.value)} placeholder="https://..." style={{ flex: 1, minWidth: 180, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none' }} />
                        <button onClick={saveLink} disabled={busy} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Αποθήκευση</button>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontFamily: T.font.sans, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 6 }}>Κωδικός προστασίας</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginBottom: 8, lineHeight: 1.5 }}>Ο ενοικιαστής θα χρειάζεται αυτόν τον κωδικό για να ανοίξει την πύλη. Δώσ&apos; τον μόνο στον ενοικιαστή σου.</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <input value={pinInput} onChange={e => setPinInput(e.target.value)} inputMode="numeric" placeholder={pinSet ? 'Νέος κωδικός' : 'π.χ. 4 ψηφία'} style={{ flex: 1, minWidth: 140, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '9px 12px', fontSize: 12, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none' }} />
                        <button onClick={savePin} disabled={busy || !pinInput.trim()} style={{ height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: pinInput.trim() ? 'pointer' : 'not-allowed', opacity: pinInput.trim() ? 1 : 0.6 }}>{pinSet ? 'Αλλαγή' : 'Ορισμός'}</button>
                        {pinSet && <button onClick={clearPin} disabled={busy} style={{ height: T.h.md, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Κατάργηση</button>}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', marginBottom: 8 }}>Αιτήματα ({pending.length} εκκρεμή)</div>
              {reqs.length === 0 ? (
                <EmptyState icon={<Inbox size={20} />} title="Κανένα αίτημα ακόμη" hint="Όταν ο ενοικιαστής στείλει αίτημα βλάβης από την πύλη, θα εμφανιστεί εδώ." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reqs.slice(0, 8).map(r => {
                    const st = STATUS_META[r.status] || STATUS_META.new;
                    const done = r.status === 'done';
                    return (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: T.font.sans, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }}>{r.title}</span>
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: `var(--${st.tone})`, background: `var(--${st.tone}-soft)`, border: `1px solid var(--${st.tone}-border)`, borderRadius: T.radius.badge, padding: '3px 9px', fontFamily: T.font.sans }}>{st.label}</span>
                          </div>
                          {r.description && <div style={{ fontFamily: T.font.sans, fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.5 }}>{r.description}</div>}
                          {Array.isArray(r.photos) && r.photos.length > 0 && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                              {r.photos.slice(0, 4).map((ph, pi) => (
                                <a key={pi} href={ph} target="_blank" rel="noopener noreferrer" style={{ display: 'block', width: 44, height: 44, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
                                  <img src={ph} alt="Φωτογραφία βλάβης" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                </a>
                              ))}
                            </div>
                          )}
                          <div style={{ fontFamily: T.font.sans, fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{fd(r.created_at)}{r.contact ? ` · ${r.contact}` : ''}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                          {r.status === 'new' && <button onClick={() => setStatus(r.id, 'in_progress')} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'var(--bg-surface)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ξεκίνησε</button>}
                          {r.status === 'in_progress' && <button onClick={() => setStatus(r.id, 'done')} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'var(--bg-surface)', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Ολοκλήρωση</button>}
                          {!done && <button onClick={() => toCalendar(r)} disabled={synced.has(r.id)} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'transparent', color: synced.has(r.id) ? 'var(--text-tertiary)' : 'var(--accent)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: synced.has(r.id) ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: synced.has(r.id) ? 0.6 : 1 }}>{synced.has(r.id) ? 'Στο Ημερολόγιο' : 'Ημερολόγιο'}</button>}
                          {done && costFor !== r.id && <button onClick={() => { setCostFor(r.id); setCost(''); }} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--accent-border)', background: 'transparent', color: 'var(--accent)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>→ Δαπάνη</button>}
                          {done && costFor === r.id && (
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              <input autoFocus value={cost} onChange={e => setCost(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') toExpense(r); if (e.key === 'Escape') setCostFor(null); }} placeholder="€" inputMode="decimal" style={{ width: 56, height: T.h.sm, background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '0 8px', fontSize: 11, color: 'var(--text-primary)', fontFamily: T.font.mono, outline: 'none', textAlign: 'right' }} />
                              <button onClick={() => toExpense(r)} style={{ height: T.h.sm, padding: '0 8px', borderRadius: T.radius.badge, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>OK</button>
                            </div>
                          )}
                          {done && <button onClick={() => setStatus(r.id, 'new')} style={{ height: T.h.sm, padding: '0 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', fontFamily: T.font.sans, fontSize: 10, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Επαναφορά</button>}
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
