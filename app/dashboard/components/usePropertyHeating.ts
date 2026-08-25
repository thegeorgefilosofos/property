'use client';
// ═══════════════════════════════════════════════════════════════════════════
// Ο ΤΥΠΟΣ ΘΕΡΜΑΝΣΗΣ, ΔΙΑΒΑΣΜΕΝΟΣ ΚΑΙ ΓΡΑΜΜΕΝΟΣ ΣΕ ΕΝΑ ΣΗΜΕΙΟ
// ─────────────────────────────────────────────────────────────────────────
// Το `useBillsSettings` κρατά ρυθμίσεις ΑΝΑ ΕΝΟΤΗΤΑ: η ενότητα «gas» και η
// ενότητα «providers» είναι δύο γραμμές στη βάση. Οταν το ίδιο γεγονός
// γράφεται και στις δύο, οι δύο οθόνες διαφωνούν και καμία δεν έχει άδικο.
//
// Ο τύπος θέρμανσης δεν είναι ρύθμιση καρτέλας: είναι ιδιότητα του κτιρίου.
// Ζει στο `user_properties.heating`, το ίδιο πεδίο που συμπληρώνει ο οδηγός
// νέου ακινήτου και τυπώνει η καρτέλα του ακινήτου.
//
// ΤΟ ΓΡΑΨΙΜΟ ΕΙΝΑΙ ΑΙΣΙΟΔΟΞΟ ΚΑΙ ΤΟ ΣΦΑΛΜΑ ΟΡΑΤΟ. Η οθόνη δείχνει αμέσως την
// επιλογή· αν η εγγραφή αποτύχει, ο χρήστης το μαθαίνει αντί να νομίζει ότι
// αποθηκεύτηκε. Η προηγούμενη εκδοχή κατάπινε το σφάλμα με `.then(() => {})`.
// ═══════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import { saved } from '@/components/dbWrite';
import { normalizeHeating } from '@/lib/property/heating';

const supabase = createClient();

/** `[τύπος θέρμανσης, θέσε, φορτώνει]`. Κενός τύπος σημαίνει «δεν απαντήθηκε». */
export function usePropertyHeating(propertyId: string, userId: string): [string, (v: string) => void, boolean] {
  const [heating, setHeating] = useState('');
  const [loading, setLoading] = useState(true);
  const aborted = useRef(false);

  // Ολη η ενημέρωση κατάστασης γίνεται ΜΕΣΑ στην ασύγχρονη συνάρτηση, ποτέ
  // απευθείας στο σώμα του effect: αλλιώς κάθε αλλαγή ακινήτου προκαλεί
  // αλυσιδωτή απόδοση και ο κανόνας του ESLint το κόβει σωστά.
  useEffect(() => {
    aborted.current = false;
    (async () => {
      if (!propertyId) {
        if (!aborted.current) { setHeating(''); setLoading(false); }
        return;
      }
      setLoading(true);
      const row = await properties.one<{ heating: string | null }>(supabase, propertyId, 'heating', userId);
      if (aborted.current) return;
      // Ο,τι έγραψαν οι παλιές οθόνες μεταφράζεται στο κανονικό κλειδί, ώστε
      // το μενού να μη βρεθεί με τιμή που δεν έχει επιλογή.
      setHeating(normalizeHeating(row?.heating));
      setLoading(false);
    })();
    return () => { aborted.current = true; };
  }, [propertyId, userId]);

  const set = useCallback((v: string) => {
    const next = normalizeHeating(v);
    setHeating(next);
    if (!propertyId) return;
    void saved('Ο τύπος θέρμανσης δεν αποθηκεύτηκε',
      properties.update(supabase, propertyId, { heating: next || null }, userId));
  }, [propertyId, userId]);

  return [heating, set, loading];
}
