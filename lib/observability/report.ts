// ═══════════════════════════════════════════════════════════════════════════
// Env-gated error reporting — isomorphic (browser + Node server).
//
// Δωρεάν και χωρίς εξαρτήσεις: όταν υπάρχει ρυθμισμένο DSN του Sentry, στέλνει
// έναν ελάχιστο φάκελο με σκέτο fetch — κανένα @sentry/* SDK, μηδέν βάρος στο
// πακέτο. Χωρίς DSN δεν κάνει τίποτα πέρα από ένα console.error, οπότε η
// εφαρμογή τρέχει ΑΚΡΙΒΩΣ το ίδιο με ή χωρίς αυτό. Η δωρεάν βαθμίδα του Sentry
// αρκεί για αυτό το στάδιο· το μόνο που ανοίγει ο ιδιοκτήτης είναι το DSN.
//
// Ρυθμίζεται με NEXT_PUBLIC_SENTRY_DSN (πελάτης και διακομιστής) ή SENTRY_DSN (μόνο διακομιστής).
// PII discipline: `extra` is scrubbed of obvious sensitive keys before sending.
// ═══════════════════════════════════════════════════════════════════════════

type Extra = Record<string, unknown>

function getDsn(): string | undefined {
  if (typeof process === 'undefined' || !process.env) return undefined
  return process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || undefined
}

// DSN: https://<publicKey>@<host>/<projectId>
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

function eventId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '')
  } catch {
    let s = ''
    for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16)
    return s
  }
}

const PII_KEY = /(email|phone|iban|pin|token|password|afm|vat|address|full_?name|ssn)/i
function scrub(extra?: Extra): Extra | undefined {
  if (!extra) return undefined
  const out: Extra = {}
  for (const [k, v] of Object.entries(extra)) {
    out[k] = PII_KEY.test(k) ? '[redacted]' : typeof v === 'string' && v.length > 500 ? v.slice(0, 500) + '…' : v
  }
  return out
}

// Αναφέρει πιασμένο σφάλμα. Δεν πετάει ποτέ. Στέλνει και ξεχνά.
export function captureError(err: unknown, extra?: Extra): void {
  try {
    if (err) console.error('[captureError]', err, extra ?? '')
    const dsn = getDsn()
    if (!dsn) return
    const parsed = parseDsn(dsn)
    if (!parsed) return

    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : safeString(err))
    const id = eventId()
    const sentAt = new Date().toISOString()
    const event = {
      event_id: id,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      environment: (typeof process !== 'undefined' && process.env?.NODE_ENV) || 'production',
      // ΠΟΙΑ ΕΚΔΟΣΗ ΕΣΠΑΣΕ. Χωρίς αυτό, μια αναφορά λέει «κάτι χάλασε» και όχι
      // «το χάλασε αυτό το ανέβασμα»: η ίδια εξαίρεση από τρία διαφορετικά
      // builds συγκεντρώνεται σε ένα σωρό, και δεν φαίνεται ούτε πότε
      // εμφανίστηκε ούτε αν η διόρθωση δούλεψε. Το `NEXT_PUBLIC_BUILD_SHA` το
      // γράφει ήδη το next.config από το commit του Vercel.
      release: (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BUILD_SHA) || undefined,
      exception: { values: [{ type: e.name || 'Error', value: (e.message || '').slice(0, 1000) }] },
      extra: { ...scrub(extra), stack: (e.stack || '').slice(0, 4000) },
    }
    const envelope =
      JSON.stringify({ event_id: id, sent_at: sentAt }) + '\n' +
      JSON.stringify({ type: 'event' }) + '\n' +
      JSON.stringify(event) + '\n'

    void fetch(`${parsed.endpoint}?sentry_key=${parsed.key}&sentry_version=7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* the reporter must never break the caller */
  }
}

function safeString(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}
