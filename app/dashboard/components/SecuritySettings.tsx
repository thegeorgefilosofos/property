'use client';

// ═══════════════════════════════════════════════════════════════════════════
// SecuritySettings, «Ασφάλεια». Πραγματικό, λειτουργικό block που μπαίνει BARE
// μέσα σε υπάρχουσα Card (ο γονέας δίνει <Card><SecHdr label="Ασφάλεια" />…).
// Τρία αληθινά εργαλεία: αλλαγή κωδικού, στοιχεία τρέχουσας σύνδεσης, καθολική
// αποσύνδεση. Ίδια οπτική γλώσσα με το υπόλοιπο «Ρυθμίσεις» (σειρές, πεδία,
// tokens). Χωρίς alert(), χωρίς ψεύτικα κουμπιά.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn } from '@/components/Theme';

// ── Κοινά στυλ, ευθυγραμμισμένα με τις υπόλοιπες κάρτες ρυθμίσεων ──────────
const group: CSSProperties = { padding: '13px 0', borderBottom: '1px solid var(--border-subtle)' };
const subLabel: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans };
const desc: CSSProperties = { fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5, marginTop: 4 };
const fieldLabel: CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 6, display: 'block' };
const field: CSSProperties = {
  width: '100%', height: 40, padding: '0 14px', borderRadius: T.radius.inner,
  border: '1px solid var(--border-default)', background: 'var(--bg-surface)',
  color: 'var(--text-primary)', fontSize: 14, fontFamily: T.font.sans, outline: 'none', boxSizing: 'border-box',
};
const rowVal: CSSProperties = { fontSize: 13, fontWeight: 600, fontFamily: T.font.sans, textAlign: 'right', overflowWrap: 'anywhere' };

export default function SecuritySettings({ userId }: { userId: string }) {
  void userId;
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

  async function savePassword() {
    if (newPass.length < 8) {
      setPwMsg({ ok: false, text: 'Ο κωδικός χρειάζεται τουλάχιστον 8 χαρακτήρες.' });
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
  }

  async function signOutEverywhere() {
    setSigningOut(true);
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
        <div style={desc}>Όρισε έναν νέο κωδικό για τον λογαριασμό σου. Τουλάχιστον 8 χαρακτήρες.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, marginTop: 12 }}>
          <div>
            <label htmlFor="sec-new-pass" style={fieldLabel}>Νέος κωδικός</label>
            <input
              id="sec-new-pass" type="password" autoComplete="new-password"
              value={newPass} onChange={e => setNewPass(e.target.value)} style={field}
            />
          </div>
          <div>
            <label htmlFor="sec-confirm-pass" style={fieldLabel}>Επιβεβαίωση</label>
            <input
              id="sec-confirm-pass" type="password" autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} style={field}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={savePassword} disabled={pwBusy}>
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
            <span style={{ ...rowVal, color: 'var(--text-primary)' }}>{email || '—'}</span>
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
        <div style={desc}>Κλείνει τη σύνδεση σε κάθε συσκευή και φυλλομετρητή. Θα χρειαστεί να συνδεθείς ξανά.</div>
        <div style={{ marginTop: 12 }}>
          <Btn variant="secondary" onClick={signOutEverywhere} disabled={signingOut}>
            {signingOut ? 'Αποσύνδεση…' : 'Αποσύνδεση από όλες τις συσκευές'}
          </Btn>
        </div>
      </div>

      {/* 4. Τι έρχεται (μία τίμια γραμμή, όχι ψεύτικο control) */}
      <div style={{ paddingTop: 13 }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
          Η επαλήθευση σε δύο βήματα (OTP) και η αναλυτική λίστα ενεργών συσκευών έρχονται σύντομα.
        </div>
      </div>

    </div>
  );
}
