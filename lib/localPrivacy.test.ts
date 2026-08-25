// Τεστ για τον καθαρισμό προσωπικών δεδομένων από τη συσκευή.
//
// Δύο πράγματα ελέγχονται και τα δύο έχουν σημασία: ότι ΣΒΗΝΕΤΑΙ ό,τι περιέχει
// προσωπικά δεδομένα τρίτων (η προηγούμενη υλοποίηση άφηνε πίσω τα ΑΦΜ των
// συνιδιοκτητών) και ότι ΔΕΝ σβήνεται ό,τι είναι απλή προτίμηση — ο
// καθαρισμός στην αποσύνδεση δεν είναι τιμωρία.

import { clearLocalPersonalData, PERSONAL_KEY_PREFIXES } from './localPrivacy'

let passed = 0, failed = 0
function ok(name: string, cond: boolean) { if (cond) { passed++ } else { failed++; console.log('  ✗ ' + name) } }

/** Ελάχιστο localStorage με τη σωστή σημασιολογία key(i) κατά τη διάσχιση. */
function fakeStorage(init: Record<string, string> = {}) {
  const map = new Map(Object.entries(init))
  return {
    get length() { return map.size },
    key(i: number) { return Array.from(map.keys())[i] ?? null },
    removeItem(k: string) { map.delete(k) },
    has: (k: string) => map.has(k),
    keys: () => Array.from(map.keys()),
  }
}

const SAMPLE = {
  'pa_hist_prop-1': '[{"role":"user","text":"Ο Νίκος Παπαδόπουλος χρωστάει 650 €"}]',
  'pa_hist_prop-2': '[]',
  'po_owner_split_prop-1': '{"rows":[{"name":"Μαρία Ιωάννου","afm":"094097524","pct":50}]}',
  'pa_mem_user-abc': '[{"text":"προτιμά ηλεκτρονικές πληρωμές"}]',
  'pos_mode': 'dark',
  'po_pwa_visits': '3',
  'po_reduce_motion': '1',
}

// ── Σβήνει ό,τι έχει προσωπικά δεδομένα ────────────────────────────────────
{
  const st = fakeStorage(SAMPLE)
  const n = clearLocalPersonalData(st)
  ok('επιστρέφει το πλήθος όσων σβήστηκαν', n === 3)
  ok('σβήνει τις συνομιλίες (1)', !st.has('pa_hist_prop-1'))
  ok('σβήνει τις συνομιλίες (2)', !st.has('pa_hist_prop-2'))
  ok('σβήνει την κατανομή συνιδιοκτητών με τα ΑΦΜ', !st.has('po_owner_split_prop-1'))
}

// ── ΔΕΝ σβήνει προτιμήσεις ούτε τις ρητές «αναμνήσεις» ─────────────────────
{
  const st = fakeStorage(SAMPLE)
  clearLocalPersonalData(st)
  ok('κρατά το θέμα', st.has('pos_mode'))
  ok('κρατά τις προτιμήσεις προσβασιμότητας', st.has('po_reduce_motion'))
  ok('κρατά τον μετρητή επισκέψεων PWA', st.has('po_pwa_visits'))
  ok('κρατά τις «αναμνήσεις» του βοηθού (ρητή επιλογή χρήστη)', st.has('pa_mem_user-abc'))
}

// ── Η διάσχιση δεν προσπερνά κλειδιά όταν σβήνονται πολλά ──────────────────
{
  // Αν η υλοποίηση έσβηνε ΚΑΤΑ τη διάσχιση, οι δείκτες θα μετακινούνταν και θα
  // επιβίωναν τα μισά. Δέκα διαδοχικά κλειδιά το κάνουν ορατό.
  const many: Record<string, string> = {}
  for (let i = 0; i < 10; i++) many[`pa_hist_p${i}`] = 'x'
  const st = fakeStorage(many)
  const n = clearLocalPersonalData(st)
  ok('σβήνει ΟΛΑ τα 10, χωρίς να προσπεράσει', n === 10 && st.keys().length === 0)
}

// ── Ακραίες περιπτώσεις ────────────────────────────────────────────────────
{
  ok('κενό storage → 0', clearLocalPersonalData(fakeStorage({})) === 0)
  ok('χωρίς προσωπικά → 0', clearLocalPersonalData(fakeStorage({ pos_mode: 'dark' })) === 0)

  // Κλειδωμένο storage (private mode): δεν πετά, επιστρέφει 0.
  const hostile = {
    get length(): number { throw new Error('SecurityError') },
    key() { return null },
    removeItem() { /* ignore */ },
  }
  let threw = false
  let r = -1
  try { r = clearLocalPersonalData(hostile) } catch { threw = true }
  ok('κλειδωμένο storage δεν πετά εξαίρεση', !threw)
  ok('κλειδωμένο storage → 0', r === 0)
}

// ── Ο κατάλογος προθεμάτων είναι ουσιαστικός ───────────────────────────────
ok('καλύπτει τις συνομιλίες', PERSONAL_KEY_PREFIXES.includes('pa_hist_'))
ok('καλύπτει την κατανομή συνιδιοκτητών', PERSONAL_KEY_PREFIXES.includes('po_owner_split_'))
ok('δεν καλύπτει τις αναμνήσεις', !(PERSONAL_KEY_PREFIXES as readonly string[]).includes('pa_mem_'))

console.log(`localPrivacy.test.ts: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
