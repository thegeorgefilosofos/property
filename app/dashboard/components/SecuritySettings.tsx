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
import { T, TT, Btn, settingsField, Spinner, ABSENT, ABSENT_DATE, fixedCols } from '@/components/Theme';
import { SetList, SetRow, SetFact } from './SettingsKit';
import { logActivity } from '@/lib/activity';
import { checkPassword } from '@/lib/auth/password';
import PasswordStrength from '@/components/PasswordStrength';
import { failed } from '@/lib/core/dbError';

// Η γεωμετρία της γραμμής (περιθώρια, περιγράμματα) έρχεται από το SettingsKit
// και το `.po-settings`. Εδώ μένουν μόνο τα δύο που είναι ειδικά της ασφάλειας.
const fieldLabel: CSSProperties = { ...TT.bodySm, marginBottom: 6, display: 'block' };
const field: CSSProperties = settingsField;
const note: CSSProperties = { ...TT.bodySm, marginTop: 10 };

// ── Ελάχιστοι τοπικοί τύποι για τα αποτελέσματα του Supabase MFA ──────────
interface MfaFactor { id: string; friendly_name?: string; factor_type: string; status: 'verified' | 'unverified' }
type MfaState = 'loading' | 'off' | 'enrolling' | 'on';

export default function SecuritySettings() {
  const supabase = createClient();

  // Κωδικός πρόσβασης
  const [newPass, setNewPass] = useState('');
  const [leakedPw, setLeakedPw] = useState<string | null>(null);
  // ΤΟ ΕΥΡΗΜΑ ΔΙΑΡΡΟΗΣ ΦΤΑΝΕΙ ΩΣ ΤΗΝ ΥΠΟΒΟΛΗ. Πριν, ζούσε μόνο μέσα στο
  // PasswordStrength: η οθόνη προειδοποιούσε και μετά δεχόταν τον κωδικό.
  // Κρατιέται ο ΙΔΙΟΣ ο κωδικός, όχι σημαία, ώστε η φραγή να παύει μόνη της
  // μόλις ο χρήστης αλλάξει έστω έναν χαρακτήρα.
  const leaked = leakedPw !== null && leakedPw === newPass;
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
          setMfaErr(failed('Η επαλήθευση δύο βημάτων δεν ενεργοποιήθηκε', error));
        }
        return;
      }
      setEnrollFactor({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
      setCode('');
      setMfaState('enrolling');
    } catch (e) {
      setMfaErr(failed('Η επαλήθευση δύο βημάτων δεν ενεργοποιήθηκε', e));
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
    if (leaked) {
      setPwMsg({ ok: false, text: 'Αυτός ο κωδικός βρίσκεται σε γνωστή διαρροή δεδομένων. Διάλεξε άλλον.' });
      return;
    }
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
    setPwMsg({ ok: true, text: 'Ο κωδικός ενημερώθηκε.' });
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
    : ABSENT_DATE;

  return (
    <SetList>

      {/* 1. Κωδικός πρόσβασης */}
      <SetRow title="Κωδικός πρόσβασης"
        desc="Τουλάχιστον οκτώ χαρακτήρες, με πεζό, κεφαλαίο, αριθμό και σύμβολο.">
        <div {...fixedCols(2, 12, 'start')}>
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
        {newPass && <PasswordStrength password={newPass} id="sec-pw-req" onLeaked={setLeakedPw} />}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={savePassword} disabled={pwBusy || !checkPassword(newPass).ok || leaked}>
            {pwBusy ? 'Αποθήκευση…' : 'Αποθήκευση'}
          </Btn>
        </div>
        {pwMsg && (
          <div style={{ ...note, color: pwMsg.ok ? 'var(--text-secondary)' : 'var(--negative)' }}>{pwMsg.text}</div>
        )}
      </SetRow>

      {/* 2. Επαλήθευση δύο βημάτων (2FA / TOTP)
          ΑΝΕΒΗΚΕ ΑΠΟ ΤΗΝ ΤΕΤΑΡΤΗ ΘΕΣΗ. Είναι το ισχυρότερο πράγμα που μπορεί να
          κάνει κάποιος για τον λογαριασμό του, και ζούσε κάτω από ένα κουμπί
          αποσύνδεσης: η σειρά έλεγε ότι μετράει λιγότερο. Οι δύο ενέργειες που
          απλώς περιγράφουν ή κλείνουν τη συνεδρία πήγαν από κάτω. */}
      <SetRow title="Επαλήθευση δύο βημάτων"
        desc="Ένα δεύτερο επίπεδο ασφάλειας, με εφαρμογή επαλήθευσης. Δουλεύει με οποιαδήποτε (Google Authenticator, Authy, Microsoft Authenticator, 1Password).">

        {mfaState === 'loading' && (
          <Spinner size={18} label="Έλεγχος κατάστασης…" />
        )}

        {mfaUnavailable && (
          <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)' }}>
            Η επαλήθευση δύο βημάτων δεν είναι ενεργή για τον λογαριασμό ακόμη.
          </div>
        )}

        {/* OFF: όφελος + «Ενεργοποίηση» */}
        {mfaState === 'off' && !mfaUnavailable && (
          <div>
            <div style={{ ...TT.bodySm, marginBottom: 10 }}>
              Ακόμη κι αν κάποιος μάθει τον κωδικό σου, δεν θα μπορεί να συνδεθεί χωρίς τον προσωρινό κωδικό από την εφαρμογή σου.
            </div>
            <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)', marginBottom: 12 }}>
              Αφορά μόνο τον δικό σου λογαριασμό. Σε ομάδα, κάθε μέλος έχει δικό του λογαριασμό και δική του επαλήθευση, οπότε η ενεργοποίηση εδώ δεν επηρεάζει την πρόσβαση των υπολοίπων.
            </div>
            <Btn variant="primary" onClick={startEnroll} disabled={mfaBusy}>
              {mfaBusy ? 'Ενεργοποίηση…' : 'Ενεργοποίηση'}
            </Btn>
            {mfaErr && <div style={{ ...note, color: 'var(--negative)' }}>{mfaErr}</div>}
          </div>
        )}

        {/* ENROLLING: QR + secret + 6ψήφιος κωδικός */}
        {mfaState === 'enrolling' && enrollFactor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 10 }}>
                1. Σάρωσε τον κωδικό QR με την εφαρμογή επαλήθευσης
              </div>
              <div style={{ display: 'inline-flex', padding: 10, background: 'var(--bg-surface)', borderRadius: T.radius.inner, border: '1px solid var(--border-default)' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrollFactor.qr} alt="Κωδικός QR επαλήθευσης" width={168} height={168} />
              </div>
              <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)', marginTop: 12, marginBottom: 6 }}>
                ή καταχώρησε τον κωδικό χειροκίνητα
              </div>
              <div style={{ ...TT.mono, userSelect: 'all', wordBreak: 'break-all', padding: '9px 12px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: T.radius.inner }}>
                {enrollFactor.secret}
              </div>
            </div>
            <div>
              <label htmlFor="sec-mfa-code" style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 600, marginBottom: 8, display: 'block' }}>
                2. Καταχώρησε τον εξαψήφιο κωδικό από την εφαρμογή
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
              {mfaErr && <div style={{ ...note, color: 'var(--negative)' }}>{mfaErr}</div>}
            </div>
          </div>
        )}

        {/* ON: η κατάσταση λέγεται ΜΙΑ φορά, και είναι το κουμπί που την αλλάζει.
            Πριν, το ίδιο πράγμα γραφόταν τρεις φορές στη σειρά: ένα σήμα
            «Ενεργό», μια πρόταση «Η επαλήθευση δύο βημάτων είναι ενεργή», και
            από κάτω το κουμπί «Απενεργοποίηση» που το προϋποθέτει. */}
        {mfaState === 'on' && (
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-primary)', fontWeight: 700 }}>Ενεργή</span>
              <Btn variant="secondary" onClick={disableMfa} disabled={mfaBusy}>
                {mfaBusy ? 'Απενεργοποίηση…' : confirmDisable ? 'Επιβεβαίωση απενεργοποίησης' : 'Απενεργοποίηση'}
              </Btn>
              {confirmDisable && !mfaBusy && (
                <Btn variant="ghost" onClick={() => setConfirmDisable(false)}>Ακύρωση</Btn>
              )}
            </div>
            {confirmDisable && (
              <div style={{ ...note, color: 'var(--text-tertiary)' }}>
                Ο λογαριασμός σου θα προστατεύεται μόνο με τον κωδικό πρόσβασης.
              </div>
            )}
            {mfaErr && <div style={{ ...note, color: 'var(--negative)' }}>{mfaErr}</div>}
          </div>
        )}
      </SetRow>

      {/* 3. Τρέχουσα σύνδεση */}
      <SetRow title="Τρέχουσα σύνδεση">
        <SetList>
          <SetFact label="Ηλεκτρονικό ταχυδρομείο" value={email || ABSENT} muted={!email} />
          <SetFact label="Τελευταία σύνδεση" value={lastSignInText} muted={!lastSignIn} />
        </SetList>
      </SetRow>

      {/* 4. Καθολική αποσύνδεση */}
      <SetRow title="Καθολική αποσύνδεση"
        desc="Κλείνει τη σύνδεση σε κάθε συσκευή και περιηγητή. Θα χρειαστεί να συνδεθείς ξανά.">
        <Btn variant="secondary" onClick={signOutEverywhere} disabled={signingOut}>
          {signingOut ? 'Αποσύνδεση…' : 'Αποσύνδεση από όλες τις συσκευές'}
        </Btn>
      </SetRow>

    </SetList>
  );
}
