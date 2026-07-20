'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Feedback, επώνυμη γνώμη χρήστη (μία φορά ανά μήνα). Πελατοκεντρικό: μας λέει
// τι θα έκανε τη διαχείριση ακινήτων πιο εύκολη, γρήγορη και αποτελεσματική.
//
// Κανόνες (server-enforced στο submit_feedback· τους καθρεφτίζουμε και εδώ για
// άμεσο feedback): ελάχιστες πραγματικές λέξεις (όχι μόνο αριθμοί/σύμβολα), μία
// υποβολή ανά μήνα. Το εποικοδομητικό feedback μπαίνει σε κλήρωση για μία δωρεάν
// ετήσια συνδρομή «Επαγγελματίας». Καθαρό, minimal, χωρίς color noise.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, Btn } from '@/components/Theme';

const MIN_WORDS = 12;

// Πραγματικές λέξεις: tokens με τουλάχιστον ένα γράμμα (ελληνικό ή λατινικό).
const realWords = (s: string) =>
  (s.trim().match(/\S+/g) || []).filter(w => /[A-Za-zΑ-Ωα-ωΆΈΉΊΌΎΏϊϋΐΰ]/.test(w)).length;

type Target = 'general' | 'assistant' | 'app';
type Status = { submitted_this_month?: boolean; campaign_active?: boolean } | null;

export default function Feedback({ target = 'general', onDone, embedded }: {
  target?: Target;
  onDone?: () => void;
  embedded?: boolean;   // true όταν ζει μέσα σε modal του βοηθού (χωρίς εξωτερικό περίγραμμα)
}) {
  const supabase = createClient();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Status>(null);
  const [done, setDone] = useState<{ in_pool: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('my_feedback_status');
        if (alive && data) setStatus(data as Status);
      } catch { /* σιωπηλά: το UI δουλεύει και χωρίς την κατάσταση */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const words = realWords(body);
  const ready = words >= MIN_WORDS;
  const alreadyThisMonth = !!status?.submitted_this_month;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      const { data, error: e } = await supabase.rpc('submit_feedback', { p_body: body.trim(), p_target: target });
      const res = (data || {}) as { status?: string; in_pool?: boolean };
      if (e || !res.status || res.status === 'error') { setError('Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο.'); setBusy(false); return; }
      if (res.status === 'too_short') { setError('Γράψε λίγες λέξεις ακόμη, για να καταλάβουμε σωστά τι εννοείς.'); setBusy(false); return; }
      if (res.status === 'already') { setStatus({ ...status, submitted_this_month: true }); setBusy(false); return; }
      setDone({ in_pool: !!res.in_pool });
    } catch {
      setError('Κάτι πήγε στραβά. Δοκίμασε ξανά σε λίγο.');
    } finally {
      setBusy(false);
    }
  };

  // Περίβλημα: διακριτικά «ζωντανό» (surface-hero + highlight), χωρίς πολλά χρώματα.
  const shell = embedded
    ? { padding: 0 }
    : {
        position: 'relative' as const, overflow: 'hidden' as const,
        background: 'var(--surface-hero)', border: '1px solid var(--border-raised)',
        borderRadius: T.radius.card, boxShadow: 'var(--highlight-inset), var(--elev-1)',
        padding: 18,
      };

  // ── Ολοκληρωμένο (ευχαριστία) ──────────────────────────────────────────────
  if (done || alreadyThisMonth) {
    const pooled = done?.in_pool;
    return (
      <div style={shell}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <span aria-hidden style={{
            width: 34, height: 34, flexShrink: 0, borderRadius: 11,
            background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, letterSpacing: '-0.01em' }}>
              Ευχαριστούμε. Σε ακούσαμε.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 6 }}>
              {done
                ? 'Το μήνυμά σου καταγράφηκε και το διαβάζει άνθρωπος από την ομάδα. Μπορείς να ξαναγράψεις τον επόμενο μήνα.'
                : 'Έχεις ήδη μοιραστεί τη γνώμη σου αυτόν τον μήνα. Θα μπορείς ξανά τον επόμενο.'}
            </div>
            {pooled && (
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: T.font.sans, lineHeight: 1.55, marginTop: 8 }}>
                Μπήκες και στην κλήρωση για μία δωρεάν χρονιά «Επαγγελματίας».
              </div>
            )}
          </div>
        </div>
        {embedded && onDone && (
          <div style={{ marginTop: 14 }}>
            <Btn variant="secondary" onClick={onDone}>Κλείσιμο</Btn>
          </div>
        )}
      </div>
    );
  }

  if (loading && !embedded) {
    return <div style={{ ...shell, color: 'var(--text-tertiary)', fontSize: 13, fontFamily: T.font.sans }}>Φόρτωση…</div>;
  }

  return (
    <div style={shell}>
      {/* Διακριτικό βάθος στο περίβλημα (μόνο εκτός modal) */}
      {!embedded && (
        <span aria-hidden style={{ position: 'absolute', top: -26, right: -18, color: 'var(--accent)', opacity: 0.08, pointerEvents: 'none' }}>
          <svg width={132} height={132} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </span>
      )}

      <div style={{ position: 'relative' }}>
        {/* Κεφαλίδα */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden style={{
            width: 30, height: 30, flexShrink: 0, borderRadius: 10,
            background: 'var(--accent-soft)', border: '1px solid var(--accent-border)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)',
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, letterSpacing: '-0.01em' }}>
            Κάνε το PropertyOS καλύτερο
          </span>
        </div>

        {/* Στόχος (πελατοκεντρικό μήνυμα) */}
        <p style={{ fontSize: 12.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55, margin: '10px 0 0' }}>
          Στόχος μας είναι η διαχείριση των ακινήτων σου να γίνει απλή, γρήγορη και αποτελεσματική. Πες μας τι λειτουργεί καλά, τι σε δυσκολεύει και τι θα ήθελες από τα εργαλεία και τον βοηθό μας. Κάθε μήνυμα το διαβάζει άνθρωπος από την ομάδα, όχι κάποια μηχανή.
        </p>

        {/* Πεδίο */}
        <textarea
          value={body}
          onChange={e => { setBody(e.target.value); if (error) setError(null); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Γράψε ελεύθερα, με δικά σου λόγια. Τι θα σε βοηθούσε περισσότερο;"
          rows={4}
          maxLength={4000}
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 14, resize: 'vertical', minHeight: 96,
            padding: '12px 14px', borderRadius: T.radius.inner,
            border: `1px solid ${focused ? 'var(--accent)' : 'var(--border-default)'}`,
            boxShadow: focused ? '0 0 0 3px var(--accent-dim)' : 'none',
            background: 'var(--bg-surface)', color: 'var(--text-primary)',
            fontFamily: T.font.sans, fontSize: 14, lineHeight: 1.55, outline: 'none',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
        />

        {/* Μετρητής λέξεων / ένδειξη ετοιμότητας */}
        <div style={{ fontSize: 11.5, color: ready ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 7, lineHeight: 1.5 }}>
          {ready
            ? 'Ωραία, το μήνυμά σου είναι έτοιμο.'
            : `Γράψε λίγες λέξεις ακόμη, για να καταλάβουμε σωστά τι εννοείς (${words}/${MIN_WORDS}).`}
        </div>

        {error && (
          <div style={{ fontSize: 11.5, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 6 }}>{error}</div>
        )}

        {/* Κίνητρο κλήρωσης */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
          <span aria-hidden style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 1 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12v10H4V12" /><path d="M2 7h20v5H2z" /><path d="M12 22V7" /><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" /><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.55 }}>
            Κάθε ουσιαστικό σχόλιο μπαίνει στην κλήρωση για μία <strong style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>δωρεάν ετήσια συνδρομή «Επαγγελματίας»</strong>.
          </span>
        </div>

        {/* Ενέργεια */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <Btn variant="primary" onClick={submit} disabled={!ready || busy}>
            {busy ? 'Αποστολή…' : 'Αποστολή'}
          </Btn>
          {embedded && onDone && <Btn variant="ghost" onClick={onDone}>Άλλη φορά</Btn>}
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>
            Με το όνομά σου, μία φορά τον μήνα.
          </span>
        </div>
      </div>
    </div>
  );
}
