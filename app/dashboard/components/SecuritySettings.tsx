'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SecuritySettings, «Ασφάλεια». Πραγματικό, λειτουργικό block που μπαίνει BARE
// μέσα σε υπάρχουσα Card (ο γονέας δίνει <Card><SecHdr label="Ασφάλεια" />…).
// Τέσσερα αληθινά εργαλεία: αλλαγή κωδικού, επαλήθευση δύο βημάτων (2FA/TOTP
// μέσω Supabase MFA), στοιχεία τρέχουσας σύνδεσης, καθολική αποσύνδεση.
// Ίδια οπτική γλώσσα με το υπόλοιπο «Ρυθμίσεις» (σειρές, πεδία,
// tokens). Χωρίς notifyError(), χωρίς ψεύτικα κουμπιά.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn, settingsField, Spinner, ABSENT } from '@/components/Theme';
import { logActivity } from '@/lib/activity';
import { checkPassword } from '@/lib/auth/password';
import PasswordStrength from '@/components/PasswordStrength';
import { notifyError } from '@/components/Toast';

// ── Κοινά στυλ, ευθυγραμμισμένα με τις υπόλοιπες κάρτες ρυθμίσεων ──────────
const group: CSSProperties = { padding: '13px 0', borderBottom: '1px solid var(--border-subtle)' };
const subLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans };
const desc: CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 4 };
const fieldLabel: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6, display: 'block' };
const field: CSSProperties = settingsField;
const rowVal: CSSProperties = { fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, textAlign: 'right', overflowWrap: 'anywhere' };

// ── Ελάχιστοι τοπικοί τύποι για τα αποτελέσματα του Supabase MFA ──────────
interface MfaFactor { id: string; friendly_name?: string; factor_type: string; status: 'verified' | 'unverified' }
type MfaState = 'loading' | 'off' | 'enrolling' | 'on';

export default function SecuritySettings() {
  const supabase = createClient();

  // Κωδικός πρόσβασης
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Τρέχουσα σύνδεση
  const [email, setEmail] = useState('');
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);

  // Καθολική αποσύνδεση
  const [signingOut, setSigningOut] = useState(false);

  // Επαλήθευση δύο βημάτων (2FA / TOTP)
  const [mfaState, setMfaState] = useState<MfaState>('loading');
  const [enrollFactor, setEnrollFactor] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaErr, setMfaErr] = useState<string | null>(null);
  const [mfaUnavailable, setMfaUnavailable] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      setEmail(data.user?.email ?? '');
      setLastSignIn(data.user?.last_sign_in_at ?? null);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ανίχνευση κατάστασης 2FA στο mount + καθάρισμα τυχόν εκκρεμών factors.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const totp = (data?.totp ?? []) as MfaFactor[];
        // Καθάρισε ό,τι έμεινε «unverified» ώστε το enroll να μην σκάει αργότερα.
        for (const f of totp) {
          if (f.status === 'unverified') {
            try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* αγνόησε */ }
          }
        }
        if (!alive) return;
        const active = totp.some(f => f.status === 'verified');
        setMfaState(active ? 'on' : 'off');
      } catch {
        if (alive) setMfaState('off');
      }
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startEnroll() {
    setMfaBusy(true);
    setMfaErr(null);
    setMfaUnavailable(false);
    try {
      // Καθάρισε τυχόν εκκρεμείς factors, ώστε το enroll να μη βρει «factor already exists».
      const { data: list } = await supabase.auth.mfa.listFactors();
      const totp = (list?.totp ?? []) as MfaFactor[];
      for (const f of totp) {
        if (f.status === 'unverified') {
          try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* αγνόησε */ }
        }
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Property OS' });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('disabled') || msg.includes('not enabled') || msg.includes('unsupported') || msg.includes('mfa')) {
          setMfaUnavailable(true);
        } else {
          setMfaErr('Κάτι πήγε στραβά. Δοκίμασε ξανά.');
        }
        return;
      }
      setEnrollFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
      setMfaState('enrolling');
    } catch {
      setMfaErr('Κάτι πήγε στραβά. Δοκίμασε ξανά.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function verifyCode() {
    if (!enrollFactor) return;
    if (code.length !== 6) {
      setMfaErr('Ο κωδικός δεν είναι σωστός. Δοκίμασε ξανά.');
      return;
    }
    setMfaBusy(true);
    setMfaErr(null);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: enrollFactor.id });
      if (chErr || !ch) {
        setMfaErr('Ο κωδικός δεν είναι σωστός. Δοκίμασε ξανά.');
        return;
      }
      const { error } = await supabase.auth.mfa.verify({ factorId: enrollFactor.id, challengeId: ch.id, code });
      if (error) {
        setMfaErr('Ο κωδικός δεν είναι σωστός. Δοκίμασε ξανά.');
        return;
      }
      setEnrollFactor(null);
      setCode('');
      setMfaState('on');
      void logActivity(supabase, 'mfa_enabled', 'security');
    } catch {
      setMfaErr('Ο κωδικός δεν είναι σωστός. Δοκίμασε ξανά.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function cancelEnroll() {
    const pending = enrollFactor;
    setEnrollFactor(null);
    setCode('');
    setMfaErr(null);
    setMfaState('off');
    if (pending) {
      try { await supabase.auth.mfa.unenroll({ factorId: pending.id }); } catch { /* αγνόησε */ }
    }
  }

  async function disableMfa() {
    if (!confirmDisable) {
      setConfirmDisable(true);
      return;
    }
    setMfaBusy(true);
    setMfaErr(null);
    try {
      const { data: list } = await supabase.auth.mfa.listFactors();
      const totp = (list?.totp ?? []) as MfaFactor[];
      for (const f of totp) {
        try { await supabase.auth.mfa.unenroll({ factorId: f.id }); } catch { /* αγνόησε */ }
      }
      setMfaState('off');
      setConfirmDisable(false);
      void logActivity(supabase, 'mfa_disabled', 'security');
    } catch {
      setMfaErr('Δεν ήταν δυνατή η απενεργοποίηση. Δοκίμασε ξανά.');
    } finally {
      setMfaBusy(false);
    }
  }

  async function savePassword() {
    if (!checkPassword(newPass).ok) {
      setPwMsg({ ok: false, text: 'Ο κωδικός δεν πληροί όλες τις προϋποθέσεις ασφαλείας.' });
      return;
    }
    if (newPass !== confirm) {
      setPwMsg({ ok: false, text: 'Οι δύο κωδικοί δεν ταιριάζουν.' });
      return;
    }
    setPwBusy(true);
    setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setPwBusy(false);
    if (error) {
      setPwMsg({ ok: false, text: 'Δεν ήταν δυνατή η αλλαγή. Δοκίμασε ξανά.' });
      return;
    }
    setNewPass('');
    setConfirm('');
    setPwMsg({ ok: true, text: 'Ο κωδικός ενημερώθηκε ✓' });
    void logActivity(supabase, 'password_changed', 'security');
  }

  async function signOutEverywhere() {
    setSigningOut(true);
    // Καταγραφή ΠΡΙΝ την καθολική αποσύνδεση (μετά χάνεται η συνεδρία).
    await logActivity(supabase, 'signed_out_all', 'security');
    await supabase.auth.signOut({ scope: 'global' });
    window.location.href = '/login';
  }

  const lastSignInText = lastSignIn
    ? new Date(lastSignIn).toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  return (
    <div className="acc-section" style={{ display: 'flex', flexDirection: 'column' }}>

      {/* 1. Κωδικός πρόσβασης */}
      <div style={group}>
        <div style={subLabel}>Κωδικός πρόσβασης</div>
        <div style={desc}>Όρισε έναν νέο κωδικό για τον λογαριασμό σου. Τουλάχιστον 8 χαρακτήρες, με πεζό, κεφαλαίο, αριθμό και σύμβολο.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <label htmlFor="sec-new-pass" style={fieldLabel}>Νέος κωδικός</label>
            <input
              id="sec-new-pass" type="password" autoComplete="new-password" className="po-field"
              value={newPass} onChange={e => setNewPass(e.target.value)} style={field} aria-describedby="sec-pw-req"
            />
          </div>
          <div>
            <label htmlFor="sec-confirm-pass" style={fieldLabel}>Επιβεβαίωση</label>
            <input
              id="sec-confirm-pass" type="password" autoComplete="new-password" className="po-field"
              value={confirm} onChange={e => setConfirm(e.target.value)} style={field}
            />
          </div>
        </div>
        {newPass && <PasswordStrength password={newPass} id="sec-pw-req" />}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={savePassword} disabled={pwBusy || !checkPassword(newPass).ok}>
            {pwBusy ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Btn>
        </div>
        {pwMsg && (
          <div style={{ fontSize: 12, color: pwMsg.ok ? 'var(--positive)' : 'var(--negative)', fontFamily: T.font.sans, marginTop: 10, lineHeight: 1.5 }}>
            {pwMsg.text}
          </div>
        )}
      </div>

      {/* 2. Τρέχουσα σύνδεση */}
      <div style={group}>
        <div style={subLabel}>Τρέχουσα σύνδεση</div>
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 9 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Email</span>
            <span style={{ ...rowVal, color: 'var(--text-primary)' }}>{email || ABSENT}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Τελευταία σύνδεση</span>
            <span style={{ ...rowVal, color: lastSignIn ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>{lastSignInText}</span>
          </div>
        </div>
      </div>

      {/* 3. Καθολική αποσύνδεση */}
      <div style={group}>
        <div style={subLabel}>Καθολική αποσύνδεση</div>
        <div style={desc}>Κλείνει τη σύνδεση σε κάθε συσκευή και περιηγητή. Θα χρειαστεί να συνδεθείς ξανά.</div>
        <div style={{ marginTop: 12 }}>
          <Btn variant="secondary" onClick={signOutEverywhere} disabled={signingOut}>
            {signingOut ? 'Αποσύνδεση…' : 'Αποσύνδεση από όλες τις συσκευές'}
          </Btn>
        </div>
      </div>

      {/* 4. Επαλήθευση δύο βημάτων (2FA / TOTP) */}
      <div style={group}>
        <div style={subLabel}>Επαλήθευση δύο βημάτων</div>
        <div style={desc}>Πρόσθεσε ένα δεύτερο επίπεδο ασφάλειας με εφαρμογή επαλήθευσης. Προτείνουμε το Google Authenticator (δωρεάν, από App Store ή Google Play) ως την πιο ασφαλή και απλή επιλογή, αλλά λειτουργεί με οποιαδήποτε (Authy, Microsoft Authenticator, 1Password).</div>

        {mfaState === 'loading' && (
          <Spinner size={18} label="Έλεγχος κατάστασης…" />
        )}

        {mfaUnavailable && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 12, lineHeight: 1.5 }}>
            Η επαλήθευση δύο βημάτων δεν είναι ενεργή για τον λογαριασμό ακόμη.
          </div>
        )}

        {/* OFF: όφελος + «Ενεργοποίηση» */}
        {mfaState === 'off' && !mfaUnavailable && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, marginBottom: 10 }}>
              Ακόμη κι αν κάποιος μάθει τον κωδικό σου, δεν θα μπορεί να συνδεθεί χωρίς τον προσωρινό κωδικό από την εφαρμογή σου.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginBottom: 12 }}>
              Αφορά μόνο τον δικό σου λογαριασμό. Σε ομάδα, κάθε μέλος έχει δικό του λογαριασμό και δική του επαλήθευση, οπότε η ενεργοποίηση εδώ δεν επηρεάζει την πρόσβαση των υπολοίπων.
            </div>
            <Btn variant="primary" onClick={startEnroll} disabled={mfaBusy}>
              {mfaBusy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση'}
            </Btn>
            {mfaErr && (
              <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 10, lineHeight: 1.5 }}>{mfaErr}</div>
            )}
          </div>
        )}

        {/* ENROLLING: QR + secret + 6ψήφιος κωδικός */}
        {mfaState === 'enrolling' && enrollFactor && (
          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.5, marginBottom: 10 }}>
                1. Σάρωσε τον κωδικό QR με την εφαρμογή επαλήθευσης (Google Authenticator προτεινόμενο, ή Authy, Microsoft Authenticator, 1Password)
              </div>
              <div style={{ display: 'inline-flex', padding: 10, background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-default)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrollFactor.qr} alt="Κωδικός QR επαλήθευσης" width={168} height={168} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 12, marginBottom: 6 }}>
                ή καταχώρησε τον κωδικό χειροκίνητα
              </div>
              <div style={{ fontFamily: T.font.mono, fontSize: 13, color: 'var(--text-primary)', userSelect: 'all', wordBreak: 'break-all', padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner }}>
                {enrollFactor.secret}
              </div>
            </div>
            <div>
              <label htmlFor="sec-mfa-code" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans, lineHeight: 1.5, marginBottom: 8, display: 'block' }}>
                2. Καταχώρησε τον 6ψήφιο κωδικό από την εφαρμογή
              </label>
              <input
                id="sec-mfa-code" inputMode="numeric" maxLength={6} autoComplete="one-time-code" className="po-field"
                placeholder="123456"
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{ ...field, maxWidth: 200, fontFamily: T.font.mono, letterSpacing: '0.3em' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Btn variant="primary" onClick={verifyCode} disabled={mfaBusy}>
                  {mfaBusy ? 'Επιβεβαίωση…' : 'Επιβεβαίωση'}
                </Btn>
                <Btn variant="secondary" onClick={cancelEnroll} disabled={mfaBusy}>Ακύρωση</Btn>
              </div>
              {mfaErr && (
                <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 10, lineHeight: 1.5 }}>{mfaErr}</div>
              )}
            </div>
          </div>
        )}

        {/* ON: θετικό chip «Ενεργό» + απενεργοποίηση με διπλή επιβεβαίωση */}
        {mfaState === 'on' && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: T.radius.pill, color: 'var(--positive)', background: 'color-mix(in srgb, var(--positive) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--positive) 40%, transparent)', fontFamily: T.font.sans }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)' }} />
                Ενεργό
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.5, marginBottom: 12 }}>
              Η επαλήθευση δύο βημάτων είναι ενεργή.
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn variant="secondary" onClick={disableMfa} disabled={mfaBusy}>
                {mfaBusy ? 'Απενεργοποίηση…' : confirmDisable ? 'Επιβεβαίωση απενεργοποίησης' : 'Απενεργοποίηση'}
              </Btn>
              {confirmDisable && !mfaBusy && (
                <button
                  type="button" onClick={() => setConfirmDisable(false)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-tertiary)', fontSize: 12, fontFamily: T.font.sans, cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Ακύρωση
                </button>
              )}
            </div>
            {confirmDisable && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 10, lineHeight: 1.5 }}>
                Ο λογαριασμός σου θα προστατεύεται μόνο με τον κωδικό πρόσβασης.
              </div>
            )}
            {mfaErr && (
              <div style={{ fontSize: 12, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 10, lineHeight: 1.5 }}>{mfaErr}</div>
            )}
          </div>
        )}
      </div>

      {/* 5. Τι έρχεται (μία τίμια γραμμή, όχι ψεύτικο control) */}
      <div style={{ paddingTop: 13 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
          Η αναλυτική λίστα ενεργών συσκευών έρχεται σύντομα.
        </div>
      </div>

    </div>
  );
}
