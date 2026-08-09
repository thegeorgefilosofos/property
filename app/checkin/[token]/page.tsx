'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Guest pre-check-in, δημόσια φόρμα (χωρίς login). Ο επισκέπτης συμπληρώνει τα
// στοιχεία διαμονής του πριν την άφιξη. Διαβάζει/γράφει ΜΟΝΟ μέσω ασφαλών RPC
// με token (get_checkin_context / submit_checkin). Theme-aware, responsive.
// ═══════════════════════════════════════════════════════════════════════════

import BrandMark from '@/components/BrandMark';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { T } from '@/components/Theme';

interface CheckinContext { property: { name: string; address: string | null } }

export default function GuestCheckin() {
  const params = useParams();
  const token = String(params?.token || '');
  const supabase = createClient();

  const [ctx, setCtx] = useState<CheckinContext | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'notfound'>('loading');

  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [nationality, setNationality] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [arrival, setArrival] = useState('');
  const [guests, setGuests] = useState('');
  const [accepts, setAccepts] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc('get_checkin_context', { p_token: token });
      if (error || !data) { setState('notfound'); return; }
      setCtx(data as CheckinContext); setState('ok');
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(''); setSending(true);
    const { data: ok, error } = await supabase.rpc('submit_checkin', {
      p_token: token, p_full_name: fullName.trim(), p_id_number: idNumber.trim(),
      p_nationality: nationality.trim(), p_birth_date: birthDate || '', p_phone: phone.trim(),
      p_email: email.trim(), p_arrival_date: arrival || '', p_guests: parseInt(guests, 10) || null,
      p_accepts: accepts, p_privacy_consent: privacyConsent,
    });
    setSending(false);
    if (error || !ok) { setErr('Δεν ήταν δυνατή η υποβολή. Έλεγξε τα στοιχεία και δοκίμασε ξανά.'); return; }
    setSent(true);
  };

  const wrap: React.CSSProperties = { maxWidth: 560, margin: '0 auto', padding: '0 clamp(16px,5vw,24px)' };
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 'clamp(18px,4vw,24px)', marginBottom: 16 };
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '10px 16px', height: 40, color: 'var(--text-primary)', fontSize: 14, outline: 'none', fontFamily: 'inherit' };
  const label: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginBottom: 6, letterSpacing: '0.5px' };

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh', color: 'var(--text-primary)', fontFamily: T.font.sans, paddingBottom: 40 }}>
      <header style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', marginBottom: 24 }}>
        <div style={{ ...wrap, height: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
          <BrandMark />
          <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Στοιχεία διαμονής</span>
        </div>
      </header>

      <div style={wrap}>
        {state === 'loading' && <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 60 }}>Φόρτωση…</div>}

        {state === 'notfound' && (
          <div style={{ ...card, textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>Ο σύνδεσμος δεν είναι έγκυρος</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>Ζήτησε από τον οικοδεσπότη έναν ενημερωμένο σύνδεσμο.</div>
          </div>
        )}

        {state === 'ok' && ctx && (
          <>
            <div style={card}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 2 }}>{ctx.property.name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{ctx.property.address || 'Καλωσόρισες! Συμπλήρωσε τα στοιχεία σου για γρήγορη άφιξη.'}</div>
            </div>

            {sent ? (
              <div style={{ ...card, textAlign: 'center' }}>
                <div style={{ background: 'var(--positive-soft)', border: '1px solid var(--positive-border)', borderRadius: 10, padding: '16px', color: 'var(--positive)', fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>✓ Ευχαριστούμε! Τα στοιχεία στάλθηκαν στον οικοδεσπότη.</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12, lineHeight: 1.6 }}>Καλό ταξίδι και καλή διαμονή!</div>
              </div>
            ) : (
              <div style={card}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 4 }}>Τα στοιχεία σου</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16, lineHeight: 1.5 }}>Χρειάζονται για τη νόμιμη δήλωση διαμονής. Μένουν ιδιωτικά, τα βλέπει μόνο ο οικοδεσπότης.</div>
                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div><label style={label}>Ονοματεπώνυμο *</label><input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Όπως στην ταυτότητα/διαβατήριο" style={field} /></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14 }}>
                    <div><label style={label}>Αριθμός ταυτότητας / διαβατηρίου</label><input value={idNumber} onChange={e => setIdNumber(e.target.value)} style={field} /></div>
                    <div><label style={label}>Εθνικότητα</label><input value={nationality} onChange={e => setNationality(e.target.value)} placeholder="Παράδειγμα: Ελληνική" style={field} /></div>
                    <div><label style={label}>Ημερομηνία γέννησης</label><input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} style={field} /></div>
                    <div><label style={label}>Ημερομηνία άφιξης</label><input type="date" value={arrival} onChange={e => setArrival(e.target.value)} style={field} /></div>
                    <div><label style={label}>Τηλέφωνο</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+30…" style={field} /></div>
                    <div><label style={label}>Ηλεκτρονικό ταχυδρομείο</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={field} /></div>
                    <div><label style={label}>Αριθμός ατόμων</label><input inputMode="numeric" value={guests} onChange={e => setGuests(e.target.value.replace(/[^\d]/g, ''))} placeholder="Παράδειγμα: 2" style={field} /></div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
                    <input type="checkbox" checked={accepts} onChange={e => setAccepts(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)' }} />
                    Αποδέχομαι τους κανόνες του καταλύματος
                  </label>

                  {/* GDPR: ρητή συγκατάθεση επεξεργασίας προσωπικών δεδομένων (υποχρεωτική) */}
                  <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '12px 14px' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                      <input type="checkbox" checked={privacyConsent} onChange={e => setPrivacyConsent(e.target.checked)} style={{ width: 18, height: 18, accentColor: 'var(--accent)', flexShrink: 0, marginTop: 1 }} />
                      <span>
                        Συναινώ στην επεξεργασία των στοιχείων μου από τον οικοδεσπότη, αποκλειστικά για τη νόμιμη δήλωση διαμονής και την επικοινωνία της κράτησης. Έλαβα γνώση της{' '}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'underline' }}>Πολιτικής απορρήτου</a>.
                      </span>
                    </label>
                  </div>

                  {err && <div style={{ background: 'var(--negative-soft)', border: '1px solid var(--negative-border)', borderRadius: 10, padding: '10px 16px', fontSize: 13, color: 'var(--negative)' }}>{err}</div>}
                  <button type="submit" disabled={sending || !fullName.trim() || !privacyConsent} style={{ height: T.h.lg, borderRadius: 10, border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: 14, fontWeight: 700, cursor: (sending || !fullName.trim() || !privacyConsent) ? 'not-allowed' : 'pointer', opacity: (sending || !fullName.trim() || !privacyConsent) ? 0.6 : 1, fontFamily: 'inherit' }}>
                    {sending ? 'Αποστολή…' : 'Αποστολή στοιχείων'}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.5 }}>
                    Τα στοιχεία σου διαβιβάζονται κρυπτογραφημένα και τα βλέπει μόνο ο οικοδεσπότης. Μπορείς να ζητήσεις διαγραφή τους όποτε θες.
                  </div>
                </form>
              </div>
            )}
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8 }}>Powered by Property OS</div>
          </>
        )}
      </div>
    </div>
  );
}
