'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Tenant Portal, δημόσια σελίδα ενοικιαστή (χωρίς login). Διαβάζει δεδομένα
// μέσω ασφαλούς RPC (get_portal_data) και δέχεται αίτημα βλάβης. Theme-aware,
// responsive. Καμία πρόσβαση σε δεδομένα ιδιοκτήτη πέραν των απαραίτητων.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { T, feAuto, fdLong } from '@/components/Theme';

interface DueItem { id: string; year: number; month: number; amount: number; due_date: string | null; declared: boolean }

interface PortalData {
  property: { name: string; address: string | null; type: string | null };
  tenant: { name: string | null; rent: number | null; lease_start: string | null; lease_end: string | null; deposit: number | null; rent_iban: string | null };
  due: DueItem[];
  total_due: number;
  payment_link: string | null;
}

const eur = (n: number | null) => (n == null ? '—' : feAuto(n));
const gdate = (d: string | null) => (d ? fdLong(d) : '—');
const GR_MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
const monthLabel = (month: number, year: number) => `${GR_MONTHS[month - 1] ?? ''} ${year}`.trim();

export default function TenantPortal() {
  const params = useParams();
  const token = String(params?.token || '');
  const supabase = createClient();

  const [data, setData] = useState<PortalData | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound' | 'locked'>('loading');

  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [pinChecking, setPinChecking] = useState(false);

  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const [declareBusyId, setDeclareBusyId] = useState<string | null>(null);
  const [declareErr, setDeclareErr] = useState('');
  const [copied, setCopied] = useState(false);

  const MAX_PHOTOS = 5;
  const MAX_BYTES = 8 * 1024 * 1024;
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [photoNote, setPhotoNote] = useState('');

  // Εφαρμόζει τα δεδομένα με αμυντικά defaults για τυχόν ελλείποντα πεδία.
  const applyData = (raw: unknown) => {
    const r = (raw ?? {}) as Partial<PortalData>;
    setData({
      ...(r as PortalData),
      property: r.property ?? { name: '', address: null, type: null },
      tenant: r.tenant ?? { name: null, rent: null, lease_start: null, lease_end: null, deposit: null, rent_iban: null },
      due: Array.isArray(r.due) ? r.due : [],
      total_due: typeof r.total_due === 'number' ? r.total_due : 0,
      payment_link: typeof r.payment_link === 'string' ? r.payment_link : null,
    });
  };

  useEffect(() => {
    (async () => {
      const { data: meta, error: metaErr } = await supabase.rpc('portal_meta', { p_token: token });
      if (metaErr || !meta || !(meta as { found?: boolean }).found) { setState('notfound'); return; }
      if ((meta as { pin_required?: boolean }).pin_required) { setState('locked'); return; }
      const { data: d, error } = await supabase.rpc('get_portal_data', { p_token: token });
      // Αμυντικά: null ή { locked } χωρίς PIN σημαίνει μη έγκυρη κατάσταση.
      if (error || !d || (d as { locked?: boolean }).locked) { setState('notfound'); return; }
      applyData(d);
      setState('ok');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submitPin = async () => {
    if (pinChecking || !pin.trim()) return;
    setPinErr(''); setPinChecking(true);
    const { data: d, error } = await supabase.rpc('get_portal_data', { p_token: token, p_pin: pin });
    setPinChecking(false);
    if (error || !d || (d as { locked?: boolean }).locked) {
      const rl = (d as { rate_limited?: boolean } | null)?.rate_limited;
      setPinErr(rl ? 'Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά σε λίγα λεπτά.' : 'Λάθος κωδικός');
      return;
    }
    applyData(d);
    setState('ok');
  };

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

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []);
    e.target.value = '';
    let note = '';
    setPhotos(prev => {
      const next = [...prev];
      for (const f of list) {
        if (next.length >= MAX_PHOTOS) { note = `Μπορείς να προσθέσεις έως ${MAX_PHOTOS} φωτογραφίες.`; break; }
        if (!f.type.startsWith('image/')) { note = 'Επιτρέπονται μόνο εικόνες.'; continue; }
        if (f.size > MAX_BYTES) { note = 'Κάποιες εικόνες ξεπερνούν τα 8 MB και παραλείφθηκαν.'; continue; }
        next.push({ file: f, url: URL.createObjectURL(f) });
      }
      return next;
    });
    setPhotoNote(note);
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((_, i) => i !== index);
    });
    setPhotoNote('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setSending(true);
    // Ανέβασμα φωτογραφιών, αποτυχία δεν μπλοκάρει την αποστολή του αιτήματος.
    const urls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const f = photos[i].file;
      const safeName = f.name.replace(/[^\w.\-]+/g, '_');
      const path = `${token}/${Date.now()}_${i}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('maintenance-photos').upload(path, f, { contentType: f.type });
      if (upErr) continue;
      // Το bucket είναι ιδιωτικό: αποθηκεύουμε το PATH, όχι public URL. Ο
      // ιδιοκτήτης το υπογράφει (signed URL) όταν το βλέπει.
      urls.push(path);
    }
    const { data: ok, error } = await supabase.rpc('submit_maintenance_request', {
      p_token: token, p_title: title.trim(), p_description: desc.trim(), p_contact: contact.trim(), p_photos: urls,
    });
    setSending(false);
    if (error || !ok) { setErr('Δεν ήταν δυνατή η αποστολή. Δοκίμασε ξανά.'); return; }
    photos.forEach(p => URL.revokeObjectURL(p.url));
    setPhotos([]); setPhotoNote('');
    setSent(true); setTitle(''); setDesc(''); setContact('');
  };

  const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)' };
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 'clamp(18px,4vw,24px)', marginBottom: 16 };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 4, padding: '10px 16px', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' };
  const label: React.CSSProperties = { fontSize: 10, color: 'var(--text-secondary)', fontWeight: 700, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' };
  const row = (k: string, v: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{k}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{v}</span>
    </div>
  );

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: T.font.sans, paddingBottom: 40 }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', marginBottom: 24 }}>
        <div style={{ ...wrap, height: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14 }}>P</div>
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Πύλη Ενοικιαστή</span>
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

        {state === 'locked' && (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Απαιτείται κωδικός</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6, marginBottom: 18 }}>Ζήτησε τον κωδικό από τον ιδιοκτήτη.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 280, margin: '0 auto' }}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={12}
                autoFocus
                value={pin}
                onChange={e => { setPin(e.target.value); if (pinErr) setPinErr(''); }}
                onKeyDown={e => { if (e.key === 'Enter') submitPin(); }}
                placeholder="Κωδικός"
                style={{ ...field, textAlign: 'center', letterSpacing: '0.3em' }}
              />
              {pinErr && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--negative)' }}>{pinErr}</div>}
              <button
                type="button"
                onClick={submitPin}
                disabled={pinChecking || !pin.trim()}
                style={{ height: 46, borderRadius: 100, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, cursor: (pinChecking || !pin.trim()) ? 'not-allowed' : 'pointer', opacity: (pinChecking || !pin.trim()) ? 0.6 : 1, fontFamily: 'inherit' }}
              >
                {pinChecking ? 'Έλεγχος…' : 'Είσοδος'}
              </button>
            </div>
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
                      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', fontFamily: T.font.mono, color: 'var(--text-primary)', marginBottom: 4 }}>{eur(data.total_due)}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 18 }}>Συνολικό εκκρεμές ποσό προς εξόφληση</div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 4 }}>
                        {data.due.map(item => (
                          <div key={item.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{monthLabel(item.month, item.year)}</span>
                              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono }}>{eur(item.amount)}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>Λήξη προθεσμίας: {gdate(item.due_date)}</div>
                            <div style={{ marginTop: 12 }}>
                              {item.declared ? (
                                <span style={{ display: 'inline-block', background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontSize: 12, fontWeight: 600, borderRadius: 100, padding: '6px 12px' }}>
                                  Δηλώθηκε, σε επιβεβαίωση από τον ιδιοκτήτη
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={declareBusyId === item.id}
                                  onClick={() => declarePayment(item.id)}
                                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, borderRadius: 10, padding: '9px 16px', cursor: declareBusyId === item.id ? 'not-allowed' : 'pointer', opacity: declareBusyId === item.id ? 0.6 : 1, fontFamily: 'inherit' }}
                                >
                                  {declareBusyId === item.id ? 'Αποστολή…' : 'Δήλωσα την πληρωμή'}
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {declareErr && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--negative)', marginTop: 12 }}>{declareErr}</div>}

                      {(() => {
                        const link = data.payment_link;
                        const hasLink = typeof link === 'string' && link.startsWith('https://');
                        const hasIban = Boolean(data.tenant.rent_iban);
                        if (!hasLink && !hasIban) return null;
                        return (
                          <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: 16, paddingTop: 16 }}>
                            <div style={label}>Τρόπος πληρωμής</div>

                            {hasLink && (
                              <div style={{ marginBottom: hasIban ? 18 : 0 }}>
                                <a
                                  href={link as string}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 46, borderRadius: 100, background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 15, fontWeight: 700, textDecoration: 'none', fontFamily: 'inherit' }}
                                >
                                  Πληρωμή τώρα
                                </a>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>Ασφαλής πληρωμή μέσω του παρόχου του ιδιοκτήτη.</div>
                              </div>
                            )}

                            {hasIban && (
                              <>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10, lineHeight: 1.5 }}>Πλήρωσε με τραπεζικό έμβασμα στον παρακάτω IBAN και έπειτα δήλωσε την πληρωμή.</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.mono, wordBreak: 'break-all', flex: 1 }}>{data.tenant.rent_iban}</span>
                                  <button
                                    type="button"
                                    onClick={() => copyIban(data.tenant.rent_iban as string)}
                                    style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                                  >
                                    {copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              );
            })()}

            <div style={card}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 2 }}>{data.property.name}</div>
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

                  <div>
                    <label style={label}>Φωτογραφίες (προαιρετικό)</label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '9px 14px', cursor: photos.length >= MAX_PHOTOS ? 'not-allowed' : 'pointer', opacity: photos.length >= MAX_PHOTOS ? 0.6 : 1, fontFamily: 'inherit' }}>
                      Προσθήκη φωτογραφιών
                      <input type="file" accept="image/*" multiple disabled={photos.length >= MAX_PHOTOS} onChange={onPickFiles} style={{ display: 'none' }} />
                    </label>
                    {photos.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                        {photos.map((p, i) => (
                          <div key={p.url} style={{ position: 'relative', width: 72, height: 72, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-default)' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.url} alt="Προεπισκόπηση φωτογραφίας" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            <button
                              type="button"
                              aria-label="Αφαίρεση φωτογραφίας"
                              onClick={() => removePhoto(i)}
                              style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 100, border: 'none', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: 13, lineHeight: 1, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {photoNote && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>{photoNote}</div>}
                  </div>

                  {err && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--negative)' }}>{err}</div>}
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
