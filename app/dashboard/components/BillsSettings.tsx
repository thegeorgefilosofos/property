// app/dashboard/components/BillsSettings.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import { saved } from '@/components/dbWrite';

// Singleton, ένας client για όλο το hook
const supabase = createClient();

// `unknown` αντί για `any`: ο περιορισμός λέει «αντικείμενο με ό,τι κλειδιά
// θέλεις», όχι «σβήσε τον έλεγχο τύπων για ό,τι βγει από εδώ».
export function useBillsSettings<T extends Record<string, unknown>>(
  propertyId: string,
  userId: string,
  section: settings.Section,
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
  // ΖΕΥΓΟΣ, ΟΧΙ ΚΕΙΜΕΝΟ. Ήταν `«ακίνητο::ενότητα»` και ξανασπάγε με `split` στην
  // εγγραφή — δηλαδή ο τύπος της ενότητας χανόταν στη μέση και ξαναγεννιόταν με
  // `as`, ακριβώς εκεί που κρίνεται ΠΟΙΑ γραμμή θα γραφτεί.
  const bound = useRef<{ propertyId: string; section: settings.Section }>({ propertyId, section });

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    bound.current = { propertyId, section };

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
      const row = await settings.section(supabase, propertyId, section, userId);

      if (aborted.current) return;

      if (row) {
        const merged = { ...defaults, ...row } as T;
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
        doSaveRef.current?.(latest.current, bound.current);
      }
    };
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  // FIX C: accepts the propertyId/section the write was scheduled FOR,
  // so a timer that survives a property switch still writes to the
  // correct row instead of silently doing nothing or racing the new one.
  const doSave = useCallback(async (snapshot: T, target: { propertyId: string; section: settings.Section }) => {
    if (!target.propertyId || !userId) return; // userId truly missing → nothing to attribute the write to
    // Η σιωπηλή αποτυχία που ήταν εδώ έκρυβε ακριβώς ό,τι έπρεπε να φανεί: ο
    // χρήστης γύριζε σε άλλο ακίνητο και οι ρυθμίσεις του δεν υπήρχαν.
    await saved('Οι ρυθμίσεις λογαριασμών δεν αποθηκεύτηκαν',
      settings.put(supabase, target.propertyId, userId, target.section, snapshot));
  }, [userId]);

  // Κρατά αναφορά στην τελευταία doSave, ώστε το effect της αποπροσάρτησης (που
  // runs once) always calls the current version, not a stale closure.
  const doSaveRef = useRef<typeof doSave | null>(null);
  useEffect(() => { doSaveRef.current = doSave; }, [doSave]);

  // ── Update ────────────────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<T>) => {
    const targetAtCallTime = bound.current; // FIX C continued: capture target before any switch can happen
    setData(prev => {
      const next = { ...prev, ...patch } as T;
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => doSave(latest.current, targetAtCallTime), 800);
      return next;
    });
  }, [doSave]);

  return [data, update, loading];
}