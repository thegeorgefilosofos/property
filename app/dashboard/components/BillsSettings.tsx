// app/dashboard/components/BillsSettings.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

// Singleton — ένας client για όλο το hook
const supabase = createClient();

export function useBillsSettings<T extends Record<string, any>>(
  propertyId: string,
  userId: string,
  section: string,
  defaults: T
): [T, (patch: Partial<T>) => void, boolean] {
  const [data, setData]       = useState<T>(defaults);
  const [loading, setLoading] = useState(true);
  const timer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest  = useRef<T>(defaults);
  const aborted = useRef(false); // FIX 3: race condition guard

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!propertyId) { setLoading(false); return; }

    aborted.current = false; // reset για κάθε νέο propertyId
    setLoading(true);

    (async () => {
      const { data: row } = await supabase
        .from('bills_settings')
        .select('data')
        .eq('property_id', propertyId)
        .eq('section', section)
        .maybeSingle();

      if (aborted.current) return; // FIX 3: αγνόησε αν το effect έχει ακυρωθεί

      if (row?.data) {
        const merged = { ...defaults, ...row.data } as T;
        setData(merged);
        latest.current = merged;
      } else {
        // Reset στα defaults αν δεν υπάρχει row (νέο ακίνητο)
        setData(defaults);
        latest.current = defaults;
      }
      setLoading(false);
    })();

    // FIX 3: cleanup function — ακυρώνει stale fetches
    return () => {
      aborted.current = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, section]); // defaults είναι stable object literal, δεν χρειάζεται

  // FIX 2: timer cleanup on unmount
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // ── Save ─────────────────────────────────────────────────────────────────
  const doSave = useCallback(async (snapshot: T) => {
    if (!propertyId || !userId) return;
    try {
      await supabase.from('bills_settings').upsert({
        property_id: propertyId,
        user_id:     String(userId), // FIX: consistent με το pattern του project
        section,
        data:        snapshot,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'property_id,section' });
    } catch (_) {
      // Silent fail — δεν crash το UI αν αποτύχει το save
    }
  }, [propertyId, userId, section]);

  // ── Update ────────────────────────────────────────────────────────────────
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