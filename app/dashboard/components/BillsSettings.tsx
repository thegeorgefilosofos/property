// app/dashboard/components/BillsSettings.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { saved } from '@/components/dbWrite';

// Singleton, ένας client για όλο το hook
const supabase = createClient();

// `unknown` αντί για `any`: ο περιορισμός λέει «αντικείμενο με ό,τι κλειδιά
// θέλεις», όχι «σβήσε τον έλεγχο τύπων για ό,τι βγει από εδώ».
export function useBillsSettings<T extends Record<string, unknown>>(
  propertyId: string,
  userId: string,
  section: string,
  defaults: T
): [T, (patch: Partial<T>) => void, boolean] {
  const [data, setData]       = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest  = useRef<T>(defaults);
  const aborted = useRef(false);

  // Ο χρονομετρητής αποθήκευσης θυμάται ΣΕ ΠΟΙΟ ακίνητο και ποια ενότητα ανήκει.
  // Χωρίς αυτό, μια αποθήκευση προγραμματισμένη για το ένα ακίνητο εκτελούνταν
  // αφού ο χρήστης είχε ήδη αλλάξει ακίνητο — και έγραφε τα δεδομένα του ενός
  // πάνω στο άλλο.
  const boundKey = useRef(`${propertyId}::${section}`);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    boundKey.current = `${propertyId}::${section}`;

    if (!propertyId) {
      // Επαναφορά στις προεπιλογές, αντί να μείνουν στην οθόνη τα δεδομένα του
      // ΠΡΟΗΓΟΥΜΕΝΟΥ ακινήτου όταν αδειάσει το propertyId.
      setData(defaults);
      latest.current = defaults;
      setLoading(false);
      return;
    }

    aborted.current = false;
    setLoading(true);

    (async () => {
      const { data: row } = await supabase
        .from('bills_settings')
        .select('data')
        .eq('property_id', propertyId)
        .eq('section', section)
        .maybeSingle();

      if (aborted.current) return;

      if (row?.data) {
        const merged = { ...defaults, ...row.data } as T;
        setData(merged);
        latest.current = merged;
      } else {
        setData(defaults);
        latest.current = defaults;
      }
      setLoading(false);
    })();

    return () => {
      aborted.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, section]);

  // Καθαρισμός χρονομέτρου στην αποπροσάρτηση: ό,τι εκκρεμεί γράφεται, δεν πετιέται
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        // Τελευταία προσπάθεια εγγραφής: μια αποθήκευση προγραμματισμένη λίγο πριν
        // (π.χ. αλλαγή καρτέλας) να μη χάνεται σιωπηλά.
        doSaveRef.current?.(latest.current, boundKey.current);
      }
    };
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  // FIX C: accepts the propertyId/section the write was scheduled FOR,
  // so a timer that survives a property switch still writes to the
  // correct row instead of silently doing nothing or racing the new one.
  const doSave = useCallback(async (snapshot: T, key: string) => {
    const [savePropertyId, saveSection] = key.split('::');
    if (!savePropertyId || !userId) return; // userId truly missing → nothing to attribute the write to
    // Η σιωπηλή αποτυχία που ήταν εδώ έκρυβε ακριβώς ό,τι έπρεπε να φανεί: ο
    // χρήστης γύριζε σε άλλο ακίνητο και οι ρυθμίσεις του δεν υπήρχαν.
    await saved('Οι ρυθμίσεις λογαριασμών δεν αποθηκεύτηκαν', supabase.from('bills_settings').upsert({
      property_id: savePropertyId,
      user_id:     String(userId),
      section:     saveSection,
      data:        snapshot,
      updated_at:  new Date().toISOString(),
    }, { onConflict: 'property_id,section' }));
  }, [userId]);

  // Κρατά αναφορά στην τελευταία doSave, ώστε το effect της αποπροσάρτησης (που
  // runs once) always calls the current version, not a stale closure.
  const doSaveRef = useRef(doSave);
  useEffect(() => { doSaveRef.current = doSave; }, [doSave]);

  // ── Update ────────────────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<T>) => {
    const keyAtCallTime = boundKey.current; // FIX C continued: capture target before any switch can happen
    setData(prev => {
      const next = { ...prev, ...patch } as T;
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => doSave(latest.current, keyAtCallTime), 800);
      return next;
    });
  }, [doSave]);

  return [data, update, loading];
}