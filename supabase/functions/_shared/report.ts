// ═══════════════════════════════════════════════════════════════════════════
// Env-gated error reporting for edge functions (Deno) — mirror of
// lib/observability/report.ts. Posts a minimal Sentry envelope over fetch when
// SENTRY_DSN is set; otherwise a pure no-op beyond console.error. Free, no SDK.
// ═══════════════════════════════════════════════════════════════════════════

type Extra = Record<string, unknown>

function parseDsn(d: string): { endpoint: string; key: string } | null {
  try {
    const u = new URL(d)
    const projectId = u.pathname.replace(/^\/+/, '')
    if (!projectId || !u.username) return null
    return { endpoint: `${u.protocol}//${u.host}/api/${projectId}/envelope/`, key: u.username }
  } catch {
    return null
  }
}

const PII_KEY = /(email|phone|iban|pin|token|password|afm|vat|address|full_?name)/i
function scrub(extra?: Extra): Extra | undefined {
  if (!extra) return undefined
  const out: Extra = {}
  for (const [k, v] of Object.entries(extra)) out[k] = PII_KEY.test(k) ? '[redacted]' : v
  return out
}

// Report a caught edge error. Never throws. `fn` is the function name for tagging.
export function reportEdgeError(fn: string, err: unknown, extra?: Extra): void {
  try {
    console.error(`[${fn}]`, err, extra ?? '')
    const dsn = Deno.env.get('SENTRY_DSN') || ''
    if (!dsn) return
    const parsed = parseDsn(dsn)
    if (!parsed) return
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : String(err))
    const id = crypto.randomUUID().replace(/-/g, '')
    const event = {
      event_id: id,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      server_name: fn,
      tags: { fn },
      environment: Deno.env.get('SENTRY_ENV') || 'production',
      exception: { values: [{ type: e.name || 'Error', value: (e.message || '').slice(0, 1000) }] },
      extra: { ...scrub(extra), stack: (e.stack || '').slice(0, 4000) },
    }
    const envelope =
      JSON.stringify({ event_id: id, sent_at: new Date().toISOString() }) + '\n' +
      JSON.stringify({ type: 'event' }) + '\n' +
      JSON.stringify(event) + '\n'
    void fetch(`${parsed.endpoint}?sentry_key=${parsed.key}&sentry_version=7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* never break the caller */
  }
}
