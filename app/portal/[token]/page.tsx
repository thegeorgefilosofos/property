'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Tenant Portal, δημόσια σελίδα ενοικιαστή (χωρίς login). Διαβάζει δεδομένα
// μέσω ασφαλούς RPC (get_portal_data) και δέχεται αίτημα βλάβης. Theme-aware,
// responsive. Καμία πρόσβαση σε δεδομένα ιδιοκτήτη πέραν των απαραίτητων.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface DueItem { id: string; year: number; month: number; amount: number; due_date: string | null; declared: boolean }

interface PortalData {
  property: { name: string; address: string | null; type: string | null };
  tenant: { name: string | null; rent: number | null; lease_start: string | null; lease_end: string | null; deposit: number | null; rent_iban: string | null };
  due: DueItem[];
  total_due: number;
}

const eur = (n: number | null) => (n == null ? '—' : `${Math.round(n).toLocaleString('el-GR')} €`);
const gdate = (d: string | null) => (d ? new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');
const GR_MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const monthLabel = (month: number, year: number) => `${GR_MONTHS[month - 1] ?? ''} ${year}`.trim();

export default function TenantPortal() {
  const params = useParams();
  const token = String(params?.token || '');
  const supabase = createClient();

  const [data, setData] = useState<PortalData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const [declareBusyId, setDeclareBusyId] = useState<string | null>(null);
  const [declareErr, setDeclareErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: d, error } = await supabase.rpc('get_portal_data', { p_token: token });
      if (error || !d) { setState('notfound'); return; }
      const raw = d as Partial<PortalData>;
      setData({
        ...(raw as PortalData),
        due: Array.isArray(raw.due) ? raw.due : [],
        total_due: typeof raw.total_due === 'number' ? raw.total_due : 0,
      });
      setState('ok');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const declarePayment = async (id: string) => {
    setDeclareErr(''); setDeclareBusyId(id);
    const { data: ok, error } = await supabase.rpc('declare_rent_payment', { p_token: token, p_payment_id: id, p_note: '' });
    setDeclareBusyId(null);
    if (error || !ok) { setDeclareErr('Δεν ήταν δυνατή η δήλωση. Δοκίμασε ξανά.'); return; }
    // Οπτιμιστική ενημέρωση, μαρκάρουμε ΜΟΝΟ ως δηλωμένο (όχι εξοφλημένο).
    setData(prev => prev ? { ...prev, due: prev.due.map(it => it.id === id ? { ...it, declared: true } : it) } : prev);
  };

  const copyIban = async (iban: string) => {
    try {
      await navigator.clipboard.writeText(iban);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* αγνόησε, ο χρήστης μπορεί να αντιγράψει χειροκίνητα */ }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setSending(true);
    const { data: ok, error } = await supabase.rpc('submit_maintenance_request', {
      p_token: token, p_title: title.trim(), p_description: desc.trim(), p_contact: contact.trim(),
    });
    setSending(false);
    if (error || !ok) { setErr('Δεν ήταν δυνατή η αποστολή. Δοκίμασε ξανά.'); return; }
    setSent(true); setTitle(''); setDesc(''); setContact('');
  };

  const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)' };
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: 'clamp(18px,4vw,24px)', marginBottom: 16 };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '12px 14px', color: 'var(--text-primary)', fontSize: 15, outline: 'none', fontFamily: 'inherit' };
  const label: React.CSSProperties = { fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' };
  const row = (k: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Roboto Mono',monospace" }}>{v}</span>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: "'Inter',sans-serif", paddingBottom: 40 }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', marginBottom: 24 }}>
        <div style={{ ...wrap, height: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Πύλη Ενοικιαστή</span>
        </div>
      </header>

      <div style={wrap}>
        {state === 'loading' && <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>Φόρτωση…</div>}

        {state === 'notfound' && (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Ο σύνδεσμος δεν είναι έγκυρος</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>Ζήτησε από τον ιδιοκτήτη έναν ενημερωμένο σύνδεσμο πύλης.</div>
          </div>
        )}

        {state === 'ok' && data && (
          <>
            {(() => {
              const hasDue = data.total_due > 0 && data.due.length > 0;
              return (
                <div style={card}>
                  <div style={{ ...label, marginBottom: 12 }}>Οφειλή</div>
                  {!hasDue ? (
                    <div style={{ background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '14px 16px', color: 'var(--positive)', fontSize: 14, fontWeight: 600 }}>
                      Δεν υπάρχει εκκρεμής οφειλή
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.02em', fontFamily: "'Roboto Mono',monospace", color: 'var(--text-primary)', marginBottom: 4 }}>{eur(data.total_due)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 18 }}>Συνολικό εκκρεμές ποσό προς εξόφληση</div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
                        {data.due.map(item => (
                          <div key={item.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{monthLabel(item.month, item.year)}</span>
                              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: "'Roboto Mono',monospace" }}>{eur(item.amount)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Λήξη προθεσμίας: {gdate(item.due_date)}</div>
                            <div style={{ marginTop: 12 }}>
                              {item.declared ? (
                                <span style={{ display: 'inline-block', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontSize: 12, fontWeight: 600, borderRadius: 100, padding: '6px 12px' }}>
                                  Δηλώθηκε — σε επιβεβαίωση από τον ιδιοκτήτη
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={declareBusyId === item.id}
                                  onClick={() => declarePayment(item.id)}
                                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '9px 14px', cursor: declareBusyId === item.id ? 'not-allowed' : 'pointer', opacity: declareBusyId === item.id ? 0.6 : 1, fontFamily: 'inherit' }}
                                >
                                  {declareBusyId === item.id ? 'Αποστολή…' : 'Δήλωσα την πληρωμή'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {declareErr && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--negative)', marginTop: 12 }}>{declareErr}</div>}

                      {data.tenant.rent_iban && (
                        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 16 }}>
                          <div style={label}>Τρόπος πληρωμής</div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.5 }}>Πλήρωσε με τραπεζικό έμβασμα στον παρακάτω IBAN και έπειτα δήλωσε την πληρωμή.</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Roboto Mono',monospace", wordBreak: 'break-all', flex: 1 }}>{data.tenant.rent_iban}</span>
                            <button
                              type="button"
                              onClick={() => copyIban(data.tenant.rent_iban as string)}
                              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                            >
                              {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            <div style={card}>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 2 }}>{data.property.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 16 }}>{[data.property.type, data.property.address].filter(Boolean).join(' · ') || 'Ακίνητο'}</div>
              {row('Μηνιαίο ενοίκιο', eur(data.tenant.rent))}
              {row('Έναρξη μίσθωσης', gdate(data.tenant.lease_start))}
              {row('Λήξη μίσθωσης', gdate(data.tenant.lease_end))}
              {row('Εγγύηση', eur(data.tenant.deposit))}
            </div>

            <div style={card}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Αίτημα βλάβης / επικοινωνία</div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16, lineHeight: 1.5 }}>Στείλε αίτημα στον ιδιοκτήτη, θα το δει άμεσα στο πάνελ διαχείρισης.</div>

              {sent ? (
                <div style={{ background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '14px 16px', color: 'var(--positive)', fontSize: 14, fontWeight: 600 }}>
                  Το αίτημα στάλθηκε. Ευχαριστούμε!
                </div>
              ) : (
                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label style={label}>Θέμα</label><input required value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Διαρροή στο μπάνιο" style={field} /></div>
                  <div><label style={label}>Περιγραφή</label><textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="Περίγραψε το πρόβλημα…" rows={4} style={{ ...field, resize: 'vertical' }} /></div>
                  <div><label style={label}>Τηλέφωνο επικοινωνίας (προαιρετικό)</label><input value={contact} onChange={e => setContact(e.target.value)} placeholder="69XXXXXXXX" style={field} /></div>
                  {err && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--negative)' }}>{err}</div>}
                  <button type="submit" disabled={sending || !title.trim()} style={{ height: 46, borderRadius: 100, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: (sending || !title.trim()) ? 'not-allowed' : 'pointer', opacity: (sending || !title.trim()) ? 0.6 : 1, fontFamily: 'inherit' }}>
                    {sending ? 'Αποστολή…' : 'Αποστολή αιτήματος'}
                  </button>
                </form>
              )}
            </div>

            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Powered by Property OS · <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-secondary)', textDecoration: 'underline' }}>Απόρρητο</a></div>
          </>
        )}
      </div>
    </div>
  );
}
