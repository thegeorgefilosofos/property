// src/hooks/useMarketData.ts
// Fetches live market data from Supabase (which gets it from ECB + ΤτΕ daily)
// Πέφτει σε σταθερές τιμές όταν η βάση δεν απαντά

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLoad } from '@/app/hooks/useLoad';
import { staleKeys, greekDay, type Provenance, type MarketKey } from '@/lib/market/ecb'
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
export function useBankRates() {
  const [banks, setBanks] = useState<LiveBankRate[]>([])
  const [loading, setLoading] = useState(true)
  const [verifiedAt, setVerifiedAt] = useState<string>('')
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
  }, [supabase])

  // Η αποτυχία σβήνει τον δείκτη φόρτωσης· και τα δύο συμβαίνουν στην απάντηση.
  const boot = useCallback(() => reload().catch(() => setLoading(false)), [reload])
  useLoad(boot)

  return { banks, loading, verifiedAt, reload }
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
