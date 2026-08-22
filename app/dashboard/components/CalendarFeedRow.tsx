'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΝΔΡΟΜΗ ΗΜΕΡΟΛΟΓΙΟΥ, ΟΠΩΣ ΤΗ ΒΛΕΠΕΙ Ο ΙΔΙΟΚΤΗΤΗΣ
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΚΟΥΜΠΙΑ ΓΙΑ ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΟΥΣ ΑΝΘΡΩΠΟΥΣ. Το «Προσθήκη» ανοίγει το
// ημερολόγιο της συσκευής με `webcal:` και γράφει ΣΥΝΔΡΟΜΗ — μία κίνηση, και
// οι προθεσμίες ανανεώνονται μόνες τους. Η «Αντιγραφή» δίνει τη διεύθυνση
// `https:` για όποιον την επικολλά στο Google Calendar από υπολογιστή, όπου το
// «Προσθήκη» της συσκευής δεν βοηθά.
//
// ΓΙΑΤΙ ΟΧΙ ΣΚΕΤΟ `https` ΣΤΟ ΚΟΥΜΠΙ. Με `https`, το πάτημα κατεβάζει ΕΝΑ
// αρχείο: οι προθεσμίες μπαίνουν μία φορά και παγώνουν στη μέρα που
// προστέθηκαν. Ο χρήστης δεν το μαθαίνει ποτέ — απλώς μετά από έναν μήνα το
// ημερολόγιό του λέει ψέματα.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as feedStore from '@/lib/data/calendarFeed';
import { notifyError } from '@/components/Toast';
import { Btn } from '@/components/Theme';
import SecretAddressRow from './SecretAddressRow';

export default function CalendarFeedRow({ userId }: { userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    feedStore.feed(supabase, userId).then(({ row }) => {
      if (!live) return;
      setToken(row?.active ? row.token : null);
      setLoaded(true);
    });
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const rotate = async () => {
    const { token: fresh, error } = await feedStore.rotate(supabase);
    if (error || !fresh) { notifyError('Η διεύθυνση δεν άλλαξε'); return; }
    setToken(fresh);
  };

  return (
    <SecretAddressRow
      title="Ημερολόγιο προθεσμιών"
      desc="Οι λογαριασμοί που λήγουν, οι δόσεις ενοικίου, οι εκκρεμότητες και τα γεγονότα του ημερολογίου, μέσα στο ημερολόγιο του κινητού ή του υπολογιστή σου. Μπαίνει μία φορά και ενημερώνεται μόνο του."
      value={feedStore.feedUrl(token)}
      loaded={loaded}
      unavailable="Ο λογαριασμός σου δεν έχει ακόμη διεύθυνση ημερολογίου."
      hint="Οποιος έχει τη διεύθυνση διαβάζει τις προθεσμίες σου. Δεν μπορεί να αλλάξει τίποτα, και την ακυρώνεις εδώ όποτε θέλεις."
      rotateHint="Η τωρινή διεύθυνση παύει να απαντά αμέσως, σε κάθε συσκευή όπου προστέθηκε."
      actions={token ? (
        <a href={feedStore.feedSubscribeUrl(token)} style={{ textDecoration: 'none' }}>
          <Btn variant="primary">Προσθήκη στο ημερολόγιο</Btn>
        </a>
      ) : undefined}
      onRotate={rotate}
    />
  );
}
