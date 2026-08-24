'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Η ΙΔΙΩΤΙΚΗ ΔΙΕΥΘΥΝΣΗ ΠΟΥ ΔΕΧΕΤΑΙ ΛΟΓΑΡΙΑΣΜΟΥΣ
// ─────────────────────────────────────────────────────────────────────────
// ΟΤΑΝ ΤΟ ΤΑΧΥΔΡΟΜΕΙΟ ΔΕΝ ΕΧΕΙ ΣΤΗΘΕΙ, ΔΕΝ ΔΕΙΧΝΕΤΑΙ ΔΙΕΥΘΥΝΣΗ. Δεν είναι
// λεπτομέρεια: μια διεύθυνση που δεν παραλαμβάνει θα έκανε τον ιδιοκτήτη να
// προωθεί εκεί τους λογαριασμούς του για μήνες, χωρίς να φτάνει τίποτα και
// χωρίς κανένα μήνυμα σφάλματος.
//
// Το σχήμα (εμφάνιση, αντιγραφή, αλλαγή με ερώτηση) ζει στο SecretAddressRow,
// μαζί με τη συνδρομή ημερολογίου. Εδώ μένουν μόνο τα λόγια αυτής της
// λειτουργίας και το από πού έρχεται το κουπόνι.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as inbound from '@/lib/data/inbound';
import { INBOUND_DOMAIN, inboundAddress } from '@/lib/inbound/address';
import { notifyError } from '@/components/Toast';
import SecretAddressRow from './SecretAddressRow';

export default function InboundAddress({ userId }: { userId: string }) {
  const supabase = createClient();
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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

  const rotate = async () => {
    const { token: fresh, error } = await inbound.rotate(supabase);
    if (error || !fresh) { notifyError('Η διεύθυνση δεν άλλαξε'); return; }
    setToken(fresh);
  };

  return (
    <SecretAddressRow
      title="Ιδιωτική διεύθυνση για λογαριασμούς"
      desc="Προώθησε εκεί τον λογαριασμό ρεύματος, νερού ή κοινοχρήστων. Η δαπάνη σε περιμένει έτοιμη στις Δαπάνες, με ποσό και ημερομηνία διαβασμένα και την καταχωρείς με ένα πάτημα."
      value={inboundAddress(token, INBOUND_DOMAIN)}
      loaded={loaded}
      unavailable={!INBOUND_DOMAIN
        ? 'Η διεύθυνση ενεργοποιείται μόλις στηθεί το ταχυδρομείο του τομέα. Μέχρι τότε δεν παραλαμβάνει κανένα μήνυμα, οπότε δεν εμφανίζεται.'
        : 'Ο λογαριασμός σου δεν έχει ακόμη διεύθυνση παραλαβής.'}
      hint="Κράτησέ τη για σένα. Όποιος τη μάθει μπορεί να στέλνει προτάσεις δαπανών στον λογαριασμό σου. Καμία δεν γίνεται δαπάνη χωρίς δικό σου πάτημα."
      rotateHint="Η τωρινή διεύθυνση παύει να παραλαμβάνει αμέσως."
      onRotate={rotate}
    />
  );
}
