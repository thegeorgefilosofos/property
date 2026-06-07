// app/dashboard/components/useBillsSettings.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useBillsSettings<T extends Record<string, any>>(
  propertyId: string,
  userId: string,
  section: string,
  defaults: T
): [T, (patch: Partial<T>) => void, boolean] {
  const supabase = createClient();
  const [data, setData] = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const timer = useRef<any>(null);
  const latest = useRef<T>(defaults);

  // Load once on mount
  useEffect(() => {
    if (!propertyId) { setLoading(false); return; }
    (async () => {
      const { data: row } = await supabase
        .from('bills_settings')
        .select('data')
        .eq('property_id', propertyId)
        .eq('section', section)
        .maybeSingle();
      if (row?.data) {
        const merged = { ...defaults, ...row.data } as T;
        setData(merged);
        latest.current = merged;
      }
      setLoading(false);
    })();
  }, [propertyId, section]);

  // Debounced upsert
  const doSave = useCallback(async (snapshot: T) => {
    if (!propertyId || !userId) return;
    await supabase.from('bills_settings').upsert({
      property_id: propertyId,
      user_id: userId,
      section,
      data: snapshot,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'property_id,section' });
  }, [propertyId, userId, section]);

  const update = useCallback((patch: Partial<T>) => {
    setData(prev => {
      const next = { ...prev, ...patch } as T;
      latest.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => doSave(latest.current), 800);
      return next;
    });
  }, [doSave]);

  return [data, update, loading];
}