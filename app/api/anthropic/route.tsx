import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  MAX_PER_MINUTE, PLAN_RANK_ORDER,
  dailyLimitsByRank, monthlyLimitsByRank, FREE_POOL_PER_MONTH, TRIAL_LIMITS,
  dailyExhaustedMessage, monthlyExhaustedMessage, poolExhaustedMessage,
} from '@/lib/billing/aiLimits';

// Rate limiting: simple in-memory store (για production χρησιμοποίησε Redis)
// ΣΗΜ.: σε serverless/πολλαπλά instances αυτό είναι ανά-instance. Είναι φράγμα
// άμυνας σε βάθος· η οριστική λύση είναι κοινός μετρητής (Supabase RPC ή Redis).
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const dailyLimit = new Map<string, { count: number; day: number }>();
const MAX_REQUESTS_PER_MINUTE = MAX_PER_MINUTE;

// Το in-memory ημερήσιο φράγμα ΔΕΝ ξέρει το πλάνο του χρήστη (θα χρειαζόταν
// ερώτημα στη βάση πριν καν το φράγμα). Κρατά λοιπόν το ΜΕΓΑΛΥΤΕΡΟ όριο όλων
// των πλάνων: κόβει την προφανή κατάχρηση χωρίς ποτέ να κόψει άδικα συνδρομητή.
// Το πραγματικό, ανά-πλάνο όριο το επιβάλλει η bump_ai_usage παρακάτω, που
// είναι και η μόνη αυθεντική πηγή (ατομική, διαμοιραζόμενη, race-free).
const MAX_REQUESTS_PER_DAY = Math.max(...dailyLimitsByRank());

// ── Όρια εισόδου (κόστος/DoS) ────────────────────────────────────────────────
// Το input δεν έχει max_tokens· ένας συνδεδεμένος χρήστης θα μπορούσε να στείλει
// τεράστια payloads (πολλές εικόνες / 100σέλιδο PDF) και να φουσκώσει τον λογαριασμό
// του ANTHROPIC_API_KEY. Βάζουμε σκληρό όριο μεγέθους σώματος και πλήθους μηνυμάτων,
// και ΔΕΝ προωθούμε αυθαίρετα πεδία, μόνο μια λίστα επιτρεπτών.
const MAX_BODY_BYTES = 12 * 1024 * 1024; // ~12MB: αρκετό για φωτογραφία/PDF λογαριασμού
const MAX_MESSAGES   = 40;
// Καθαρίζουμε παλιές εγγραφές ρυθμού ώστε το Map να μη μεγαλώνει ασταμάτητα.
function sweepRateLimit(now: number) {
  if (rateLimit.size < 5000) return;
  for (const [k, v] of rateLimit) if (now >= v.resetAt) rateLimit.delete(k);
}

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────
  // Έλεγχος πραγματικής συνεδρίας Supabase (μέσω cookies), δουλεύει και σε dev
  // και σε production, χωρίς να χρειάζεται ο client να στέλνει header.
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Απαιτείται σύνδεση.' }, { status: 401 });
  }

  // ── Rate limiting (ανά χρήστη) ───────────────────────────────
  const ip = user.id;
  const now = Date.now();
  sweepRateLimit(now);
  const rl  = rateLimit.get(ip);
  if (rl && now < rl.resetAt) {
    if (rl.count >= MAX_REQUESTS_PER_MINUTE) {
      return NextResponse.json(
        { error: 'Πολλές αιτήσεις. Δοκίμασε σε 1 λεπτό.' },
        { status: 429 }
      );
    }
    rl.count++;
  } else {
    rateLimit.set(ip, { count: 1, resetAt: now + 60_000 });
  }

  // ── Ημερήσιο ταβάνι ανά χρήστη (κατά της κατάχρησης κόστους) ──
  const today = Math.floor(now / 86_400_000);
  const dl = dailyLimit.get(ip);
  if (dl && dl.day === today) {
    if (dl.count >= MAX_REQUESTS_PER_DAY) {
      return NextResponse.json(
        { error: 'Έφτασες το ημερήσιο όριο αιτήσεων AI. Δοκίμασε ξανά αύριο.' },
        { status: 429 }
      );
    }
    dl.count++;
  } else {
    dailyLimit.set(ip, { count: 1, day: today });
  }

  // ── Durable, cross-instance cap (authoritative) ──────────────
  // Οι χάρτες στη μνήμη από πάνω ζουν ΑΝΑ ΣΤΙΓΜΙΟΤΥΠΟ: σε serverless, κάθε νέα
  // εκτέλεση ξεκινά με άδειους. Ο ατομικός μετρητής στο Supabase είναι το
  // πραγματικό φράγμα — αυτό που δεν παρακάμπτεται χτυπώντας άλλο στιγμιότυπο.
  // Ανοίγει μόνο αν σφάλει η ΙΔΙΑ η κλήση (ο φρουρός της μνήμης μένει σε ισχύ).
  //
  // Τα όρια περνούν ως πίνακες [δωρεάν, ιδιοκτήτης, επαγγελματίας]. Η ΑΝΑΓΝΩΡΙΣΗ
  // του πλάνου γίνεται μέσα στη βάση (public.user_plan_rank), ώστε να μη χρειάζεται
  // δεύτερο ερώτημα εδώ και να μην μπορεί να δηλωθεί πλάνο από τον client.
  try {
    const { data: usage } = await supabase.rpc('bump_ai_usage', {
      p_max_min: MAX_REQUESTS_PER_MINUTE,
      p_day:     dailyLimitsByRank(),
      p_month:   monthlyLimitsByRank(),
      p_pool:    FREE_POOL_PER_MONTH,
      // ΤΟ ΠΑΚΕΤΟ ΤΗΣ ΔΟΚΙΜΗΣ. Χωρίς αυτό, κάθε ανυψωμένο αλλά μη πληρωμένο
      // επίπεδο (δοκιμή, δωρεάν μήνες, Συνεργάτης) έπαιρνε τα όρια του πακέτου
      // στο οποίο ανυψώθηκε — δυόμισι φορές περισσότερα από όσα δικαιούται ο
      // συνδρομητής που πληρώνει το φθηνότερο.
      p_trial_day:   TRIAL_LIMITS.perDay,
      p_trial_month: TRIAL_LIMITS.perMonth,
    });
    const u = usage as { allowed?: boolean; reason?: string; rank?: number } | null;
    if (u && u.allowed === false) {
      // Το μήνυμα λέει το ΠΡΑΓΜΑΤΙΚΟ νούμερο του πλάνου του χρήστη. Ένα γενικό
      // «έφτασες το όριο» αφήνει τον χρήστη να μαντεύει πόσο είναι το όριο και
      // πότε επιστρέφει — και αυτό είναι που τον κάνει να νομίζει ότι χάλασε κάτι.
      const plan = PLAN_RANK_ORDER[u.rank ?? 0] ?? 'free';
      const error =
        u.reason === 'pool'   ? poolExhaustedMessage()
        : u.reason === 'month' ? monthlyExhaustedMessage(plan)
        : u.reason === 'day'   ? dailyExhaustedMessage(plan)
        : 'Πολλές ερωτήσεις μαζί. Δοκίμασε ξανά σε ένα λεπτό.';
      return NextResponse.json({ error, reason: u.reason, plan }, { status: 429 });
    }
  } catch { /* RPC unavailable — rely on the in-memory guard above */ }

  // ── Anthropic API call ───────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY δεν έχει οριστεί στο .env.local' },
      { status: 500 }
    );
  }

  try {
    // Διαβάζουμε πρώτα ως κείμενο για να επιβάλουμε σκληρό όριο μεγέθους (το
    // Content-Length μπορεί να λείπει/να είναι πλαστό, μετράμε τα πραγματικά bytes).
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { error: 'Το αρχείο είναι πολύ μεγάλο. Δοκίμασε μικρότερη φωτογραφία ή PDF.' },
        { status: 413 }
      );
    }
    const body = JSON.parse(raw);

    // Ασφάλεια: κλείδωμα μοντέλου + max_tokens. Το 'claude-sonnet-4-6' ΗΤΑΝ ΑΚΥΡΟ
    // (κάθε κλήση απέτυχε). Σωστό ID: claude-sonnet-5 (ικανό για vision/PDF).
    const ALLOWED = new Set(['claude-sonnet-5', 'claude-haiku-4-5-20251001']);

    // Δεν προωθούμε ΟΛΟ το body του client (θα ήταν γενικός proxy Claude με χρέωση
    // δική μας). Δεχόμαστε μόνο μια λίστα επιτρεπτών πεδίων και ελέγχουμε τα μηνύματα.
    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: 'Λείπουν μηνύματα.' }, { status: 400 });
    }
    // ΚΟΒΟΥΜΕ, ΔΕΝ ΑΠΟΡΡΙΠΤΟΥΜΕ. Πριν, στο 40ό μήνυμα (≈20ή ερώτηση) ο χρήστης
    // έπαιρνε 413 «Πολύ μεγάλη συνομιλία» και η συνεδρία ΣΠΑΓΕ: κάθε επόμενη
    // ερώτηση απέτυχε, χωρίς τρόπο ανάκαμψης πέρα από ανανέωση σελίδας. Ο σκοπός
    // του ορίου είναι να φράξει το κόστος, όχι να τιμωρήσει όποιον μιλά πολύ.
    //
    // Κρατάμε τα ΤΕΛΕΥΤΑΙΑ μηνύματα (η πρόσφατη συνομιλία είναι που μετράει) και
    // φροντίζουμε να ξεκινά από 'user': το Anthropic API απορρίπτει ιστορικό που
    // αρχίζει με 'assistant'.
    if (body.messages.length > MAX_MESSAGES) {
      let trimmed = body.messages.slice(-MAX_MESSAGES);
      while (trimmed.length && trimmed[0]?.role !== 'user') trimmed = trimmed.slice(1);
      body.messages = trimmed.length ? trimmed : body.messages.slice(-1);
    }
    const safeBody: Record<string, unknown> = {
      model:      ALLOWED.has(body.model) ? body.model : 'claude-sonnet-5', // ποτέ opus
      max_tokens: Math.min(Number(body.max_tokens) || 1000, 2000),
      messages:   body.messages,
    };
    // ── PROMPT CACHING: η μεγαλύτερη μείωση κόστους που υπάρχει εδώ ──────────
    // Το system prompt είναι 72.598 χαρακτήρες (~33.000 tokens) και προσαρτάται
    // αυτούσιο σε ΚΑΘΕ μήνυμα. Το caching είναι αντιστοίχιση ΠΡΟΘΕΜΑΤΟΣ και
    // κοστίζει write 1,25× · read 0,10×.
    //
    // Ο βοηθός στέλνει πλέον ΔΥΟ μπλοκ (assistantPersona.buildSystemBlocks):
    // πρώτα το σταθερό (γνώση, κανόνες, πλάνα — ίδιο για κάθε χρήστη, το 97,5%
    // του κειμένου) και μετά το προσωπικό. Έτσι η cache είναι ΚΟΙΝΗ για όλους
    // τους χρήστες του ίδιου κλειδιού. Το κόστος πέφτει από ~0,130 $ σε
    // ~0,052 $ ανά ερώτηση, χωρίς να αλλάξει λέξη στο prompt.
    //
    // Το TTL των 5 λεπτών ανανεώνεται ΔΩΡΕΑΝ σε κάθε hit, άρα η κίνηση κρατά
    // την cache ζεστή χωρίς δεύτερη χρέωση write. Γι' αυτό δεν χρησιμοποιούμε
    // το 1ωρο TTL, που κοστίζει 2× αντί 1,25×.
    //
    // ΤΟ `cache_control` ΤΟ ΒΑΖΕΙ Ο SERVER, ΠΟΤΕ Ο CLIENT: κάθε breakpoint είναι
    // χρεώσιμη εγγραφή, οπότε αν το εμπιστευόμασταν στον client, ένας χρήστης θα
    // μπορούσε να ζητήσει τέσσερα breakpoints σε κάθε αίτημα και να πολλαπλασιάσει
    // τον λογαριασμό. Το καθαρίζουμε και το βάζουμε μόνοι μας, στο πρώτο μπλοκ.
    const asBlock = (b: unknown) =>
      b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string'
        ? { type: 'text' as const, text: (b as { text: string }).text }
        : null;
    if (typeof body.system === 'string' && body.system.length > 0) {
      safeBody.system = [{ type: 'text', text: body.system, cache_control: { type: 'ephemeral' } }];
    } else if (Array.isArray(body.system)) {
      const blocks = body.system.map(asBlock).filter(Boolean) as { type: 'text'; text: string }[];
      if (blocks.length) {
        safeBody.system = blocks.map((b, i) =>
          i === 0 ? { ...b, cache_control: { type: 'ephemeral' } } : b);
      }
    }
    // ΣΚΟΠΙΜΑ ΔΕΝ ΠΡΟΩΘΕΙΤΑΙ το `temperature`. Το Claude Sonnet 5 απορρίπτει με 400
    // κάθε μη-προεπιλεγμένη τιμή σε temperature/top_p/top_k. Κανένας από τους
    // caller δεν το στέλνει σήμερα, οπότε η γραμμή ήταν νάρκη: θα έσπαγε αθόρυβα
    // την πρώτη φορά που κάποιος θα το πρόσθετε, με σφάλμα που δεν παραπέμπει
    // πουθενά. Αν χρειαστεί ποτέ έλεγχος δημιουργικότητας, γίνεται στο prompt.

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safeBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Anthropic API error:', data);
      return NextResponse.json(
        { error: data.error?.message ?? 'Σφάλμα Anthropic API' },
        { status: response.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('Route error:', err);
    return NextResponse.json({ error: 'Εσωτερικό σφάλμα' }, { status: 500 });
  }
}

// Μόνο POST· κάθε άλλη μέθοδος απαντά 405.
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}