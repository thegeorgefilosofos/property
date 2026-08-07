'use client';

// ═══════════════════════════════════════════════════════════════════════════
// ΣΥΜΒΟΛΑΙΑ ΚΑΙ ΠΑΡΟΧΟΙ — και ΜΟΝΟ αυτά.
//
// ΤΙ ΥΠΗΡΧΕ ΕΔΩ ΚΑΙ ΕΦΥΓΕ. Μια δεύτερη ολόκληρη οθόνη δαπανών
// (BillsDashboard): δική της φόρμα καταχώρησης λογαριασμού, δική της λίστα με
// σήμανση πληρωμής και διαγραφή, δικά της τρία γραφήματα, δικός της «Ετήσιος
// Απολογισμός». Καθένα από αυτά υπήρχε ήδη αλλού:
//   · η φόρμα και η λίστα, στις «Δαπάνες» (ExpenseLedger)
//   · τα γραφήματα και η πρόβλεψη έτους, στον «Προϋπολογισμό» (BillsBudget)
// Δηλαδή ο ιδιοκτήτης είχε ΔΥΟ φόρμες με διαφορετικά πεδία για το ίδιο ευρώ,
// δύο λίστες που έδειχναν τα ίδια νούμερα αλλιώς, και τρία σημεία να ρωτήσει
// «πόσο ξόδεψα φέτος» με τρεις πιθανές απαντήσεις.
//
// Η αρχή ήταν ήδη γραμμένη στο TabFinances και απλώς δεν είχε εφαρμοστεί ως το
// τέλος: «ο λογαριασμός δεν είναι άλλο πράγμα από τη δαπάνη — είναι δαπάνη που
// δεν την έχεις πληρώσει ακόμη», και «τα έξι εργαλεία έπαψαν να είναι σημείο
// καταχώρησης και έγιναν αυτό που πάντα ήταν, δηλαδή συμβόλαια και συγκρίσεις».
//
// ΤΙ ΜΕΝΕΙ: πόσο τρέχουν τα πάγια τον μήνα (το νούμερο πάνω στο οποίο πατά κάθε
// σύγκριση), η ειδοποίηση όταν πληρώνεις παραπάνω από ό,τι χρειάζεται, και τα
// έξι εργαλεία ανά κατηγορία. Χωρίς πτυσσόμενο «Περισσότερα»: όταν δεν υπάρχει
// τίποτα μπροστά του, ένα «Περισσότερα» είναι απλώς ένα κλικ πριν το μοναδικό
// περιεχόμενο της οθόνης.
//
// ΠΟΥ ΠΗΓΕ Ο ΔΙΑΜΟΙΡΑΣΜΟΣ. Το «Ποιος πληρώνει / μερίδιό μου» ήταν το μόνο
// γνήσια μοναδικό της παλιάς φόρμας — και το διάβαζε όλη η εφαρμογή ενώ το
// έγραφε μόνο εκείνη. Ζει τώρα στη φόρμα των «Δαπανών», με τα υπόλοιπα πεδία.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { T, fe, Skeleton } from '@/components/Theme';
import { mergeLedger, recurringMonthly } from '@/lib/expenses/ledger';

// ── Static imports, all components must be static for Next.js App Router ────
import BillsElectricity  from './BillsElectricity';
import BillsGas          from './BillsGas';
import BillsCommon       from './BillsCommon';
import BillsProviders    from './BillsProviders';
import BillsInsurance    from './BillsInsurance';
import BillsServices     from './BillsServices';
import ExpenseSwitchAlert from './ExpenseSwitchAlert';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Props {
  propertyId:       string;
  userId:           string;
}

/** Τα εργαλεία που ζουν πίσω από το «Περισσότερα». */
type ToolId = 'electricity' | 'gas' | 'common' | 'providers' | 'insurance' | 'services';

interface ToolDef { id: ToolId; label: string; icon: string; desc: string }

interface StripData {
  /**
   * Ο μέσος μήνας σε πάγια, ΜΕΤΡΗΜΕΝΟΣ. `null` όταν το ιστορικό δεν φτάνει.
   *
   * Ήταν `sum(λογαριασμοί με recurring)` με ετικέτα «/ μήνα». Κάθε γραμμή του
   * `bills` όμως είναι ΜΙΑ ΠΕΡΙΟΔΟΣ — ο χρήστης διαλέγει «Ιούλιος 2026» — και το
   * `recurring` είναι χαρακτηρισμός («Πάγιο» απέναντι σε «Εφάπαξ»), όχι
   * πρόγραμμα. Δώδεκα λογαριασμοί ΔΕΗ των 100 € έδειχναν «1.200 € / μήνα».
   */
  recurringPerMonth: number | null;
  // ΤΑ ΑΛΛΑ ΤΡΙΑ ΕΦΥΓΑΝ ΜΑΖΙ ΜΕ ΤΗ ΛΙΣΤΑ. Ο μετρητής ληξιπρόθεσμων έδειχνε προς
  // μια λίστα που δεν υπάρχει πια σε αυτή την οθόνη — ένα σήμα που δεν οδηγεί
  // πουθενά είναι χειρότερο από κανένα σήμα. Το όνομα ενοικιαστή δεν είχε ποτέ
  // σχέση με τα συμβόλαια παρόχων, και η ώρα τελευταίας ανάγνωσης απαντούσε σε
  // ερώτηση που δεν έκανε κανείς. Μένει το ΕΝΑ νούμερο πάνω στο οποίο πατά κάθε
  // σύγκριση τιμολογίου: πόσο τρέχουν τα πάγια τον μήνα.
}

// ─── SVG icons ────────────────────────────────────────────────────────────────
const ICONS: Record<string, string> = {
  bolt:     'M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z',
  flame:    'M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-1.5-.5-2.5-1.5-4 .5 2-.5 3-1.5 2.5.5-2-.5-4-2-5.5z M12 13a2 2 0 1 1-2-2c.5 0 1 .5 1 1.5 0 1-.5.5-.5 1.5a1.5 1.5 0 0 0 1.5 1.5z',
  building: 'M3 21h18M5 21V7l8-4 8 4v14M9 21V15h6v6M9 11h1m4 0h1M9 7h1m4 0h1',
  wifi:     'M12 18h.01M8.5 14.5A5.5 5.5 0 0 1 12 13a5.5 5.5 0 0 1 3.5 1.5M5 11a9 9 0 0 1 14 0M1.5 7.5a14 14 0 0 1 21 0',
  shield:   'M12 3l8 4v5c0 5-3.5 9.7-8 11-4.5-1.3-8-6-8-11V7l8-4z',
  wrench:   'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
};

const TabIcon = ({ name, size = 13 }: { name: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICONS[name] ?? ICONS.bolt}/>
  </svg>
);

// ─── Τα εργαλεία ──────────────────────────────────────────────────────────────
const TOOLS: ToolDef[] = [
  { id: 'electricity', label: 'Ρεύμα',                icon: 'bolt',     desc: 'Πάροχος, κατανάλωση, σύγκριση τιμολογίων' },
  { id: 'gas',         label: 'Φυσικό αέριο',         icon: 'flame',    desc: 'Πάροχος αερίου και σύγκριση τιμολογίων' },
  { id: 'common',      label: 'Κοινόχρηστα',          icon: 'building', desc: 'Διαχείριση κτηρίου, ταμείο, ιστορικό' },
  { id: 'providers',   label: 'Πάροχοι',              icon: 'wifi',     desc: 'Internet, νερό, θέρμανση, security' },
  { id: 'insurance',   label: 'Ασφάλεια & συνδρομές', icon: 'shield',   desc: 'Ασφάλεια κατοικίας, streaming, cloud' },
  { id: 'services',    label: 'Υπηρεσίες',            icon: 'wrench',   desc: 'ΕΝΦΙΑ, δημοτικά τέλη, καθαρισμός, κηπουρός' },
];

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabBills({
  propertyId, userId,
}: Props) {
  const supabase   = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const toolsRef   = useRef<HTMLDivElement | null>(null);

  const [tool,       setTool]       = useState<ToolId | null>(null);
  const [strip,      setStrip]      = useState<StripData>({ recurringPerMonth: null });
  // Το `strip` ξεκινά με μηδενικά, οπότε η κεφαλίδα δεν έδειχνε κανένα chip και
  // μετά τα chips εμφανίζονταν μονομιάς και έσπρωχναν τη γραμμή. Δύο σκελετοί
  // κρατούν τη θέση τους όσο τρέχουν τα παράλληλα ερωτήματα.
  const [stripLoading, setStripLoading] = useState(true);

  const loadStrip = useCallback(async () => {
    if (!propertyId) return;
    try {
      // Οι δαπάνες χρειάζονται για να μη μετρηθεί δύο φορές ο πληρωμένος πάγιος:
      // ο λογαριασμός είναι το πρόγραμμα, η δαπάνη το γεγονός, δεμένα με bill_id.
      const [{ data: bills }, { data: expenses }] = await Promise.all([
        supabase.from('bills').select('id,name,amount,paid,paid_at,due_date,created_at,category,recurring').eq('property_id', propertyId),
        supabase.from('expenses').select('id,bill_id,amount,date,description,category,paid,expense_group,is_recurring,store_vendor').eq('property_id', propertyId),
      ]);

      const { entries } = mergeLedger((bills ?? []) as never[], (expenses ?? []) as never[]);
      setStrip({ recurringPerMonth: recurringMonthly(entries).perMonth });
    } catch (_) {} finally { setStripLoading(false); }
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return;
    let mounted = true;
    loadStrip();
    const ch = supabase
      .channel(`tabbills_${propertyId}`)
      .on('postgres_changes' as const, { event: '*', schema: 'public', table: 'bills', filter: `property_id=eq.${propertyId}` }, () => { if (mounted) loadStrip(); })
      .subscribe();
    channelRef.current = ch;
    return () => { mounted = false; supabase.removeChannel(ch); channelRef.current = null; };
  }, [propertyId, loadStrip]);

  // Άνοιγμα εργαλείου από αλλού (π.χ. από την ειδοποίηση «πληρώνεις παραπάνω»).
  const openTool = useCallback((id: ToolId) => {
    setTool(id);
    // Το requestAnimationFrame περιμένει να αποδοθεί το πάνελ πριν κυλήσει σε αυτό.
    requestAnimationFrame(() => toolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  // Χωρίς propertyId δεν τρέχει κανένα ερώτημα, άρα δεν υπάρχει τίποτα να
  // περιμένει ο σκελετός. Παράγωγη τιμή, ώστε το effect να μην γράφει state.
  const showSkeleton = stripLoading && !!propertyId;

  const activeTool = TOOLS.find(t => t.id === tool) ?? null;

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3, fontFamily: T.font.sans }}>
            Λογαριασμοί & πάγιες δαπάνες
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Τι πληρώνεις κάθε μήνα, και αν υπάρχει φθηνότερο. Οι καταχωρήσεις γίνονται στις Δαπάνες.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* Η ΠΡΑΣΙΝΗ ΚΟΥΚΚΙΔΑ «LIVE» ΕΦΥΓΕ. Δεν ήταν πληροφορία του ιδιοκτήτη:
              ήταν η κατάσταση μιας σύνδεσης websocket, με αγγλική λέξη και με
              σημασιολογικό πράσινο, μόνιμα στην κορυφή της οθόνης. Ό,τι έχει να
              πει μια χαμένη σύνδεση το λέει η ίδια η οθόνη όταν τα νούμερα δεν
              ανανεώνονται — και τότε αρκεί η ανανέωση της σελίδας. */}
          {showSkeleton
            ? <Skeleton w={110} h={24} r={T.radius.pill} />
            : strip.recurringPerMonth !== null && strip.recurringPerMonth > 0 && (
              <span title="Ο μέσος μήνας σε πάγια, μετρημένος από τους λογαριασμούς που έχεις καταχωρήσει (σύνολο παγίων ÷ οι μήνες που καλύπτουν). Εμφανίζεται μόλις υπάρχουν δύο περίοδοι — με μία δεν υπάρχει μέσος όρος." style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(strip.recurringPerMonth, 0)} / μήνα</span>
            )}
        </div>
      </div>

      {/* ── «Πληρώνεις παραπάνω» — μόνο όταν υπάρχει πραγματική διαφορά ── */}
      <ExpenseSwitchAlert propertyId={propertyId} onOpen={openTool} />

      {/* ── Τα εργαλεία ανά κατηγορία ──────────────────────────────────
          Χωρίς πτυσσόμενο περιτύλιγμα: αυτά ΕΙΝΑΙ η οθόνη. */}
      <div ref={toolsRef}>
        {/* Ίδιο περίβλημα με τον διακόπτη του TabFinances από πάνω: βυθισμένη
            επιφάνεια, μέσα της ανασηκώνεται το ενεργό. Μία γλώσσα, μία οθόνη. */}
        <div style={{ display: 'inline-flex', padding: 3, gap: 2, flexWrap: 'wrap',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      borderRadius: T.radius.pill, maxWidth: '100%',
                      marginBottom: activeTool ? 16 : 0 }}>
          {TOOLS.map(t => {
            const on = tool === t.id;
            return (
              <button key={t.id} type="button" title={t.desc}
                onClick={() => setTool(on ? null : t.id)} aria-pressed={on}
                // ΤΟ ΕΝΕΡΓΟ ΔΕΝ ΕΙΝΑΙ ΜΠΛΕ. Ο κανόνας είναι γραμμένος ρητά στο
                // TabFinances, είκοσι εικονοστοιχεία πιο πάνω στην ίδια οθόνη:
                // «το μπλε μένει ΜΟΝΟ για την κύρια ενέργεια — δύο μπλε σημεία
                // στην ίδια οθόνη είναι κανένα». Εδώ τα chips ήταν γεμάτα μπλε
                // και ένα σκαλί κοντύτερα (sm αντί για md), οπότε οι δύο σειρές
                // διακοπτών έμοιαζαν με δύο διαφορετικές εφαρμογές. Ίδιο ύψος,
                // ίδιο σχήμα, ίδιος κανόνας ενεργού.
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: T.h.md, padding: '0 16px', borderRadius: T.radius.pill, border: `1px solid ${on ? 'var(--border-default)' : 'transparent'}`, cursor: 'pointer', fontSize: 13, fontWeight: on ? 700 : 500, fontFamily: T.font.sans, whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s', background: on ? 'var(--bg-surface)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: on ? 'var(--elev-1)' : 'none' }}>
                <TabIcon name={t.icon} size={12}/>
                {t.label}
              </button>
            );
          })}
        </div>

        {activeTool ? (
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
            {tool === 'electricity' && <BillsElectricity propertyId={propertyId} userId={userId}/>}
            {tool === 'gas'         && <BillsGas         propertyId={propertyId} userId={userId}/>}
            {tool === 'common'      && <BillsCommon      propertyId={propertyId} userId={userId}/>}
            {tool === 'providers'   && <BillsProviders   propertyId={propertyId} userId={userId}/>}
            {tool === 'insurance'   && <BillsInsurance   propertyId={propertyId} userId={userId}/>}
            {tool === 'services'    && <BillsServices    propertyId={propertyId} userId={userId}/>}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.6, marginTop: 14 }}>
            Διάλεξε κατηγορία για να δεις το συμβόλαιό σου και τι προσφέρει η αγορά.
          </div>
        )}
      </div>
    </div>
  );
}
