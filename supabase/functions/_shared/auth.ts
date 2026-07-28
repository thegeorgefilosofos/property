// ═══════════════════════════════════════════════════════════════════════════
// Shared cron/service authorization for edge functions — one source of truth.
//
// Before this, every cron function inlined the same three-way check with plain
// `===` string comparison, which is timing-unsafe (an attacker can, in theory,
// recover a secret byte-by-byte from response-time differences) and drifted
// subtly between functions. This centralises it with a constant-time compare.
//
// The real protection is still the 122-bit secret itself; the constant-time
// compare is defense-in-depth and, more importantly, makes the authz identical
// and auditable across all functions.
// ═══════════════════════════════════════════════════════════════════════════

// Constant-time string equality. Runs over the longer of the two inputs and
// folds any length mismatch into the result, so it does not early-return on the
// first differing byte (which is what leaks timing).
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const ba = enc.encode(a ?? '')
  const bb = enc.encode(b ?? '')
  const len = Math.max(ba.length, bb.length)
  let diff = ba.length ^ bb.length
  for (let i = 0; i < len; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}

/**
 * The minimal shape of a Supabase client this module needs: we only ever call
 * `.from('cron_secrets').select().eq().maybeSingle()`.
 *
 * Exported so callers can annotate their own helpers with the SAME type instead
 * of re-declaring it. That matters: `ReturnType<typeof createClient>` does not
 * work here — with the `npm:` specifier `createClient` is a generic const arrow,
 * so `ReturnType<>` instantiates it with `unknown`/`never` and every call site
 * fails with TS2345. One structural type, declared once, used by everyone.
 */
// deno-lint-ignore no-explicit-any
export type MinimalSupabaseClient = { from: (table: string) => any }

interface CronAuthOpts {
  serviceKey?: string        // SUPABASE_SERVICE_ROLE_KEY — accepted as Bearer
  envSecret?: string         // per-function *_CRON_SECRET env (optional)
  supabase?: MinimalSupabaseClient
  dbSecretName?: string      // row name in public.cron_secrets (default 'email_cron')
}

// Authorize a cron/service request (zero-config): accepts (a) the service-role
// key as `Authorization: Bearer`, (b) the per-function env secret via
// `x-cron-secret`, or (c) the shared secret stored in public.cron_secrets — the
// zero-config path pg_cron uses. All comparisons are constant-time.
export async function authorizeCron(req: Request, opts: CronAuthOpts): Promise<boolean> {
  const { serviceKey = '', envSecret = '', supabase, dbSecretName = 'email_cron' } = opts
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (serviceKey && timingSafeEqual(bearer, serviceKey)) return true
  const header = req.headers.get('x-cron-secret') || ''
  if (envSecret && timingSafeEqual(header, envSecret)) return true
  if (supabase && header) {
    try {
      const { data } = await supabase.from('cron_secrets').select('secret').eq('name', dbSecretName).maybeSingle()
      const dbSecret = data?.secret || ''
      if (dbSecret && timingSafeEqual(header, dbSecret)) return true
    } catch { /* fall through to unauthorized */ }
  }
  return false
}
