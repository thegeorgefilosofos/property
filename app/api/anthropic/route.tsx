import { NextRequest, NextResponse } from 'next/server';

// Rate limiting: simple in-memory store (για production χρησιμοποίησε Redis)
const rateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_REQUESTS_PER_MINUTE = 20;

export async function POST(req: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────
  // Βεβαιώνεται ότι μόνο authenticated users καλούν το API
  const authHeader = req.headers.get('authorization');
  if (!authHeader && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Rate limiting ────────────────────────────────────────────
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const now = Date.now();
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

  // ── Anthropic API call ───────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY δεν έχει οριστεί στο .env.local' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();

    // Security: enforce model + max_tokens limits
    const safeBody = {
      ...body,
      model:      'claude-sonnet-4-6', // πάντα sonnet, όχι opus
      max_tokens: Math.min(body.max_tokens ?? 1000, 2000), // max 2000
    };

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