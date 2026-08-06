// app/dashboard/components/useAppPreferences.ts
// Single source of truth για τις προτιμήσεις & δυνατότητες της εφαρμογής.
// Αποθηκεύονται στον πίνακα bills_settings (section: 'app_preferences') ως JSON blob.

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AppPreferences {
  // Ειδοποιήσεις
  liveNotifications: boolean;        // Ζωντανές ειδοποιήσεις στην Επισκόπηση
  deadlineAlerts: boolean;           // Ειδοποιήσεις λήξεων & προθεσμιών
  /**
   * Πόσο μακριά μπροστά δείχνει η αρχική οθόνη, σε ημέρες.
   *
   * Η λίστα «Τι χρειάζεται τώρα» γέμιζε με δόσεις ΕΝΦΙΑ του επόμενου
   * καλοκαιριού (222 ημέρες) και έσπρωχνε κάτω το εκπρόθεσμο. Το όριο δεν
   * μπορεί όμως να είναι ίδιο για όλους: άλλο ρυθμό έχει ο ιδιοκτήτης ενός
   * διαμερίσματος και άλλο το γραφείο με δεκαπέντε. Ρυθμίζεται.
   * Το ΕΚΠΡΟΘΕΣΜΟ δεν κρύβεται ποτέ, με καμία τιμή.
   */
  agendaHorizonDays: 30 | 60 | 100 | 180 | 365;
  // Αρχείο & Καταχωρήσεις
  autoSuggestCategory: boolean;      // Αυτόματη πρόταση κατηγορίας βάσει παρόχου
  confirmBeforeDelete: boolean;      // Επιβεβαίωση πριν τη διαγραφή
  // Εμφάνιση
  compactView: boolean;              // Συμπαγής προβολή
  showSmartTips: boolean;            // Εμφάνιση έξυπνων συμβουλών
  // Μνήμη & Δεδομένα
  rememberAcrossProperties: boolean; // Να θυμάται τις προτιμήσεις σε όλα τα ακίνητα
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  liveNotifications: true,
  deadlineAlerts: true,
  agendaHorizonDays: 100,
  autoSuggestCategory: true,
  confirmBeforeDelete: true,
  compactView: false,
  showSmartTips: true,
  rememberAcrossProperties: false,
};

export const APP_PREFERENCES_SECTION = 'app_preferences';

export function useAppPreferences(propertyId: string): { prefs: AppPreferences; loading: boolean } {
  const supabase = createClient();
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('bills_settings')
      .select('data')
      .eq('property_id', propertyId)
      .eq('section', APP_PREFERENCES_SECTION)
      .maybeSingle();

    if (data?.data) {
      setPrefs(prev => ({ ...prev, ...data.data }));
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  useEffect(() => { load(); }, [load]);

  return { prefs, loading };
}
