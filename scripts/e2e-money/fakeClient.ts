// Το ψεύτικο `@/lib/supabase/client`. Ο,τι ζητά πελάτη παίρνει ΤΟΝ ΙΔΙΟ διπλό,
// ώστε οι κλήσεις όλων των components να καταγράφονται σε μία λίστα.
import type { makeFakeDb } from './fakeDb';

type Fake = ReturnType<typeof makeFakeDb>;
declare global { interface Window { __fake?: Fake } }

export const createClient = () => {
  const f = window.__fake;
  if (!f) throw new Error('Δεν στήθηκε διπλός βάσης πριν από την απόδοση');
  return f.db as never;
};
export const createBrowserClient = createClient;
export default createClient;
