// app/dashboard/components/BillsSettings.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { saved } from '@/components/dbWrite';

// Singleton, ένας client για όλο το hook
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
  const aborted = useRef(false);

  // FIX A: track the property/section this hook instance is "bound" to,
  // so a pending save timer never accidentally targets a different one.
  const boundKey = useRef(`${propertyId}::${section}`);

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    boundKey.current = `${propertyId}::${section}`;

    if (!propertyId) {
      // FIX B: reset to defaults instead of leaving stale data from a
      // previously-loaded property when propertyId becomes empty.
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

  // Timer cleanup on unmount, flushes any pending save instead of dropping it
  useEffect(() => {
    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
        // Best-effort flush so a save scheduled just before navigating away
        // (e.g. switching tabs) isn't silently lost.
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

  // Keep a ref to the latest doSave so the unmount-flush effect (which only
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