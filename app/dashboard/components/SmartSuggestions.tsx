'use client';

// ═══════════════════════════════════════════════════════════════════════════
// Νόα · Προτάσεις — τι έρχεται σε αυτό το ακίνητο.
// ─────────────────────────────────────────────────────────────────────────
// Διαβάζει τα δεδομένα του ακινήτου και προτείνει επερχόμενες υποχρεώσεις
// (συντήρηση, φόροι, ανανεώσεις), με ένα άγγιγμα στο ημερολόγιο. Ζει στην
// Επισκόπηση, όχι στις ρυθμίσεις: εκεί είναι το φυσικό της σημείο.
//
// ΓΙΑΤΙ ΔΕΝ ΛΕΓΕΤΑΙ ΠΙΑ «ΕΞΥΠΝΕΣ ΠΡΟΤΑΣΕΙΣ»
// Ήταν δεύτερο brand για το ίδιο ακριβώς πράγμα με τη συνομιλία: ίδια δεδομένα,
// ίδια κρίση, άλλο όνομα. Ο χρήστης δεν είχε τρόπο να καταλάβει ότι μιλάει στο
// ίδιο πρόσωπο, οπότε δεν χτιζόταν καμία σχέση. Τώρα η κάρτα λέει ποια μιλάει.
//
// ΤΟ ΥΦΟΣ: μία στήλη, ήρεμη ιεραρχία, τυπογραφία από τα tokens. Καμία έγχρωμη
// κορδέλα, κανένα emoji· η προτεραιότητα φαίνεται από τη σειρά, όχι από χρώμα.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import * as calendar from '@/lib/data/calendar'
import { Check, Plus, X, RotateCcw, CircleCheckBig } from 'lucide-react';
import { isoDate } from '@/lib/core/time';
import { AssistantMark } from './AssistantMark';
import { T, TT, fe, EmptyState } from '@/components/Theme';
import { saved } from '@/components/dbWrite';
import { ASSISTANT_ACC, suggestionsTitle, suggestionsSub, suggestionsTeaser } from '@/lib/assistant/identity';

interface Suggestion {
  title: string;
  category: string;
  amount?: number;
  /** «YYYY-MM-DD» από τη συνάρτηση. Προαιρετικό: παλιό ανεβασμένο bundle δεν
   *  το στέλνει καθόλου, οπότε ισχύει η εφεδρική ημερομηνία της addSuggestion. */
  event_date?: string;
  recurring: boolean;
  recurring_interval?: string;
  priority?: string;
  reason: string;
}

const catLabels: Record<string, string> = {
  financial: 'Οικονομικά', bills: 'Λογαριασμοί', maintenance: 'Συντήρηση',
  contract: 'Συμβόλαιο', tenant: 'Ενοικιαστής', reminder: 'Υπενθύμιση',
};

// ΟΙ ΕΞΙ ΣΥΧΝΟΤΗΤΕΣ ΠΟΥ ΞΕΡΕΙ ΤΟ ΗΜΕΡΟΛΟΓΙΟ, ΜΕ ΤΟ ΟΝΟΜΑ ΤΟΥΣ.
//
// Η γραμμή της κάρτας τις έγραφε με αλυσίδα δύο ελέγχων: «annual» ετήσιο,
// «monthly» μηνιαίο, ΚΑΘΕ ΑΛΛΗ ΤΙΜΗ «Τριμηνιαίο». Το σχήμα που ζητά η
// συνάρτηση προσφέρει τέσσερις τιμές, άρα το «biannual» έπεφτε πάντα στο
// τελευταίο σκέλος: εξαμηνιαία υποχρέωση διαβαζόταν ως τριμηνιαία, δίπλα στο
// εικονίδιο επανάληψης, χωρίς τίποτα στην οθόνη να τη διαψεύδει.
//
// Οι τιμές είναι ακριβώς οι έξι που επεκτείνει το lib/calendar/recurrence.ts.
// Ο,τι δεν είναι εδώ δεν παράγει ποτέ δεύτερη εμφάνιση.
const intervalLabels: Record<string, string> = {
  weekly: 'Εβδομαδιαίο', monthly: 'Μηνιαίο', bimonthly: 'Διμηνιαίο',
  quarterly: 'Τριμηνιαίο', biannual: 'Εξαμηνιαίο', annual: 'Ετήσιο',
};

// Η συχνότητα της πρότασης, μόνο αν το ημερολόγιο ξέρει να την επεκτείνει.
//
// Γραφόταν αυτούσια στη στήλη (`s.recurring_interval || null`), δίπλα σε
// κατηγορία και προτεραιότητα που περνούν από φύλακες. Μια τιμή εκτός των έξι
// σήμαινε γεγονός σημαιοδοτημένο «επαναλαμβανόμενο» που δεν επαναλαμβανόταν
// ποτέ: υπόσχεση στην οθόνη χωρίς κανένα γεγονός από πίσω.
const intervalOf = (s: Suggestion): string | null => {
  const v = typeof s.recurring_interval === 'string' ? s.recurring_interval.trim() : '';
  return s.recurring === true && v in intervalLabels ? v : null;
};

// ΤΟ ΠΟΣΟ ΤΗΣ ΠΡΟΤΑΣΗΣ ΔΕΝ ΕΙΝΑΙ ΜΕΤΡΗΣΗ.
//
// Δηλώνεται `number` παραπάνω, αλλά βγαίνει από `JSON.parse` της απάντησης του
// μοντέλου (supabase/functions/smart-suggestions/index.ts:187, χωρίς κανέναν
// έλεγχο πεδίου) και το σχήμα που ζητά η συνάρτηση γράφει ρητά «amount: 150»:
// το μοντέλο ΠΡΕΠΕΙ να συμπληρώσει κάτι, ακόμη κι όταν καμία δαπάνη, κανένας
// λογαριασμός και κανένα γεγονός του ακινήτου δεν το στηρίζει.
//
// Δύο διαφορετικά πράγματα φτάνουν εδώ. Ποσό εκτός τύπου («450 €», Infinity),
// που το `fe()` το τυπώνει «0,00 €» — ποσό που δεν είπε κανείς, με δύο δεκαδικά
// και βεβαιότητα. Και ποσό εντός τύπου, που απλώς δεν προκύπτει από πουθενά.
// Το πρώτο κόβεται εδώ. Το δεύτερο μένει ορατό ως εκτίμηση, με «~» μπροστά.
const estimate = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

export default function SmartSuggestions({ userId, propertyId }: { userId: string; propertyId: string }) {
  const supabase = createClient();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  // Η μηχανή δεν απάντησε. Το λέμε, δεν το καλύπτουμε με εφευρέσεις.
  // Το ακριβές μήνυμα του server (π.χ. υπέρβαση ορίου AI), ώστε να μη λέμε
  // «δοκίμασε ξανά» εκεί που το ξαναπάτημα κοστίζει άλλη μία ερώτηση.
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  // Η κάρτα άνοιγε και δεν έκλεινε ποτέ. Ό,τι μπορεί να εμφανιστεί μόνο του
  // πρέπει να μπορεί και να φύγει, χωρίς να χαθεί ο τρόπος να ξανάρθει.
  const [collapsed, setCollapsed] = useState(false);
  const [failed, setFailed] = useState(false);

  async function generateSuggestions() {
    setLoadingSugg(true);
    setSuggestions([]);
    setDismissedIds(new Set());
    setFailed(false);
    try {
      // Send the signed-in user's own access token — the function derives identity
      // from it and verifies the property belongs to them (never trusts a body id).
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no session');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/smart-suggestions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ property_id: propertyId }),
        }
      );
      const data = await response.json();
      // ΤΟ ΜΗΝΥΜΑ ΤΟΥ SERVER ΠΡΕΠΕΙ ΝΑ ΦΤΑΝΕΙ ΣΤΟΝ ΧΡΗΣΤΗ.
      //
      // Κάθε απόκριση κατέληγε στο ίδιο «δοκίμασε ξανά σε λίγο». Σε υπέρβαση
      // ορίου (429) αυτό είναι λάθος συμβουλή: ο μετρητής αυξάνει ΠΡΙΝ τον
      // έλεγχο, οπότε κάθε ξαναπάτημα κατανάλωνε άλλη μία ερώτηση από το πακέτο
      // του χρήστη. Το λάθος μήνυμα άδειαζε ενεργά το υπόλοιπό του.
      if (!response.ok || data.error) {
        // ΜΟΝΟ ΤΑ ΜΗΝΥΜΑΤΑ ΠΟΥ ΓΡΑΦΤΗΚΑΝ ΓΙΑ ΤΟΝ ΧΡΗΣΤΗ ΦΤΑΝΟΥΝ ΣΕ ΑΥΤΟΝ.
        // Ο διακομιστής επιστρέφει και εσωτερικούς κωδικούς («AI error»,
        // «unauthorized», «internal error»). Περνούσαν αυτούσιοι στην οθόνη και
        // ο ιδιοκτήτης διάβαζε «AI error» κάτω από το σήμα της Νόα: αγγλικά,
        // ακατανόητα και χωρίς να του λένε τι να κάνει. Τα ελληνικά μηνύματα
        // (όριο ερωτήσεων, υπηρεσία εκτός) είναι γραμμένα γι' αυτόν και περνούν.
        const msg = typeof data.error === 'string' ? data.error : '';
        setServerMessage(/[Α-Ωα-ωΆ-Ώά-ώ]/.test(msg) ? msg : null);
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      setServerMessage(null);
      if (data.suggestions?.length) setSuggestions(data.suggestions);
      else throw new Error('No suggestions');
    } catch {
      // ═══════════════════════════════════════════════════════════════════════
      // ΤΙ ΕΦΥΓΕ ΑΠΟ ΕΔΩ, ΚΑΙ ΓΙΑΤΙ ΗΤΑΝ ΤΟ ΣΟΒΑΡΟΤΕΡΟ ΣΦΑΛΜΑ ΤΟΥ ΠΡΟΪΟΝΤΟΣ
      //
      // Υπήρχε «fallback αν δεν υπάρχει API key»: πέντε επινοημένες προτάσεις με
      // καρφωμένα ποσά — «Πληρωμή ΕΝΦΙΑ, 200 €, ετήσια υποχρέωση, συνήθως
      // Σεπτέμβριος», «Service κλιματιστικού 60 €», «Έλεγχος θέρμανσης 80 €».
      //
      // Τρία πράγματα το έκαναν χειρότερο από κάθε άλλο επινοημένο νούμερο:
      //   1. Εμφανιζόταν ΚΑΤΩ ΑΠΟ ΤΟ ΣΗΜΑ ΤΗΣ ΝΟΑ, δηλαδή με τη μεγαλύτερη
      //      αντιληπτή αυθεντία που έχει η οθόνη.
      //   2. Το κουμπί «Στο ημερολόγιο» το ΕΓΡΑΦΕ στο calendar_events.amount, από
      //      όπου τροφοδοτούσε το «Εκκρεμή ποσά». Σε έξι μήνες ο χρήστης δεν
      //      θυμάται ότι δεν το έγραψε ο ίδιος: ξένο νούμερο μεταμφιεσμένο σε δικό του.
      //   3. Το «συνήθως Σεπτέμβριος» ΑΝΤΙΦΑΣΚΕΙ με τη δική μας μηχανή
      //      (lib/tax/greekTaxCalendar.ts — πρώτη δόση τέλος Μαρτίου) και το
      //      πραγματικό `enfia` του ακινήτου αγνοούνταν εντελώς.
      //
      // Η θέση του προϊόντος είναι «είμαστε η ανεξάρτητη απόδειξη που ελέγχει το
      // προσυμπληρωμένο του κράτους». Αυτή δεν επιβιώνει σε εργαλείο που
      // προσυμπληρώνει με 200 € της φαντασίας του.
      //
      // Χωρίς απάντηση από τη μηχανή, δεν δείχνουμε προτάσεις. Λέμε γιατί.
      // ═══════════════════════════════════════════════════════════════════════
      setSuggestions([]);
      setFailed(true);
    }
    setLoadingSugg(false);
  }

  async function addSuggestion(s: Suggestion, idx: number) {
    setAddingId(idx);
    const today = new Date();
    // ΠΑΝΤΑ ΜΙΑ ΜΕΡΑ ΠΙΣΩ. Το `new Date(έτος, μήνας, 1)` φτιάχνει ΤΟΠΙΚΑ
    // μεσάνυχτα· το `toISOString()` γυρίζει UTC, που στην Ελλάδα είναι η
    // προηγούμενη μέρα. Δηλαδή η «1η του επόμενου μήνα» γινόταν η ΤΕΛΕΥΤΑΙΑ
    // του τρέχοντος και η πρόταση έμπαινε στο ημερολόγιο σε λάθος μήνα.
    const fallback = isoDate(new Date(today.getFullYear(), today.getMonth() + 1, 1));
    // ΟΛΕΣ ΟΙ ΠΡΟΤΑΣΕΙΣ ΕΠΑΙΡΝΑΝ ΤΗΝ ΙΔΙΑ ΜΕΡΑ.
    //
    // Η παραπάνω γραμμή ήταν η ΜΟΝΗ διαδρομή, χωρίς καμία διακλάδωση ανά είδος:
    // δόση ΕΝΦΙΑ, service λέβητα, λήξη μίσθωσης και ασφαλιστήριο γράφονταν όλα
    // την 1η του επόμενου μήνα. Πέντε προτάσεις, πέντε γεγονότα στην ίδια μέρα,
    // οι υπόλοιπες 364 άδειες και καμία από τις πέντε στη σωστή της θέση. Το
    // σχήμα που ζητούσε η συνάρτηση δεν είχε καν πεδίο ημερομηνίας.
    //
    // Τώρα η κάθε πρόταση φέρνει τη δική της. Ελέγχεται και η μορφή και το ότι
    // η μέρα υπάρχει: το «2027-02-31» περνά το μοτίβο και ρίχνει ολόκληρη την
    // εγγραφή. Η εφεδρική μένει, γιατί το `event_date` είναι NOT NULL και η
    // ανάπτυξη γίνεται σε δύο κομμάτια: πελάτης με παλιά ανεβασμένη συνάρτηση
    // δεν παίρνει πεδίο και το κουμπί πρέπει να δουλεύει.
    const wanted = typeof s.event_date === 'string' ? s.event_date.trim() : '';
    const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(wanted)
      && isoDate(new Date(`${wanted}T00:00:00`)) === wanted ? wanted : fallback;
    const interval = intervalOf(s);
    // ΤΟ ΕΠΙΝΟΗΜΕΝΟ ΠΟΣΟ ΕΠΑΨΕ ΝΑ ΓΡΑΦΕΤΑΙ ΩΣ ΒΕΒΑΙΟ.
    //
    // Γραφόταν στο `calendar_events.amount` — την ΙΔΙΑ στήλη με τα ποσά που
    // πληκτρολογεί ο χρήστης. Από εκεί το διάβαζαν πέντε σημεία του ημερολογίου
    // (κεφαλίδα μήνα «εκκρεμή», κελί ημέρας, κάρτα γεγονότος, ICS, CSV), όλα με
    // δύο δεκαδικά και χωρίς «~»: το «~450,00 €» της πρότασης γινόταν 450,00 €
    // μέσα στο άθροισμα του μήνα. Η λέξη «πρόταση» δεν εμφανιζόταν σε καμία από
    // αυτές τις οθόνες και σε έξι μήνες το ξένο ποσό δεν ξεχωρίζει από δικό του.
    //
    // Τώρα η στήλη μένει κενή και το ποσό μένει στις σημειώσεις, με την πηγή
    // του δίπλα. Το κόστος: όποιος θέλει το ποσό στο άθροισμα το γράφει ο ίδιος
    // από τη φόρμα επεξεργασίας. Αυτό είναι το ζητούμενο, όχι παρενέργεια.
    const amount = estimate(s.amount);
    // Ο λόγος έρχεται κι αυτός από το μοντέλο: μπορεί να λείπει ή να τελειώνει
    // με τελεία, οπότε η σημείωση διάβαζε «…σου.. Ενδεικτικό ποσό».
    const reason = typeof s.reason === 'string' ? s.reason.trim().replace(/\.+$/, '') : '';
    const origin = `Πρόταση από ${ASSISTANT_ACC}${reason ? `: ${reason}` : ''}`;
    const ok = await saved('Η πρόταση δεν μπήκε στο ημερολόγιο', calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'manual', {
      // Η ΠΡΟΤΑΣΗ ΕΡΧΕΤΑΙ ΑΠΟ ΤΟ ΔΙΚΤΥΟ, ΟΧΙ ΑΠΟ ΕΜΑΣ. Η κατηγορία και η
      // προτεραιότητα γράφονταν αυτούσιες: ό,τι κι αν επέστρεφε η συνάρτηση
      // κατέληγε στη βάση και το ημερολόγιο δεν ήξερε τι να το κάνει.
      title: s.title, category: calendar.canonicalCategory(s.category),
      event_date: eventDate, amount: null,
      priority: calendar.eventPriority(s.priority),
      recurring: interval != null, recurring_interval: interval,
      notes: amount == null ? origin
        : `${origin}. Ενδεικτικό ποσό ~${fe(amount)}, χωρίς πηγή στα δικά σου στοιχεία. Το γεγονός μένει χωρίς ποσό.`,
    })]));
    setAddingId(null);
    // Η πρόταση φεύγει από τη λίστα ΜΟΝΟ αν μπήκε κάπου αλλού. Αλλιώς χάνεται
    // και από τα δύο σημεία.
    if (ok) setDismissedIds(prev => new Set([...prev, idx]));
  }

  const dismiss = (idx: number) => setDismissedIds(prev => new Set([...prev, idx]));
  const visibleSuggestions = suggestions.filter((_, i) => !dismissedIds.has(i));

  // ═══ ΟΤΑΝ ΔΕΝ ΕΧΕΙ ΝΑ ΠΕΙ ΤΙΠΟΤΑ, ΔΕΝ ΠΙΑΝΕΙ ΚΑΡΤΑ ═══════════════════════
  // Η κάρτα αποδιδόταν πάντα: πλαίσιο, σκιά, σήμα, τίτλος, υπότιτλος, κουμπί,
  // και από κάτω κενή κατάσταση «Καμία πρόταση ακόμη» με δεύτερη προτροπή για
  // το ίδιο κουμπί. Διακόσια εικονοστοιχεία στο τέλος κάθε λίστας για να πει
  // ότι δεν έχει τίποτα να πει, με το ίδιο μήνυμα δύο φορές.
  //
  // Χωρίς προτάσεις μένει μία γραμμή, στο βάρος του κειμένου γύρω της. Η κάρτα
  // εμφανίζεται μόνο όταν υπάρχει περιεχόμενο ή σφάλμα να αναφερθεί.
  const hasSomethingToSay = visibleSuggestions.length > 0 || loadingSugg || failed;
  if (!hasSomethingToSay || collapsed) {
    return (
      /* ΣΤΟΙΧΙΣΜΕΝΗ ΜΕ ΤΗΝ ΥΠΟΛΟΙΠΗ ΟΘΟΝΗ, ΟΧΙ ΔΕΞΙΑ ΜΟΝΗ ΤΗΣ. Ο τίτλος της
         καρτέλας, τα φίλτρα, οι κάρτες και οι επικεφαλίδες ενοτήτων ξεκινούν
         όλα από την αριστερή άκρη. Αυτή η μία γραμμή ξεκινούσε από τη δεξιά,
         οπότε το μάτι έκανε ένα ταξίδι για μια πρόταση που δεν το άξιζε.
         Η ανοιχτή μορφή της ίδιας κάρτας ήταν ήδη αριστερά. */
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {/* Η συμπτυγμένη μορφή ΔΕΝ αποδίδει τον τίτλο «Νόα · Προτάσεις», οπότε ο
            υπότιτλος έμενε χωρίς υποκείμενο: «Διαβάζει τα δεδομένα σου» — ποιος;
            Εδώ μπαίνει η εκδοχή που κουβαλά το όνομα μαζί της. */}
        <span style={{ ...TT.caption }}>{suggestionsTeaser()}</span>
        <button onClick={() => { setCollapsed(false); generateSuggestions(); }} style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          color: 'var(--accent)', fontSize: 12, fontWeight: 600, fontFamily: T.font.sans,
        }}>{collapsed && visibleSuggestions.length > 0 ? `Δες τις προτάσεις (${visibleSuggestions.length})` : 'Δες τι έρχεται'}</button>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-raised)', borderRadius: T.radius.card, padding: 18, boxShadow: 'var(--highlight-inset), var(--elev-1)', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          {/* Το σήμα είναι το αρχικό του ονόματος: ίδιο με το πλωτό κουμπί, ώστε
              ο χρήστης να δει με μια ματιά ότι μιλάει στο ίδιο πρόσωπο. */}
          <div aria-hidden style={{ width: 32, height: 32, flexShrink: 0, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}><AssistantMark size={16} /></div>
          <div style={{ minWidth: 0 }}>
            <p style={{ ...TT.h2, fontSize: 13 }}>{suggestionsTitle()}</p>
            <p style={{ ...TT.caption, marginTop: 2 }}>{suggestionsSub()}</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <button onClick={generateSuggestions} disabled={loadingSugg} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          height: T.h.md, padding: '0 16px',
          background: 'transparent',
          border: `1px solid ${loadingSugg ? 'var(--border-subtle)' : 'var(--border-default)'}`,
          borderRadius: T.radius.pill,
          cursor: loadingSugg ? 'default' : 'pointer',
          color: loadingSugg ? 'var(--text-tertiary)' : 'var(--text-primary)',
          fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap',
          transition: 'background 0.15s, border-color 0.15s',
        }}
          onMouseEnter={e => { if (!loadingSugg) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--accent) 45%, transparent)'; } }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = loadingSugg ? 'var(--border-subtle)' : 'var(--border-default)'; }}>
          {loadingSugg ? 'Διαβάζει το ακίνητο…' : 'Δες τι έρχεται'}
        </button>
        {/* Η κάρτα κλείνει. Οι προτάσεις δεν χάνονται: η γραμμή που μένει τις
            ξαναφέρνει με το πλήθος τους, ώστε το κλείσιμο να μη μοιάζει διαγραφή. */}
        <button onClick={() => setCollapsed(true)} aria-label="Σύμπτυξη προτάσεων" title="Σύμπτυξη"
          style={{ width: T.h.md, height: T.h.md, borderRadius: T.radius.pill, border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-tertiary)'; }}>
          <X size={14} aria-hidden />
        </button>
        </div>
      </div>

      {/* Μία στήλη, χωρισμένη με γραμμές αντί για κάρτες: πέντε πλαίσια μέσα σε
          πλαίσιο διαβάζονται σαν θόρυβος, πέντε γραμμές σαν λίστα. */}
      {failed && (
        <p style={{ ...TT.bodySm, marginTop: 4 }}>
          {serverMessage ? serverMessage : <>
          Δεν κατάφερα να διαβάσω το ακίνητο αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο· δεν θα
          σου δείξω προτάσεις με νούμερα που δεν προέρχονται από τα δικά σου στοιχεία.
          </>}
        </p>
      )}

      {visibleSuggestions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {suggestions.map((s, idx) => {
            if (dismissedIds.has(idx)) return null;
            const label = catLabels[s.category] || s.category;
            const amt = estimate(s.amount);
            const isAdded = addingId === idx;
            const first = visibleSuggestions[0] === s;
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                padding: '14px 2px', borderTop: first ? 'none' : '1px solid var(--border-subtle)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: T.font.sans, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{s.title}</span>
                    {amt != null && <span style={{ fontFamily: T.font.num, fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: 'var(--text-secondary)' }}>~{fe(amt)}</span>}
                  </div>
                  <p style={{ ...TT.caption, marginTop: 3 }}>{s.reason}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ ...TT.label, fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
                    {s.recurring && (
                      <span style={{ ...TT.caption, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {/* Χωρίς αναγνωρίσιμη συχνότητα λέμε μόνο ότι επαναλαμβάνεται.
                            Το γεγονός γράφεται τότε χωρίς επανάληψη και η κάρτα δεν
                            επιτρέπεται να ονομάσει ρυθμό που δεν θα συμβεί. */}
                        <RotateCcw size={10} aria-hidden />{intervalLabels[s.recurring_interval || ''] || 'Επαναλαμβανόμενο'}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <button onClick={() => addSuggestion(s, idx)} disabled={isAdded} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    height: T.h.sm, padding: '0 13px',
                    background: 'transparent', border: `1px solid ${isAdded ? 'var(--border-subtle)' : 'var(--border-default)'}`,
                    borderRadius: T.radius.pill, cursor: isAdded ? 'default' : 'pointer',
                    color: isAdded ? 'var(--text-tertiary)' : 'var(--text-secondary)',
                    fontSize: 12, fontWeight: 600, fontFamily: T.font.sans, whiteSpace: 'nowrap',
                    transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                  }}
                    onMouseEnter={e => { if (!isAdded) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = isAdded ? 'var(--text-tertiary)' : 'var(--text-secondary)'; }}>
                    {isAdded ? <Check size={12} aria-hidden /> : <Plus size={12} aria-hidden />}
                    {isAdded ? 'Προστέθηκε' : 'Στο ημερολόγιο'}
                  </button>
                  <button onClick={() => dismiss(idx)} aria-label={`Απόρριψη: ${s.title}`} title="Απόρριψη"
                    style={{ width: T.h.sm, height: T.h.sm, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'var(--text-tertiary)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    <X size={13} aria-hidden />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {suggestions.length > 0 && visibleSuggestions.length === 0 && (
        <EmptyState icon={<CircleCheckBig size={20} />} title="Όλες οι προτάσεις διεκπεραιώθηκαν" hint="Ζήτα νέα ματιά όταν αλλάξουν δαπάνες, λογαριασμοί ή μίσθωση." />
      )}

    </div>
  );
}
