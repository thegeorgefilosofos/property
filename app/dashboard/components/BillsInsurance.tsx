'use client';

import { useState, useEffect, useRef } from 'react';
import { daysUntil } from '@/lib/core/time';
import { createClient } from '@/lib/supabase/client';
import * as properties from '@/lib/data/properties';
import * as loanStore from '@/lib/data/loans';
// Οι ρυθμίσεις ανά ενότητα έχουν ένα σπίτι: lib/data/settings.
import * as settings from '@/lib/data/settings';
import * as checklist from '@/lib/data/checklist';
import * as tenantStore from '@/lib/data/tenants';
import * as calendar from '@/lib/data/calendar'
import { NumberInput, CustomSelect, TextInput, Toggle, DatePicker } from './UIComponents';
import { useBillsSettings } from './BillsSettings';
import { T, TT, fe, formGrid, tileRow, SecHdr, InfoBanner, Skeleton, SkeletonKPIs, localDay, ABSENT_SHORT, pressable } from '@/components/Theme';
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
      { id: 'hd_full',     name: 'Κτίριο και Περιεχόμενο',   monthly: 8.50,  annual: 85,  covers: ['Πυρκαγιά','Κλοπή','Θραύση Σωληνώσεων','Βραχυκύκλωμα','Φυσικά Φαινόμενα','Αστική Ευθύνη','Τυχαίες Ζημιές'], earthquake: false, flood: true,  natural: true  },
      { id: 'hd_full_eq',  name: 'Κτίριο και Περιεχόμενο + Σεισμός', monthly: 12.00, annual: 120, covers: ['Πλήρης Κάλυψη','Σεισμός','Κλοπή','Αστική Ευθύνη'], earthquake: true, flood: true, natural: true },
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

export const STREAMING = [
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

export const CLOUD = [
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
  { key: 'natural',    label: 'Φυσικές καταστροφές' },
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
    basedOn: `${sqm} τ.μ., ίδιες ή καλύτερες καλύψεις· εκτίμηση, όχι προσφορά`,
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


// ═══════════════════════════════════════════════════════════════════════════
// ΕΝΑΣ ΕΠΙΛΟΓΕΑΣ ΣΥΝΔΡΟΜΩΝ, ΓΙΑ ΟΛΕΣ ΤΙΣ ΣΥΝΔΡΟΜΕΣ
// ─────────────────────────────────────────────────────────────────────────
// ΤΙ ΕΚΑΝΕ Η ΟΘΟΝΗ ΑΦΟΡΗΤΗ. Η φόρμα επεξεργασίας ζούσε ΜΕΣΑ στο κελί του
// επιλογέα. Σε πλέγμα, όλα τα κελιά μιας σειράς παίρνουν το ύψος του ψηλότερου:
// μόλις ο χρήστης άνοιγε μία συνδρομή, το κελί της φούσκωνε στα εξακόσια
// εικονοστοιχεία και οι τέσσερις διπλανές γίνονταν γιγάντια ΑΔΕΙΑ γκρίζα
// κουτιά. Μία επιλογή, μισή οθόνη κενό.
//
// Και μέσα σε κάθε κελί στριμώχνονταν: κουκκίδα-διακόπτης, όνομα, σύνδεσμος
// «Επίσημη σελίδα», κουμπί «✕», ετικέτα «+ Προσθήκη», επιλογέας πακέτου με
// κομμένο κείμενο («Βασικό, 8,…»), διακόπτης διαμοιρασμού, πεδίο αριθμού
// ατόμων, τιμή, ημερομηνία, και ξανά το ποσό. Δώδεκα χειριστήρια σε πλάτος
// 150 εικονοστοιχείων, εννέα φορές στη σειρά.
//
// Η ΔΟΜΗ ΠΟΥ ΤΟ ΛΥΝΕΙ ΕΙΝΑΙ Η ΠΡΟΦΑΝΗΣ: ο επιλογέας διαλέγει, ο επεξεργαστής
// επεξεργάζεται, και είναι δύο διαφορετικά πράγματα σε δύο διαφορετικά σημεία.
//
//   επάνω   πλακίδια ίδιου ύψους, ένα κλικ ανάβει ή σβήνει. Τίποτα άλλο.
//   κάτω    μία γραμμή ΑΝΑ ΕΝΕΡΓΗ συνδρομή, όλες στοιχισμένες στο ίδιο πλέγμα.
//
// ΤΙ ΣΒΗΣΤΗΚΕ. Το «+ Προσθήκη» σε κάθε ανενεργό πλακίδιο (το πλακίδιο ΕΙΝΑΙ το
// κουμπί), το «✕» σε κάθε ενεργό (το ίδιο πλακίδιο σβήνει), ο σύνδεσμος
// «Επίσημη σελίδα» σε κάθε κάρτα (κανείς δεν μπαίνει στη διαχείριση δαπανών
// για να επισκεφθεί το Netflix), και η ετικέτα «Μηνιαίο κόστος» που
// επαναλαμβανόταν σε κάθε ανοιχτή κάρτα ενώ η στήλη έχει ήδη επικεφαλίδα.
//
// Ο διαμοιρασμός ήταν ΔΥΟ χειριστήρια, διακόπτης και αριθμός ατόμων. Έγινε
// ένας επιλογέας που λέει την απάντηση με λέξεις: «Μόνος μου», «2 άτομα».
// ═══════════════════════════════════════════════════════════════════════════

interface SubService { value: string; label: string; url: string; plans: { id: string; name: string; price: number }[] }

const SPLIT_OPTIONS = [
  { value: '1', label: 'Μόνος μου' },
  ...[2, 3, 4, 5, 6].map(n => ({ value: String(n), label: `${n} άτομα` })),
];

/**
 * Το όνομα του πακέτου ΧΩΡΙΣ την τιμή του.
 *
 * Τα πακέτα λέγονται «Βασικό, 8,99 €», «Individual, 13,99 €». Μέσα σε επιλογέα
 * πλάτους 150 εικονοστοιχείων αυτό γίνεται «Βασικό, 8,9…» και «Individual, …»:
 * το κείμενο που κόβεται είναι ακριβώς η τιμή, δηλαδή η πληροφορία που η ίδια
 * γραμμή γράφει ήδη με μεγάλα γράμματα δεξιά. Τα ονόματα των βαθμίδων είναι
 * μοναδικά από μόνα τους σε κάθε υπηρεσία, και έτσι διαλέγει ο κόσμος:
 * «βασικό ή premium», όχι «8,99 ή 15,99».
 */
const planLabel = (name: string) => name.replace(/,\s*[\d.,]+\s*€\s*$/, '').trim();

/** Το ποσό που βαρύνει τον χρήστη: πακέτο ή δική του τιμή, διά τα άτομα. */
function subShare(svc: SubService | undefined, a: SubscriptionEntry): number {
  const plan = svc?.plans.find(p => p.id === a.planId);
  const base = parseFloat(a.customPrice) || plan?.price || 0;
  const n = a.splitActive && a.splitPeople > 1 ? a.splitPeople : 1;
  return base / n;
}

export function SubscriptionSection({ label, catalog, active, onToggle, onUpdate, total }: {
  label: string;
  catalog: readonly SubService[];
  active: SubscriptionEntry[];
  onToggle: (svc: string) => void;
  onUpdate: <K extends keyof SubscriptionEntry>(svc: string, field: K, val: SubscriptionEntry[K]) => void;
  total: number;
}) {
  const isOn = (v: string) => active.some(a => a.service === v);
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: T.radius.card, padding: 20, marginBottom: 16 }}>
      <SecHdr label={label} sub={active.length === 0 ? 'Πάτησε ό,τι έχεις. Τα υπόλοιπα μένουν σβηστά.' : undefined}
        right={total > 0 ? <span style={{ ...TT.kpi, fontSize: 18 }}>{fe(total)}</span> : undefined}/>

      {/* Ο ΕΠΙΛΟΓΕΑΣ: ίδια ανατομία σε ΚΑΘΕ πλακίδιο, ένα κλικ, τίποτα άλλο μέσα.

          ΙΣΑ ΠΛΑΤΗ, ΚΕΝΤΡΑΡΙΣΜΕΝΑ. Όσο κάθε πλακίδιο έπαιρνε το πλάτος του
          ονόματός του, το «Netflix» ήταν μισό από το «Amazon Prime Video» και
          δεκαοκτώ άκρες κατέβαιναν σε τυχαία σημεία. Τώρα όλα έχουν το ίδιο
          πλάτος, τα ονόματα ξεκινούν στο ίδιο σημείο και τα ποσά τελειώνουν στο
          ίδιο· και η μισή τελευταία σειρά κάθεται στη ΜΕΣΗ αντί να αφήνει τρύπα
          δεξιά, οπότε το μπλοκ διαβάζεται συμμετρικό αντί για κομμένο.

          Και το ποσό μπαίνει σε ΟΛΑ: πριν, το ενεργό πλακίδιο έχανε την τιμή
          του ενώ το διπλανό ανενεργό την κρατούσε, οπότε στην ίδια σειρά δύο
          πλακίδια είχαν διαφορετικό σχήμα. Στα ενεργά γράφεται η ΠΡΑΓΜΑΤΙΚΗ
          τιμή που πληρώνει ο χρήστης, στα υπόλοιπα η τιμή εισόδου. */}
      <div style={tileRow(210)}>
        {catalog.map(svc => {
          const entry = active.find(a => a.service === svc.value);
          const on = !!entry;
          const amount = entry ? subShare(svc, entry) : svc.plans[0].price;
          return (
            <button key={svc.value} type="button" onClick={() => onToggle(svc.value)} aria-pressed={on}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10,
                flex: '0 0 var(--tile-w)', maxWidth: '100%',
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                height: T.h.lg, padding: '0 14px', borderRadius: T.radius.inner,
                background: on ? 'var(--accent-soft)' : 'var(--bg-elevated)',
                border: `1px solid ${on ? 'var(--accent)' : 'var(--border-subtle)'}`,
                transition: 'background-color .15s, border-color .15s',
              }}>
              <span style={{ ...TT.bodySm, color: on ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: on ? 600 : 400, whiteSpace: 'nowrap' }}>{svc.label}</span>
              <span style={{ ...TT.caption, color: on ? 'var(--text-secondary)' : 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fe(amount)}</span>
            </button>
          );
        })}
      </div>

      {/* Ο ΕΠΕΞΕΡΓΑΣΤΗΣ: μία γραμμή ανά ενεργή, όλες στο ίδιο πλέγμα. */}
      {active.length > 0 && (
        <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {active.map(a => {
            const svc = catalog.find(x => x.value === a.service);
            if (!svc) return null;
            return (
              <div key={a.service} style={{ ...formGrid(160, 230), gap: 12, alignItems: 'end', paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                  <span style={{ ...TT.h2, fontSize: 15 }}>{svc.label}</span>
                  <span style={{ ...TT.kpi, fontSize: 18 }}>{fe(subShare(svc, a))}</span>
                </div>
                <CustomSelect label="Πακέτο" value={a.planId} onChange={v => onUpdate(a.service, 'planId', v)}
                  options={svc.plans.map(p => ({ value: p.id, label: planLabel(p.name) }))}/>
                <CustomSelect label="Μοιράζεται" value={String(a.splitActive && a.splitPeople > 1 ? a.splitPeople : 1)}
                  onChange={v => { const n = parseInt(v) || 1; onUpdate(a.service, 'splitPeople', n); onUpdate(a.service, 'splitActive', n > 1); }}
                  options={SPLIT_OPTIONS}/>
                <NumberInput label="Τιμή αν διαφέρει" value={a.customPrice} onChange={v => onUpdate(a.service, 'customPrice', v)} suffix="€" step={0.5}/>
                {/* Το προεπιλεγμένο «Επιλογή ημερομηνίας» τσάκιζε σε δύο γραμμές και
                    έσπαγε τη στοίχιση της σειράς. Η ετικέτα λέει ήδη «Ανανέωση»·
                    το κενό λέει ότι είναι προαιρετικό. */}
                <DatePicker label="Ανανέωση" placeholder="Προαιρετικό" value={a.renewalDate} onChange={v => onUpdate(a.service, 'renewalDate', v)}/>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Η ασφάλεια κατοικίας και οι συνδρομές streaming δεν είναι ίδιο πράγμα, και
 * δεν τα ανοίγει κανείς μαζί. Το `only` δηλώνει ποια κάρτα πατήθηκε.
 */
export type InsuranceScope = 'insurance' | 'subscriptions';

export default function BillsInsurance({ propertyId, userId = '', only }: { propertyId: string; userId?: string; only?: InsuranceScope }) {
  const show = (k: InsuranceScope) => !only || only === k;
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
        const chk = await checklist.matchingDescription<{ status: string | null; due_date: string | null }>(
          supabase, propertyId, 'status,due_date', '%ασφαλιστήριο%', userId);
        if (chk[0]) setChecklistRenewal({ daysLeft: chk[0].due_date ? daysUntil(chk[0].due_date) ?? 0 : null });

        // Property data from services (ΕΝΦΙΑ has sqm, zone, floor, age)
        const svcData = await settings.section(supabase, propertyId, 'services', userId);
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
        const [prop, activeLoan, activeTenants] = await Promise.all([
          properties.one(supabase, propertyId, 'address,sqm,prop_type,status_detail,year_built,rental_mode,target_rent,insurance_company,insurance_expiry,insurance_amount', userId),
          loanStore.hasActive(supabase, propertyId, userId),
          tenantStore.currentAll<{ monthly_rent?: number | null; furnishing?: string | null }>(supabase, propertyId, 'monthly_rent,furnishing', userId),
        ]);
        // Ο κανόνας του «ενεργό» ζει στο lib/loans/shape.ts, όχι σε δύο συγκρίσεις εδώ.
        // Το φιλτράρισμα «όχι past και χωρίς ημερομηνία αποχώρησης» ζούσε εδώ, και
        // σε άλλα τέσσερα αρχεία, γραμμένο κάθε φορά από την αρχή. Το στρώμα το κάνει.
        const activeRent = activeTenants
          .reduce((s, t) => s + (Number(t.monthly_rent) || 0), 0);
        const isFurnished = activeTenants.some(t => {
          const f = t.furnishing ?? undefined;
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
        if (svcData || prop) {
          // Τα διασταυρούμενα στοιχεία έρχονται από τις ρυθμίσεις ΕΝΦΙΑ, όπου το `data`
        // είναι ελεύθερο jsonb. Δηλώνονται όσα πεδία διαβάζονται, και μόνο αυτά.
        const d = (svcData ?? {}) as { enfiaSqm?: string; enfiaZone?: string; enfiaFloor?: string; enfiaAge?: string };
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
  // Καθαρή αναζήτηση σε σταθερό πίνακα. Δηλωνόταν ΜΕΤΑ το effect που τη
  // διαβάζει, και δούλευε μόνο επειδή η ανάγνωση γινόταν μέσα σε setTimeout.
  const insCompany = INSURANCE_COMPANIES.find(c => c.value === insProvider);
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
  // ΤΟ `insProvider` ΕΛΕΙΠΕ, ΚΑΙ ΗΤΑΝ ΠΡΑΓΜΑΤΙΚΟ ΣΦΑΛΜΑ. Το `currentMonthly`
  // διαβάζεται από `insCompany?.plans`, δηλαδή από την ΕΤΑΙΡΕΙΑ. Με αλλαγή
  // εταιρείας και ίδιο αναγνωριστικό προγράμματος, ο υπολογισμός έμενε στην
  // παλιά — και η στήλη «εξοικονόμηση» έβγαινε από λάθος ασφάλιστρο, δηλαδή
  // λάθος νούμερο σε οθόνη που ζητά απόφαση αλλαγής παρόχου.
  }, [effectiveSqm, insPropValue, insContentValue, effectiveFloor, effectiveAge, insCustomPrice, insPlanId, insCompany?.plans]);

  const insPlan    = (insCompany?.plans ?? []).find(p => p.id === insPlanId);
  const insCost    = parseFloat(insCustomPrice) || insPlan?.monthly || 0;
  /** Ξέρουμε ασφάλιστρο; Χωρίς αυτό, το «0,00 €» θα σήμαινε «δεν πληρώνω». */

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
  const insPlanOptions = (insCompany?.plans ?? []).map(p => ({ value: p.id, label: `${p.name}, ~${p.monthly > 0 ? `${fe(p.monthly)}` : 'Χειροκίνητο'}` }));

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
      const { error } = await properties.update(supabase, propertyId, patch, userId);
      setSyncError(!!error);
    }, 1200); // debounce, αποφυγή write σε κάθε keystroke
    return () => { if (propertySyncTimer.current) clearTimeout(propertySyncTimer.current); };
  }, [propertyId, loading, insSignature, insCompany?.label, insCost, insRenewalDate]);

  // ── Auto-sync ανανέωσης ασφάλειας → calendar_events ──────────────────────────
  useEffect(() => {
    if (!propertyId || !insRenewalDate || calendarSynced) return;
    (async () => {
      // Η ΚΑΤΗΓΟΡΙΑ ΕΙΝΑΙ ΤΟ ΚΛΕΙΔΙ ΤΗΣ ΜΟΝΑΔΙΚΟΤΗΤΑΣ ΕΔΩ, και γι' αυτό μένει
      // 'insurance_renewal': η πηγή είναι 'system' και τη μοιράζεται με το
      // φυσικό αέριο, οπότε δεν ξεχωρίζει τις δύο υπενθυμίσεις.
      if (await calendar.exists(supabase, propertyId, { category: 'insurance_renewal', eventDate: insRenewalDate })) { setCalendarSynced(true); return; }

      // Το `.then(() => setCalendarSynced(true))` δήλωνε «καταχωρήθηκε» ακόμη κι
      // όταν το insert γύριζε σφάλμα. Η υπενθύμιση μαρκαριζόταν ως συγχρονισμένη
      // και δεν ξαναδοκίμαζε ποτέ, οπότε ο ιδιοκτήτης δεν έπαιρνε ειδοποίηση
      // λήξης — ούτε μάθαινε ποτέ ότι δεν πρόκειται να την πάρει.
      const { error } = await calendar.insert(supabase, [calendar.row({ propertyId, userId }, 'system', {
        title: `Ανανέωση Ασφάλειας Κατοικίας, ${insCompany?.label ?? ''}`,
        category: 'insurance_renewal',
        event_date: insRenewalDate,
        amount: insCost > 0 ? insCost : null,
        notes: `Πρόγραμμα: ${(insCompany?.plans ?? []).find(p => p.id === insPlanId)?.name ?? ''}. Σύγκρινε εναλλακτικές πριν ανανεώσεις.`,
      })]);
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
      {/* ΟΙ ΕΙΔΟΠΟΙΗΣΕΙΣ ΑΝΗΚΟΥΝ ΣΤΗΝ ΑΣΦΑΛΕΙΑ, ΟΧΙ ΣΤΙΣ ΣΥΝΔΡΟΜΕΣ. Η λήξη
          ασφαλιστηρίου και η ελλιπής κάλυψη σεισμού δεν έχουν καμία σχέση με το
          Netflix· εμφανίζονταν όμως και στις δύο, γιατί το πάνελ ήταν ένα.

          Η σειρά τεσσάρων μεγάλων αριθμών στην κορυφή έφυγε για τον ίδιο λόγο
          με τους Παρόχους: αθροίσματα κατηγοριών που ο χρήστης δεν ζήτησε,
          μπροστά από αυτό που ζήτησε. Το σύνολο των συνδρομών μένει, κάτω από
          τις συνδρομές, όπου το διαβάζει όποιος τις κοιτάζει. */}

      {show('insurance') && (<>
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

        {/* ── Ασφάλεια Κατοικίας ───────────────────────────────────────────── */}
        <div style={card}>
          {secHdr('Ασφάλεια κατοικίας')}

          {/* ── ΤΟ ΔΙΚΟ ΣΟΥ ΑΣΦΑΛΙΣΤΗΡΙΟ, ΠΡΩΤΑ ────────────────────────────────
              ΗΤΑΝ ΤΕΛΕΥΤΑΙΟ, ΜΕΤΑ ΑΠΟ ~150 ΓΡΑΜΜΕΣ ΚΑΤΑΛΟΓΟΥ ΑΓΟΡΑΣ: στοιχεία
              ακινήτου, φίλτρα, «τι χρειάζεται αυτό το ακίνητο», προτεινόμενο,
              τρεις κάρτες προσφορών και πλήρης πίνακας — και μετά, στο τέλος, το
              συμβόλαιο που ΕΧΕΙ ο ιδιοκτήτης.

              Η ίδια ανάποδη ιεραρχία που διορθώθηκε ένα επίπεδο πιο πάνω, στα
              Συμβόλαια: κανείς δεν ανοίγει την Ασφάλεια για να μελετήσει την
              αγορά, την ανοίγει για να δει τι έχει και πότε λήγει. Η αγορά είναι
              η ΔΕΥΤΕΡΗ ερώτηση, και μένει ακέραιη από κάτω. */}
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
                    Επίσημη σελίδα
                  </a>
                </div>
              )}
            </div>

            {insPlan && (
              <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 14, border: '1px solid var(--border-subtle)', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', fontFamily: T.font.sans }}>Καλύψεις προγράμματος</div>
                  <button onClick={() => { u({ insEditCovers: !insEditCovers }); if (!insEditCovers) { u({ insCustomCovers: effectiveCovers.join(', '), insCustomEarthquake: effectiveEarthquake, insCustomFlood: effectiveFloodState, insCustomNatural: effectiveNatural }); } }}
                    style={{ fontSize: 10, color: 'var(--accent)', background: 'transparent', border: '1px solid var(--accent)', borderRadius: T.radius.badge, padding: '5px 12px', cursor: 'pointer', fontFamily: T.font.sans, fontWeight: 600 }}>
                    {insEditCovers ? 'Αποθήκευση' : 'Επεξεργασία'}
                  </button>
                </div>
                {/* Δυναμικός πίνακας καλύψεων, ✓/✗ αυτόματα βάσει επιλεγμένου προγράμματος */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 6, marginBottom: insEditCovers ? 12 : 0 }}>
                  {deriveCoverages(effectiveCovers, effectiveEarthquake, effectiveFloodState, effectiveNatural).map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: c.ok ? 'var(--accent-soft)' : 'var(--bg-base)', border: `1px solid ${c.ok ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.badge, padding: '6px 10px' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: c.ok ? 'var(--accent)' : 'var(--text-tertiary)', lineHeight: 1 }}>{c.ok ? 'Ναι' : 'Όχι'}</span>
                      <span style={{ fontSize: 10, color: c.ok ? 'var(--text-primary)' : 'var(--text-tertiary)', fontFamily: T.font.sans }}>{c.label}</span>
                    </div>
                  ))}
                </div>
                {insEditCovers && (
                  <div>
                    <input value={insCustomCovers} onChange={e => u({ insCustomCovers: e.target.value })} placeholder="Παράδειγμα: Πυρκαγιά, Κλοπή, Σεισμός…"
                      style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--accent)', borderRadius: T.radius.inner, padding: '9px 12px', color: 'var(--text-primary)', fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: T.font.sans, marginBottom: 10 }}/>
                    <div style={{ display: 'flex', gap: 16 }}>
                      <Toggle on={insCustomEarthquake} onChange={v => u({ insCustomEarthquake: v })} label="Σεισμός"/>
                      <Toggle on={insCustomFlood}      onChange={v => u({ insCustomFlood: v })}      label="Πλημμύρα"/>
                      <Toggle on={insCustomNatural}    onChange={v => u({ insCustomNatural: v })}    label="Φυσικές καταστροφές"/>
                    </div>
                  </div>
                )}
                {effectiveEarthquake && effectiveFloodState && (
                  <div title="ΕΝΦΙΑ: Ενιαίος Φόρος Ιδιοκτησίας Ακινήτων" style={{ marginTop: 10, background: 'var(--accent-soft)', border: '1px solid var(--accent-border)', borderRadius: T.radius.badge, padding: '8px 14px', fontSize: 11, color: 'var(--accent)', fontFamily: T.font.sans }}>
                    Δικαιούσαι μείωση ΕΝΦΙΑ από 10% έως 20%, βάσει Α.1005/2026. Δήλωσέ την στη Λογιστική, στον Υπολογισμό ΕΝΦΙΑ.
                  </div>
                )}
              </div>
            )}
          </div>

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
            <div style={{ ...formGrid(200, 270), gap: 14, marginBottom: 14 }}>
              <NumberInput label="Εμβαδόν"       value={effectiveSqm}    onChange={v => u({ insSqm: v })}          suffix="τετραγωνικά" step={5}/>
              <TextInput   label="Πόλη ή περιοχή"         value={effectiveCity}   onChange={v => u({ insCity: v })}         placeholder="Παράδειγμα: Αθήνα, Θεσσαλονίκη…"/>
            </div>
            <div style={{ ...formGrid(200, 270), gap: 14, marginBottom: 14 }}>
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
                <div {...pressable(() => u({ insProvider: recommended.q.company, insPlanId: recommended.q.plan, insEditCovers: false }))}
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
                        style={{ background: isCurrent ? 'var(--accent-soft)' : 'var(--bg-elevated)', border: `1px solid ${isCurrent ? 'var(--accent)' : isBest ? 'var(--accent-border)' : 'var(--border-subtle)'}`, borderRadius: T.radius.inner, padding: 12, cursor: 'pointer', transition: 'background-color 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s', position: 'relative' as const }}>
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
                          {q.natural   && <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: '1px 6px', borderRadius: 3, fontFamily: T.font.sans }}>Φυσικές καταστροφές</span>}
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
                      <tr>{['Εταιρεία','Πρόγραμμα','Σεισμός','Πλημμύρα','Φυσικές καταστροφές','Εκτιμώμενο Μηνιαίο','Εκτιμώμενο Ετήσιο','Εξοικονόμηση/μήνα'].map((h, i) => (
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
                            <td style={{ padding: '6px 8px', color: q.earthquake ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.earthquake ? 'Ναι' : 'Όχι'}</td>
                            <td style={{ padding: '6px 8px', color: q.flood     ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.flood     ? 'Ναι' : 'Όχι'}</td>
                            <td style={{ padding: '6px 8px', color: q.natural   ? 'var(--text-primary)' : 'var(--text-tertiary)', textAlign: 'center' as const, fontWeight: 700 }}>{q.natural   ? 'Ναι' : 'Όχι'}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 600, color: isCur ? 'var(--accent)' : 'var(--text-primary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const }}>{fe(q.monthlyEstimate)}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--text-secondary)', fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', fontSize: 9, whiteSpace: 'nowrap' as const }}>{fe(q.annualEstimate)}</td>
                            <td style={{ padding: '6px 8px', fontWeight: 700, fontFamily: T.font.mono, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' as const, color: 'var(--text-secondary)' }}>
                              {q.savings !== undefined && q.savings !== 0 ? `${q.savings > 0 ? '+' : ''}${fe(q.savings)}` : fe(0)}
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

        </div>

      </>)}

      {show('subscriptions') && (<>
        <SubscriptionSection label="Streaming και ψυχαγωγία" catalog={STREAMING}
          active={activeStreaming || []} onToggle={toggleStreaming} onUpdate={updateS} total={streamingCost}/>

        <SubscriptionSection label="Cloud και λογισμικό" catalog={CLOUD}
          active={activeCloud || []} onToggle={toggleCloud} onUpdate={updateC} total={cloudCost}/>


        {/* ── Άλλες Πάγιες Συνδρομές ───────────────────────────────────────── */}
        <div style={card}>
          {secHdr('Άλλες πάγιες συνδρομές')}
          <div style={{ background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: 16, marginBottom: 14, border: '1px solid var(--border-subtle)' }}>
            <div style={{ ...formGrid(150, 240), marginBottom: 12 }}>
              <TextInput   label="Ονομασία"         value={newSubName}    onChange={setNewSubName}    placeholder="Παράδειγμα: Canva Pro, Adobe, Antivirus…"/>
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
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums' }}>{fe(parseFloat(s.price))} / μήνα</span>
                  <button onClick={() => u({ otherSubs: (otherSubs || []).filter((_, j) => j !== i) })}
                    style={{ width: 26, height: 26, borderRadius: T.radius.badge, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
              </div>
            );
          })}
          {total > 0 && (
            <div style={{ marginTop: 16, background: 'var(--bg-elevated)', borderRadius: T.radius.inner, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border-subtle)' }}>
              <div>
                {/* Η ετικέτα απαριθμούσε «ασφάλεια + streaming + cloud + άλλα»
                    ακόμη κι όταν υπήρχαν μόνο δύο από τα τέσσερα, ενώ η γραμμή
                    από κάτω έγραφε ήδη ποια ακριβώς αθροίζονται. Δύο απαντήσεις
                    στην ίδια ερώτηση, και η μία λάθος. */}
                <div style={{ ...TT.bodySm, color: 'var(--text-secondary)' }}>Σύνολο ανά μήνα</div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontFamily: T.font.sans, marginTop: 2 }}>
                  {[insCost > 0 && `Ασφάλεια ${fe(insCost)}`, streamingCost > 0 && `Streaming ${fe(streamingCost)}`, cloudCost > 0 && `Cloud ${fe(cloudCost)}`, otherCost > 0 && `Άλλα ${fe(otherCost)}`].filter(Boolean).join(' + ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' as const }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fe(total)} / μήνα</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: T.font.num, fontVariantNumeric: 'tabular-nums', marginTop: 3 }}>{fe(total * 12)} / έτος</div>
              </div>
            </div>
          )}
        </div>
      </>)}

    </div>
  );
}