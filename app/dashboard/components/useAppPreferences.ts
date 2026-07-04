// app/dashboard/components/useAppPreferences.ts
// Single source of truth για τις προτιμήσεις & δυνατότητες της εφαρμογής.
// Αποθηκεύονται στον πίνακα bills_settings (section: 'app_preferences') ως JSON blob.

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AppPreferences {
  // Ειδοποιήσεις
  liveNotifications: boolean;        // Ζωντανές ειδοποιήσεις στην Επισκόπηση
  deadlineAlerts: boolean;           // Ειδοποιήσεις λήξεων & προθεσμιών
  // Αρχείο & Καταχωρήσεις
  autoSuggestCategory: boolean;      // Αυτόματη πρόταση κατηγορίας βάσει παρόχου
  confirmBeforeDelete: boolean;      // Επιβεβαίωση πριν τη διαγραφή
  // Εμφάνιση
  compactView: boolean;              // Συμπαγής προβολή
  showSmartTips: boolean;            // Εμφάνιση έξυπνων συμβουλών
  decimals: '0' | '2';               // Δεκαδικά στα ποσά
  // Μνήμη & Δεδομένα
  rememberAcrossProperties: boolean; // Να θυμάται τις προτιμήσεις σε όλα τα ακίνητα
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  liveNotifications: true,
  deadlineAlerts: true,
  autoSuggestCategory: true,
  confirmBeforeDelete: true,
  compactView: false,
  showSmartTips: true,
  decimals: '0',
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
