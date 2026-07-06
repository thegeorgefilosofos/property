// ── useEnergyTariffs.ts ───────────────────────────────────────────────────────
// Φορτώνει τα τιμολόγια ρεύματος από Supabase energy_tariffs table
// Χρησιμοποιείται από BillsElectricity για live δεδομένα
// Fallback: hardcoded constants αν η DB είναι κενή

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface EnergyTariff {
  tariff_id: string;
  provider: string;
  provider_label: string;
  name: string;
  badge: string;
  type: string;
  kwh_day: number;
  kwh_night?: number | null;
  kwh_tier2?: number;
  tier2_threshold?: number;
  flat_monthly?: number | null;
  fixed: number;
  fixed_ebill?: number | null;
  contract_months: number;
  no_fixed: boolean;
  dynamic: boolean;
  valid_month: string;
  updated_at: string;
}

interface UseEnergyTariffsReturn {
  tariffs:     EnergyTariff[];
  loading:     boolean;
  error:       string | null;
  lastUpdated: string | null;
  isLive:      boolean;  // true = from DB, false = fallback
  refresh:     () => void;
}

export function useEnergyTariffs(): UseEnergyTariffsReturn {
  const supabase = createClient();
  const [tariffs,     setTariffs]     = useState<EnergyTariff[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isLive,      setIsLive]      = useState(false);
  const [tick,        setTick]        = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Get current month's tariffs
        const now   = new Date();
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const { data, error: err } = await supabase
          .from('energy_tariffs')
          .select('*')
          .eq('valid_month', month)
          .order('provider')
          .order('kwh_day');

        if (err) throw err;

        if (data && data.length > 0) {
          setTariffs(data as EnergyTariff[]);
          setLastUpdated(data[0]?.updated_at ?? null);
          setIsLive(true);
          setError(null);
        } else {
          // Table is empty, trigger Edge Function to populate
          setError('Τα τιμολόγια δεν έχουν ενημερωθεί ακόμα. Χρησιμοποιούνται τελευταία γνωστά δεδομένα.');
          setIsLive(false);
        }
      } catch (e) {
        setError('Σφάλμα φόρτωσης τιμολογίων, χρησιμοποιούνται τοπικά δεδομένα.');
        setIsLive(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [tick]);

  // Subscribe to changes
  useEffect(() => {
    const ch = supabase
      .channel('energy_tariffs_changes')
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'energy_tariffs' }, () => {
        setTick(t => t + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const refresh = () => setTick(t => t + 1);

  return { tariffs, loading, error, lastUpdated, isLive, refresh };
}

// ── Trigger Edge Function manually ────────────────────────────────────────────
export async function triggerMarketDataUpdate(): Promise<{ success: boolean; message: string }> {
  try {
    const response = await fetch('/api/trigger-market-update', { method: 'POST' });
    const data = await response.json();
    return { success: data.success, message: data.results?.join(', ') || 'Ενημέρωση ολοκληρώθηκε' };
  } catch {
    return { success: false, message: 'Σφάλμα σύνδεσης' };
  }
}