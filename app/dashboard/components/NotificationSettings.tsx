'use client'

// ═══════════════════════════════════════════════════════════════════════════
// Ειδοποιήσεις — τι φτάνει στα εισερχόμενά σου, και πότε
// ─────────────────────────────────────────────────────────────────────────
// ΔΥΟ ΠΡΑΓΜΑΤΑ ΑΛΛΑΞΑΝ ΚΑΙ ΤΑ ΔΥΟ ΗΤΑΝ ΟΡΑΤΑ.
//
// ΠΡΩΤΟ, ΚΑΡΤΑ ΜΕΣΑ ΣΕ ΚΑΡΤΑ. Η ενότητα ζει ήδη μέσα σε `Card` με κεφαλίδα
// «Ειδοποιήσεις», και εδώ ξαναγραφόταν δεύτερο πλαίσιο με δικό του
// περίγραμμα, δικό του γέμισμα, εικονίδιο καμπάνας και τίτλο «Ειδοποιήσεις
// email». Δύο περιγράμματα σε απόσταση δεκαέξι εικονοστοιχείων, και ο ίδιος
// τίτλος δύο φορές. Έμεινε το εξωτερικό, που το βάζει ο γονέας.
//
// ΔΕΥΤΕΡΟ, ΚΟΥΜΠΙ ΑΠΟΘΗΚΕΥΣΗΣ ΣΕ ΣΕΛΙΔΑ ΠΟΥ ΑΠΟΘΗΚΕΥΕΙ ΜΟΝΗ ΤΗΣ. Το θέμα, ο
// ορίζοντας προθεσμιών, η προσβασιμότητα και τα δεδομένα κοινότητας
// αποθηκεύονταν με το που τα άγγιζες. Εδώ, επτά διακόπτες περίμεναν πάτημα —
// και όποιος είχε μάθει τη σελίδα έφευγε νομίζοντας ότι τους άλλαξε.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Send } from 'lucide-react'
import { T, TT, Btn, settingsField } from '@/components/Theme'
import { Toggle } from './UIComponents'
import { SetList, SetRow, SetGroup, SaveNote, useAutosave } from './SettingsKit'

interface NotifPrefs {
  email_enabled: boolean
  reminder_7days: boolean
  reminder_3days: boolean
  reminder_1day: boolean
  reminder_today: boolean
  reminder_overdue: boolean
  reminder_email: string
  dunning_enabled: boolean
  dunning_every_days: number
  dunning_max: number
  /** Αλλαγές νομοθεσίας που αφορούν τα ακίνητα του χρήστη. */
  legal_updates: boolean
}

// Η ΟΘΟΝΗ ΕΛΕΓΕ ΨΕΜΑΤΑ ΟΣΟ Η ΓΡΑΜΜΗ ΔΕΝ ΥΠΗΡΧΕ. Το `email_enabled` ήταν `false`
// εδώ, ενώ ο ΠΙΝΑΚΑΣ δηλώνει `DEFAULT true` (baseline.sql:2474). Ο χρήστης
// χωρίς γραμμή έβλεπε τον διακόπτη κλειστό και συμπέραινε ότι δεν λαμβάνει —
// σωστό συμπέρασμα για λάθος λόγο, αφού δεν λάμβανε επειδή ΔΕΝ ΥΠΗΡΧΕ ΓΡΑΜΜΗ.
// Τώρα η γραμμή γεννιέται με τον λογαριασμό (20260819140000) και η οθόνη
// δείχνει την προεπιλογή που όντως ισχύει.
const DEFAULT: NotifPrefs = {
  email_enabled: true,
  reminder_7days: true,
  reminder_3days: true,
  reminder_1day: true,
  reminder_today: true,
  reminder_overdue: true,
  reminder_email: '',
  dunning_enabled: true,
  dunning_every_days: 7,
  dunning_max: 3,
  // ΠΡΟΕΠΙΛΟΓΗ ΑΝΑΜΜΕΝΗ, ΚΑΙ ΕΙΝΑΙ ΑΠΟΦΑΣΗ. Οι υπόλοιποι διακόπτες αφορούν
  // υπενθυμίσεις για πράγματα που ο χρήστης έχει ήδη καταχωρήσει. Αυτός αφορά
  // αλλαγές που συμβαίνουν ΧΩΡΙΣ να το ξέρει και του κοστίζουν: από 1/1/2026 τα
  // ενοίκια κατοικίας πρέπει να εισπράττονται μέσω τραπέζης, αλλιώς χάνεται η
  // τεκμαρτή έκπτωση 5%. Κανείς δεν ψάχνει ρύθμιση για κάτι που αγνοεί ότι ισχύει.
  legal_updates: true,
}

export default function NotificationSettings({ userId }: { userId: string }) {
  const supabase = createClient()
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT)
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const persist = useCallback(async (next: NotifPrefs): Promise<boolean> => {
    const row = { ...next, user_id: userId, updated_at: new Date().toISOString() }
    let { error } = await supabase.from('notification_preferences').upsert(row, { onConflict: 'user_id' })
    // ΑΜΥΝΤΙΚΗ ΓΡΑΦΗ: η στήλη `legal_updates` προστίθεται με migration
    // (supabase/migrations/20260730092000_checklist_actuals.sql). Αν δεν έχει
    // τρέξει ακόμη στη βάση, ξαναδοκιμάζουμε ΧΩΡΙΣ αυτήν, ώστε ο χρήστης να μη
    // χάνει και τις επτά υπόλοιπες ρυθμίσεις του εξαιτίας μιας νέας.
    if (error && /legal_updates/i.test(error.message)) {
      const { legal_updates: _omit, ...rest } = row
      void _omit
      ;({ error } = await supabase.from('notification_preferences').upsert(rest, { onConflict: 'user_id' }))
    }
    return !error
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const { state: saveState, schedule } = useAutosave(persist)

  // ΤΟ ΚΕΝΟ ΠΕΔΙΟ ΓΕΜΙΖΕΙ ΜΕ ΤΗ ΔΙΕΥΘΥΝΣΗ ΤΟΥ ΛΟΓΑΡΙΑΣΜΟΥ, ΚΑΙ ΕΙΝΑΙ ΤΟ ΣΦΑΛΜΑ.
  // Οποιος άναβε μόνο τον διακόπτη «Υπενθυμίσεις με email» αποθήκευε γραμμή με
  // `reminder_email = ''`. Η reminder_recipients() (20260810070000:65-83) δεν
  // βρίσκει παραλήπτη για κενή διεύθυνση, οπότε η send-reminders δεν έστελνε
  // ποτέ τίποτα, χωρίς κανένα μήνυμα στην οθόνη. Η διεύθυνση του λογαριασμού
  // περνά το πρώτο σκέλος της συνάρτησης χωρίς δεύτερη επιβεβαίωση.
  // ΜΟΝΟ ΟΤΑΝ ΤΟ ΑΠΟΘΗΚΕΥΜΕΝΟ ΕΙΝΑΙ ΚΕΝΟ. Αποθηκευμένη διεύθυνση τρίτου μένει
  // ως έχει: αντικατάστασή της θα έσβηνε ρύθμιση του χρήστη και θα ακύρωνε την
  // επιβεβαίωση που ήδη είχε δώσει ο παραλήπτης.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data }, { data: auth }] = await Promise.all([
        supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle(),
        supabase.auth.getUser(),
      ])
      if (!alive) return
      const own = (auth?.user?.email || '').trim()
      setPrefs(p => {
        const next = { ...p, ...(data || {}) }
        const stored = String(next.reminder_email ?? '')
        return { ...next, reminder_email: stored.trim() ? stored : own }
      })
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  /**
   * Μία πόρτα για κάθε αλλαγή: ενημερώνει την οθόνη και βάζει την αποθήκευση σε
   * αναμονή. Η φόρτωση ΔΕΝ περνά από εδώ — αλλιώς η σελίδα θα έγραφε στη βάση
   * μόλις ανοίξει, χωρίς ο χρήστης να έχει αγγίξει τίποτα.
   */
  const update = (patch: Partial<NotifPrefs>) => {
    setPrefs(p => {
      const next = { ...p, ...patch }
      schedule(next)
      return next
    })
  }

  async function testEmail() {
    const email = prefs.reminder_email.trim()
    if (!email) { setTestMsg({ ok: false, text: 'Χωρίς διεύθυνση δεν υπάρχει πού να σταλεί.' }); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setTestMsg({ ok: false, text: 'Η μορφή του email δεν είναι σωστή.' }); return }
    setTesting(true); setTestMsg(null)
    // ΤΟ ΙΔΙΟ ΚΟΥΜΠΙ, ΔΥΟ ΕΙΛΙΚΡΙΝΑ ΝΟΗΜΑΤΑ. Αν η διεύθυνση είναι η δική σου,
    // φεύγει δοκιμαστικό. Αν είναι ΑΛΛΟΥ, φεύγει αίτημα επιβεβαίωσης — και οι
    // υπενθυμίσεις ξεκινούν μόνο αφού ο παραλήπτης πει «ναι». Δεν προσθέτουμε
    // δεύτερο κουμπί: η ενέργεια είναι μία, «στείλε το τώρα εκεί που έγραψα».
    let ok = false
    let confirm = false
    let sentTo = ''
    let reason = ''
    try {
      const { data, error } = await supabase.functions.invoke('send-test-notification', { body: { email } })
      if (error) {
        // Μη-2xx: διάβασε το σώμα της απόκρισης της function για τον πραγματικό λόγο.
        try { const body = await (error as { context?: Response }).context?.json?.(); reason = (body?.detail || body?.error || '') as string; } catch { /* ignore */ }
        console.error('Δοκιμαστικό email — σφάλμα function:', error, reason)
      } else {
        const res = data as { sent?: boolean; mode?: string; to?: string; error?: string; detail?: string } | null
        ok = !!res?.sent
        confirm = res?.mode === 'confirm'
        sentTo = res?.to || ''
        if (!ok) { reason = res?.detail || res?.error || ''; console.error('Δοκιμαστικό email — δεν στάλθηκε:', res) }
      }
    } catch (e) { console.error('Δοκιμαστικό email — εξαίρεση:', e) }
    setTesting(false)
    if (ok) {
      setTestMsg({ ok: true, text: confirm
        ? `Στάλθηκε αίτημα επιβεβαίωσης στο ${sentTo || email}. Οι υπενθυμίσεις θα ξεκινήσουν μόλις πατηθεί ο σύνδεσμος μέσα στο μήνυμα. Ο σύνδεσμος λήγει σε 48 ώρες.`
        : `Στάλθηκε δοκιμαστικό email στο ${sentTo || email}. Το βρίσκεις στα εισερχόμενά σου.` })
      return
    }
    // Σαφές, ειλικρινές μήνυμα ανάλογα με τον λόγο (χωρίς τεχνικό θόρυβο στον χρήστη).
    const low = reason.toLowerCase()
    const text = /testing emails|verify a domain|not allowed|403|only send/.test(low)
      ? 'Το email δεν στάλθηκε: ο πάροχος επιτρέπει αποστολή μόνο σε επαληθευμένη διεύθυνση ή τομέα ακόμη. Θα ενεργοποιηθεί με την επίσημη διεύθυνση αποστολής.'
      : 'Δεν στάλθηκε το δοκιμαστικό email. Δοκίμασε ξανά σε λίγο.'
    setTestMsg({ ok: false, text })
  }

  const numField = { ...settingsField, maxWidth: 120, fontVariantNumeric: 'tabular-nums' as const }

  return (
    <SetList>

      {/* Η διεύθυνση: πρώτη, γιατί χωρίς αυτήν κανένας από τους διακόπτες πιο
          κάτω δεν έχει πού να καταλήξει. */}
      <SetRow title="Διεύθυνση αποστολής"
        desc="Η δική σου διεύθυνση δουλεύει αμέσως. Σε οποιαδήποτε άλλη, η δοκιμή στέλνει αίτημα επιβεβαίωσης και οι υπενθυμίσεις ξεκινούν μόλις το εγκρίνει ο παραλήπτης.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input id="notif-email" className="po-field" style={{ ...settingsField, flex: 1, minWidth: 220 }} type="email"
            aria-label="Διεύθυνση αποστολής ειδοποιήσεων" placeholder="ονομα@email.com"
            value={prefs.reminder_email} onChange={e => update({ reminder_email: e.target.value })} />
          <Btn variant="secondary" onClick={testEmail} disabled={testing}><Send size={11} />{testing ? 'Αποστολή…' : 'Δοκιμή'}</Btn>
        </div>
        {testMsg && <div style={{ ...TT.bodySm, marginTop: 8, color: testMsg.ok ? 'var(--text-secondary)' : 'var(--negative)' }}>{testMsg.text}</div>}
      </SetRow>

      {/* Ο ΚΕΝΤΡΙΚΟΣ ΔΙΑΚΟΠΤΗΣ, ΚΑΙ ΟΛΑ ΟΣΑ ΚΡΕΜΟΝΤΑΙ ΑΠΟ ΑΥΤΟΝ.
          Η send-reminders διαβάζει προτιμήσεις με ΕΝΑ φίλτρο, `email_enabled =
          true` (supabase/functions/send-reminders/index.ts:192), και το ίδιο
          σύνολο τροφοδοτεί ΚΑΙ το pass για το ληξιπρόθεσμο ενοίκιο (γρ. 276).
          Ο διακόπτης του ενοικίου καθόταν έξω από εδώ, με προεπιλογή αναμμένη:
          με σβηστό το email έδειχνε αναμμένο κάτι που δεν έστελνε ποτέ τίποτα.
          Οσο δεν φεύγει email, δεν φαίνεται ρύθμιση email. */}
      <SetRow title="Υπενθυμίσεις με email" desc="Για τα γεγονότα του ημερολογίου σου και για το ληξιπρόθεσμο ενοίκιο."
        control={<Toggle on={prefs.email_enabled} onChange={v => update({ email_enabled: v })} size="sm" />}>
        {prefs.email_enabled && (
          <SetList>
            {/* ΤΟ ΔΙΧΤΥ, ΓΙΑ ΟΣΟΥΣ ΣΒΗΝΟΥΝ ΤΟ ΠΕΔΙΟ Η ΕΧΟΥΝ ΗΔΗ ΚΕΝΗ ΓΡΑΜΜΗ.
                Ο διακόπτης αναμμένος με κενή διεύθυνση δεν στέλνει τίποτα, και
                μέχρι σήμερα η σιωπή ήταν ολική: καμία ένδειξη σε καμία οθόνη. */}
            {!prefs.reminder_email.trim() && (
              <div style={{ ...TT.bodySm, color: 'var(--negative)' }}>
                Η διεύθυνση αποστολής είναι κενή. Καμία υπενθύμιση δεν θα σταλεί.
              </div>
            )}
            <SetGroup>Πόσο πριν</SetGroup>
            <SetRow title="Επτά ημέρες πριν" desc="Εβδομαδιαία προειδοποίηση."
              control={<Toggle on={prefs.reminder_7days} onChange={v => update({ reminder_7days: v })} size="sm" />} />
            <SetRow title="Τρεις ημέρες πριν" desc="Τριήμερη προειδοποίηση."
              control={<Toggle on={prefs.reminder_3days} onChange={v => update({ reminder_3days: v })} size="sm" />} />
            <SetRow title="Την προηγούμενη ημέρα" desc="Υπενθύμιση αύριο το πρωί."
              control={<Toggle on={prefs.reminder_1day} onChange={v => update({ reminder_1day: v })} size="sm" />} />
            <SetRow title="Την ίδια ημέρα" desc="Υπενθύμιση στις 08:00."
              control={<Toggle on={prefs.reminder_today} onChange={v => update({ reminder_today: v })} size="sm" />} />
            <SetRow title="Εκπρόθεσμα" desc="Ειδοποίηση για ληξιπρόθεσμες υποχρεώσεις."
              control={<Toggle on={prefs.reminder_overdue} onChange={v => update({ reminder_overdue: v })} size="sm" />} />

            <SetGroup>Ενοίκιο</SetGroup>
            {/* ΕΛΕΓΕ «ΔΙΑΚΡΙΤΙΚΗ ΕΝΗΜΕΡΩΣΗ» ΚΑΙ ΔΕΝ ΕΛΕΓΕ ΣΕ ΠΟΙΟΝ.
                Με κλιμάκωση («Δεύτερη υπενθύμιση», «Τελική υπόμνηση»), ρυθμό ανά
                7 ημέρες και όριο 3 ανά δόση, διαβαζόταν ως όχληση οφειλέτη. Και
                τα δύο περάσματα της send-reminders στέλνουν στο mailbox() του
                ιδιοκτήτη· το tenants.email δεν το διαβάζει κανένας αποστολέας. */}
            <SetRow title="Ληξιπρόθεσμο ενοίκιο" desc="Ενημέρωση στη δική σου διεύθυνση αποστολής όταν μια δόση καθυστερεί. Στον ενοικιαστή δεν στέλνει τίποτα η εφαρμογή."
              control={<Toggle on={prefs.dunning_enabled} onChange={v => update({ dunning_enabled: v })} size="sm" />}>
              {prefs.dunning_enabled && (
                <>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <div>
                    <label htmlFor="dunning-every" style={{ ...TT.bodySm, display: 'block', marginBottom: 6 }}>Ανά πόσες ημέρες</label>
                    <input id="dunning-every" className="po-field" type="number" min={1} max={30} style={numField} value={prefs.dunning_every_days}
                      onChange={e => update({ dunning_every_days: Math.max(1, Math.min(30, parseInt(e.target.value) || 7)) })} />
                    <div style={{ ...TT.caption, marginTop: 4 }}>Ελάχιστο διάστημα για την ίδια δόση.</div>
                  </div>
                  <div>
                    <label htmlFor="dunning-max" style={{ ...TT.bodySm, display: 'block', marginBottom: 6 }}>Μέγιστες ειδοποιήσεις</label>
                    <input id="dunning-max" className="po-field" type="number" min={1} max={12} style={numField} value={prefs.dunning_max}
                      onChange={e => update({ dunning_max: Math.max(1, Math.min(12, parseInt(e.target.value) || 3)) })} />
                    <div style={{ ...TT.caption, marginTop: 4 }}>Ανώτατος αριθμός ανά δόση.</div>
                  </div>
                </div>
                <div style={{ ...TT.caption, marginTop: 10 }}>
                  Την υπενθύμιση προς τον ενοικιαστή τη στέλνεις εσύ, από την
                  καρτέλα «Ενοικιαστής», με WhatsApp, Viber ή ηλεκτρονικό
                  ταχυδρομείο. Η εφαρμογή δεν γράφει ποτέ σε διεύθυνση
                  ενοικιαστή χωρίς τη δική του συγκατάθεση.
                </div>
                </>
              )}
            </SetRow>
          </SetList>
        )}
      </SetRow>

      {/* Η ΜΗΧΑΝΗ ΥΠΗΡΧΕ ΚΑΙ ΗΤΑΝ ΑΠΟΣΥΝΔΕΔΕΜΕΝΗ. Το lib/accounting/updates2026.ts
          κρατά τους ισχύοντες κανόνες με νομική βάση, ισχύ και επίσημη πηγή, και
          κανένας διακόπτης δεν τους αφορούσε: επτά διακόπτες για προθεσμίες
          ημερολογίου, κανένας για το ότι άλλαξε ο νόμος. */}
      <SetRow title="Αλλαγές νομοθεσίας"
        desc="Μόνο όσες αφορούν τα ακίνητά σου και ζητούν κίνηση, με τη νομική βάση και σύνδεσμο στην επίσημη πηγή. Εμφανίζονται και ως εκκρεμότητες στο ακίνητο που αφορούν."
        control={<Toggle on={prefs.legal_updates} onChange={v => update({ legal_updates: v })} size="sm" />} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: 18 }}>
        <SaveNote state={saveState} />
      </div>

    </SetList>
  )
}
