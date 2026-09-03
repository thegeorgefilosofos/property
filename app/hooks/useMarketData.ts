'use client'
// ΕΙΝΑΙ MODULE ΠΕΛΑΤΗ, ΚΑΙ ΤΩΡΑ ΤΟ ΛΕΕΙ. Εξάγει ΜΟΝΟ hooks: τρέχει
// αποκλειστικά σε component πελάτη και όλοι οι καταναλωτές του δηλώνουν ήδη
// 'use client'. Χωρίς τη δήλωση, ο `check-server-imports` το έβλεπε ως Server
// Component που διαβάζει τιμή από module πελάτη (το `useLoad`) — εύρημα
// σωστό στη μορφή του, γιατί ένα module χωρίς τη δήλωση ΜΠΟΡΕΙ να αποδοθεί
// στον διακομιστή, όπου η τιμή θα ερχόταν undefined.
// src/hooks/useMarketData.ts
// Fetches live market data from Supabase (which gets it from ECB + ΤτΕ daily)
// Πέφτει σε σταθερές τιμές όταν η βάση δεν απαντά

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLoad } from '@/app/hooks/useLoad';
import { staleKeys, type Provenance, type MarketKey } from '@/lib/market/ecb'
import { athensToday } from '@/lib/core/time'

export interface LiveMarketRates {
  euribor_3m: number
  euribor_1m: number
  euribor_6m: number
  euribor_12m: number
  ecb_rate: number
  ecb_dfl: number
  bog_housing_new: number   // ΤτΕ average new mortgage rate
  bog_housing_stock: number // ΤτΕ average outstanding mortgage rate
  updated_at: string
  source_euribor: string
  source_bog: string
  rate_changed: boolean
  isLoading: boolean
  /**
   * ΠΟΤΕ ΠΑΡΑΤΗΡΗΘΗΚΕ ΚΑΘΕ ΤΙΜΗ, ΠΟΙΟΣ ΤΗ ΛΕΕΙ ΚΑΙ ΤΙ ΜΕΤΡΑ.
   *
   * Πριν, η φρεσκάδα βγαινε από την `updated_at` της γραμμής — δηλαδή από το
   * πότε ΕΤΡΕΞΕ η πρωινή εργασία. Η εργασία έγραφε γραμμή κάθε μέρα ακόμη κι
   * όταν η ΕΚΤ δεν απαντούσε, οπότε η γραμμή ήταν πάντα σημερινή και ο δείκτης
   * παλαιότητας δεν μπορούσε να ενεργοποιηθεί ποτέ. Εδώ η ημερομηνία ανήκει
   * στην ΤΙΜΗ. Κενό μέχρι το πρώτο πέρασμα της νέας τροφοδοσίας.
   */
  provenance: Provenance
  /** Τα κλειδιά που έχουν παλιώσει, με το όριο του καθενός. */
  stale: MarketKey[]
  isStale: boolean
}

export interface LiveBankRate {
  bank_id: string
  bank_name: string
  color: string
  fixed_3yr: string
  fixed_5yr: string
  fixed_10yr: string
  fixed_15yr: string
  fixed_20yr: string
  variable_spread_min: number
  variable_spread_max: number
  fixed_min: number
  max_ltv: number
  max_years: number
  max_amount: number
  min_amount: number
  green_discount: number
  spiti_mou: boolean
  features: string[]
  programs: string[]
  fees: string
  note: string
  url: string
  source_url: string
  verified_at: string
}

export interface LiveProgram {
  id: string
  program_id: string
  name: string
  icon: string
  color: string
  status: string
  type_label: string
  description: string
  how_it_works: string
  extra_info: string
  savings_example: string
  max_amount: number | null
  max_prop_value: number | null
  max_ltv: number | null
  max_sqm: number | null
  age_min: number | null
  age_max: number | null
  duration_label: string
  deadline: string | null
  deadline_label: string
  deadline_urgent: boolean
  total_budget: string
  criteria: string[]
  participating_banks: string[]
  source_url: string
}

// ΤΟ `new Date()` ΕΔΩ ΗΤΑΝ ΣΦΡΑΓΙΔΑ ΣΗΜΕΡΙΝΗ ΠΑΝΩ ΣΕ ΝΟΥΜΕΡΑ ΤΟΥ ΚΩΔΙΚΑ.
// Οταν η βάση δεν απαντούσε, ο πίνακας γύριζε αυτές τις χειρόγραφες τιμές με
// ημερομηνία «τώρα» και ο έλεγχος παλαιότητας των 48 ωρών έβρισκε πάντα
// φρέσκα δεδομένα. Σταθερή ημερομηνία, όση αξίζουν: είναι το τελευταίο σημείο
// που ξέρουμε, όχι μέτρηση της στιγμής. Η `provenance` μένει κενή επίτηδες· και
// η οθόνη δεν γράφει ημερομηνία δίπλα σε καμία από αυτές.
//
// ΚΑΙ ΤΑ ΝΟΥΜΕΡΑ ΗΤΑΝ ΛΑΘΟΣ, ΟΧΙ ΑΠΛΩΣ ΠΑΛΙΑ. Στην πρώτη αληθινή εκτέλεση της
// τροφοδοσίας, 01/09/2026, η ΕΚΤ έδωσε Euribor τριμήνου 2,51% εκεί που ο
// κώδικας έγραφε 2,18: τριάντα τρεις μονάδες βάσης κάτω, πάνω στο νούμερο που
// στηρίζει κάθε υπολογισμό κυμαινόμενου δανείου. Το ελληνικό μέσο υφιστάμενο
// έγραφε 3,50 και είναι 3,01. Αντικαταστάθηκαν με τις τιμές που επιστρέφει η
// πηγή, με την ημερομηνία της παρατήρησης και όχι με σφραγίδα «τώρα».
const FALLBACK_AS_OF = '2026-08-01T00:00:00Z';

const RATES_FALLBACK: LiveMarketRates = {
  euribor_3m: 2.513, euribor_1m: 2.221, euribor_6m: 2.713, euribor_12m: 2.954,
  ecb_rate: 2.40, ecb_dfl: 2.25, bog_housing_new: 3.56, bog_housing_stock: 3.01,
  updated_at: FALLBACK_AS_OF, source_euribor: 'fallback', source_bog: 'fallback',
  rate_changed: false, isLoading: true, provenance: {}, stale: [], isStale: false,
}

export function useMarketRates() {
  const [data, setData] = useState<LiveMarketRates>(RATES_FALLBACK)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      try {
        const { data: row } = await supabase
          .from('market_rates')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (row) {
          // Η ΠΑΛΑΙΟΤΗΤΑ ΒΓΑΙΝΕΙ ΑΠΟ ΤΙΣ ΤΙΜΕΣ, ΟΧΙ ΑΠΟ ΤΗ ΓΡΑΜΜΗ. Και κάθε
          // είδος έχει δικό του όριο: το Euribor βγαίνει κάθε εργάσιμη, το
          // επιτόκιο πολιτικής λίγες φορές τον χρόνο. Το παλιό «48 ώρες για
          // όλα» θα φώναζε ψέματα στο δεύτερο ακόμη κι αν δούλευε.
          const provenance = (row.provenance ?? {}) as Provenance
          const stale = staleKeys(provenance, athensToday())
          setData({
            euribor_3m:        row.euribor_3m        ?? RATES_FALLBACK.euribor_3m,
            euribor_1m:        row.euribor_1m        ?? RATES_FALLBACK.euribor_1m,
            euribor_6m:        row.euribor_6m        ?? RATES_FALLBACK.euribor_6m,
            euribor_12m:       row.euribor_12m       ?? RATES_FALLBACK.euribor_12m,
            ecb_rate:          row.ecb_rate          ?? RATES_FALLBACK.ecb_rate,
            ecb_dfl:           row.ecb_dfl           ?? RATES_FALLBACK.ecb_dfl,
            bog_housing_new:   row.bog_housing_new   ?? RATES_FALLBACK.bog_housing_new,
            bog_housing_stock: row.bog_housing_stock ?? RATES_FALLBACK.bog_housing_stock,
            updated_at:        row.updated_at,
            source_euribor:    row.source_euribor    ?? 'fallback',
            source_bog:        row.source_bog        ?? 'fallback',
            rate_changed:      row.rate_changed      ?? false,
            isLoading: false,
            provenance, stale,
            isStale: stale.length > 0,
          })
        } else {
          setData(r => ({ ...r, isLoading: false }))
        }
      } catch {
        setData(r => ({ ...r, isLoading: false }))
      }
    }
    load()
  }, [])

  return data
}

// ΓΙΑΤΙ ΕΠΙΣΤΡΕΦΕΙ `reload`.
// Ο διαχειριστής αποθήκευε νέα επιτόκια από το BankRatesAdmin και η οθόνη
// κρατούσε τα ΠΑΛΙΑ: το hook φόρτωνε μία φορά, μέσα σε useEffect με κενές
// εξαρτήσεις και δεν έδινε τίποτα να ξανακληθεί. Το BankRatesAdmin ξαναδιάβαζε
// ΜΟΝΟ τον δικό του πίνακα, οπότε στην ίδια οθόνη φαίνονταν δύο διαφορετικά
// επιτόκια για την ίδια τράπεζα — το νέο στον πίνακα του διαχειριστή, το παλιό
// στις κάρτες σύγκρισης από κάτω. Και η ημερομηνία «επιβεβαιώθηκε» έμενε πίσω.
// ═══════════════════════════════════════════════════════════════════════════
// Η ΚΑΤΑΣΤΑΣΗ ΤΗΣ ΤΡΟΦΟΔΟΣΙΑΣ, ΓΙΑ ΟΠΟΙΟΝ ΤΗ ΣΥΝΤΗΡΕΙ
// ─────────────────────────────────────────────────────────────────────────
// ΜΑΘΑΜΕ ΓΙΑ ΣΠΑΣΜΕΝΗ ΕΡΓΑΣΙΑ ΕΠΕΙΔΗ ΕΤΥΧΕ ΝΑ ΚΟΙΤΑΞΟΥΜΕ. Δύο εργασίες έτρεχαν
// χαλασμένες επί μήνες: η μία αποτύγχανε κάθε μέρα με ανυποκατάστατη διεύθυνση,
// η άλλη έγραφε παλιά επιτόκια πάνω από τα σωστά. Καμία δεν ειδοποίησε κανέναν.
//
// Ο ΟΡΙΣΜΟΣ ΤΟΥ «ΧΑΛΑΣΕ» ΔΕΝ ΓΡΑΦΕΤΑΙ ΕΔΩ. Ζει στη `market_feed_health()` της
// βάσης, όπου τον διαβάζει και ο νυχτερινός φύλακας. Δύο ορισμοί θα απέκλιναν
// ακριβώς τη μέρα που θα άλλαζε ο ένας.
//
// ΤΙ ΔΕΝ ΚΑΝΕΙ: δεν το βλέπει ο απλός χρήστης. Εκείνος βλέπει ήδη την αλήθεια —
// κάθε τιμή κουβαλά την ημερομηνία της και η παλιά υπογραμμίζεται. Αυτό εδώ
// είναι για όποιον μπορεί να το ΔΙΟΡΘΩΣΕΙ.
export interface FeedHealth {
  ok: boolean;
  reason: string;
  hoursSilent: number | null;
  valuesPresent: number;
  valuesExpected: number;
  /** Οσο είναι false, δεν ξέρουμε τίποτα και δεν λέμε τίποτα. */
  checked: boolean;
}

export function useMarketFeedHealth(enabled: boolean) {
  const [health, setHealth] = useState<FeedHealth>({
    ok: true, reason: '', hoursSilent: null, valuesPresent: 0, valuesExpected: 8, checked: false,
  })
  const supabase = createClient()

  useEffect(() => {
    if (!enabled) return
    let alive = true
    async function check() {
      try {
        const { data, error } = await supabase.rpc('market_feed_health')
        // ΣΦΑΛΜΑ ΑΝΑΓΝΩΣΗΣ ΔΕΝ ΕΙΝΑΙ «ΟΛΑ ΚΑΛΑ». Αν η κλήση αποτύχει — η
        // συνάρτηση δεν έχει ανέβει ακόμη, η βάση δεν απαντά — το `data` έρχεται
        // κενό. Χωρίς αυτόν τον έλεγχο, το κενό θα διαβαζόταν ως «καμία ένδειξη
        // προβλήματος» και η γραμμή δεν θα εμφανιζόταν ΠΟΤΕ, ακριβώς όπως οι
        // εργασίες που αποτύγχαναν σιωπηλά επί μήνες. Μένει `checked: false`:
        // δεν ξέρουμε, άρα δεν λέμε τίποτα· αυτό είναι διαφορετικό από
        // «ελέγχθηκε και είναι εντάξει».
        if (error) return
        const row = Array.isArray(data) ? data[0] : data
        if (!alive || !row) return
        setHealth({
          ok: !!row.ok,
          reason: row.reason ?? '',
          hoursSilent: row.hours_silent == null ? null : Number(row.hours_silent),
          valuesPresent: row.values_present ?? 0,
          valuesExpected: row.values_expected ?? 8,
          checked: true,
        })
      } catch { /* σιωπή: μια αποτυχία ελέγχου δεν είναι αποτυχία τροφοδοσίας */ }
    }
    check()
    return () => { alive = false }
  }, [enabled])

  return health
}

// ═══ Η ΥΓΕΙΑ ΤΗΣ ΤΡΟΦΟΔΟΣΙΑΣ ΕΠΙΤΟΚΙΩΝ ΤΡΑΠΕΖΩΝ ═══════════════════════════
// Ο ορισμός ζει στη `bank_feed_health()` της βάσης, όπως και για την ΕΚΤ.
// Εδώ διαβάζεται μόνο, ώστε η οθόνη να μπορεί να πει «ελέγχθηκαν σήμερα,
// αμετάβλητα από …» αντί να μετρά ημέρες από το `verified_at` και να
// υποθέτει ότι κανείς δεν κοίταξε.
export interface BankFeedHealth {
  ok: boolean;
  reason: string;
  /** Πότε έτρεξε τελευταία η τροφοδοσία, ό,τι κι αν βρήκε. */
  lastCheck: string | null;
  /** Πότε έτρεξε τελευταία ΚΑΙ πέτυχε. */
  lastOk: string | null;
  hoursSilent: number | null;
  /** Η παλαιότερη επιβεβαίωση ανάμεσα στις ενεργές τράπεζες. */
  verifiedAt: string | null;
  /** Μεταβολές που περιμένουν δεύτερη επιβεβαίωση. */
  heldChanges: number;
  /** Οσο είναι false, δεν ξέρουμε τίποτα και δεν λέμε τίποτα. */
  checked: boolean;
}

const NO_BANK_HEALTH: BankFeedHealth = {
  ok: true, reason: '', lastCheck: null, lastOk: null, hoursSilent: null, verifiedAt: null, heldChanges: 0, checked: false,
}

export function useBankRates() {
  const [banks, setBanks] = useState<LiveBankRate[]>([])
  const [loading, setLoading] = useState(true)
  const [verifiedAt, setVerifiedAt] = useState<string>('')
  const [health, setHealth] = useState<BankFeedHealth>(NO_BANK_HEALTH)
  const supabase = createClient()

  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('bank_rates')
      .select('*')
      .eq('is_active', true)
      .order('fixed_min', { ascending: true })

    if (data?.length) {
      setBanks(data)
      setVerifiedAt(data[0].verified_at)
    }
    setLoading(false)
    // Σφάλμα ανάγνωσης δεν είναι «όλα καλά»: μένει `checked: false` και η
    // οθόνη πέφτει στην παλιά της γλώσσα, τις ημέρες από το verified_at.
    try {
      const { data: h, error } = await supabase.rpc('bank_feed_health')
      const row = Array.isArray(h) ? h[0] : h
      if (!error && row) setHealth({
        ok: !!row.ok, reason: row.reason ?? '', lastCheck: row.last_check ?? null, lastOk: row.last_ok ?? null,
        hoursSilent: row.hours_silent == null ? null : Number(row.hours_silent),
        verifiedAt: row.verified_at ?? null, heldChanges: Number(row.held_changes ?? 0), checked: true,
      })
    } catch { /* μια αποτυχία ελέγχου δεν είναι αποτυχία τροφοδοσίας */ }
  }, [supabase])

  // Η αποτυχία σβήνει τον δείκτη φόρτωσης· και τα δύο συμβαίνουν στην απάντηση.
  const boot = useCallback(() => reload().catch(() => setLoading(false)), [reload])
  useLoad(boot)

  return { banks, loading, verifiedAt, health, reload }
}

// Ελέγχει αν ο συνδεδεμένος χρήστης ανήκει στη λίστα διαχειριστών (app_admins).
// Η ίδια λίστα ελέγχεται και από την πολιτική RLS του bank_rates, ώστε UI και
// βάση να συμφωνούν από μία και μόνη πηγή αλήθειας — χωρίς email στον κώδικα.
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false)
  const [checked, setChecked] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        const email = user?.email
        if (email) {
          const { data } = await supabase
            .from('app_admins')
            .select('email')
            .eq('email', email)
            .maybeSingle()
          setIsAdmin(!!data)
        }
      } catch {}
      setChecked(true)
    }
    check()
  }, [])

  return { isAdmin, checked }
}

export function useLoanPrograms() {
  const [programs, setPrograms] = useState<LiveProgram[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      try {
        // Χρησιμοποιεί την όψη της βάσης, που φιλτράρει μόνη της τα ληγμένα προγράμματα
        const { data } = await supabase
          .from('active_loan_programs')
          .select('*')

        if (data?.length) setPrograms(data)
      } catch {}
      setLoading(false)
    }
    load()
    // Ανανέωση κάθε τριάντα λεπτά
    const interval = setInterval(load, 30 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  return { programs, loading }
}
