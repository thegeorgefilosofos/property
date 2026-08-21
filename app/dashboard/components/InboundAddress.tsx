'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Η ΙΔΙΩΤΙΚΗ ΔΙΕΥΘΥΝΣΗ, ΟΠΩΣ ΤΗ ΒΛΕΠΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΡΙΑ ΠΡΑΓΜΑΤΑ ΚΑΙ ΤΙΠΟΤΑ ΑΛΛΟ: ποια είναι η διεύθυνση, ένα κουμπί που την
// αντιγράφει, και ένα που τη σβήνει και δίνει καινούρια.
//
// ΟΤΑΝ ΤΟ ΤΑΧΥΔΡΟΜΕΙΟ ΔΕΝ ΕΧΕΙ ΣΤΗΘΕΙ, ΔΕΝ ΔΕΙΧΝΕΤΑΙ ΔΙΕΥΘΥΝΣΗ. Δεν είναι
// λεπτομέρεια: μια διεύθυνση που δεν παραλαμβάνει θα έκανε τον ιδιοκτήτη να
// προωθεί εκεί τους λογαριασμούς του για μήνες, χωρίς να φτάνει τίποτα και
// χωρίς κανένα μήνυμα σφάλματος. Λέμε ότι δεν είναι έτοιμη, και τελειώνει.
//
// ΤΟ ΚΟΥΜΠΙ ΤΗΣ ΝΕΑΣ ΔΙΕΥΘΥΝΣΗΣ ΡΩΤΑΕΙ ΠΡΩΤΑ. Η παλιά παύει να παραλαμβάνει
// ΑΜΕΣΩΣ: όποιο φίλτρο ή προώθηση δείχνει σε αυτήν σταματά να δουλεύει, και ο
// ιδιοκτήτης πρέπει να το ξέρει πριν, όχι μετά.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as inbound from '@/lib/data/inbound';
import { INBOUND_DOMAIN, inboundAddress } from '@/lib/inbound/address';
import { T, TT, Btn } from '@/components/Theme';
import { SetRow } from './SettingsKit';
import { notifyError } from '@/components/Toast';

export default function InboundAddress({ userId }: { userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    inbound.mailbox(supabase, userId).then(({ row }) => {
      if (!live) return;
      setToken(row?.active ? row.token : null);
      setLoaded(true);
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const address = inboundAddress(token, INBOUND_DOMAIN);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Χωρίς άδεια στο πρόχειρο, η διεύθυνση είναι ήδη ορατή και επιλέξιμη.
    }
  };

  const rotate = async () => {
    setBusy(true);
    const { token: fresh, error } = await inbound.rotate(supabase);
    setBusy(false);
    setAsking(false);
    if (error || !fresh) { notifyError('Η διεύθυνση δεν άλλαξε'); return; }
    setToken(fresh);
  };

  return (
    <SetRow
      title="Ιδιωτική διεύθυνση για λογαριασμούς"
      desc="Προώθησε εκεί τον λογαριασμό ρεύματος, νερού ή κοινοχρήστων. Η δαπάνη σε περιμένει έτοιμη στις Δαπάνες, με ποσό και ημερομηνία διαβασμένα, και την καταχωρείς με ένα πάτημα."
      control={address ? <Btn variant="secondary" onClick={copy}>{copied ? 'Αντιγράφηκε' : 'Αντιγραφή'}</Btn> : undefined}>

      {!loaded ? null : !INBOUND_DOMAIN ? (
        <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
          Η διεύθυνση ενεργοποιείται μόλις στηθεί το ταχυδρομείο του τομέα. Μέχρι τότε δεν
          παραλαμβάνει κανένα μήνυμα, οπότε δεν εμφανίζεται.
        </div>
      ) : !address ? (
        <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
          Ο λογαριασμός σου δεν έχει ακόμη διεύθυνση παραλαβής.
        </div>
      ) : (
        <>
          <div style={{
            fontFamily: T.font.num, fontSize: 14, fontWeight: 600,
            color: 'var(--text-primary)', wordBreak: 'break-all',
            padding: '10px 12px', borderRadius: T.radius.btn,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          }}>{address}</div>
          <div style={{ ...TT.bodySm, color: 'var(--text-tertiary)', marginTop: 8 }}>
            Κράτησέ τη για σένα. Οποιος τη μάθει μπορεί να στέλνει προτάσεις δαπανών στον
            λογαριασμό σου. Καμία δεν γίνεται δαπάνη χωρίς δικό σου πάτημα.
          </div>
          {asking ? (
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>
                Η τωρινή διεύθυνση παύει να παραλαμβάνει αμέσως.
              </span>
              <Btn variant="primary" onClick={rotate} disabled={busy}>{busy ? 'Αλλάζει…' : 'Νέα διεύθυνση'}</Btn>
              <Btn variant="secondary" onClick={() => setAsking(false)} disabled={busy}>Ακύρωση</Btn>
            </div>
          ) : (
            <div style={{ marginTop: 12 }}>
              <Btn variant="secondary" onClick={() => setAsking(true)}>Αλλαγή διεύθυνσης</Btn>
            </div>
          )}
        </>
      )}
    </SetRow>
  );
}
