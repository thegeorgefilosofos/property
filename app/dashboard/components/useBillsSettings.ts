// app/dashboard/components/useBillsSettings.ts
// Custom hook για αυτόματο save/load JSONB settings per section

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useBillsSettings<T>(
  propertyId: string,
  userId: string,
  section: string,
  defaults: T
): [T, (update: Partial<T>) => void, boolean] {
  const supabase = createClient();
  const [data, setData] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // Load on mount
  const load = useCallback(async () => {
    setLoading(true);
    const { data: row } = await supabase
      .from('bills_settings')
      .select('data')
      .eq('property_id', propertyId)
      .eq('section', section)
      .maybeSingle();

    if (row?.data) {
      setData(prev => ({ ...prev, ...row.data }));
    }
    setLoading(false);
  }, [propertyId, section]);

  useEffect(() => { load(); }, [load]);

  // Debounced save, fires 800ms after last update
  const save = useCallback(async (newData: T) => {
    await supabase
      .from('bills_settings')
      .upsert({
        property_id: propertyId,
        user_id: userId,
        section,
        data: newData,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'property_id,section' });
  }, [propertyId, userId, section]);

  const update = useCallback((partial: Partial<T>) => {
    setData(prev => {
      const next = { ...prev, ...partial };
      // Debounce save
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(next), 800);
      return next;
    });
  }, [save]);

  return [data, update, loading];
}