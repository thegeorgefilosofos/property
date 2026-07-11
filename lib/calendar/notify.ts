// Καθαρή λογική για ειδοποιήσεις συσκευής (device notifications) του ημερολογίου.
// Δεν αγγίζει το DOM ή το Notification API — μόνο «ποιο γεγονός πρέπει να ειδοποιήσει
// τώρα». Έτσι δοκιμάζεται ντετερμινιστικά και το UI απλώς την εκτελεί.

export interface NotifiableEvent {
  id: string
  title: string
  event_date: string          // YYYY-MM-DD
  event_time?: string | null  // HH:MM (κενό = ολοήμερο)
  status?: string             // «pending» ειδοποιεί· «paid»/«cancelled» όχι
}

// Λεπτά από τα μεσάνυχτα για ένα «HH:MM» (ανθεκτικό σε κενά/άκυρα → null).
export function minutesOfDay(time?: string | null): number | null {
  if (!time) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = +m[1], mm = +m[2]
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

// Τοπική ημερομηνία «YYYY-MM-DD» για ένα Date (όχι UTC — ο χρήστης ζει σε τοπική ώρα).
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Επιστρέφει τα γεγονότα που πρέπει να ειδοποιήσουν «τώρα»: εκκρεμή, με ώρα, της
// σημερινής ημέρας, που ξεκινούν εντός [now, now+leadMinutes] και δεν έχουν ήδη
// ειδοποιηθεί (alreadyNotified). Το lead window αφήνει προειδοποίηση π.χ. 10' πριν.
export function dueReminders(
  events: NotifiableEvent[],
  now: Date,
  leadMinutes = 10,
  alreadyNotified: Set<string> = new Set(),
): NotifiableEvent[] {
  const today = localDateStr(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const out: NotifiableEvent[] = []
  for (const e of events) {
    if (!e || e.event_date !== today) continue
    if (e.status && e.status !== 'pending') continue
    if (alreadyNotified.has(e.id)) continue
    const t = minutesOfDay(e.event_time)
    if (t === null) continue                       // ολοήμερα δεν χτυπούν «ώρα»
    if (t >= nowMin && t <= nowMin + leadMinutes) out.push(e)
  }
  return out
}

// Ανθρώπινο κείμενο ειδοποίησης: «σε 8 λεπτά» / «τώρα» ανάλογα με την απόσταση.
export function notifyBody(e: NotifiableEvent, now: Date): string {
  const t = minutesOfDay(e.event_time)
  if (t === null) return e.title
  const diff = t - (now.getHours() * 60 + now.getMinutes())
  const when = diff <= 0 ? 'τώρα' : diff === 1 ? 'σε 1 λεπτό' : `σε ${diff} λεπτά`
  return `${e.event_time} · ${when}`
}
