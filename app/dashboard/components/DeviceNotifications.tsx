'use client'

// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΔΙΑΚΟΠΤΗΣ ΓΙΑ ΤΙΣ ΕΙΔΟΠΟΙΗΣΕΙΣ ΤΗΣ ΣΥΣΚΕΥΗΣ, ΚΑΙ ΟΧΙ ΔΥΟ
// ─────────────────────────────────────────────────────────────────────────
// ΤΟ ΣΦΑΛΜΑ ΠΟΥ ΠΑΡΑΛΙΓΟ ΝΑ ΓΡΑΦΤΕΙ. Το ημερολόγιο είχε ήδη δικό του «Ειδοποιήσεις
// στη συσκευή» μέσα στο μενού «⋯», που άναβε τις προειδοποιήσεις δέκα λεπτά πριν
// από κάθε ραντεβού όσο η εφαρμογή είναι ανοιχτή. Ενας δεύτερος διακόπτης εδώ,
// με το ίδιο όνομα και άλλο νόημα, θα σήμαινε ότι ο ιδιοκτήτης ανάβει τον έναν,
// βλέπει τον άλλον σβηστό και δεν ξέρει τι ακριβώς λαμβάνει.
//
// ΤΩΡΑ ΕΙΝΑΙ ΕΝΑΣ, ΚΑΙ ΖΕΙ ΕΔΩ. Ανάβει και τα δύο: την άδεια του περιηγητή με τη
// συνδρομή που φέρνει την πρωινή ειδοποίηση με την εφαρμογή ΚΛΕΙΣΤΗ και την
// τοπική προειδοποίηση του ημερολογίου όσο είναι ΑΝΟΙΧΤΗ. Το ημερολόγιο ακούει
// την αλλαγή και ενημερώνεται χωρίς ανανέωση σελίδας.
//
// ΟΤΑΝ Η ΣΥΣΚΕΥΗ ΔΕΝ ΜΠΟΡΕΙ, Ο ΔΙΑΚΟΠΤΗΣ ΔΕΝ ΥΠΑΡΧΕΙ. Ενας διακόπτης που
// αποτυγχάνει πάντα είναι χειρότερος από απουσία λειτουργίας: υπόσχεται.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TT } from '@/components/Theme'
import { Toggle } from './UIComponents'
import { SetRow } from './SettingsKit'
import * as devices from '@/lib/data/pushSubscriptions'
import { readSubscription, type RawSubscription } from '@/lib/push/subscription'
import {
  pushSupported, pushConfigured, subscribeDevice, unsubscribeDevice,
  currentSubscription, setDeviceNotify,
} from '@/lib/push/client'

/** Τι λέει η οθόνη όταν η απόπειρα δεν πέτυχε. Κάθε λόγος, η δική του κίνηση. */
const REASONS: Record<string, string> = {
  denied: 'Ο περιηγητής δεν έδωσε άδεια. Δίνεται από τις ρυθμίσεις του για αυτή τη σελίδα.',
  failed: 'Η εγγραφή δεν ολοκληρώθηκε. Σε iPhone χρειάζεται πρώτα προσθήκη στην αρχική οθόνη.',
  unsupported: 'Αυτός ο περιηγητής δεν στέλνει ειδοποιήσεις με την εφαρμογή κλειστή.',
  unconfigured: 'Οι ειδοποιήσεις συσκευής δεν είναι ρυθμισμένες σε αυτή την εγκατάσταση.',
  stored: 'Η συνδρομή δεν αποθηκεύτηκε. Δοκίμασε ξανά σε λίγο.',
}

export default function DeviceNotifications({ userId }: { userId: string }) {
  const supabase = createClient()
  const [available, setAvailable] = useState(false)
  const [on, setOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  // ΤΟ ΑΛΗΘΙΝΟ ΑΝΑΜΜΕΝΟ ΘΕΛΕΙ ΚΑΙ ΤΑ ΔΥΟ: συνδρομή στον περιηγητή ΚΑΙ γραμμή στη
  // βάση. Με μόνο το πρώτο, ο διακομιστής δεν ξέρει πού να στείλει· με μόνο το
  // δεύτερο, στέλνει σε διεύθυνση που ο περιηγητής έχει ήδη ακυρώσει.
  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!pushSupported() || !pushConfigured()) return
      if (alive) setAvailable(true)
      const sub = await currentSubscription()
      if (!alive) return
      if (!sub) { setOn(false); return }
      const known = await devices.has(supabase, userId, sub.endpoint)
      if (alive) setOn(known)
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  if (!available) return null

  async function turnOn() {
    setBusy(true); setNote('')
    const outcome = await subscribeDevice()
    if (!outcome.ok) { setBusy(false); setNote(REASONS[outcome.reason]); return }
    const checked = readSubscription(outcome.subscription.toJSON() as RawSubscription)
    if (!checked) { setBusy(false); setNote(REASONS.failed); return }
    const { error } = await devices.save(supabase, userId, checked, navigator.userAgent)
    setBusy(false)
    if (error) { setNote(REASONS.stored); return }
    setDeviceNotify(true)
    setOn(true)
  }

  async function turnOff() {
    setBusy(true); setNote('')
    const endpoint = await unsubscribeDevice()
    if (endpoint) await devices.remove(supabase, endpoint)
    setDeviceNotify(false)
    setOn(false)
    setBusy(false)
  }

  return (
    <SetRow
      title="Ειδοποιήσεις στη συσκευή"
      desc="Μία ειδοποίηση το πρωί, μόνο όταν κάτι λήγει σήμερα ή αύριο, ακόμη και με την εφαρμογή κλειστή. Οσο είναι ανοιχτή, προειδοποιεί και δέκα λεπτά πριν από κάθε ραντεβού."
      control={<Toggle on={on} onChange={v => { if (!busy) void (v ? turnOn() : turnOff()) }} size="sm" />}>
      {note && <div style={{ ...TT.bodySm, color: 'var(--negative)' }}>{note}</div>}
    </SetRow>
  )
}
