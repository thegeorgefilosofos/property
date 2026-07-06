import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Rate limiting: simple in-memory store (για production χρησιμοποίησε Redis)
// ΣΗΜ.: σε serverless/πολλαπλά instances αυτό είναι ανά-instance. Είναι φράγμα
// άμυνας σε βάθος· η οριστική λύση είναι κοινός μετρητής (Supabase RPC ή Redis).
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const dailyLimit = new Map<string, { count: number; day: number }>();
const MAX_REQUESTS_PER_MINUTE = 20;
const MAX_REQUESTS_PER_DAY = 400;   // ταβάνι ανά χρήστη/ημέρα (κατά της κατάχρησης κόστους)

// ── Όρια εισόδου (κόστος/DoS) ────────────────────────────────────────────────
// Το input δεν έχει max_tokens· ένας συνδεδεμένος χρήστης θα μπορούσε να στείλει
// τεράστια payloads (πολλές εικόνες / 100σέλιδο PDF) και να φουσκώσει τον λογαριασμό
// του ANTHROPIC_API_KEY. Βάζουμε σκληρό όριο μεγέθους σώματος και πλήθους μηνυμάτων,
// και ΔΕΝ προωθούμε αυθαίρετα πεδία — μόνο μια λίστα επιτρεπτών.
const MAX_BODY_BYTES = 12 * 1024 * 1024; // ~12MB: αρκετό για φωτογραφία/PDF λογαριασμού
const MAX_MESSAGES   = 40;
// Καθαρίζουμε παλιές εγγραφές ρυθμού ώστε το Map να μη μεγαλώνει ασταμάτητα.
function sweepRateLimit(now: number) {
  if (rateLimit.size < 5000) return;
  for (const [k, v] of rateLimit) if (now >= v.resetAt) rateLimit.delete(k);
}

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────
  // Έλεγχος πραγματικής συνεδρίας Supabase (μέσω cookies) — δουλεύει και σε dev
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
    // Content-Length μπορεί να λείπει/να είναι πλαστό — μετράμε τα πραγματικά bytes).
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
    if (body.messages.length > MAX_MESSAGES) {
      return NextResponse.json(
        { error: 'Πολύ μεγάλη συνομιλία.' },
        { status: 413 }
      );
    }
    const safeBody: Record<string, unknown> = {
      model:      ALLOWED.has(body.model) ? body.model : 'claude-sonnet-5', // ποτέ opus
      max_tokens: Math.min(Number(body.max_tokens) || 1000, 2000),
      messages:   body.messages,
    };
    if (typeof body.system === 'string')      safeBody.system = body.system;
    if (typeof body.temperature === 'number') safeBody.temperature = body.temperature;

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

// Only POST allowed
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}