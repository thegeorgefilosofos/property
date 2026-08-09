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
import * as expenseStore from '@/lib/data/expenses'
import { T, fe, Skeleton } from '@/components/Theme';
import { mergeLedger, type LedgerEntry } from '@/lib/expenses/ledger';
import { contractOverview, totalMonthly, CONTRACT_EMPTY_HINT, CONTRACT_LABEL, type ContractCard, type ContractKind } from '@/lib/contracts/overview';

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
  /** Οι κάρτες συμβολαίων, υπολογισμένες από το ίδιο ιστορικό. */
  cards: ContractCard[];
  // ΤΑ ΑΛΛΑ ΤΡΙΑ ΕΦΥΓΑΝ ΜΑΖΙ ΜΕ ΤΗ ΛΙΣΤΑ. Ο μετρητής ληξιπρόθεσμων έδειχνε προς
  // μια λίστα που δεν υπάρχει πια σε αυτή την οθόνη — ένα σήμα που δεν οδηγεί
  // πουθενά είναι χειρότερο από κανένα σήμα. Το όνομα ενοικιαστή δεν είχε ποτέ
  // σχέση με τα συμβόλαια παρόχων, και η ώρα τελευταίας ανάγνωσης απαντούσε σε
  // ερώτηση που δεν έκανε κανείς. Μένει το ΕΝΑ νούμερο πάνω στο οποίο πατά κάθε
  // σύγκριση τιμολογίου: πόσο τρέχουν τα πάγια τον μήνα.
}

// ΤΟ ΔΕΥΤΕΡΟ ΣΥΝΟΛΟ ΟΝΟΜΑΤΩΝ ΕΦΥΓΕ. Ο πίνακας `TOOLS` κρατούσε έξι δικές του
// ετικέτες («Πάροχοι», «Ασφάλεια και συνδρομές», «Υπηρεσίες») δίπλα στις οκτώ
// του `CONTRACT_LABEL` — και οι δύο κατάλογοι έδειχναν τα ίδια πράγματα με
// άλλα λόγια. Δύο ονόματα για ένα πράγμα δεν είναι ευελιξία· είναι η αιτία που
// η κεφαλίδα του πάνελ διαφωνούσε με την κάρτα που μόλις πάτησες.
//
// Το εικονίδιο της κεφαλίδας έφυγε μαζί: η κάρτα από πάνω δεν έχει εικονίδιο,
// άρα δεν το αναγνώριζε κανείς ως τη συνέχειά της.

// ─── Η κάρτα ενός συμβολαίου ──────────────────────────────────────────────────
/**
 * ΕΝΑ ΣΧΗΜΑ, ΕΠΤΑ ΠΕΡΙΠΤΩΣΕΙΣ. Η γνωστή και η άγνωστη κατηγορία έχουν το ΙΔΙΟ
 * περίγραμμα και το ίδιο ύψος: αλλιώς το πλέγμα «χοροπηδά» ανάλογα με το τι
 * έχει καταχωρήσει ο χρήστης, και η οθόνη μοιάζει διαφορετική σε κάθε ακίνητο.
 *
 * ΤΟ ΑΓΝΩΣΤΟ ΔΕΝ ΓΡΑΦΕΤΑΙ ΜΗΔΕΝ. Ένα «0,00 €» στο αέριο σημαίνει «δεν πληρώνω
 * αέριο», ενώ η αλήθεια είναι «δεν ξέρω ακόμη». Η κενή κάρτα λέει τι λείπει και
 * πώς μπαίνει — με τον δρόμο που δεν απαιτεί πληκτρολόγηση.
 */
function ContractTile({ card, active, onOpen }: { card: ContractCard; active: boolean; onOpen: () => void }) {
  const [hover, setHover] = useState(false);
  const raised = hover || active;
  const period = card.everyMonths === 2 ? 'ανά δίμηνο' : '';
  const meta = card.known
    ? [card.provider, period, `${card.occurrences} ${card.occurrences === 1 ? 'περίοδος' : 'περίοδοι'}`].filter(Boolean).join(' · ')
    : CONTRACT_EMPTY_HINT[card.kind];

  return (
    <button type="button" onClick={onOpen}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      aria-pressed={active}
      style={{
        textAlign: 'left', width: '100%', cursor: 'pointer', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', gap: 10, minHeight: 92,
        padding: '14px 16px', borderRadius: T.radius.card, fontFamily: T.font.sans,
        background: raised ? 'var(--bg-surface)' : 'var(--bg-elevated)',
        border: `1px solid ${active ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        boxShadow: raised ? 'var(--elev-1)' : 'none',
        transition: `background .15s ${T.ease.standard}, border-color .15s, box-shadow .15s, transform .15s`,
        transform: hover && !active ? 'translateY(-1px)' : 'none',
      }}>
      <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {card.label}
        </span>
        {/* Η ΙΕΡΑΡΧΙΑ ΒΓΑΙΝΕΙ ΑΠΟ ΜΕΓΕΘΟΣ ΚΑΙ ΒΑΡΟΣ, ΟΧΙ ΑΠΟ ΧΡΩΜΑ. Το ποσό
            είναι το μόνο μεγάλο νούμερο της κάρτας· ό,τι δεν γνωρίζουμε μένει
            στο μέγεθος του κειμένου, όχι σε κόκκινο. */}
        {card.monthly !== null && (
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>
            {fe(card.monthly)}
          </span>
        )}
      </span>
      {/* ΤΟ ΚΟΥΜΠΙ ΜΕΣΑ ΣΤΟ ΚΟΥΜΠΙ ΕΦΥΓΕ. Κάτω από κάθε κάρτα στεκόταν μια
          γραμμή «Άνοιγμα» ή «Σύγκριση και λεπτομέρειες», βαμμένη σαν σύνδεσμος
          — μέσα σε ένα <button> που είναι ΟΛΟΚΛΗΡΟ πατήσιμο. Οκτώ κάρτες, οκτώ
          ψεύτικοι σύνδεσμοι που δεν πρόσθεταν ούτε προορισμό ούτε ενέργεια: το
          μόνο που έκαναν ήταν να λένε δεύτερη φορά αυτό που λέει ήδη ο δείκτης
          του ποντικιού και η ίδια η κάρτα. Ο τίτλος, το ποσό και ο πάροχος
          μένουν· ο θόρυβος όχι. */}
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
        {meta}
      </span>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TabBills({
  propertyId, userId,
}: Props) {
  const supabase   = createClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const toolsRef   = useRef<HTMLDivElement | null>(null);

  const [tool,       setTool]       = useState<ContractKind | null>(null);
  const [strip,      setStrip]      = useState<StripData>({ recurringPerMonth: null, cards: [] });
  // Το `strip` ξεκινά με μηδενικά, οπότε η κεφαλίδα δεν έδειχνε κανένα chip και
  // μετά τα chips εμφανίζονταν μονομιάς και έσπρωχναν τη γραμμή. Δύο σκελετοί
  // κρατούν τη θέση τους όσο τρέχουν τα παράλληλα ερωτήματα.
  const [stripLoading, setStripLoading] = useState(true);

  const loadStrip = useCallback(async () => {
    if (!propertyId) return;
    try {
      // Οι δαπάνες χρειάζονται για να μη μετρηθεί δύο φορές ο πληρωμένος πάγιος:
      // ο λογαριασμός είναι το πρόγραμμα, η δαπάνη το γεγονός, δεμένα με bill_id.
      const [{ data: bills }, rows] = await Promise.all([
        supabase.from('bills').select('id,name,amount,paid,paid_at,due_date,created_at,category,recurring').eq('property_id', propertyId),
        expenseStore.ledger(supabase, propertyId),
      ]);

      const { entries } = mergeLedger((bills ?? []) as never[], rows as never[]);
      const cards = contractOverview(entries as LedgerEntry[], new Date());
      // Το σύνολο βγαίνει από τις ΙΔΙΕΣ κάρτες που βλέπει ο χρήστης. Πριν, το
      // νούμερο της κεφαλίδας ερχόταν από άλλη συνάρτηση (`recurringMonthly`)
      // και μπορούσε να μη συμφωνεί με το άθροισμα των γραμμών από κάτω — δύο
      // απαντήσεις στην ίδια ερώτηση, στην ίδια οθόνη.
      setStrip({ recurringPerMonth: totalMonthly(cards) || null, cards });
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
  const openTool = useCallback((id: ContractKind) => {
    setTool(id);
    // Το requestAnimationFrame περιμένει να αποδοθεί το πάνελ πριν κυλήσει σε αυτό.
    requestAnimationFrame(() => toolsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  // Χωρίς propertyId δεν τρέχει κανένα ερώτημα, άρα δεν υπάρχει τίποτα να
  // περιμένει ο σκελετός. Παράγωγη τιμή, ώστε το effect να μην γράφει state.
  const showSkeleton = stripLoading && !!propertyId;


  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }`}</style>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 3, fontFamily: T.font.sans }}>
            Λογαριασμοί και πάγιες δαπάνες
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.sans, lineHeight: 1.5 }}>
            Τι έχεις, τι πληρώνεις. Οι καταχωρήσεις γίνονται στις Δαπάνες.
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
              <span title="Το άθροισμα των καρτών από κάτω. Κάθε κατηγορία μετριέται από το ιστορικό της με διάμεσο, και ο διμηνιαίος λογαριασμός μοιράζεται στους μήνες του. Κατηγορία χωρίς αρκετό ιστορικό δεν μπαίνει στο άθροισμα." style={{ padding: '4px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.pill, fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(strip.recurringPerMonth)} τον μήνα</span>
            )}
        </div>
      </div>

      {/* ── «Πληρώνεις παραπάνω» — μόνο όταν υπάρχει πραγματική διαφορά ── */}
      <ExpenseSwitchAlert propertyId={propertyId} onOpen={openTool} />

      {/* ── ΟΙ ΚΑΡΤΕΣ: Η ΑΠΑΝΤΗΣΗ ΠΡΙΝ ΤΗΝ ΕΡΩΤΗΣΗ ────────────────────────
          ΠΡΙΝ: έξι κλειστά chips και η γραμμή «Διάλεξε κατηγορία για να δεις το
          συμβόλαιό σου». Τρία κλικ και άδεια οθόνη πριν ο ιδιοκτήτης δει
          οτιδήποτε δικό του — και πίσω από κάθε chip ένα πάνελ εκατοντάδων
          γραμμών με καταλόγους της αγοράς.

          Η ιεραρχία ήταν ανάποδη. Κανείς δεν ανοίγει τα Συμβόλαια για να
          μελετήσει την αγορά· τα ανοίγει για να θυμηθεί τι έχει και πόσο του
          κοστίζει. Η αγορά είναι η ΔΕΥΤΕΡΗ ερώτηση, και μόνο για όποιον τη
          ρωτήσει: ζει ακέραιη ένα κλικ πιο μέσα. */}
      <div ref={toolsRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 230px), 1fr))', gap: 10 }}>
        {showSkeleton
          ? [0, 1, 2, 3, 4, 5, 6, 7].map(i => <Skeleton key={i} h={92} r={T.radius.card} />)
          : strip.cards.map(c => (
            <ContractTile key={c.kind} card={c} active={tool === c.kind}
              onOpen={() => openTool(c.kind)} />
          ))}
      </div>

      {tool && (
        <div style={{ marginTop: 16 }}>
          {/*

            ΤΟ ΟΝΟΜΑ ΤΗΣ ΚΑΡΤΑΣ ΚΑΙ ΤΟ ΟΝΟΜΑ ΤΟΥ ΠΑΝΕΛ ΗΤΑΝ ΔΙΑΦΟΡΕΤΙΚΑ.

            Επτά κάρτες οδηγούσαν σε έξι πάνελ, και τα ονόματα δεν συνέπιπταν: πατούσες
            «Νερό» και άνοιγε «Πάροχοι», με internet, τηλεόραση, θέρμανση, συναγερμό και
            δημοτικά τέλη μπροστά σου· πατούσες «Συνδρομές» και άνοιγε «Ασφάλεια και
            συνδρομές», με το ασφαλιστήριο πρώτο. Ο χρήστης δεν έκανε λάθος: η οθόνη
            τού υποσχόταν ένα και του έδινε άλλο.

            Και μία ολόκληρη ενότητα δεν είχε κάρτα καθόλου. Ο υπολογιστής ΕΝΦΙΑ, το
            ιστορικό δημοτικών τελών και οι υπηρεσίες του ακινήτου ήταν το έβδομο πάνελ
            μιας αντιστοίχισης έξι θέσεων: δουλεύοντας εργαλείο, χωρίς πόρτα.

            Τώρα η αντιστοίχιση είναι ένα προς ένα. Κάθε κάρτα ανοίγει πάνελ με το ΙΔΙΟ
            όνομα και ΜΟΝΟ τα δικά της πεδία — αυτό είναι όλο το περιεχόμενο αυτού του
            χάρτη. Οι δύο περιπτώσεις που χρειάζονται δύο πάνελ τα δηλώνουν ρητά: η
            θέρμανση με το αέριο (ο ίδιος λογαριασμός ζεσταίνει το σπίτι), ο συναγερμός
            με τις συνδρομές (είναι μηνιαία συνδρομή σε εταιρεία, όχι πάροχος δικτύου).
 
          */}
          {/* Η κεφαλίδα λέει ΤΟ ΟΝΟΜΑ ΤΗΣ ΚΑΡΤΑΣ ΠΟΥ ΠΑΤΗΘΗΚΕ, από την ίδια
              πηγή με την κάρτα. Πριν διάβαζε ένα δεύτερο, δικό της λεξιλόγιο —
              και γι᾽ αυτό το «Νερό» άνοιγε «Πάροχοι». */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, minWidth: 0 }}>{CONTRACT_LABEL[tool]}</span>
            <button type="button" onClick={() => setTool(null)}
              style={{ height: T.h.sm, padding: '0 14px', borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, flexShrink: 0 }}>
              Κλείσιμο
            </button>
          </div>
          <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-1)' }}>
            {tool === 'electricity'   && <BillsElectricity propertyId={propertyId} userId={userId} onNavigateTab={t => openTool(t as ContractKind)}/>}
            {/* Ο ίδιος λογαριασμός ζεσταίνει το σπίτι: το αέριο και ο τρόπος
                θέρμανσης απαντούν στην ίδια ερώτηση και μπαίνουν μαζί. */}
            {tool === 'gas'           && (<>
              <BillsGas propertyId={propertyId} userId={userId} onNavigateTab={t => openTool(t as ContractKind)}/>
              <BillsProviders propertyId={propertyId} userId={userId} only="heating"/>
            </>)}
            {tool === 'common'        && <BillsCommon    propertyId={propertyId} userId={userId}/>}
            {tool === 'water'         && <BillsProviders propertyId={propertyId} userId={userId} only="water"/>}
            {tool === 'internet'      && <BillsProviders propertyId={propertyId} userId={userId} only="internet"/>}
            {tool === 'insurance'     && <BillsInsurance propertyId={propertyId} userId={userId} only="insurance"/>}
            {/* Ο συναγερμός είναι μηνιαία συνδρομή σε εταιρεία, όχι πάροχος
                δικτύου: στέκει με τις υπόλοιπες συνδρομές. */}
            {tool === 'subscriptions' && (<>
              <BillsInsurance propertyId={propertyId} userId={userId} only="subscriptions"/>
              <BillsProviders propertyId={propertyId} userId={userId} only="security"/>
            </>)}
            {tool === 'services'      && <BillsServices  propertyId={propertyId} userId={userId}/>}
          </div>
        </div>
      )}
    </div>
  );
}
