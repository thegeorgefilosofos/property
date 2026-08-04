import { createClient } from '@/lib/supabase/client';
import { athensToday } from './core/time';

// GDPR φορητότητα δεδομένων (Άρθρο 20): ο συνδεδεμένος χρήστης κατεβάζει ΟΛΑ τα
// δικά του δεδομένα σε ένα ενιαίο, μηχαναγνώσιμο αρχείο JSON. Καθαρή λογική
// συλλογής και λήψη στον browser, χωρίς αλλαγές στον server και χωρίς εξωτερικές
// βιβλιοθήκες. Η ανάγνωση περιορίζεται στις γραμμές του χρήστη (RLS + φίλτρα).

export interface ExportResult {
  ok: boolean;
  error?: string;
  tables?: number;
  rows?: number;
}

// Γενικό σχήμα γραμμής: το ακριβές σχήμα κάθε πίνακα δεν μας ενδιαφέρει εδώ.
type Row = Record<string, unknown>;

// Πίνακες που ανήκουν στον χρήστη μέσω στήλης user_id (όπως ορίζει το RLS στο
// SETUP_ALL / core_rls_hardening). Το user_properties το αντλούμε ξεχωριστά
// πρώτα, ώστε να έχουμε τα ids των ακινήτων για τους property-scoped πίνακες.
const USER_ID_TABLES = [
  'expenses',
  'bills',
  'tenants',
  'maintenance_tasks',
  'loans',
  'client_stays',
  'contacts',
  'property_documents',
  'clients',
] as const;

// Πίνακες που ανήκουν στον χρήστη μέσω property_id (ιδιοκτησία μέσω user_properties).
// Φιλτράρονται με τα ids των ακινήτων του χρήστη.
const PROPERTY_ID_TABLES = [
  'property_settings',
  'checklist_items',
  'inventory_items',
  'inventory_maintenance',
] as const;

// Στήλες του προφίλ χρέωσης προς εξαγωγή. Εξαιρούμε ρητά τα εσωτερικά πεδία του
// Stripe (αναγνωριστικά συνδρομής/πελάτη), που δεν αφορούν φορητότητα δεδομένων.
const BILLING_PROFILE_COLUMNS = [
  'user_id',
  'doc_type',
  'full_name',
  'owner_name',
  'company_name',
  'afm',
  'doy',
  'profession',
  'address',
  'city',
  'postal_code',
  'country',
  'phone',
  'plan',
  'billing_cycle',
  'subscription_status',
  'profile_type',
  'comp_plan',
  'comp_until',
  'comp_months_granted',
  'comp_started_at',
  'wants_mobile',
  'full_name_changed_at',
  'updated_at',
].join(',');

// Λήψη του JSON στον browser: Blob και προσωρινός σύνδεσμος <a>. Καθαρίζουμε το
// object URL μετά. Εκτελείται μόνο client-side (φύλαξη με typeof window).
function triggerDownload(payload: unknown): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = athensToday(); // YYYY-MM-DD
  const a = document.createElement('a');
  a.href = url;
  a.download = `property_os_data_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportAllData(userId: string): Promise<ExportResult> {
  try {
    if (!userId) {
      return { ok: false, error: 'Λείπει το αναγνωριστικό χρήστη.' };
    }

    const supabase = createClient();
    const data: Record<string, Row[]> = {};

    // 1) Πρώτα τα ακίνητα του χρήστη, ώστε να φιλτράρουμε τους property-scoped πίνακες.
    const { data: propsData, error: propsError } = await supabase
      .from('user_properties')
      .select('*')
      .eq('user_id', userId);
    const properties: Row[] =
      !propsError && Array.isArray(propsData) ? (propsData as Row[]) : [];
    data['user_properties'] = properties;

    // Τα ids των ακινήτων (uuid ως string) που τροφοδοτούν τα φίλτρα property_id.
    const propertyIds = properties
      .map((p) => p.id)
      .filter((id): id is string | number => id !== null && id !== undefined);

    // 2) Πίνακες με user_id.
    for (const table of USER_ID_TABLES) {
      try {
        const { data: rows, error } = await supabase
          .from(table)
          .select('*')
          .eq('user_id', userId);
        // Αν ο πίνακας λείπει ή αποτύχει το ερώτημα, τον προσπερνάμε σιωπηλά.
        if (error) continue;
        data[table] = Array.isArray(rows) ? (rows as Row[]) : [];
      } catch {
        // Αγνοούμε το σφάλμα μεμονωμένου πίνακα και συνεχίζουμε τη συλλογή.
      }
    }

    // 3) Πίνακες με property_id (μόνο για τα ακίνητα του χρήστη).
    for (const table of PROPERTY_ID_TABLES) {
      // Χωρίς ακίνητα δεν υπάρχουν property-scoped γραμμές: κενή λίστα, χωρίς ερώτημα.
      if (propertyIds.length === 0) {
        data[table] = [];
        continue;
      }
      try {
        const { data: rows, error } = await supabase
          .from(table)
          .select('*')
          .in('property_id', propertyIds);
        if (error) continue;
        data[table] = Array.isArray(rows) ? (rows as Row[]) : [];
      } catch {
        // Αγνοούμε το σφάλμα μεμονωμένου πίνακα και συνεχίζουμε.
      }
    }

    // 4) Προφίλ χρέωσης: η δική του γραμμή, χωρίς τα εσωτερικά πεδία Stripe.
    try {
      const { data: rows, error } = await supabase
        .from('billing_profiles')
        .select(BILLING_PROFILE_COLUMNS)
        .eq('user_id', userId);
      if (!error) {
        data['billing_profiles'] = Array.isArray(rows) ? (rows as unknown as Row[]) : [];
      }
    } catch {
      // Αν λείπει ο πίνακας/στήλη, το παραλείπουμε αθόρυβα.
    }

    // Πλήθος πινάκων που συλλέχθηκαν και συνολικές γραμμές.
    const tables = Object.keys(data).length;
    const rows = Object.values(data).reduce((sum, r) => sum + r.length, 0);

    // Φάκελος εξαγωγής (envelope) με μεταδεδομένα ταυτοποίησης.
    const envelope = {
      app: 'Property OS',
      exported_at: new Date().toISOString(),
      user_id: userId,
      data,
    };

    // Ενεργοποίηση της λήψης στον browser.
    triggerDownload(envelope);

    return { ok: true, tables, rows };
  } catch (e) {
    // Ποτέ δεν πετάμε σφάλμα προς τον καλούντα: επιστρέφουμε δομημένο αποτέλεσμα.
    const message =
      e instanceof Error ? e.message : 'Άγνωστο σφάλμα κατά την εξαγωγή δεδομένων.';
    return { ok: false, error: message };
  }
}
