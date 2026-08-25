// app/dashboard/components/useAppPreferences.ts
// Single source of truth για τις προτιμήσεις & δυνατότητες της εφαρμογής.
// Αποθηκεύονται στον πίνακα bills_settings (section: 'app_preferences') ως JSON blob.

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';

// ═══════════════════════════════════════════════════════════════════════════
// ΕΞΙ ΑΠΟ ΤΙΣ ΟΚΤΩ ΠΡΟΤΙΜΗΣΕΙΣ ΔΕΝ ΕΚΑΝΑΝ ΤΙΠΟΤΑ.
// ─────────────────────────────────────────────────────────────────────────
// Μετρημένο: `deadlineAlerts`, `autoSuggestCategory`, `compactView`,
// `showSmartTips`, `rememberAcrossProperties` είχαν ΜΗΔΕΝ αναγνώστες σε όλο το
// app — και μηδέν διακόπτες στις Ρυθμίσεις. Δηλαδή ούτε ρυθμίζονταν ούτε
// ίσχυαν: ήταν κλειδιά που ταξίδευαν σε JSON, τύπο και προεπιλογές και
// διαβάζονταν ως «κανόνες της εφαρμογής» χωρίς να είναι.
//
// Η ΕΚΤΗ ΗΤΑΝ ΧΕΙΡΟΤΕΡΗ. Το `liveNotifications` έκρυβε ΟΛΟΚΛΗΡΗ την ατζέντα
// («τι χρειάζεται τώρα» — την κύρια λίστα της Επισκόπησης) πίσω από συνθήκη
// που κανένας διακόπτης δεν μπορούσε να αλλάξει. Μια σημαία μόνιμα `true`
// είναι νεκρή διακλάδωση με ρίσκο: αρκεί μια αποτυχία φόρτωσης προτιμήσεων για
// να εξαφανιστεί το κύριο περιεχόμενο της αρχικής οθόνης.
//
// Μένουν οι δύο που ΙΣΧΥΟΥΝ: ο ορίζοντας της ατζέντας (ρυθμίζεται και
// διαβάζεται) και η επιβεβαίωση πριν τη διαγραφή (δύο πραγματικοί αναγνώστες
// στο Αρχείο). Τα παλιά κλειδιά μένουν αβλαβή μέσα σε ήδη αποθηκευμένα JSON:
// κανείς δεν τα διαβάζει πια, οπότε δεν χρειάζεται μετανάστευση.
// ═══════════════════════════════════════════════════════════════════════════
export interface AppPreferences {
  /**
   * Πόσο μακριά μπροστά δείχνει η αρχική οθόνη, σε ημέρες.
   *
   * Η λίστα «Τι χρειάζεται τώρα» γέμιζε με δόσεις ΕΝΦΙΑ του επόμενου
   * καλοκαιριού (222 ημέρες) και έσπρωχνε κάτω το εκπρόθεσμο. Το όριο δεν
   * μπορεί όμως να είναι ίδιο για όλους: άλλο ρυθμό έχει ο ιδιοκτήτης ενός
   * διαμερίσματος και άλλο το γραφείο με δεκαπέντε. Ρυθμίζεται.
   * Το ΕΚΠΡΟΘΕΣΜΟ δεν κρύβεται ποτέ, με καμία τιμή.
   */
  agendaHorizonDays: 30 | 60 | 90 | 180 | 365;
  /** Επιβεβαίωση πριν τη διαγραφή αρχείου (Αρχείο ακινήτου). */
  confirmBeforeDelete: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  agendaHorizonDays: 90,
  confirmBeforeDelete: true,
};

export const APP_PREFERENCES_SECTION = 'app_preferences';

export function useAppPreferences(propertyId: string): { prefs: AppPreferences; loading: boolean } {
  const supabase = createClient();
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await settings.section<Partial<AppPreferences>>(supabase, propertyId, APP_PREFERENCES_SECTION);

    if (data) {
      setPrefs(prev => ({ ...prev, ...data }));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  return { prefs, loading };
}
