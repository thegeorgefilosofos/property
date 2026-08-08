'use client';

import { useState, useEffect, useRef } from 'react';
import { daysUntil } from '@/lib/core/time';
import { createClient } from '@/lib/supabase/client';
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, fe, InfoBanner, Skeleton, SkeletonKPIs, localDay, ABSENT_SHORT } from '@/components/Theme';
import { freshness } from '@/lib/energy/freshness';
import { seedInsurance, type PropertyInsurance } from '@/lib/insurance/seed';
import { assessNeeds, matchPlans, explain, NEED_LABEL, type PropertyRisk } from '@/lib/insurance/match';
import { normalizeEnfiaAgeKey } from '@/lib/billing/enfia';

// ═══ Ο ΚΙΝΔΥΝΟΣ ΠΑΛΑΙΟΤΗΤΑΣ ΠΟΥ ΗΤΑΝ ΠΑΝΤΑ 1,00 ═══════════════════════════
// Η παλαιότητα διαβάζεται από τη ρύθμιση `enfiaAge`, της οποίας τα κλειδιά
// έγιναν έξι (y0_4 … y26_plus) όταν διορθώθηκε η κλίμακα του ΕΝΦΙΑ. Εδώ όμως
// η σύγκριση έμεινε στα ΠΑΛΙΑ ονόματα ('under_5', '25_30', 'over_30'), και η
// προεπιλογή ήταν επίσης παλιά ('10_20'). Καμία συνθήκη δεν ταίριαζε ποτέ σε
// καμία αποθηκευμένη τιμή: ο συντελεστής έβγαινε 1,00 για όλους. Μια οικοδομή
// του 1975 έπαιρνε ακριβώς την ίδια εκτίμηση ασφαλίστρου με νεόδμητη.
//
// Το κλειδί περνά τώρα από την ίδια μετάφραση με τον ΕΝΦΙΑ, οπότε δουλεύει και
// με τα παλιά ονόματα που κάθονται ήδη στις ρυθμίσεις των χρηστών.
/**
 * ΠΟΤΕ ΕΠΑΛΗΘΕΥΤΗΚΑΝ ΤΑ ΑΣΦΑΛΙΣΤΡΑ ΤΟΥ ΚΑΤΑΛΟΓΟΥ.
 *
 * ΤΟ ΚΕΝΟ: σαράντα οκτώ ασφάλιστρα και είκοσι οκτώ τιμές συνδρομών
 * παρουσιάζονταν χωρίς καμία ημερομηνία ή πηγή ανά εγγραφή — ενώ η οθόνη
 * ανακήρυσσε «ΠΡΟΤΕΙΝΟΜΕΝΟ ΓΙΑ ΕΣΕΝΑ». Το `BillsGas.tsx` έχει σήμανση ανά τιμή
 * (επιβεβαιωμένη / ενδεικτική / τύπος) και το `BillsElectricity.tsx` έχει
 * ημερομηνία και πύλη φρεσκάδας. Τρεις κατάλογοι, τρία πρότυπα ειλικρίνειας.
 *
 * Οι τιμές έρχονται από το `data/price-sources.json`, που φυλάσσεται από test.
 * Το κατώφλι είναι 120 ημέρες και όχι 40 όπως στο ρεύμα, με τη δική του
 * αιτιολογία γραμμένη εκεί: τα προγράμματα κατοικίας δεν αλλάζουν μηνιαία.
 */
export const INSURANCE_VERIFIED = '2026-07-29';
export const INSURANCE_MAX_AGE_DAYS = 120;

const AGE_RISK: Record<string, number> = {
  y0_4: 0.90, y5_9: 0.95, y10_14: 1.00, y15_19: 1.05, y20_25: 1.10, y26_plus: 1.20,
};


/**
 * Μάρκες που ανήκουν στην ίδια ασφαλιστική επιχείρηση.
 *
 * Το Anytime είναι το ψηφιακό κανάλι της Interamerican, όχι δεύτερη εταιρεία.
 * Χωρίς αυτό, μια πρόταση «συγκρίναμε 9 εταιρείες» θα μετρούσε την ίδια
 * επιχείρηση δύο φορές. Τα προγράμματα μένουν και τα δύο, γιατί είναι
 * πραγματικά διαφορετικά προϊόντα με διαφορετική τιμή, αλλά η ΕΠΙΧΕΙΡΗΣΗ
 * μετριέται μία.
 *
 * Η αυθεντική πηγή για το ποιες ασφαλιστικές λειτουργούν σήμερα και με ποιο
 * όνομα είναι το δημόσιο μητρώο ασφαλιστικών επιχειρήσεων της Τράπεζας της
 * Ελλάδος. Ο κατάλογος οφείλει να διασταυρώνεται εκεί σε κάθε ενημέρωση.
 */
const BRAND_PARENT: Record<string, string> = {
  anytime: 'interamerican',
};

/** Πόσες ΕΠΙΧΕΙΡΗΣΕΙΣ, όχι πόσες μάρκες. */
const distinctInsurers = (companyIds: string[]): number =>
  new Set(companyIds.map(c => BRAND_PARENT[c] ?? c)).size;

// ─── Insurance data ────────────────────────────────────────────────────────────
// ΤΟ ΣΧΗΜΑ ΔΗΛΩΝΕΤΑΙ, ΔΕΝ ΣΥΜΠΕΡΑΙΝΕΤΑΙ. Χωρίς τον τύπο, ο μεταγλωττιστής
// έβγαζε ένωση από τριάντα διαφορετικά σχήματα αντικειμένου (άλλο πρόγραμμα έχει
// `covers`, άλλο όχι) και κάθε ανάγνωση πεδίου χρειαζόταν `(p as any)`. Δηλαδή
// μια ορθογραφία σε όνομα πεδίου περνούσε αθόρυβα και το κελί έμενε κενό.
interface CatalogPlan {
  id: string;
  name: string;
  /** Ενδεικτικό μηνιαίο, ΠΟΤΕ πραγματική προσφορά. */
  monthly: number;
  annual?: number;
  covers?: string[];
  earthquake?: boolean;
  flood?: boolean;
  natural?: boolean;
}
interface InsuranceCompany {
  value: string;
  label: string;
  url: string;
  agent_label: string;
  propertyTypes: string[];
  note: string;
  plans: CatalogPlan[];
}

const INSURANCE_COMPANIES: InsuranceCompany[] = [
  { value: 'hellas_direct', label: 'Hellas Direct',            url: 'https://www.hellasdirect.gr/asfaleia-katoikias', agent_label: 'Ψηφιακή, χωρίς ασφαλιστή',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη','Βραχυχρόνια Μίσθωση'],
    note: 'Modular καλύψεις, τιμή εξαρτάται από τετραγωνικά, ζώνη, αξία. Δωρεάν αποτίμηση online.',
    plans: [
      { id: 'hd_ktirio',    name: 'Κτίριο',                monthly: 5.50,  annual: 55,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Βραχυκύκλωμα','Φυσικά Φαινόμενα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'hd_perieh',   name: 'Περιεχόμενο',            monthly: 4.00,  annual: 40,  covers: ['Κλοπή','Βραχυκύκλωμα','Τυχαίες Ζημιές Περιεχομένου'], earthquake: false, flood: false, natural: false },
      { id: 'hd_full',     name: 'Κτίριο & Περιεχόμενο',   monthly: 8.50,  annual: 85,  covers: ['Πυρκαγιά','Κλοπή','Θραύση Σωληνώσεων','Βραχυκύκλωμα','Φυσικά Φαινόμενα','Αστική Ευθύνη','Τυχαίες Ζημιές'], earthquake: false, flood: true,  natural: true  },
      { id: 'hd_full_eq',  name: 'Κτίριο & Περιεχόμενο + Σεισμός', monthly: 12.00, annual: 120, covers: ['Πλήρης Κάλυψη','Σεισμός','Κλοπή','Αστική Ευθύνη'], earthquake: true, flood: true, natural: true },
    ] },
  { value: 'interamerican', label: 'Interamerican',             url: 'https://www.interamerican.gr/idiotes/proionta-ypiresies/katoikia', agent_label: 'Ασφαλιστής Interamerican',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη','Κατοικία με Δάνειο'],
    note: '4 προγράμματα, BASIC / EXTRA / COMFORT / TOTAL. Τιμή βάσει τετραγωνικών μέτρων και ασφαλιζόμενου κεφαλαίου.',
    plans: [
      { id: 'im_basic',    name: 'HOME BASIC',              monthly: 10.00, annual: 100, covers: ['Πυρκαγιά','Κεραυνός','Καπνός','Φυσικά Φαινόμενα','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'im_extra',    name: 'HOME EXTRA',              monthly: 14.50, annual: 145, covers: ['Πυρκαγιά','Κλοπή','Φυσικά Φαινόμενα','Αστική Ευθύνη','Δαπάνες Μεταστέγασης'], earthquake: false, flood: true,  natural: true  },
      { id: 'im_comfort',  name: 'HOME COMFORT',            monthly: 19.00, annual: 190, covers: ['Πυρκαγιά','Κλοπή','Φυσικά Φαινόμενα','Πλημμύρα','Αστική Ευθύνη','Δαπάνες Μεταστέγασης'], earthquake: false, flood: true,  natural: true  },
      { id: 'im_total',    name: 'HOME TOTAL (All Risk)',   monthly: 26.00, annual: 249, covers: ['Κάλυψη Παντός Κινδύνου','Σεισμός','Κλοπή','Ψυχολογική Υποστήριξη','Νομική Προστασία'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'anytime',       label: 'Anytime (Interamerican)',   url: 'https://www.anytime.gr/home/programs-covers', agent_label: 'Online, anytime.gr',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη','Βραχυχρόνια Μίσθωση'],
    note: 'Ψηφιακή πλατφόρμα της Interamerican. 100% online. Διαθέσιμη και για Airbnb.',
    plans: [
      { id: 'any_eco',    name: 'Home Economic',             monthly: 8.00,  annual: 79,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Φυσικά Φαινόμενα','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'any_val',    name: 'Home Value',                monthly: 12.50, annual: 119, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη','Δαπάνες Μεταστέγασης'], earthquake: false, flood: true,  natural: true  },
      { id: 'any_prem',   name: 'Home Premium',              monthly: 18.00, annual: 169, covers: ['Πλήρης Κάλυψη','Σεισμός','Κλοπή','Αστική Ευθύνη','Δαπάνες Μεταστέγασης'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'eurolife',      label: 'Eurolife FFH',              url: 'https://www.eurolife.gr', agent_label: 'Σύμβουλος Eurolife FFH',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Μέλος Fairfax Financial. Ιδιαίτερα ανταγωνιστικά ασφάλιστρα.',
    plans: [
      { id: 'el_ess',     name: 'HomeSecure Essential',      monthly: 9.50,  annual: 90,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Φυσικά Φαινόμενα','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'el_plus',    name: 'HomeSecure Plus',           monthly: 14.90, annual: 142, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'el_total',   name: 'HomeSecure Total',          monthly: 21.50, annual: 205, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'generali',      label: 'Generali',                  url: 'https://www.generali.gr', agent_label: 'Σύμβουλος Generali',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη','Κατοικία με Δάνειο'],
    note: 'Διεθνής ασφαλιστικός γίγαντας. Ισχυρή παρουσία στην Ελλάδα.',
    plans: [
      { id: 'gen_basic',  name: 'MyHome Basic',              monthly: 9.00,  annual: 85,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Φυσικά Φαινόμενα'], earthquake: false, flood: false, natural: false },
      { id: 'gen_plus',   name: 'MyHome Plus',               monthly: 14.00, annual: 132, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'gen_prem',   name: 'MyHome Premium',            monthly: 20.00, annual: 189, covers: ['Πλήρης Κάλυψη + Σεισμός + Κατολίσθηση'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'axa',           label: 'ΑΧΑ Ασφαλιστική',          url: 'https://www.axa.gr', agent_label: 'Σύμβουλος ΑΧΑ',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Μεγαλύτερη ασφαλιστική ομάδα παγκοσμίως.',
    plans: [
      { id: 'axa_basic',  name: 'Home Protect Basic',        monthly: 10.50, annual: 99,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'axa_plus',   name: 'Home Protect Plus',         monthly: 15.90, annual: 149, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη','Φυσικά Φαινόμενα'], earthquake: false, flood: true,  natural: true  },
      { id: 'axa_prem',   name: 'Home Protect Premium',      monthly: 23.00, annual: 219, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'ethniki',       label: 'Εθνική Ασφαλιστική',        url: 'https://www.ethniki-asfalistiki.gr', agent_label: 'Ασφαλιστής Εθνικής',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη','Κατοικία με Δάνειο'],
    note: 'Παραδοσιακή ελληνική ασφαλιστική. Εκτεταμένο δίκτυο ασφαλιστών.',
    plans: [
      { id: 'eth_classic', name: 'Οικία Classic',            monthly: 12.00, annual: 114, covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'eth_extra',   name: 'Οικία Extra',              monthly: 17.90, annual: 169, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'eth_prem',    name: 'Οικία Premium',            monthly: 24.90, annual: 235, covers: ['Πλήρης Κάλυψη + Σεισμός + Κατολίσθηση'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'allianz',       label: 'Allianz Hellas',            url: 'https://www.allianz.gr', agent_label: 'Ασφαλιστής Allianz / Online',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Μεγαλύτερος ασφαλιστικός όμιλος Ευρώπης.',
    plans: [
      { id: 'al_comp',    name: 'MeinHaus Compact',          monthly: 11.00, annual: 104, covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη','Θραύση Σωληνώσεων'], earthquake: false, flood: false, natural: false },
      { id: 'al_comf',    name: 'MeinHaus Comfort',          monthly: 16.90, annual: 159, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Φυσικά Φαινόμενα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'al_plus',    name: 'MeinHaus Plus',             monthly: 23.90, annual: 225, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'ergo',          label: 'ERGO Ασφαλιστική',          url: 'https://www.ergohellas.gr', agent_label: 'Μεσίτης / Online',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Μέλος Munich Re Group.',
    plans: [
      { id: 'ergo_basic', name: 'Home Basic',                monthly: 9.00,  annual: 85,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'ergo_plus',  name: 'Home Plus',                 monthly: 14.00, annual: 132, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'ergo_prem',  name: 'Home Premium',              monthly: 20.00, annual: 189, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'groupama',      label: 'Groupama (myZen)',          url: 'https://www.groupama.gr', agent_label: 'Online, myZen.gr',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Γαλλικός ασφαλιστικός όμιλος. 100% online μέσω myZen.gr.',
    plans: [
      { id: 'grp_basic',  name: 'myZen Basic',               monthly: 8.50,  annual: 80,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'grp_conf',   name: 'myZen Confort',             monthly: 12.90, annual: 120, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη','Φυσικά Φαινόμενα'], earthquake: false, flood: true,  natural: true  },
      { id: 'grp_allr',   name: 'myZen All Risk',            monthly: 19.00, annual: 179, covers: ['Κάλυψη Παντός Κινδύνου + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'cosmote_ins',   label: 'Magenta Insurance',         url: 'https://www.magentainsurance.gr/home', agent_label: 'Online, Magenta',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία'],
    note: 'Πρώην COSMOTE Insurance. Σύγκριση και online ασφάλιση κατοικίας από 90 €/έτος, με δυνατότητα έκπτωσης έως 20% στον ΕΝΦΙΑ υπό προϋποθέσεις.',
    plans: [
      { id: 'ci_basic',   name: 'Magenta Home Βασικό',       monthly: 8.00,  annual: 96,  covers: ['Πυρκαγιά','Θραύση Σωληνώσεων','Φυσικά Φαινόμενα','Βραχυκύκλωμα','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'ci_plus',    name: 'Magenta Home Πλήρες',       monthly: 14.50, annual: 139, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Φυσικά Φαινόμενα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'ci_total',   name: 'Magenta Home Ολοκληρωμένο', monthly: 21.00, annual: 199, covers: ['Πλήρης Κάλυψη','Σεισμός','Κατολίσθηση','Νομική Προστασία'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'interlife',     label: 'Interlife',                 url: 'https://www.interlife.gr', agent_label: 'Ασφαλιστής / Online',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Ελληνική ασφαλιστική εταιρεία. Ανταγωνιστικές τιμές.',
    plans: [
      { id: 'il_basic',   name: 'Κατοικία Basic',            monthly: 7.50,  annual: 72,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'il_plus',    name: 'Κατοικία Plus',             monthly: 12.00, annual: 114, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'il_prem',    name: 'Κατοικία Premium',          monthly: 17.00, annual: 160, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'metlife',       label: 'MetLife',                   url: 'https://www.metlife.gr', agent_label: 'Ασφαλιστής MetLife',
    propertyTypes: ['Κύρια Κατοικία','Ενοικιαζόμενη','Κατοικία με Δάνειο'],
    note: 'Αμερικανική εταιρεία με ισχυρή παρουσία στην Ελλάδα.',
    plans: [
      { id: 'ml_prot',    name: 'Home Protection',           monthly: 10.00, annual: 95,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'ml_comf',    name: 'Home Comfort',              monthly: 16.00, annual: 152, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'atlantiki',     label: 'Ατλαντική Ένωση',           url: 'https://www.atlantiki.gr', agent_label: 'Ασφαλιστής',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: 'Ελληνική εταιρεία, ανταγωνιστικά ασφάλιστρα.',
    plans: [
      { id: 'at_class',   name: 'Ακίνητο Classic',           monthly: 8.00,  annual: 76,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'at_extra',   name: 'Ακίνητο Extra',             monthly: 13.00, annual: 124, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'at_prem',    name: 'Ακίνητο Premium',           monthly: 19.00, annual: 179, covers: ['Πλήρης Κάλυψη + Σεισμός'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'intesaloniki',  label: 'Ιντερσαλόνικα',             url: 'https://www.intersalonica.gr', agent_label: 'Ασφαλιστής',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία'],
    note: 'Ελληνική εταιρεία με έδρα τη Θεσσαλονίκη.',
    plans: [
      { id: 'is_vasi',    name: 'Κατοικία Βασική',           monthly: 7.00,  annual: 66,  covers: ['Πυρκαγιά','Κλοπή','Αστική Ευθύνη'], earthquake: false, flood: false, natural: false },
      { id: 'is_plir',    name: 'Κατοικία Πλήρης',          monthly: 12.00, annual: 114, covers: ['Πυρκαγιά','Κλοπή','Πλημμύρα','Αστική Ευθύνη','Φυσικά Φαινόμενα'], earthquake: false, flood: true,  natural: true  },
    ] },
  { value: 'aig',           label: 'AIG (American International)', url: 'https://www.aig.com.gr', agent_label: 'Ασφαλιστής',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Κατοικία με Δάνειο'],
    note: 'Αμερικανική εταιρεία, ισχυρές καλύψεις All Risk.',
    plans: [
      { id: 'aig_allr',   name: 'Home All Risk',             monthly: 13.00, annual: 124, covers: ['Κάλυψη Παντός Κινδύνου','Αστική Ευθύνη'], earthquake: false, flood: true,  natural: true  },
      { id: 'aig_plus',   name: 'Home All Risk Plus',        monthly: 20.00, annual: 189, covers: ['Κάλυψη Παντός Κινδύνου + Σεισμός + Κατολίσθηση'], earthquake: true,  flood: true,  natural: true  },
    ] },
  { value: 'other',         label: 'Άλλη Ασφαλιστική',          url: '', agent_label: 'Ασφαλιστής',
    propertyTypes: ['Κύρια Κατοικία','Εξοχική Κατοικία','Ενοικιαζόμενη'],
    note: '',
    plans: [{ id: 'other_custom', name: 'Προσαρμοσμένο', monthly: 0, annual: 0, covers: [], earthquake: false, flood: false, natural: false }] },
];

const STREAMING = [
  { value: 'netflix',    label: 'Netflix',            color: '#e50914', url: 'https://www.netflix.com/gr',             plans: [{ id: 'n_basic', name: 'Βασικό, 8,99 €', price: 8.99 },{ id: 'n_standard', name: 'Standard, 12,49 €', price: 12.49 },{ id: 'n_premium', name: 'Premium 4K, 15,99 €', price: 15.99 }] },
  { value: 'disney',     label: 'Disney+',            color: '#0063e5', url: 'https://www.disneyplus.com/el-gr',        plans: [{ id: 'd_standard', name: 'Standard, 8,99 €', price: 8.99 },{ id: 'd_premium', name: 'Premium, 13,99 €', price: 13.99 }] },
  { value: 'apple_tv',   label: 'Apple TV+',          color: '#555555', url: 'https://www.apple.com/gr/apple-tv-plus', plans: [{ id: 'a_std', name: 'Apple TV+, 9,99 €', price: 9.99 }] },
  { value: 'amazon',     label: 'Amazon Prime Video', color: '#00a8e1', url: 'https://www.primevideo.com',              plans: [{ id: 'am_std', name: 'Prime Video, 8,99 €', price: 8.99 }] },
  { value: 'max',        label: 'Max (HBO)',           color: '#0d1ce5', url: 'https://www.max.com/gr/el',              plans: [{ id: 'max_basic', name: 'Basic με διαφημίσεις, 5,99 €', price: 5.99 },{ id: 'max_std', name: 'Standard, 9,99 €', price: 9.99 },{ id: 'max_ult', name: 'Ultimate 4K, 15,99 €', price: 15.99 }] },
  { value: 'spotify',    label: 'Spotify',            color: '#1db954', url: 'https://www.spotify.com/gr',             plans: [{ id: 's_individual', name: 'Individual, 10,99 €', price: 10.99 },{ id: 's_duo', name: 'Duo, 14,99 €', price: 14.99 },{ id: 's_family', name: 'Family (6 άτομα), 17,99 €', price: 17.99 }] },
  { value: 'youtube',    label: 'YouTube Premium',    color: '#ff0000', url: 'https://www.youtube.com/premium',        plans: [{ id: 'y_individual', name: 'Individual, 13,99 €', price: 13.99 },{ id: 'y_family', name: 'Family, 22,99 €', price: 22.99 }] },
  { value: 'ant1plus',   label: 'ANT1+',              color: '#1a56db', url: 'https://www.antennaplus.gr',                plans: [{ id: 'ant_monthly', name: 'Μηνιαία, 2,99 €', price: 2.99 }] },
  { value: 'cosmote_tv', label: 'Cosmote TV',         color: '#00adef', url: 'https://www.cosmote.gr',                 plans: [{ id: 'cos_start', name: 'Start, 6,00 €', price: 6.00 },{ id: 'cos_full', name: 'Full, 30,00 €', price: 30.00 }] },
];

const CLOUD = [
  { value: 'icloud',       label: 'iCloud+',       url: 'https://www.icloud.com',          plans: [{ id: 'ic_50', name: '50 GB, 0,99 €', price: 0.99 },{ id: 'ic_200', name: '200 GB, 2,99 €', price: 2.99 },{ id: 'ic_2t', name: '2 TB, 9,99 €', price: 9.99 }] },
  { value: 'google_one',   label: 'Google One',    url: 'https://one.google.com',          plans: [{ id: 'g_100', name: '100 GB, 1,99 €', price: 1.99 },{ id: 'g_200', name: '200 GB, 2,99 €', price: 2.99 },{ id: 'g_2t', name: '2 TB, 9,99 €', price: 9.99 }] },
  { value: 'microsoft365', label: 'Microsoft 365', url: 'https://www.microsoft.com/el-gr', plans: [{ id: 'ms_pers', name: 'Personal, 6,99 €', price: 6.99 },{ id: 'ms_fam', name: 'Family, 9,99 €', price: 9.99 }] },
  { value: 'dropbox',      label: 'Dropbox',       url: 'https://www.dropbox.com',         plans: [{ id: 'db_plus', name: 'Plus 2 TB, 9,99 €', price: 9.99 }] },
  { value: 'adobe',        label: 'Adobe CC',      url: 'https://www.adobe.com/gr',        plans: [{ id: 'ad_photo', name: 'Photography, 12,29 €', price: 12.29 }] },
];


// Οι δύο εγγραφές συνδρομής ήταν λέξη προς λέξη ίδιες. Η μία περιγραφή αρκεί:
// αν αύριο προστεθεί πεδίο στη μία, δεν υπάρχει δεύτερη να ξεχαστεί.
interface SubscriptionEntry { service: string; planId: string; customPrice: string; splitPeople: number; splitActive: boolean; renewalDate: string; }
type StreamingEntry = SubscriptionEntry;
type CloudEntry     = SubscriptionEntry;
interface OtherSub       { name: string; price: string; renewalDate: string; }

// ─── Ασφαλιστικό Comparison Engine ─────────────────────────────────────────────
// Προσομοιώνει προσφορές ασφάλισης από τα στοιχεία του ακινήτου
// Όταν ανοίξει το API του insurancemarket.gr, το computeQuotes() αντικαθίσταται με πραγματική κλήση
/** Τα τέσσερα φίλτρα προσφορών, δηλωμένα μία φορά και ως τύπος. */
const QUOTE_FILTERS = [
  { key: 'all',        label: 'Όλα'                 },
  { key: 'earthquake', label: 'Σεισμός'             },
  { key: 'flood',      label: 'Πλημμύρα'            },
  { key: 'natural',    label: 'Φυσικές Καταστροφές' },
] as const;
type QuoteFilter = typeof QUOTE_FILTERS[number]['key'];

interface LiveQuote {
  company: string;
  companyLabel: string;
  plan: string;
  planLabel: string;
  monthlyEstimate: number;
  annualEstimate: number;
  earthquake: boolean;
  flood: boolean;
  natural: boolean;
  covers: string[];
  url: string;
  confidence: 'live' | 'estimated';
  savings?: number; // vs current plan
}

/**
 * Το ΕΝΔΕΙΚΤΙΚΟ κόστος κάθε προγράμματος για το ακίνητο.
 *
 * ΤΙ ΕΙΝΑΙ ΚΑΙ ΤΙ ΔΕΝ ΕΙΝΑΙ: είναι μοντέλο τιμής πάνω στις δημοσιευμένες τιμές
 * εκκίνησης των εταιρειών. ΔΕΝ είναι προσφορά. Πραγματική τιμή ασφάλισης
 * κατοικίας δεν υπάρχει δημοσιευμένη: παράγεται από τα στοιχεία του
 * συγκεκριμένου ακινήτου και προσώπου, και τη δίνει μόνο η ασφαλιστική. Γι'
 * αυτό κάθε ποσό εδώ φέρει `confidence: 'estimated'` και η οθόνη στέλνει τον
 * χρήστη στην πηγή για την πραγματική προσφορά.
 *
 * ΠΡΟΣΟΧΗ ΣΤΟ ΤΙ ΚΑΝΕΙ Ο ΣΥΝΤΕΛΕΣΤΗΣ: ανεβοκατεβάζει ΟΛΑ τα προγράμματα μαζί,
 * άρα ΔΕΝ αλλάζει σειρά. Η σειρά βγαίνει από τη μηχανή αναγκών
 * (lib/insurance/match.ts) και όχι από εδώ. Παλιά δεν υπήρχε τέτοια μηχανή, και
 * η «εξατομικευμένη σύγκριση» έβγαζε ακριβώς την ίδια κατάταξη για κάθε ακίνητο.
 */
function computeLiveQuotes(sqm: number, propValue: number, contentValue: number, floor: string, age: string): LiveQuote[] {
  if (!sqm || !propValue) return [];

  // Συντελεστές τιμολόγησης από τα χαρακτηριστικά του ακινήτου
  const sqmFactor    = Math.max(0.7, Math.min(1.5, sqm / 100));
  const valueFactor  = Math.max(0.8, Math.min(2.0, propValue / 150000));
  // ΣΗΜΕΙΟ ΑΝΑΦΟΡΑΣ, ΟΧΙ ΔΗΛΩΜΕΝΗ ΑΞΙΑ. Το 20.000 € είναι ο παρονομαστής της
  // κλίμακας, όχι οικοσκευή που ισχυριζόμαστε ότι έχει ο χρήστης. Ήταν γραμμένο
  // `(contentValue || 20000) / 20000`, που δίνει ακριβώς 1 όταν λείπει η τιμή —
  // σωστό αριθμητικά, αλλά διαβαζόταν σαν να υποθέτουμε οικοσκευή 20.000 €.
  // Χωρίς δηλωμένη αξία δεν προσαρμόζουμε καθόλου: συντελεστής 1.
  const CONTENT_REFERENCE = 20000;
  const contentF     = contentValue > 0 ? Math.max(0.9, Math.min(1.4, contentValue / CONTENT_REFERENCE)) : 1;
  const floorRisk    = floor === 'ground' ? 1.15 : floor === 'basement' ? 1.25 : 1.0;
  const ageRisk      = AGE_RISK[normalizeEnfiaAgeKey(age)] ?? 1.0;
  // Η σεισμική ζώνη ΔΕΝ βγαίνει από το όνομα της πόλης. Ο παλιός κώδικας έψαχνε
  // αν το κείμενο περιείχε «Αθήν» και πρόσθετε 5%. Η ζώνη ορίζεται από χάρτη
  // κανονισμού, όχι από αλφαριθμητικά, και η Αθήνα δεν είναι καν η πιο
  // επιβαρυμένη περιοχή. Αφαιρέθηκε αντί να αντικατασταθεί με άλλη μαντεψιά.
  const totalFactor  = sqmFactor * valueFactor * contentF * floorRisk * ageRisk;

  return INSURANCE_COMPANIES
    .filter(c => c.value !== 'other')
    .flatMap(c => (c.plans ?? []).map(p => {
      const base = p.monthly;
      const estimate = base * totalFactor;
      // ΤΟ ΕΤΗΣΙΟ ΔΕΝ ΕΙΝΑΙ ΜΗΝΙΑΙΟ ΕΠΙ ΔΩΔΕΚΑ. Κάθε πρόγραμμα φέρει και δικό του
      // annual, που είναι εκπτωτικό: η Hellas Direct «Κτίριο & Περιεχόμενο» κάνει
      // 8,50 τον μήνα αλλά 85 τον χρόνο, όχι 102. Ο παλιός τύπος έδειχνε την
      // ετήσια πληρωμή περίπου 20% ακριβότερη απ όσο πραγματικά είναι, δηλαδή
      // έκρυβε ακριβώς την έκπτωση που κάνει την ετήσια πληρωμή συμφέρουσα.
      const declaredAnnual = (p as { annual?: number }).annual;
      const annualRatio = (declaredAnnual && base) ? declaredAnnual / (base * 12) : 1;
      return {
        company:       c.value,
        companyLabel:  c.label,
        plan:          p.id,
        planLabel:     p.name,
        monthlyEstimate: Math.round(estimate * 100) / 100,
        annualEstimate:  Math.round(estimate * 12 * annualRatio * 100) / 100,
        earthquake:    !!p.earthquake,
        flood:         !!p.flood,
        natural:       !!p.natural,
        covers:        p.covers || [],
        url:           c.url,
        confidence:    'estimated' as const,
      };
    }));
  // Καμία ταξινόμηση εδώ. Τη σειρά την ορίζει η καταλληλότητα, όχι η τιμή.
}

// ═══════════════════════════════════════════════════════════════════════════
// Η ΣΥΓΚΡΙΣΗ ΑΣΦΑΛΕΙΩΝ ΩΣ ΕΙΔΟΠΟΙΗΣΗ, ΟΧΙ ΩΣ ΚΑΡΤΕΛΑ.
//
// Επιστρέφει κάτι ΜΟΝΟ όταν και τα τρία ισχύουν:
//   1. ξέρουμε τι πληρώνει σήμερα (το έχει γράψει ο ίδιος),
//   2. ξέρουμε τετραγωνικά και αξία, ώστε το μοντέλο τιμής να έχει πάνω σε τι
//      να πατήσει (χωρίς αυτά το computeLiveQuotes επιστρέφει κενό),
//   3. υπάρχει πρόγραμμα με ΤΟΥΛΑΧΙΣΤΟΝ τις ίδιες καλύψεις και χαμηλότερη τιμή.
//
// Το (3) είναι το κρίσιμο: μια φθηνότερη ασφάλεια χωρίς σεισμό, σε κάποιον που
// έχει σεισμό, δεν είναι εξοικονόμηση — είναι λιγότερη ασφάλεια στην ίδια τιμή
// ανά κάλυψη. Η παλιά καρτέλα κατέτασσε κατά τιμή και άφηνε τον χρήστη να το
// προσέξει μόνος του.
// ═══════════════════════════════════════════════════════════════════════════

const INS_SWITCH_NOISE = 3;   // €/μήνα — κάτω από αυτό δεν διακόπτουμε κανέναν

export interface InsuranceSwitchFinding {
  current: number;
  best: number;
  savingsMonthly: number;
  bestLabel: string;
  basedOn: string;
}

export function insuranceSwitchFinding(
  s: Record<string, unknown> | null | undefined,
): InsuranceSwitchFinding | null {
  if (!s) return null;
  const company = INSURANCE_COMPANIES.find(c => c.value === s.insProvider);
  const plan = (company?.plans ?? []).find(p => p.id === s.insPlanId) as
    | { monthly?: number; name?: string; earthquake?: boolean; flood?: boolean; natural?: boolean }
    | undefined;

  const current = parseFloat(String(s.insCustomPrice ?? '')) || plan?.monthly || 0;
  if (!(current > 0)) return null;

  const sqm = parseFloat(String(s.insSqm ?? '')) || 0;
  const propValue = parseFloat(String(s.insPropValue ?? '')) || 0;
  const contentValue = parseFloat(String(s.insContentValue ?? '')) || 0;
  if (!sqm || !propValue) return null;

  // Οι καλύψεις που ΕΧΕΙ σήμερα: ό,τι δηλώθηκε χειροκίνητα ή ό,τι φέρνει το πρόγραμμα.
  const needEq = Boolean(s.insCustomEarthquake) || Boolean(plan?.earthquake);
  const needFl = Boolean(s.insCustomFlood) || Boolean(plan?.flood);
  const needNa = Boolean(s.insCustomNatural) || Boolean(plan?.natural);

  const cheaper = computeLiveQuotes(
    sqm, propValue, contentValue,
    String(s.insFloor ?? 'second'), String(s.insAge ?? 'y10_14'),
  )
    .filter(q => q.plan !== s.insPlanId)
    .filter(q => (!needEq || q.earthquake) && (!needFl || q.flood) && (!needNa || q.natural))
    .sort((a, b) => a.monthlyEstimate - b.monthlyEstimate)[0];

  if (!cheaper) return null;
  const savings = current - cheaper.monthlyEstimate;
  if (!(savings >= INS_SWITCH_NOISE)) return null;

  return {
    current, best: cheaper.monthlyEstimate, savingsMonthly: savings,
    bestLabel: `${cheaper.companyLabel} ${cheaper.planLabel}`,
    basedOn: `${sqm} τ.μ., ίδιες ή καλύτερες καλύψεις — εκτίμηση, όχι προσφορά`,
  };
}

// ΑΦΑΙΡΕΘΗΚΕ: «Σύνδεση με TAXISnet».
//
// Υπήρχε εδώ ένα πλαίσιο που υποσχόταν «αυτόματη λήψη ΕΝΦΙΑ εκκαθαριστικού» και
// ένα κουμπί «Σύνδεση με TAXISnet →». Τίποτα από τα δύο δεν ίσχυε:
//
//   • Το `aadeConnected` ξεκινούσε false και η ΜΟΝΗ γραμμή που το άγγιζε ήταν
//     `setAadeConnected(false)`. Δεν μπορούσε ποτέ να γίνει true.
//   • Το `aadeData` δεν γράφτηκε ποτέ· η `fetchENFIAFromAADE` δεν κλήθηκε ποτέ
//     και επέστρεφε `null` ούτως ή άλλως.
//   • Το κουμπί ήταν `<a href target="_blank">` ΚΑΙ έκανε `window.open` στην ίδια
//     διεύθυνση: κάθε κλικ άνοιγε δύο καρτέλες στην ίδια δημόσια σελίδα της ΑΑΔΕ.
//   • Δεν ζητούσε ποτέ κωδικούς, άρα ούτε καν παραπλανητικά δεν «συνδεόταν».
//
// Δηλαδή: ο χρήστης διάβαζε ότι δεν θα χρειαστεί χειροκίνητη καταχώρηση, πατούσε,
// έπαιρνε δύο καρτέλες με ενημερωτικό κείμενο, και μετά καταχωρούσε χειροκίνητα.
//
// Δεν χάνεται λειτουργία: ο ΕΝΦΙΑ καταχωρείται στην καρτέλα Υπηρεσίες, που έχει
// ήδη υπολογιστή, πεδίο «ΕΝΦΙΑ/έτος» και σύνδεσμο προς Ε9/myAADE. Το πλαίσιο ήταν
// αντίγραφο εκείνου — σε λάθος καρτέλα (Ασφάλεια) — με μια υπόσχεση από πάνω.
//
// Όταν η ΑΑΔΕ ανοίξει πραγματικό API, μπαίνει τότε, με πραγματική ροή εξουσιοδότησης.

// ─── Coverage taxonomy, δυναμική ανάλυση καλύψεων (pricefox / insurancemarket style) ──
// Οι φράσεις «Πλήρης Κάλυψη / Παντός Κινδύνου / All Risk» υπονοούν τους βασικούς κινδύνους.
const ALL_RISK_HINTS = ['πλήρης', 'παντός κινδύνου', 'all risk', 'παντός'];
function hasCov(covers: string[], keys: string[], allRiskImplies = false): boolean {
  const joined = (covers || []).join(' ').toLowerCase();
  if (keys.some(k => joined.includes(k.toLowerCase()))) return true;
  if (allRiskImplies && ALL_RISK_HINTS.some(h => joined.includes(h))) return true;
  return false;
}
// Επιστρέφει τον πλήρη πίνακα καλύψεων με ✓/✗ βάσει του προγράμματος.
function deriveCoverages(covers: string[], earthquake: boolean, flood: boolean, natural: boolean) {
  return [
    { label: 'Πυρκαγιά',            ok: hasCov(covers, ['πυρκαγιά', 'φωτιά'], true) },
    { label: 'Σεισμός',             ok: !!earthquake },
    { label: 'Πλημμύρα',            ok: !!flood || hasCov(covers, ['πλημμύρα']) },
    { label: 'Φυσικά Φαινόμενα',    ok: !!natural || hasCov(covers, ['φυσικά φαινόμενα', 'καιρικά']) },
    { label: 'Κλοπή / Διάρρηξη',    ok: hasCov(covers, ['κλοπή', 'διάρρηξη', 'ληστεία'], true) },
    { label: 'Αστική Ευθύνη',       ok: hasCov(covers, ['αστική ευθύνη'], true) },
    { label: 'Θραύση Σωληνώσεων',   ok: hasCov(covers, ['θραύση σωλην', 'σωληνώσ'], true) },
    { label: 'Βραχυκύκλωμα',        ok: hasCov(covers, ['βραχυκύκλωμα'], true) },
    { label: 'Θραύση Κρυστάλλων',   ok: hasCov(covers, ['κρυστάλλ']) },
    { label: 'Νομική Προστασία',    ok: hasCov(covers, ['νομική']) },
  ];
}

export default function BillsInsurance({ propertyId, userId = '' }: { propertyId: string; userId?: string }) {
  const supabase = createClient();
  const card: React.CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 };
  const g2: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 };
  const g3: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 14, marginBottom: 14 };
  const g4: React.CSSProperties  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 14, marginBottom: 14 };

  // ── Cross-tab: checklist renewal ─────────────────────────────────────────
  const [checklistRenewal, setChecklistRenewal] = useState<{ daysLeft: number | null } | null>(null);
  // ── Cross-tab: property data from other tabs ─────────────────────────────
  const [scanned, setScanned] = useState<PropertyInsurance | null>(null);
  const [crossProperty, setCrossProperty] = useState<{
    sqm?: string; zone?: string; floor?: string; age?: string;
    propValue?: string; contentValue?: string; city?: string;
    propertyType?: string; isRented?: boolean;
    // Από πού ήρθαν τα τετραγωνικά, ώστε η ένδειξη προσυμπλήρωσης να λέει την
    // πραγματική πηγή. Έλεγε πάντα «από ΕΝΦΙΑ» — που ήταν και η μόνη πηγή που
    // δούλευε, αφού το ακίνητο διαβαζόταν από ανύπαρκτο πίνακα.
    sqmFrom?: 'enfia' | 'property';
    // Τα τέσσερα που κρίνουν την πρόταση, και που δεν φορτώνονταν ποτέ.
    yearBuilt?: number | null;
    rentalMode?: 'long_term' | 'short_term' | '';
    furnished?: boolean;
    hasLoan?: boolean;
    monthlyRent?: number | null;
  }>({});
  const [calendarSynced, setCalendarSynced] = useState(false);
  // ── Live quotes state ─────────────────────────────────────────────────────
  const [liveQuotes,      setLiveQuotes]      = useState<LiveQuote[]>([]);
  const [quotesLoading,   setQuotesLoading]   = useState(false);
  const [quotesFilter,    setQuotesFilter]    = useState<QuoteFilter>('all');
  const [showQuotes,      setShowQuotes]      = useState(false);
  const quotesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      try {
        const { data: chk } = await supabase.from('checklist_items').select('status,due_date').eq('property_id', propertyId).ilike('description', '%ασφαλιστήριο%').limit(1);
        if (chk?.[0]) setChecklistRenewal({ daysLeft: chk[0].due_date ? daysUntil(chk[0].due_date) ?? 0 : null });

        // Property data from services (ΕΝΦΙΑ has sqm, zone, floor, age)
        const { data: svc } = await supabase.from('bills_settings').select('data').eq('property_id', propertyId).eq('section', 'services').maybeSingle();
        // ΤΟ ΑΚΙΝΗΤΟ ΔΕΝ ΔΙΑΒΑΖΟΤΑΝ ΠΟΤΕ. Η ερώτηση πήγαινε στον πίνακα
        // `properties`, που δεν υπάρχει στη βάση — τα ακίνητα ζουν στο
        // `user_properties`. Γύριζε πάντα σφάλμα, οπότε τα τετραγωνικά και η
        // περιοχή έμεναν άδεια και η οθόνη ζητούσε από τον ιδιοκτήτη να
        // ξαναγράψει στοιχεία που το ακίνητό του ήδη είχε καταχωρημένα.
        //
        // Δεύτερη αιτία της ίδιας ζημιάς: ζητούνταν οι στήλες `city` και
        // `furnished`, που ούτε αυτές υπάρχουν στο σχήμα. Μία ανύπαρκτη στήλη
        // ρίχνει ΟΛΟΚΛΗΡΟ το select, άρα μαζί τους χανόταν και το έτος
        // κατασκευής και ο τρόπος εκμετάλλευσης — ακριβώς τα δεδομένα πάνω στα
        // οποία στηρίζεται η πρόταση ασφάλισης. Η περιοχή έρχεται τώρα από τη
        // διεύθυνση, και το «επιπλωμένο» από τη μίσθωση, όπου όντως ζει.
        const [{ data: prop }, { data: loans }, { data: tenants }] = await Promise.all([
          supabase.from('user_properties')
            .select('address,sqm,prop_type,status_detail,year_built,rental_mode,target_rent,insurance_company,insurance_expiry,insurance_amount')
            .eq('id', propertyId).maybeSingle(),
          supabase.from('loans').select('status').eq('property_id', propertyId),
          supabase.from('tenants').select('monthly_rent,status,move_out_date,furnishing').eq('property_id', propertyId),
        ]);
        const activeLoan = (loans ?? []).some(l => (l as { status?: string }).status !== 'closed' && (l as { status?: string }).status !== 'inactive');
        const activeTenants = (tenants ?? [])
          .filter(t => (t as { status?: string }).status !== 'past' && !(t as { move_out_date?: string }).move_out_date);
        const activeRent = activeTenants
          .reduce((s, t) => s + (Number((t as { monthly_rent?: number }).monthly_rent) || 0), 0);
        const isFurnished = activeTenants.some(t => {
          const f = (t as { furnishing?: string }).furnishing;
          return f === 'furnished' || f === 'turnkey';
        });
        const p = (prop ?? {}) as {
          address?: string; sqm?: number; prop_type?: string; status_detail?: string;
          year_built?: number; rental_mode?: string; target_rent?: number;
          insurance_company?: string | null; insurance_expiry?: string | null; insurance_amount?: number | null;
        };
        // ΤΟ ΣΑΡΩΜΕΝΟ ΑΣΦΑΛΙΣΤΗΡΙΟ ΦΤΑΝΕΙ ΕΠΙΤΕΛΟΥΣ ΕΔΩ. Η σάρωση διάβαζε
        // ασφαλιστική, ασφάλιστρο και λήξη από τη φωτογραφία και τα έγραφε στο
        // ακίνητο· η οθόνη διάβαζε άλλο αποθετήριο και ζητούσε τα ίδια στοιχεία
        // ξανά, με το χέρι. Οι κανόνες ζουν στο `lib/insurance/seed.ts` με tests:
        // ό,τι έχει πειράξει ο ιδιοκτήτης μένει ανέπαφο, ό,τι είναι ακόμη στην
        // προεπιλογή συμπληρώνεται από το συμβόλαιό του.
        setScanned({
          insurance_company: p.insurance_company ?? null,
          insurance_expiry: p.insurance_expiry ?? null,
          insurance_amount: p.insurance_amount ?? null,
        });
        if (svc?.data || prop) {
          // Τα διασταυρούμενα στοιχεία έρχονται από τις ρυθμίσεις ΕΝΦΙΑ, όπου το `data`
        // είναι ελεύθερο jsonb. Δηλώνονται όσα πεδία διαβάζονται, και μόνο αυτά.
        const d = (svc?.data ?? {}) as { enfiaSqm?: string; enfiaZone?: string; enfiaFloor?: string; enfiaAge?: string };
          const propSqm = p.sqm ? String(p.sqm) : '';
          setCrossProperty({
            sqm:          d.enfiaSqm       || propSqm         || '',
            sqmFrom:      d.enfiaSqm ? 'enfia' : propSqm ? 'property' : undefined,
            zone:         d.enfiaZone      || '',
            floor:        d.enfiaFloor     || 'second',
            age:          d.enfiaAge       || 'y10_14',
            city:         p.address        || '',
            propertyType: p.prop_type      || '',
            isRented:     p.status_detail === 'rented',
            yearBuilt:    Number(p.year_built) || null,
            rentalMode:   p.rental_mode === 'long_term' || p.rental_mode === 'short_term' ? p.rental_mode : '',
            furnished:    isFurnished,
            hasLoan:      activeLoan,
            monthlyRent:  activeRent || Number(p.target_rent) || null,
          });
        }
      } catch (_) {}
    })();
  }, [propertyId]);

  const [ps, updPs, loading] = useBillsSettings(propertyId, userId, 'insurance', {
    // ΚΑΜΙΑ ΠΡΟΕΠΙΛΕΓΜΕΝΗ ΑΣΦΑΛΙΣΤΙΚΗ. Ήταν 'hellas_direct'/'hd_full': ένας
    // ιδιοκτήτης που δεν είχε ασφαλίσει ποτέ το ακίνητό του έβλεπε συγκεκριμένη
    // εταιρεία ήδη επιλεγμένη ως «τρέχον πρόγραμμα», με το ασφάλιστρο ΕΚΕΙΝΗΣ
    // να μετράει στα σύνολα της οθόνης. Το άγνωστο εμφανιζόταν ως γεγονός, και
    // μάλιστα ως εμπορική επιλογή που κανείς δεν έκανε.
    insProvider: '', insPlanId: '',
    insCustomPrice: '', insCustomPlanName: '',
    insAgentName: '', insAgentPhone: '', insRenewalDate: '',
    insPropValue: '', insContentValue: '',
    insCustomCovers: '', insEditCovers: false,
    insCustomEarthquake: false, insCustomFlood: false, insCustomNatural: false,
    // NEW: property details for live quotes
    insSqm: '', insFloor: 'second', insAge: 'y10_14', insCity: '',
    activeStreaming: [] as StreamingEntry[],
    activeCloud:     [] as CloudEntry[],
    otherSubs:       [] as OtherSub[],
  });

  const {
    insProvider, insPlanId, insCustomPrice, insAgentName, insAgentPhone,
    insRenewalDate, insPropValue, insContentValue, insCustomCovers, insEditCovers,
    insCustomEarthquake, insCustomFlood, insCustomNatural,
    insSqm, insFloor, insAge, insCity,
    activeStreaming, activeCloud, otherSubs,
  } = ps;

  // Οι ρυθμίσεις ασφάλισης έχουν σχήμα, και το `u` το σέβεται: μια ορθογραφία σε
// όνομα πεδίου γίνεται σφάλμα μεταγλώττισης αντί για ρύθμιση που δεν ισχύει ποτέ.
type InsuranceSettings = typeof ps;
const u = (patch: Partial<InsuranceSettings>) => updPs(patch);

  // ── Η ΣΥΜΠΛΗΡΩΣΗ ΑΠΟ ΤΟ ΣΑΡΩΜΕΝΟ ΣΥΜΒΟΛΑΙΟ ────────────────────────────────
  // Τρέχει ΜΙΑ φορά, όταν φτάσουν και τα δύο (ρυθμίσεις και ακίνητο), και μόνο
  // αν έχει κάτι να γράψει. Η `seedInsurance` επιστρέφει κενό αντικείμενο όταν
  // δεν αλλάζει τίποτα — μια περιττή εγγραφή σε κάθε φόρτωση δεν είναι αθώα:
  // γεννά συμβάν realtime που ξαναφορτώνει την ίδια οθόνη, σε βρόχο.
  const seededRef = useRef(false);
  useEffect(() => {
    if (loading || !scanned || seededRef.current) return;
    const patch = seedInsurance(ps, scanned, { insProvider: 'hellas_direct' },
      INSURANCE_COMPANIES.map(c => ({ value: c.value, label: c.label })));
    seededRef.current = true;
    if (Object.keys(patch).length) updPs(patch);
  }, [loading, scanned, ps, updPs]);

  // Αυτόματη συμπλήρωση από άλλες καρτέλες, όταν δεν το έχει ορίσει ο χρήστης
  const effectiveSqm    = insSqm    || crossProperty.sqm    || '';
  const effectiveFloor  = insFloor  || crossProperty.floor  || 'second';
  const effectiveAge    = insAge    || crossProperty.age    || 'y10_14';
  const effectiveCity   = insCity   || crossProperty.city   || '';

  // ── Live quotes computation (debounced) ──────────────────────────────────
  useEffect(() => {
    const sqm    = parseFloat(effectiveSqm)   || 0;
    const pVal   = parseFloat(insPropValue)   || 0;
    const cVal   = parseFloat(insContentValue)|| 0;

    if (!sqm || !pVal) { setLiveQuotes([]); return; }

    if (quotesTimer.current) clearTimeout(quotesTimer.current);
    setQuotesLoading(true);
    // Μικρή καθυστέρηση επειδή ο χρήστης πληκτρολογεί, ΟΧΙ για να μιμηθεί
    // κλήση σε διακομιστή. Ο παλιός κώδικας περίμενε 800ms με τη σημείωση
    // «Simulate API latency»: έδειχνε στον χρήστη ότι κάτι ρωτιέται κάπου, ενώ
    // ο υπολογισμός γινόταν τοπικά. Το ψεύτικο περίμενε είναι ψέμα στην οθόνη.
    quotesTimer.current = setTimeout(() => {
      const quotes = computeLiveQuotes(sqm, pVal, cVal, effectiveFloor, effectiveAge);
      const currentMonthly = parseFloat(insCustomPrice) || (insCompany?.plans ?? []).find(p => p.id === insPlanId)?.monthly || 0;
      const withSavings = quotes.map(q => ({ ...q, savings: currentMonthly > 0 ? currentMonthly - q.monthlyEstimate : undefined }));
      setLiveQuotes(withSavings);
      setQuotesLoading(false);
    }, 250);

    return () => { if (quotesTimer.current) clearTimeout(quotesTimer.current); };
  }, [effectiveSqm, insPropValue, insContentValue, effectiveFloor, effectiveAge, insCustomPrice, insPlanId]);

  const insCompany = INSURANCE_COMPANIES.find(c => c.value === insProvider);
  const insPlan    = (insCompany?.plans ?? []).find(p => p.id === insPlanId);
  const insCost    = parseFloat(insCustomPrice) || insPlan?.monthly || 0;
  /** Ξέρουμε ασφάλιστρο; Χωρίς αυτό, το «0,00 €» θα σήμαινε «δεν πληρώνω». */
  const hasPolicy  = insCost > 0;

  const effectiveCovers     = insEditCovers && insCustomCovers ? insCustomCovers.split(',').map(s => s.trim()).filter(Boolean) : (insPlan?.covers || []);
  const effectiveEarthquake = insEditCovers ? insCustomEarthquake : (insPlan?.earthquake || false);
  const effectiveFloodState = insEditCovers ? insCustomFlood      : (insPlan?.flood      || false);
  const effectiveNatural    = insEditCovers ? insCustomNatural    : (insPlan?.natural    || false);

  const streamingCost = (activeStreaming || []).reduce((s, a) => {
    const svc  = STREAMING.find(x => x.value === a.service);
    const plan = svc?.plans.find(p => p.id === a.planId);
    const base = parseFloat(a.customPrice) || plan?.price || 0;
    return s + (a.splitActive && a.splitPeople > 1 ? base / a.splitPeople : base);
  }, 0);
  const cloudCost = (activeCloud || []).reduce((s, a) => {
    const svc  = CLOUD.find(x => x.value === a.service);
    const plan = svc?.plans.find(p => p.id === a.planId);
    const base = parseFloat(a.customPrice) || plan?.price || 0;
    return s + (a.splitActive && a.splitPeople > 1 ? base / a.splitPeople : base);
  }, 0);
  const otherCost = (otherSubs || []).reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
  const total     = insCost + streamingCost + cloudCost + otherCost;

  const renewalAlerts: { name: string; daysLeft: number; type: 'danger'|'warning'|'info' }[] = [];
  const checkRenewal = (name: string, dateStr: string, days: number) => {
    if (!dateStr) return;
    const diff = daysUntil(dateStr) ?? 0;
    if (diff >= 0 && diff <= days) renewalAlerts.push({ name, daysLeft: diff, type: diff <= 3 ? 'danger' : diff <= 7 ? 'warning' : 'info' });
  };
  if (insRenewalDate) checkRenewal(`Ασφάλεια κατοικίας (${insCompany?.label})`, insRenewalDate, 60);
  (activeStreaming || []).forEach(a => { const svc = STREAMING.find(x => x.value === a.service); if (a.renewalDate) checkRenewal(svc?.label || a.service, a.renewalDate, 5); });
  (otherSubs || []).forEach(s => { if (s.renewalDate) checkRenewal(s.name, s.renewalDate, 7); });

  // ── Auto-detect insurance property type από property settings ──────────────
  // prop_type στη βάση είναι ελληνικό label (π.χ. 'Κατοικία', 'Επαγγελματικό Ακίνητο')
  // status_detail === 'rented' σημαίνει ενοικιαζόμενο, αυτό υπερισχύει του prop_type
  const detectedPropertyType = crossProperty.isRented
    ? 'Ενοικιαζόμενη'
    : crossProperty.propertyType === 'Κατοικία'
      ? 'Κύρια Κατοικία'
      : crossProperty.propertyType === 'Εξοχική Κατοικία'
        ? 'Εξοχική Κατοικία'
        : crossProperty.propertyType === 'Επαγγελματικό Ακίνητο'
          ? null  // δεν φιλτράρουμε ασφάλειες κατοικίας για επαγγελματικά ακίνητα
          : null;

  // ── Φιλτράρισμα εταιρειών βάσει πραγματικού τύπου ακινήτου ─────────────────
  const relevantCompanies = detectedPropertyType
    ? INSURANCE_COMPANIES.filter(c => !c.propertyTypes || c.propertyTypes.includes(detectedPropertyType))
    : INSURANCE_COMPANIES;

  const insOptions     = relevantCompanies.filter(c => c.value && c.label).map(c => ({ value: c.value!, label: c.label! }));
  const insPlanOptions = (insCompany?.plans ?? []).map(p => ({ value: p.id, label: `${p.name}, ~${p.monthly > 0 ? `${fe(p.monthly, 2)}` : 'Χειροκίνητο'}` }));

  // ── Sync-back στο ακίνητο: μία πηγή αλήθειας για το υπόλοιπο app ──────────
  // Η κάρτα ακινήτου διαβάζει insurance_company / insurance_amount /
  // insurance_expiry από το ίδιο το ακίνητο.
  //
  // ΤΙ ΠΗΓΑΙΝΕ ΣΤΡΑΒΑ: το γράψιμο πήγαινε στον πίνακα `properties`, που δεν
  // υπάρχει, και το αποτέλεσμα δεν ελεγχόταν ποτέ (`.then(() => {})`). Το
  // σφάλμα καταπινόταν αθόρυβα: ο ιδιοκτήτης καταχωρούσε ημερομηνία λήξης
  // ασφαλιστηρίου, η οθόνη συμπεριφερόταν σαν να αποθηκεύτηκε, και η λήξη δεν
  // έφτανε ποτέ στο ακίνητο. Καμία υπενθύμιση, καμία ένδειξη ότι κάτι χάθηκε.
  //
  // Ο έλεγχος `loading` δεν είναι διακοσμητικός: όσο φορτώνουν οι ρυθμίσεις το
  // `ps` κρατά τις ΠΡΟΕΠΙΛΟΓΕΣ (Hellas Direct, χωρίς ημερομηνία). Τώρα που το
  // γράψιμο πιάνει στ' αλήθεια, ένα sync μέσα σε εκείνο το παράθυρο θα έσβηνε
  // την πραγματική ασφαλιστική και τη λήξη του χρήστη με τις προεπιλογές.
  const [syncError, setSyncError] = useState(false);
  const propertySyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── ΓΡΑΦΟΥΜΕ ΜΟΝΟ ΟΤΑΝ ΑΛΛΑΞΕ ΚΑΤΙ ΠΡΑΓΜΑΤΙΚΑ ──────────────────────────────
  //
  // Ο έλεγχος `loading` ΔΕΝ αρκεί, και παραλίγο να κοστίσει δεδομένα χρήστη.
  // Το BillsSettings, όταν η ανάγνωση των ρυθμίσεων ΑΠΟΤΥΧΕΙ, δεν διαβάζει το
  // σφάλμα: πέφτει στις προεπιλογές και θέτει loading=false. Δηλαδή «απέτυχε η
  // ανάγνωση» και «δεν υπάρχει γραμμή» καταλήγουν στην ΙΔΙΑ κατάσταση.
  //
  // Με φύλακα μόνο το `loading`, 1,2 δευτερόλεπτα μετά το άνοιγμα της καρτέλας
  // το effect θα έγραφε «Hellas Direct», 8,50 € και ΚΕΝΗ ημερομηνία λήξης πάνω
  // από την πραγματική ασφαλιστική του χρήστη — σιωπηλά, χωρίς καμία ενέργειά
  // του. Θα έσβηνε μαζί και την υποχρέωση και το insight που διαβάζουν το
  // insurance_expiry, δηλαδή ΑΚΡΙΒΩΣ την υπενθύμιση που αυτή η διόρθωση
  // υποτίθεται ότι αποκατέστησε.
  //
  // Η υπογραφή της φορτωμένης κατάστασης κρατιέται μόλις τελειώσει η φόρτωση.
  // Όσο η τρέχουσα τιμή είναι ίδια με εκείνη, δεν υπάρχει τίποτα να γραφτεί —
  // ούτε όταν αυτή προήλθε από προεπιλογές μετά από αποτυχία. Γράφουμε μόνο
  // όταν ο χρήστης άλλαξε κάτι, που είναι και το μόνο που θέλαμε ποτέ.
  const insSignature = `${insCompany?.label ?? ''}|${insCost}|${insRenewalDate ?? ''}`;
  const loadedSignature = useRef<string | null>(null);
  useEffect(() => {
    if (loading) { loadedSignature.current = null; return; }
    if (loadedSignature.current === null) loadedSignature.current = insSignature;
  }, [loading, insSignature]);

  useEffect(() => {
    if (!propertyId || loading) return;
    if (loadedSignature.current === null) return;        // δεν κατοχυρώθηκε ακόμη βάση
    if (insSignature === loadedSignature.current) return; // τίποτα δεν άλλαξε
    if (propertySyncTimer.current) clearTimeout(propertySyncTimer.current);
    propertySyncTimer.current = setTimeout(async () => {
      // ΓΡΑΦΟΥΜΕ ΜΟΝΟ Ο,ΤΙ ΞΕΡΟΥΜΕ, ΠΟΤΕ null ΠΑΝΩ ΑΠΟ ΥΠΑΡΧΟΥΣΑ ΤΙΜΗ.
      //
      // Ο ΚΙΝΔΥΝΟΣ, ΣΥΓΚΕΚΡΙΜΕΝΑ: όταν το σαρωμένο ασφαλιστήριο ανήκει σε
      // εταιρεία ΕΚΤΟΣ καταλόγου, η αυτόματη συμπλήρωση κρατά το όνομα από το
      // χαρτί αλλά δεν επιλέγει `insProvider` — άρα το `insCompany` μένει κενό.
      // Ταυτόχρονα συμπληρώνει ασφάλιστρο και ημερομηνία, οπότε η υπογραφή
      // αλλάζει και ο συγχρονισμός ενεργοποιείται. Με σταθερό `?? null` θα
      // έγραφε κενή ασφαλιστική ΠΑΝΩ από το όνομα που μόλις διάβασε η σάρωση:
      // η εφαρμογή θα έσβηνε μόνη της αυτό που μόλις έμαθε.
      const patch: Record<string, string | number> = {};
      if (insCompany?.label) patch.insurance_company = insCompany.label;
      if (insCost > 0) patch.insurance_amount = insCost;
      if (insRenewalDate) patch.insurance_expiry = insRenewalDate;
      if (!Object.keys(patch).length) return;
      const { error } = await supabase.from('user_properties').update(patch).eq('id', propertyId);
      setSyncError(!!error);
    }, 1200); // debounce, αποφυγή write σε κάθε keystroke
    return () => { if (propertySyncTimer.current) clearTimeout(propertySyncTimer.current); };
  }, [propertyId, loading, insSignature, insCompany?.label, insCost, insRenewalDate]);

  // ── Auto-sync ανανέωσης ασφάλειας → calendar_events ──────────────────────────
  useEffect(() => {
    if (!propertyId || !insRenewalDate || calendarSynced) return;
    (async () => {
      const { data: existing } = await supabase
        .from('calendar_events')
        .select('id')
        .eq('property_id', propertyId)
        .eq('category', 'insurance_renewal')
        .eq('event_date', insRenewalDate)
        .limit(1);
      if (existing?.length) { setCalendarSynced(true); return; }

      // Το `.then(() => setCalendarSynced(true))` δήλωνε «καταχωρήθηκε» ακόμη κι
      // όταν το insert γύριζε σφάλμα. Η υπενθύμιση μαρκαριζόταν ως συγχρονισμένη
      // και δεν ξαναδοκίμαζε ποτέ, οπότε ο ιδιοκτήτης δεν έπαιρνε ειδοποίηση
      // λήξης — ούτε μάθαινε ποτέ ότι δεν πρόκειται να την πάρει.
      const { error } = await supabase.from('calendar_events').insert({
        property_id: propertyId,
        user_id: userId,
        title: `Ανανέωση Ασφάλειας Κατοικίας, ${insCompany?.label ?? ''}`,
        category: 'insurance_renewal',
        event_date: insRenewalDate,
        amount: insCost > 0 ? insCost : null,
        priority: 'medium',
        status: 'pending',
        recurring: false,
        notes: `Πρόγραμμα: ${(insCompany?.plans ?? []).find(p => p.id === insPlanId)?.name ?? ''}. Σύγκρινε εναλλακτικές πριν ανανεώσεις.`,
        source: 'system',
      });
      if (!error) setCalendarSynced(true);
    })();
  }, [propertyId, insRenewalDate]);

  // ── ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΑΥΤΟ ΤΟ ΑΚΙΝΗΤΟ ────────────────────────────────────────
  // Οι ανάγκες βγαίνουν από όσα ξέρουμε γι' αυτό το συγκεκριμένο ακίνητο, με
  // γραμμένη την αιτιολογία της καθεμιάς. Όπου το δεδομένο λείπει, η ανάγκη δεν
  // ανεβαίνει σε «απαραίτητη»: δεν φτιάχνουμε επείγον από άγνοια.
  const risk: PropertyRisk = {
    sqm: parseFloat(effectiveSqm) || null,
    buildYear: crossProperty.yearBuilt ?? null,
    floor: effectiveFloor === 'basement' ? 'basement'
      : effectiveFloor === 'ground' ? 'ground'
      : effectiveFloor === 'top' ? 'top' : 'mid',
    hasLoan: !!crossProperty.hasLoan,
    rentalMode: crossProperty.rentalMode ?? '',
    furnished: !!crossProperty.furnished,
    contentsValue: parseFloat(insContentValue) || null,
    monthlyRent: crossProperty.monthlyRent ?? null,
  };
  const needs = assessNeeds(risk);

  // Η ΚΑΤΑΤΑΞΗ: πρώτα καταλληλότητα, μετά τιμή. Ένα πρόγραμμα που δεν καλύπτει
  // σεισμό, σε ακίνητο με δάνειο, δεν είναι φθηνό. Είναι άχρηστο, γιατί η
  // τράπεζα δεν το δέχεται.
  const ranked = matchPlans(
    liveQuotes.map(q => ({
      id: q.plan, name: q.planLabel, company: q.company, companyLabel: q.companyLabel,
      monthly: q.monthlyEstimate, annual: q.annualEstimate,
      earthquake: q.earthquake, flood: q.flood, covers: q.covers, url: q.url,
    })),
    needs,
  );
  const quoteOf = (id: string) => liveQuotes.find(q => q.plan === id)!;
  const orderedQuotes = ranked.map(r => quoteOf(r.plan.id)).filter(Boolean);
  const matchOf = new Map(ranked.map(r => [r.plan.id, r]));

  const filteredQuotes = orderedQuotes.filter(q =>
    quotesFilter === 'all'       ? true :
    quotesFilter === 'earthquake' ? q.earthquake :
    quotesFilter === 'flood'      ? q.flood :
    quotesFilter === 'natural'    ? q.natural : true
  );

  // Η πρόταση, με τον λόγο της γραμμένο. Ο χρήστης αποφασίζει, αλλά οφείλει να
  // έχει τα στοιχεία για να διαφωνήσει τεκμηριωμένα.
  // Η ΠΡΟΤΑΣΗ ΔΕΣΜΕΥΕΙ ΓΙΑ ΕΝΑΝ ΧΡΟΝΟ. Σε ασφάλιστρα καταλόγου που έχουν
  // παλιώσει, το «ΠΡΟΤΕΙΝΟΜΕΝΟ ΓΙΑ ΕΣΕΝΑ» είναι υπόσχεση που δεν στέκει.
  const insFresh = freshness(INSURANCE_VERIFIED, new Date(), INSURANCE_MAX_AGE_DAYS);
  const recommended: { q: LiveQuote; reason: string } | null = !insFresh.canRank ? null :
    ranked.length ? { q: quoteOf(ranked[0].plan.id), reason: explain(ranked[0], ranked, needs) } : null;

  const toggleStreaming = (svc: string) => {
    if ((activeStreaming || []).find(a => a.service === svc)) {
      u({ activeStreaming: (activeStreaming || []).filter(a => a.service !== svc) });
    } else {
      const s = STREAMING.find(x => x.value === svc);
      u({ activeStreaming: [...(activeStreaming || []), { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 2, splitActive: false, renewalDate: '' }] });
    }
  };
  const updateS = <K extends keyof SubscriptionEntry>(svc: string, field: K, val: SubscriptionEntry[K]) =>
    u({ activeStreaming: (activeStreaming || []).map(a => a.service === svc ? { ...a, [field]: val } : a) });

  const toggleCloud = (svc: string) => {
    if ((activeCloud || []).find(a => a.service === svc)) {
      u({ activeCloud: (activeCloud || []).filter(a => a.service !== svc) });
    } else {
      const s = CLOUD.find(x => x.value === svc);
      u({ activeCloud: [...(activeCloud || []), { service: svc, planId: s?.plans[0].id || '', customPrice: '', splitPeople: 2, splitActive: false, renewalDate: '' }] });
    }
  };
  const updateC = <K extends keyof SubscriptionEntry>(svc: string, field: K, val: SubscriptionEntry[K]) =>
    u({ activeCloud: (activeCloud || []).map(a => a.service === svc ? { ...a, [field]: val } : a) });

  const [newSubName, setNewSubName] = useState('');
  const [newSubPrice, setNewSubPrice] = useState('');
  const [newSubRenewal, setNewSubRenewal] = useState('');

  const secHdr = (label: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingBottom: 10, borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>{label}</span>
    </div>
  );

  // Πριν, όσο φόρτωναν οι ρυθμίσεις η καρτέλα έδειχνε ΤΙΠΟΤΑ ενδεικτικό: τα πεδία
  // εμφανίζονταν άδεια και μετά γέμιζαν απότομα, σαν να έσβησε κάτι ο χρήστης.
  if (loading) return (
    <div style={{ fontFamily: T.font.sans }}>
      <SkeletonKPIs n={3} />
      {[0, 1].map(i => <Skeleton key={i} h={120} r={14} style={{ marginBottom: 12 }} />)}
    </div>
  );

  return (
    <div style={{ fontFamily: T.font.sans, color: 'var(--text-primary)' }}>

      {/* ── Checklist renewal banner ──────────────────────────────────────── */}
      {checklistRenewal && checklistRenewal.daysLeft !== null && checklistRenewal.daysLeft <= 60 && (
        <div style={{ background: checklistRenewal.daysLeft <= 7 ? 'var(--negative-soft)' : 'var(--warning-soft)', border: `1px solid ${checklistRenewal.daysLeft <= 7 ? 'var(--negative-border)' : 'var(--warning-border)'}`, borderRadius: T.radius.inner, padding: '11px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: checklistRenewal.daysLeft <= 7 ? 'var(--negative)' : 'var(--warning)', flexShrink: 0 }}/>
          <div style={{ flex: 1, fontSize: 12, fontFamily: T.font.sans }}>
            <span style={{ fontWeight: 700, color: checklistRenewal.daysLeft <= 7 ? 'var(--negative)' : 'var(--warning)' }}>Ανανέωση ασφαλιστηρίου </span>
            <span style={{ color: 'var(--text-secondary)' }}>{checklistRenewal.daysLeft <= 0 ? 'έχει λήξει' : `σε ${checklistRenewal.daysLeft} ημέρες`}</span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 10px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>Checklist</span>
        </div>
      )}

      {/* ── Auto-detected property type banner ──────────────────────────── */}
      {detectedPropertyType && (
        <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Ανιχνεύθηκε τύπος ακινήτου: <strong style={{ color: 'var(--accent)' }}>{detectedPropertyType}</strong>, εμφανίζονται {insOptions.length} σχετικές ασφαλιστικές εταιρείες.
          </span>
        </div>
      )}

      {/* ── Standalone coverage gap notification (σεισμός/πλημμύρα) ───────── */}
      {insCompany && (() => {
        const hasEq = effectiveEarthquake;
        const hasFl = effectiveFloodState;
        if (hasEq && hasFl) return null;
        return (
          <div style={{ background: 'var(--warning-soft)', border: '1px solid var(--warning-border)', borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }}/>
            <span style={{ color: 'var(--text-secondary)' }}>
              {!hasEq && !hasFl ? 'Το πρόγραμμά σου δεν καλύπτει σεισμό ούτε πλημμύρα.' : !hasEq ? 'Το πρόγραμμά σου δεν καλύπτει σεισμό.' : 'Το πρόγραμμά σου δεν καλύπτει πλημμύρα.'}
              {' '}Εξετάστε αναβάθμιση κάλυψης.
            </span>
          </div>
        );
      })()}

      {/* Αν η ασφάλεια δεν έφτασε στο ακίνητο, ο χρήστης πρέπει να το μάθει από
          την οθόνη. Πριν, η αποτυχία ήταν αόρατη και η υπενθύμιση λήξης απλώς
          δεν ερχόταν ποτέ. */}
      {syncError && (
        <InfoBanner tone="warning">
          Τα στοιχεία ασφάλισης δεν αποθηκεύτηκαν στο ακίνητο. Η υπενθύμιση λήξης δεν θα λειτουργήσει μέχρι να ξαναδοκιμάσεις.
        </InfoBanner>
      )}

      {/* ── Renewal alerts ──────────────────────────────────────────────── */}
      {renewalAlerts.map((a, i) => (
        <div key={i} style={{ background: a.type === 'danger' ? 'var(--negative-soft)' : a.type === 'warning' ? 'var(--warning-soft)' : 'var(--accent-soft)', border: `1px solid ${a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--accent)'}`, borderRadius: T.radius.inner, padding: '10px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: T.font.sans }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.type === 'danger' ? 'var(--negative)' : a.type === 'warning' ? 'var(--warning)' : 'var(--accent)', flexShrink: 0 }}/>
          <strong>{a.name}</strong>: {a.daysLeft === 0 ? 'Λήγει ΣΗΜΕΡΑ' : `Λήγει σε ${a.daysLeft} ημέρες`}
        </div>
      ))}

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Ασφάλεια Κατοικίας', value: hasPolicy ? fe(insCost) : ABSENT_SHORT },
          { label: 'Streaming & Media',   value: fe(streamingCost) },
          { label: 'Cloud & Λογισμικό',   value: fe(cloudCost)     },
          { label: 'Σύνολο / μήνα',       value: fe(total)         },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: '16px 18px' }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 10, fontFamily: T.font.sans }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: i === 3 && total > 0 ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── Ασφάλεια Κατοικίας ───────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Ασφάλεια κατοικίας')}

        {/* ── Property details for live quotes ──────────────────────────── */}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>
            Στοιχεία Ακινήτου, για Συγκριτική Εκτίμηση Ασφαλίστρων
          </div>
          {crossProperty.sqm && !insSqm && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 8 }}>
              ✓ Τα στοιχεία συμπληρώθηκαν αυτόματα από {crossProperty.sqmFrom === 'property' ? 'την καρτέλα του ακινήτου' : 'tab Υπηρεσίες (ΕΝΦΙΑ)'}, μπορείς να τα επεξεργαστείς
            </div>
          )}
          {/* FIX: 2+2 grid, Πόλη label doesn't overflow */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
            <NumberInput label="Εμβαδόν"       value={effectiveSqm}    onChange={v => u({ insSqm: v })}          suffix="τετραγωνικά" step={5}/>
            <TextInput   label="Πόλη ή περιοχή"         value={effectiveCity}   onChange={v => u({ insCity: v })}         placeholder="Παράδειγμα: Αθήνα, Θεσσαλονίκη…"/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
            <NumberInput label="Αξία κτηρίου"      value={insPropValue}    onChange={v => u({ insPropValue: v })}    suffix="€" step={5000}/>
            <NumberInput label="Αξία περιεχομένου" value={insContentValue} onChange={v => u({ insContentValue: v })} suffix="€" step={1000}/>
          </div>
        </div>

        {/* ── Live Quotes Engine ────────────────────────────────────────── */}
        {(parseFloat(effectiveSqm) > 0 && parseFloat(insPropValue) > 0) && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: quotesLoading ? 'var(--text-tertiary)' : liveQuotes.length > 0 ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0, transition: 'background 0.3s' }}/>
                <span title="Εκτιμήσεις ασφαλίστρων ανά εταιρεία και πρόγραμμα" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>
                  {quotesLoading
                    ? 'Υπολογισμός…'
                    : `${liveQuotes.length} προγράμματα από ${distinctInsurers(liveQuotes.map(q => q.company))} ασφαλιστικές`}
                </span>
                {/* Η λέξη «ενδεικτικές» δεν είναι νομικίστικη προφύλαξη, είναι
                    η αλήθεια: πραγματική τιμή ασφάλισης κατοικίας δεν υπάρχει
                    δημοσιευμένη, παράγεται από τα στοιχεία του συγκεκριμένου
                    ακινήτου και προσώπου και τη δίνει μόνο η ασφαλιστική. */}
                <span style={{ fontSize: 9, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', padding: '2px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>
                  Ενδεικτικές τιμές, όχι προσφορές
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {QUOTE_FILTERS.map(f => (
                  <button key={f.key} onClick={() => setQuotesFilter(f.key)}
                    style={{ fontSize: 9, padding: '4px 10px', borderRadius: T.radius.pill, border: `1px solid ${quotesFilter === f.key ? 'var(--accent)' : 'var(--border-subtle)'}`, background: quotesFilter === f.key ? 'var(--accent-soft)' : 'transparent', color: quotesFilter === f.key ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: quotesFilter === f.key ? 700 : 400 }}>
                    {f.label}
                  </button>
                ))}
                <button onClick={() => setShowQuotes(v => !v)}
                  style={{ fontSize: 9, padding: '4px 10px', borderRadius: T.radius.pill, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: T.font.sans }}>
                  {showQuotes ? '▲ Σύμπτυξη' : '▼ Ανάπτυξη'}
                </button>
              </div>
            </div>

            {/* ── ΤΙ ΧΡΕΙΑΖΕΤΑΙ ΑΥΤΟ ΤΟ ΑΚΙΝΗΤΟ ────────────────────────────
                Πριν από κάθε τιμή. Η κατάταξη βγαίνει από εδώ και ο χρήστης
                πρέπει να μπορεί να δει τα κριτήρια και να διαφωνήσει: αν η
                μηχανή λέει «απαραίτητος ο σεισμός επειδή έχεις δάνειο», αυτό
                είναι ελέγξιμο. Ένα σκορ χωρίς αιτιολογία δεν είναι. */}
            {!quotesLoading && needs.length > 0 && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.inner, padding: '12px 14px', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans, marginBottom: 8 }}>
                  Τι χρειάζεται αυτό το ακίνητο
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                  {needs.filter(n => n.weight === 'required' || n.weight === 'important').map(n => (
                    <div key={n.need} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 11, fontFamily: T.font.sans, lineHeight: 1.5 }}>
                      <span style={{
                        flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                        padding: '2px 7px', borderRadius: T.radius.pill,
                        color: n.weight === 'required' ? 'var(--accent-text)' : 'var(--text-secondary)',
                        background: n.weight === 'required' ? 'var(--accent)' : 'var(--bg-surface)',
                        border: n.weight === 'required' ? 'none' : '1px solid var(--border-subtle)',
                      }}>
                        {n.weight === 'required' ? 'ΑΠΑΡΑΙΤΗΤΟ' : 'ΚΑΛΟ ΝΑ ΥΠΑΡΧΕΙ'}
                      </span>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600, flexShrink: 0 }}>{NEED_LABEL[n.need]}</span>
                      <span style={{ color: 'var(--text-tertiary)', minWidth: 0 }}>{n.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Προτεινόμενο πρόγραμμα βάσει ακινήτου */}
            {!quotesLoading && recommended && (
              <div onClick={() => u({ insProvider: recommended.q.company, insPlanId: recommended.q.plan, insEditCovers: false })}
                style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.inner, padding: '10px 14px', marginBottom: 10, cursor: 'pointer' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-text)', background: 'var(--accent)', padding: '3px 8px', borderRadius: T.radius.pill, fontFamily: T.font.sans, whiteSpace: 'nowrap' as const, letterSpacing: '0.04em' }}>ΠΡΟΤΕΙΝΟΜΕΝΟ ΓΙΑ ΕΣΕΝΑ</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{recommended.q.companyLabel}, {recommended.q.planLabel}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{recommended.reason}</div>
                </div>
                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(recommended.q.monthlyEstimate)}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>εκτίμηση / μήνα</div>
                </div>
              </div>
            )}

            {!quotesLoading && filteredQuotes.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 8, marginBottom: showQuotes ? 12 : 0 }}>
                {filteredQuotes.slice(0, 3).map((q, i) => {
                  const isCurrent = q.company === insProvider && q.plan === insPlanId;
                  const isBest    = i === 0;
                  return (
                    <div key={q.plan}
                      onClick={() => { u({ insProvider: q.company, insPlanId: q.plan, insEditCovers: false }); }}
                      style={{ background: isCurrent ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1px solid ${isCurrent ? 'var(--accent)' : isBest ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 12, cursor: 'pointer', transition: 'all 0.15s', position: 'relative' as const }}>
                      {/* ΟΧΙ «ΚΑΛΥΤΕΡΗ ΤΙΜΗ». Η πρώτη θέση ανήκει στο πιο
                          ΚΑΤΑΛΛΗΛΟ, που συχνά δεν είναι το φθηνότερο. Η παλιά
                          ετικέτα έλεγε ψέματα για το ίδιο το κριτήριο. */}
                      {isBest && !isCurrent && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>ΚΑΤΑΛΛΗΛΟΤΕΡΟ</div>}
                      {isCurrent && <div style={{ position: 'absolute', top: 8, right: 8, fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', padding: '2px 6px', borderRadius: T.radius.pill, fontFamily: T.font.sans }}>ΤΡΕΧΟΝ</div>}
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.sans, marginBottom: 2 }}>{q.companyLabel}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginBottom: 8 }}>{q.planLabel}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: isCurrent ? 'var(--accent)' : isBest ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(q.monthlyEstimate)}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2 }}>εκτίμηση / μήνα</div>
                      {q.savings !== undefined && q.savings > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--text-secondary)', fontFamily: T.font.sans, marginTop: 4, fontWeight: 700 }}>Εξοικονόμηση {fe(q.savings)} τον μήνα</div>
                      )}
                      <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' as const }}>
                        {q.earthquake && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Σεισμός</span>}
                        {q.flood     && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Πλημμύρα</span>}
                        {q.natural   && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Φυσικές Καταστροφές</span>}
                      </div>
                      {/* ΤΙ ΤΟΥ ΛΕΙΠΕΙ, ΓΡΑΜΜΕΝΟ ΠΑΝΩ ΣΤΗΝ ΚΑΡΤΑ. Ένα φθηνό
                          πρόγραμμα χωρίς σεισμό δεν κρύβεται, αλλά ούτε
                          παρουσιάζεται σαν ισοδύναμο. */}
                      {(matchOf.get(q.plan)?.missingRequired.length ?? 0) > 0 && (
                        <div style={{ fontSize: 9, color: 'var(--negative)', fontFamily: T.font.sans, marginTop: 6, lineHeight: 1.4, fontWeight: 600 }}>
                          Δεν καλύπτει {matchOf.get(q.plan)!.missingRequired.map(n => NEED_LABEL[n].toLowerCase()).join(', ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {showQuotes && !quotesLoading && filteredQuotes.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 700 }}>
                  <thead>
                    <tr>{['Εταιρεία','Πρόγραμμα','Σεισμός','Πλημμύρα','Φυσικές Καταστροφές','Εκτιμώμενο Μηνιαίο','Εκτιμώμενο Ετήσιο','Εξοικονόμηση/μήνα'].map((h, i) => (
                      <th key={i} style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: 'var(--text-secondary)', padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left', fontWeight: 600, fontFamily: T.font.sans, background: 'var(--bg-elevated)', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {filteredQuotes.map(q => {
                      const isCur = q.company === insProvider && q.plan === insPlanId;
                      return (
                        <tr key={q.plan} onClick={() => { u({ insProvider: q.company, insPlanId: q.plan, insEditCovers: false }); }}
                          style={{ cursor: 'pointer', background: isCur ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.15s' }}>
                          <td style={{ padding: '6px 8px', fontWeight: isCur ? 700 : 400, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.sans }}>{q.companyLabel}{isCur ? ' ✓' : ''}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: T.font.sans, fontSize: 9 }}>{q.planLabel}</td>
                          <td style={{ padding: '6px 8px', color: q.earthquake ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.earthquake ? '✓' : '—'}</td>
                          <td style={{ padding: '6px 8px', color: q.flood     ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.flood     ? '✓' : '—'}</td>
                          <td style={{ padding: '6px 8px', color: q.natural   ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.natural   ? '✓' : '—'}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>{fe(q.monthlyEstimate)}</td>
                          <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 9, whiteSpace: 'nowrap' as const }}>{fe(q.annualEstimate)}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const, color: 'var(--text-secondary)' }}>
                            {q.savings !== undefined && q.savings !== 0 ? `${q.savings > 0 ? '+' : ''}${fe(q.savings)}` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{ marginTop: 8, fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans, background: 'var(--bg-elevated)', padding: '6px 12px', borderRadius: T.radius.badge }}>
                  * Εκτιμώμενες τιμές βάσει στοιχείων ακινήτου, Χρησιμοποίησε <a href="https://www.insurancemarket.gr/katoikia/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>insurancemarket.gr</a> για ακριβή προσφορά · Πάτα γραμμή για επιλογή
                </div>
              </div>
            )}
          </div>
        )}

        {(!parseFloat(effectiveSqm) || !parseFloat(insPropValue)) && (
          // Τα σκληροκωδικοποιημένα rgba(26,115,232,…) αγνοούσαν τα tokens: στο σκούρο
          // θέμα το πλαίσιο έμενε γαλάζιο-σε-γαλάζιο. Το InfoBanner παίρνει χρώμα από τον τόνο.
          <InfoBanner tone="info">Συμπλήρωσε εμβαδόν και αξία κτηρίου για συγκριτική εκτίμηση ασφαλίστρων.</InfoBanner>
        )}

        {/* ── Current plan selection ────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16, marginTop: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 12, fontFamily: T.font.sans }}>Τρέχον πρόγραμμα</div>
          <div style={g3}>
            <CustomSelect label="Ασφαλιστική εταιρεία" value={insProvider}
              onChange={v => { u({ insProvider: v, insEditCovers: false }); const c = INSURANCE_COMPANIES.find(x => x.value === v); if (c) u({ insPlanId: c.plans[0].id }); }}
              options={insOptions}/>
            <CustomSelect label="Πρόγραμμα ασφάλισης" value={insPlanId}
              onChange={v => u({ insPlanId: v, insEditCovers: false })}
              options={insPlanOptions}/>
            <NumberInput label="Πραγματικό κόστος τον μήνα" value={insCustomPrice} onChange={v => u({ insCustomPrice: v })} suffix="€" step={1}/>
          </div>
          <div style={g4}>
            <TextInput   label={insCompany?.agent_label || 'Ασφαλιστής'} value={insAgentName}    onChange={v => u({ insAgentName: v })}    placeholder="Ονοματεπώνυμο"/>
            <TextInput   label="Τηλέφωνο ασφαλιστή"                      value={insAgentPhone}   onChange={v => u({ insAgentPhone: v })}   placeholder="69xxxxxxxx"/>
            <DatePicker  label="Ημερομηνία ανανέωσης"                     value={insRenewalDate}  onChange={v => u({ insRenewalDate: v })}/>
            {insCompany?.url && (
              <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                <a href={insCompany.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.btn, padding: '9px 14px', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, fontFamily: T.font.sans }}>
                  Επίσημη σελίδα →
                </a>
              </div>
            )}
          </div>

          {insPlan && (
            <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, border: '1px solid var(--border-subtle)', marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Καλύψεις Προγράμματος</div>
                <button onClick={() => { u({ insEditCovers: !insEditCovers }); if (!insEditCovers) { u({ insCustomCovers: effectiveCovers.join(', '), insCustomEarthquake: effectiveEarthquake, insCustomFlood: effectiveFloodState, insCustomNatural: effectiveNatural }); } }}
                  style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: 600 }}>
                  {insEditCovers ? 'Αποθήκευση' : 'Επεξεργασία'}
                </button>
              </div>
              {/* Δυναμικός πίνακας καλύψεων, ✓/✗ αυτόματα βάσει επιλεγμένου προγράμματος */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, marginBottom: insEditCovers ? 12 : 0 }}>
                {deriveCoverages(effectiveCovers, effectiveEarthquake, effectiveFloodState, effectiveNatural).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: c.ok ? 'var(--accent-soft)' : 'var(--bg-base)', border: `1px solid ${c.ok ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.badge, padding: '6px 10px' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: c.ok ? 'var(--accent)' : 'var(--text-tertiary)', lineHeight: 1 }}>{c.ok ? '✓' : '—'}</span>
                    <span style={{ fontSize: 10, color: c.ok ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.sans }}>{c.label}</span>
                  </div>
                ))}
              </div>
              {insEditCovers && (
                <div>
                  <input value={insCustomCovers} onChange={e => u({ insCustomCovers: e.target.value })} placeholder="Παράδειγμα: Πυρκαγιά, Κλοπή, Σεισμός…"
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: T.radius.inner, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans, marginBottom: 10 }}/>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <Toggle on={insCustomEarthquake} onChange={v => u({ insCustomEarthquake: v })} label="Σεισμός" labelOff="Χωρίς Σεισμό"/>
                    <Toggle on={insCustomFlood}      onChange={v => u({ insCustomFlood: v })}      label="Πλημμύρα" labelOff="Χωρίς Πλημμύρα"/>
                    <Toggle on={insCustomNatural}    onChange={v => u({ insCustomNatural: v })}    label="Φυσικές καταστροφές" labelOff="Χωρίς"/>
                  </div>
                </div>
              )}
              {effectiveEarthquake && effectiveFloodState && (
                <div title="ΕΝΦΙΑ: Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων" style={{ marginTop: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.badge, padding: '8px 14px', fontSize: 11, color: 'var(--accent)', fontFamily: T.font.sans }}>
                  Δικαιούσαι μείωση ΕΝΦΙΑ 10-20% βάσει Α.1005/2026, ρύθμισε στο tab Υπηρεσίες → ΕΝΦΙΑ
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Streaming & Ψυχαγωγία ────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Streaming και ψυχαγωγία')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10, marginBottom: 16 }}>
          {STREAMING.map(svc => {
            const active  = (activeStreaming || []).find(a => a.service === svc.value);
            const plan    = svc.plans.find(p => p.id === active?.planId);
            const cost    = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 2) > 1 ? cost / (active.splitPeople || 2) : cost;
            return (
              <div key={svc.value} style={{ background: active ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 14, transition: 'all 0.15s', minHeight: 68, display: 'flex', flexDirection: 'column' as const }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: active ? 10 : 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: active ? svc.color : 'var(--border-default)', flexShrink: 0, cursor: 'pointer' }} onClick={() => toggleStreaming(svc.value)}/>
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 500, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1, cursor: 'pointer' }} onClick={() => toggleStreaming(svc.value)}>{svc.label}</span>
                  {active && <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: 'var(--text-tertiary)', textDecoration: 'none', padding: '2px 4px' }}>↗</a>}
                  {active ? (
                    <button onClick={() => toggleStreaming(svc.value)} style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 9, color: 'var(--text-tertiary)', flexShrink: 0, padding: 0 }}>✕</button>
                  ) : (
                    <span style={{ fontSize: 9, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: T.font.sans }} onClick={() => toggleStreaming(svc.value)}>+ Προσθήκη</span>
                  )}
                </div>
                {!active && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, paddingLeft: 15, cursor: 'pointer' }} onClick={() => toggleStreaming(svc.value)}>από {fe(svc.plans[0].price)} / μήνα</div>}
                {active && (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' as const, gap: 8, flex: 1 }}>
                    <CustomSelect value={active.planId} onChange={v => updateS(svc.value, 'planId', v)}
                      options={(svc.plans ?? []).map(p => ({ value: p.id, label: p.name }))} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', borderRadius: T.radius.badge, padding: '6px 10px' }}>
                      <div onClick={() => updateS(svc.value, 'splitActive', !active.splitActive)}
                        style={{ width: 30, height: 17, borderRadius: T.radius.pill, background: active.splitActive ? 'var(--accent)' : 'var(--border-default)', cursor: 'pointer', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                        <div style={{ position: 'absolute', top: 2.5, left: active.splitActive ? 14 : 2.5, width: 12, height: 12, borderRadius: '50%', background: active.splitActive ? 'var(--accent-text)' : '#fff', transition: 'left 0.2s' }}/>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>Διαμοιρασμός κόστους</span>
                      {active.splitActive && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input type="number" min="2" max="10" value={active.splitPeople || 2} onChange={e => updateS(svc.value, 'splitPeople', Math.max(2, parseInt(e.target.value) || 2))}
                            style={{ width: 44, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: T.radius.badge, padding: '3px 6px', color: 'var(--text-primary)', fontSize: 12, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', outline: 'none', textAlign: 'center' }}/>
                          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>άτομα</span>
                        </div>
                      )}
                    </div>
                    <NumberInput label="Τιμή αν διαφέρει" value={active.customPrice} onChange={v => updateS(svc.value, 'customPrice', v)} suffix="€" step={0.5}/>
                    <DatePicker label="Ημερομηνία ανανέωσης" value={active.renewalDate} onChange={v => updateS(svc.value, 'renewalDate', v)}/>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid var(--border-subtle)', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>{active.splitActive && (active.splitPeople || 2) > 1 ? `Μερίδιό σου (÷${active.splitPeople})` : 'Μηνιαίο κόστος'}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(myShare)} / μήνα</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {(activeStreaming || []).length > 0 && (
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: 4, fontFamily: T.font.sans }}>{(activeStreaming || []).length} υπηρεσίες ενεργές</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>{(activeStreaming || []).map(a => STREAMING.find(s => s.value === a.service)?.label).join(' · ')}</div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(streamingCost)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 3 }}>ανά μήνα</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Cloud & Λογισμικό ────────────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Cloud και λογισμικό')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 105px), 1fr))', gap: 8, marginBottom: 14 }}>
          {CLOUD.map(svc => {
            const active  = (activeCloud || []).find(a => a.service === svc.value);
            const plan    = svc.plans.find(p => p.id === active?.planId);
            const cost    = parseFloat(active?.customPrice || '') || plan?.price || 0;
            const myShare = active?.splitActive && (active?.splitPeople || 2) > 1 ? cost / (active.splitPeople || 2) : cost;
            return (
              <div key={svc.value} onClick={() => toggleCloud(svc.value)}
                style={{ background: active ? 'var(--bg-surface)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 10, cursor: 'pointer', transition: 'all 0.2s', minHeight: 56, display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--accent)' : 'var(--border-default)', flexShrink: 0 }}/>
                  <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontFamily: T.font.sans, flex: 1 }}>{svc.label}</span>
                  {active && <a href={svc.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ fontSize: 9, color: 'var(--text-tertiary)', textDecoration: 'none' }}>↗</a>}
                </div>
                {active ? (
                  <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
                    <CustomSelect value={active.planId} onChange={v => updateC(svc.value, 'planId', v)}
                      options={(svc.plans ?? []).map(p => ({ value: p.id, label: p.name }))} />
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 11, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(myShare)} / μήνα</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: T.font.sans }}>από {fe(svc.plans[0].price)}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Άλλες Πάγιες Συνδρομές ───────────────────────────────────────── */}
      <div style={card}>
        {secHdr('Άλλες πάγιες συνδρομές')}
        <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <TextInput   label="Ονομασία"         value={newSubName}    onChange={setNewSubName}    placeholder="Παράδειγμα: Canva Pro, Adobe, Antivirus..."/>
            <NumberInput label="Κόστος τον μήνα" value={newSubPrice}  onChange={setNewSubPrice}   suffix="€" step={1}/>
            <DatePicker  label="Ημερομηνία ανανέωσης"    value={newSubRenewal} onChange={setNewSubRenewal}/>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => { if (newSubName && newSubPrice) { u({ otherSubs: [...(otherSubs || []), { name: newSubName, price: newSubPrice, renewalDate: newSubRenewal }] }); setNewSubName(''); setNewSubPrice(''); setNewSubRenewal(''); } }}
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: T.radius.btn, padding: '0 24px', height: T.h.lg, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: T.font.sans }}>
              + Προσθήκη
            </button>
          </div>
        </div>
        {(otherSubs || []).map((s, i) => {
          const daysLeft = s.renewalDate ? daysUntil(s.renewalDate) ?? 0 : null;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: T.font.sans }}>{s.name}</span>
                {s.renewalDate && <span style={{ fontSize: 10, color: daysLeft !== null && daysLeft <= 7 ? 'var(--warning)' : 'var(--text-tertiary)', marginLeft: 12, fontFamily: T.font.sans }}>{localDay(s.renewalDate).toLocaleDateString('el-GR')}{daysLeft !== null && daysLeft <= 7 ? `, σε ${daysLeft} ημέρες` : ''}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums' }}>{fe(parseFloat(s.price))} / μήνα</span>
                <button onClick={() => u({ otherSubs: (otherSubs || []).filter((_, j) => j !== i) })}
                  style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            </div>
          );
        })}
        {total > 0 && (
          <div style={{ marginTop: 16, background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: T.font.sans }}>Σύνολο, ασφάλεια + streaming + cloud + άλλα</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2 }}>
                {[insCost > 0 && `Ασφάλεια ${fe(insCost)}`, streamingCost > 0 && `Streaming ${fe(streamingCost)}`, cloudCost > 0 && `Cloud ${fe(cloudCost)}`, otherCost > 0 && `Άλλα ${fe(otherCost)}`].filter(Boolean).join(' + ')}
              </div>
            </div>
            <div style={{ textAlign: 'right' as const }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(total)} / μήνα</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{fe(total * 12)} / έτος</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}