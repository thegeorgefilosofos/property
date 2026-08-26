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
  // ΤΑ ΔΕΔΟΜΕΝΑ ΦΕΡΟΥΝ ΤΟ ΚΛΕΙΔΙ ΤΟΥΣ, ΚΑΙ Η ΦΟΡΤΩΣΗ ΒΓΑΙΝΕΙ ΑΠΟ ΑΥΤΟ. Ηταν δύο
  // καταστάσεις με `setData(defaults)` και `setLoading` σύγχρονα μέσα σε effect:
  // περιττή απόδοση· δύο πηγές αλήθειας που μπορούσαν να διαφωνήσουν. Οσο τα
  // δεδομένα δεν είναι αυτού του ακινήτου και αυτής της ενότητας, ισχύουν οι
  // προεπιλογές· αυτό ΕΙΝΑΙ το «φορτώνει», δεν χρειάζεται δεύτερη σημαία.
  const key = `${propertyId}|${section}`;
  const [store, setStore] = useState<{ key: string; value: T }>({ key: '', value: defaults });
  const data = store.key === key ? store.value : defaults;
  const loading = !!propertyId && store.key !== key;
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

  // ── Η ΕΚΚΡΕΜΗΣ ΕΓΓΡΑΦΗ ΚΡΑΤΑ ΚΑΙ ΤΑ ΔΕΔΟΜΕΝΑ ΤΗΣ ───────────────────────────
  // ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΕΚΛΕΙΣΕ ΕΔΩ. Ο προορισμός («σε ποιο ακίνητο») παγωνόταν σωστά,
  // αλλά τα ΔΕΔΟΜΕΝΑ διαβάζονταν από το `latest.current` τη στιγμή που χτυπούσε
  // ο χρονομετρητής — και ώς τότε το effect φόρτωσης το είχε ήδη αντικαταστήσει
  // με τα δεδομένα του ΝΕΟΥ ακινήτου. Δηλαδή: γράφεις 400 kWh στο Α, αλλάζεις
  // ακίνητο μέσα σε 800ms και στο Α γράφονται οι ρυθμίσεις του Β. Η
  // `settings.put` κάνει upsert ΟΛΟΚΛΗΡΟΥ του jsonb, οπότε δεν σώζεται τίποτα:
  // ο πάροχος, το τιμολόγιο και οι kWh του Α χάνονται σιωπηλά και η ίδια η
  // διόρθωση δεν γράφεται πουθενά.
  //
  // Δεν ήταν σπάνιο race: χτυπούσε κάθε φορά που η ανάγνωση του νέου ακινήτου
  // τελείωνε πριν λήξει το υπόλοιπο του debounce, δηλαδή σχεδόν πάντα.
  //
  // Το ζεύγος «τι» και «πού» ταξιδεύει πλέον μαζί και δεν το αγγίζει τίποτα
  // μετά τον προγραμματισμό του.
  const pending = useRef<{ snapshot: T; target: { propertyId: string; section: settings.Section } } | null>(null);

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

  /**
   * Γράφει ό,τι εκκρεμεί, στον προορισμό του και το σβήνει από την ουρά.
   *
   * Ασφαλής να κληθεί πολλές φορές: χωρίς εκκρεμότητα δεν κάνει τίποτα.
   */
  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    await doSave(p.snapshot, p.target);
  }, [doSave]);


  // Ο ΚΑΘΑΡΙΣΜΟΣ ΣΤΗΝ ΑΠΟΠΡΟΣΑΡΤΗΣΗ: ο,τι εκκρεμεί γράφεται, δεν πετιέται.
  // Ηταν πίσω από ένα `flushRef`, επειδή η `flush` δηλωνόταν ΜΕΤΑ τα effect που
  // την καλούν. Ο καθρέφτης έφυγε μαζί με την αιτία του: η αποθήκευση δηλώνεται
  // πρώτη και όποιος τη χρειάζεται τη βλέπει.
  useEffect(() => () => { void flush(); }, [flush]);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Η ΑΛΛΑΓΗ ΑΚΙΝΗΤΟΥ ΞΕΠΛΕΝΕΙ ΤΗΝ ΕΚΚΡΕΜΟΤΗΤΑ, ΔΕΝ ΤΗΝ ΠΕΤΑΕΙ. Ο χρήστης
    // διόρθωσε κάτι και άλλαξε οθόνη μέσα στα 800ms: η διόρθωση ανήκει στο
    // ΠΡΟΗΓΟΥΜΕΝΟ ακίνητο και γράφεται εκεί, τώρα.
    void flush();
    bound.current = { propertyId, section };

    if (!propertyId) {
      // Χωρίς ακίνητο δεν υπάρχει τι να φορτωθεί: τα δεδομένα ΕΙΝΑΙ ήδη οι
      // προεπιλογές, γιατί το κλειδί δεν ταιριάζει με τίποτα αποθηκευμένο.
      latest.current = defaults;
      return;
    }

    aborted.current = false;

    (async () => {
      const row = await settings.section(supabase, propertyId, section, userId);

      if (aborted.current) return;

      const merged = row ? ({ ...defaults, ...row } as T) : defaults;
      setStore({ key, value: merged });
      latest.current = merged;
    })();

    return () => {
      aborted.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, section]);


  // ── Update ────────────────────────────────────────────────────────────────
  const update = useCallback((patch: Partial<T>) => {
    // Ο ΠΡΟΓΡΑΜΜΑΤΙΣΜΟΣ ΔΕΝ ΓΙΝΕΤΑΙ ΜΕΣΑ ΣΤΟΝ ΕΝΗΜΕΡΩΤΗ ΤΟΥ setState. Η React
    // επιτρέπεται να τον καλέσει δύο φορές, οπότε ένας χρονομετρητής έμενε
    // ορφανός — και κάθε παρενέργεια εκεί μέσα εκτελείται δύο φορές.
    const next = { ...latest.current, ...patch } as T;
    latest.current = next;
    pending.current = { snapshot: next, target: bound.current };
    setStore({ key, value: next });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, 800);
  }, [flush, key]);

  return [data, update, loading];
}