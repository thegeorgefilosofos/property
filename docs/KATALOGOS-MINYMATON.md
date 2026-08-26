# Ο κατάλογος των μηνυμάτων

**ΠΑΡΑΓΕΤΑΙ ΑΠΟ ΤΟΝ ΚΩΔΙΚΑ. Μην τον γράψεις με το χέρι.**

```
npm run katalogos
```

Κάθε μήνυμα που μπορεί να φύγει από το PROPERWISE, με το θέμα που βλέπει ο
παραλήπτης και το αρχείο που το πυροδοτεί. Οσα θέματα αλλάζουν ανά παραλήπτη
γράφονται με το καλούπι τους, όπως `Το «${c.propertyName}» είναι έτοιμο`.

## Σύνοψη

| Πρόγραμμα | Μηνύματα | Τι κάνει |
|---|---:|---|
| ONBOARDING | 12 | Πρώτες ημέρες: από την εγγραφή ώς το πρώτο ακίνητο και την πρώτη αναφορά |
| ENGAGEMENT | 14 | Τακτική επαφή: μηνιαία κατάσταση, επιτόκια, φορολογικές προθεσμίες, ενοίκια |
| UPSELL | 10 | Αναβάθμιση πακέτου, όταν η χρήση το δικαιολογεί |
| SEASONAL | 6 | Εποχικά: σεζόν βραχυχρόνιας, χειμώνας, κλείσιμο χρονιάς |
| REFERRAL | 4 | Πρόγραμμα πρόσκλησης |
| LIFECYCLE | 8 | Δοκιμή, λήξη δοκιμής, επιστροφή |
| WINBACK | 5 | Επανάκτηση χρήστη που σταμάτησε |
| OPERATIONS | 12 | Λειτουργικά: ενοίκια, λογαριασμοί, συμβόλαια, συντηρήσεις |
| SHORTTERM | 7 | Βραχυχρόνια μίσθωση: κρατήσεις, ΤΑΚΚ, μητρώο |
| PRODUCT | 11 | Τι καινούριο υπάρχει στο προϊόν |
| CONVERSION | 4 | Από δωρεάν σε συνδρομή |
| COMPLIANCE | 4 | Νομικά και συμμόρφωση |
| BILLING | 3 | Χρεώσεις και πληρωμές |
| RELATIONSHIP | 3 | Σχέση με τον χρήστη: επέτειοι, ευχαριστίες |
| VALUE | 8 | Απόδειξη αξίας με τα δικά του νούμερα |
| NEWS | 5 | Ενημερωτικό δελτίο |
| DIGESTS | 3 | Συνόψεις αγοράς και χαρτοφυλακίου |
| **ΣΥΝΟΛΟ** | **119** | |

## ONBOARDING

Πρώτες ημέρες: από την εγγραφή ώς το πρώτο ακίνητο και την πρώτη αναφορά.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `welcome_free` | Καλωσόρισες στο PROPERWISE | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` (+1) |
| `welcome_individual` | Τα ακίνητά σου, τακτοποιημένα | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260819130000_o_kyklos_zois_diavazei_to_sosto_pedio.sql` |
| `welcome_professional` | Το χαρτοφυλάκιό σου σε μία οθόνη | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260819130000_o_kyklos_zois_diavazei_to_sosto_pedio.sql` |
| `add_first_property` | Πρόσθεσε το πρώτο σου ακίνητο | `supabase/migrations/20260723091000_lifecycle_enqueue.sql`, `supabase/migrations/20260723092000_email_activation_fixes.sql` (+2) |
| `first_property_success` | c.propertyName ? `Το «${c.propertyName}» είναι έτοιμο` : 'Το ακίνητό σου είναι έτοιμο' | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260723091000_lifecycle_enqueue.sql` (+3) |
| `connect_bank` | Άσε τη λογιστική να γίνεται μόνη της | **με το χέρι** · Η σύνδεση τράπεζας δεν έχει ανοίξει: λείπει προσαρμογέας παρόχου. Θα υποσχόταν κουμπί που δεν υπάρχει. |
| `connect_calendar` | Συγχρόνισε Airbnb και Booking | `supabase/migrations/20260824130000_ta_email_pou_den_estelne_kaneis.sql`, `scripts/db/rls-probe.sql` |
| `tip_assistant` | Ο βοηθός σου ξέρει τα ακίνητά σου | `supabase/functions/_shared/emailPolicy.ts` |
| `voice_entry` | Πες το και καταχωρείται | `supabase/functions/_shared/emailPolicy.ts` |
| `tip_reports` | Επίσημη αναφορά με ένα κλικ | `supabase/functions/_shared/emailPolicy.ts` |
| `feedback_week1` | Πώς σου φαίνεται μέχρι τώρα; | `supabase/functions/_shared/emailPolicy.ts` |
| `recap_week2` | Η πρώτη σου εβδομάδα σε δεδομένα | `supabase/functions/_shared/emailPolicy.ts` |

## ENGAGEMENT

Τακτική επαφή: μηνιαία κατάσταση, επιτόκια, φορολογικές προθεσμίες, ενοίκια.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `monthly_statement` | Η μηνιαία σου κατάσταση | `supabase/functions/_shared/verify-policy.ts`, `supabase/functions/send-monthly-statements/index.ts` |
| `market_digest` | Τα επιτόκια αυτή την εβδομάδα | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `product_update` | Τι νέο έχει το PROPERWISE | `supabase/functions/_shared/verify-policy.ts` |
| `quarterly_review` | Το τρίμηνό σου σε μία ματιά | `supabase/migrations/20260824130000_ta_email_pou_den_estelne_kaneis.sql`, `scripts/db/rls-probe.sql` |
| `tax_e2` | Πλησιάζει η φορολογική δήλωση | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `tax_enfia` | ΕΝΦΙΑ: εκτίμηση και προθεσμίες | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `tax_installment` | Υπενθύμιση: δόση φόρου αυτόν τον μήνα | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `year_end` | Κλείσε τη χρονιά με τα βιβλία σου σε τάξη | `supabase/migrations/20260824130000_ta_email_pou_den_estelne_kaneis.sql`, `scripts/db/rls-probe.sql` |
| `rent_pending` | Εκκρεμεί μια είσπραξη ενοικίου | `supabase/functions/_shared/emailPolicy.ts` |
| `dunning_1` | Υπενθύμιση: ληξιπρόθεσμο ενοίκιο | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `dunning_2` | Δεύτερη υπενθύμιση: το ενοίκιο εκκρεμεί ακόμη | `supabase/functions/_shared/emailPolicy.ts` |
| `dunning_final` | Τελική υπόμνηση για ληξιπρόθεσμο ενοίκιο | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `enfia_installment_reminder` | frac ? `ΕΝΦΙΑ · η δόση ${frac} λήγει σύντομα` : 'ΕΝΦΙΑ · δόση που λήγει σύντομα', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `portfolio_digest_nudge` | Ο μηνιαίος απολογισμός σου είναι έτοιμος | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |

## UPSELL

Αναβάθμιση πακέτου, όταν η χρήση το δικαιολογεί.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `free_month_upgrade` | Άλλος ένας μήνας. Μήπως ήρθε η ώρα; | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `upsell_to_individual` | Δώσε στα ακίνητά σου το πλήρες PROPERWISE | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260723091000_lifecycle_enqueue.sql` (+3) |
| `upsell_to_professional` | Το χαρτοφυλάκιό σου μεγαλώνει | `supabase/functions/_shared/emailPolicy.ts` |
| `limit_reached` | Έφτασες στο όριο του δωρεάν πλάνου | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `value_left` | Αφήνεις αξία αναξιοποίητη | `supabase/functions/_shared/emailPolicy.ts` |
| `annual_discount` | Πλήρωσε ετησίως και εξοικονόμησε ${pct}% | `supabase/functions/_shared/emailPolicy.ts` |
| `trial_ending` | Η δοκιμή σου τελειώνει σύντομα | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260819130000_o_kyklos_zois_diavazei_to_sosto_pedio.sql` (+2) |
| `winback_downgrade` | Είμαστε εδώ, όποτε θες | `supabase/functions/_shared/emailPolicy.ts` |
| `reactivation_offer` | Γύρνα με ${pct}% έκπτωση | `supabase/functions/_shared/emailPolicy.ts` |
| `trial_started` | Η δοκιμή σου ξεκίνησε. Ας την αξιοποιήσουμε | `supabase/functions/_shared/emailPolicy.ts` |

## SEASONAL

Εποχικά: σεζόν βραχυχρόνιας, χειμώνας, κλείσιμο χρονιάς.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `black_friday` | Black Friday: ${pct}% στο PROPERWISE | `supabase/functions/_shared/emailTemplates.ts`, `supabase/migrations/20260723091000_lifecycle_enqueue.sql` (+3) |
| `cyber_monday` | Cyber Monday: ${pct}%, μόνο σήμερα | `supabase/functions/_shared/emailTemplates.ts` |
| `christmas` | Κλείσε τη χρονιά με τα ακίνητά σου σε τάξη | `supabase/functions/_shared/emailTemplates.ts`, `supabase/migrations/20260723091000_lifecycle_enqueue.sql` (+3) |
| `new_year` | Νέα χρονιά, καθαρά βιβλία | `supabase/functions/_shared/emailTemplates.ts` |
| `tax_season` | Μπες στη φορολογική σεζόν χωρίς άγχος | `supabase/migrations/20260723091000_lifecycle_enqueue.sql`, `supabase/migrations/20260723092000_email_activation_fixes.sql` (+2) |
| `summer_str` | Η σεζόν των βραχυχρόνιων ξεκινά | `supabase/migrations/20260723091000_lifecycle_enqueue.sql`, `supabase/migrations/20260723092000_email_activation_fixes.sql` (+2) |

## REFERRAL

Πρόγραμμα πρόσκλησης.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `referral_invite` | Πρότεινε το PROPERWISE, κερδίστε και οι δύο | `supabase/functions/send-lifecycle-email/index.ts` |
| `referral_reminder` | Ο σύνδεσμος πρόσκλησής σου περιμένει | `supabase/functions/_shared/verify-policy.ts`, `supabase/migrations/20260723091000_lifecycle_enqueue.sql` (+3) |
| `referral_reward` | Η ανταμοιβή σου είναι έτοιμη | `supabase/functions/_shared/emailPolicy.ts` |
| `referral_friend_activated` | Η σύστασή σου μόλις ενεργοποιήθηκε | `supabase/functions/_shared/emailPolicy.ts` |

## LIFECYCLE

Δοκιμή, λήξη δοκιμής, επιστροφή.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `subscription_receipt` | c.invoiceNumber ? `Απόδειξη συνδρομής ${esc(c.invoiceNumber)}` : 'Η απόδειξη της συνδρομής σου', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `plan_changed` | Το πλάνο σου ενημερώθηκε | `supabase/functions/_shared/emailPolicy.ts` |
| `payment_failed` | Η πληρωμή της συνδρομής δεν ολοκληρώθηκε | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `security_login` | Νέα σύνδεση στον λογαριασμό σου | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `accountant_request_answered` | ${c.clientName \|\| 'Ο πελάτης σου'}: ήρθε αυτό που ζήτησες | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260825150000_i_pyli_logisti_kleinei_ton_kyklo.sql` |
| `reply_ack` | Λάβαμε το μήνυμά σου | `supabase/functions/_shared/emailPolicy.ts` |
| `mobile_launch` | Το PROPERWISE είναι πλέον στο κινητό σου | `supabase/functions/send-lifecycle-email/index.ts` |
| `legislation_update` | Νομοθεσία ακινήτων: ${head} | **με το χέρι** · Νομοθετική αλλαγή. Το τι άλλαξε το γράφει άνθρωπος, δεν το μαντεύει σαρωτής. |

## WINBACK

Επανάκτηση χρήστη που σταμάτησε.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `inactive_30` | Πάει καιρός. Όλα σε περιμένουν | `supabase/migrations/20260824130000_ta_email_pou_den_estelne_kaneis.sql`, `scripts/db/rls-probe.sql` |
| `inactive_60` | Να κρατήσουμε τα δεδομένα σου ασφαλή; | `supabase/migrations/20260824130000_ta_email_pou_den_estelne_kaneis.sql` |
| `winback_offer` | Μια αφορμή για να γυρίσεις: ${pct}% έκπτωση | `supabase/functions/_shared/emailPolicy.ts` |
| `churn_survey` | Ένα λεπτό, για να γίνουμε καλύτεροι | `supabase/functions/_shared/emailPolicy.ts` |
| `data_retention_notice` | Κράτησε τον λογαριασμό σου ενεργό | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |

## OPERATIONS

Λειτουργικά: ενοίκια, λογαριασμοί, συμβόλαια, συντηρήσεις.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `lease_ending` | c.propertyName ? `Λήγει η μίσθωση του «${esc(c.propertyName)}»` : 'Πλησιάζει λήξη μίσθωσης', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` (+4) |
| `lease_renewal_prompt` | Ώρα για ανανέωση μίσθωσης; | `supabase/functions/_shared/emailPolicy.ts` |
| `deposit_reminder` | Η εγγύηση θέλει τακτοποίηση | `supabase/functions/_shared/emailPolicy.ts` |
| `insurance_expiring` | Λήγει η ασφάλεια του ακινήτου | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` (+4) |
| `certificate_expiring` | Λήγει πιστοποιητικό${named} | `supabase/functions/_shared/emailPolicy.ts` |
| `appointment_reminder` | Υπενθύμιση: ${title} | `supabase/functions/_shared/emailPolicy.ts` |
| `maintenance_scheduled` | Προγραμματισμένη συντήρηση | `supabase/functions/_shared/emailPolicy.ts` |
| `maintenance_completed` | Ολοκληρώθηκε η συντήρηση | `supabase/functions/_shared/emailPolicy.ts` |
| `inspection_due` | Ώρα για τον ετήσιο έλεγχο του ακινήτου | `supabase/functions/_shared/emailPolicy.ts` |
| `utility_bill_due` | type ? `Πληρωμή: ${type}` : 'Υπενθύμιση πληρωμής λογαριασμού', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts` |
| `appointment_missed` | Χαμένο ραντεβού. Ας το ξανακλείσουμε | `supabase/functions/_shared/emailPolicy.ts` |
| `maintenance_requested` | Νέο αίτημα επισκευής από το ακίνητό σου | `supabase/functions/_shared/emailPolicy.ts` |

## SHORTTERM

Βραχυχρόνια μίσθωση: κρατήσεις, ΤΑΚΚ, μητρώο.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `checkin_today` | Άφιξη επισκέπτη σήμερα | `supabase/functions/_shared/emailPolicy.ts` |
| `checkout_today` | Αναχώρηση επισκέπτη σήμερα | `supabase/functions/_shared/emailPolicy.ts` |
| `cleaning_scheduled` | Προγραμματισμένος καθαρισμός | `supabase/functions/_shared/emailPolicy.ts` |
| `occupancy_gap` | Κενές νύχτες, ευκαιρία για πλήρωση | `supabase/functions/_shared/emailPolicy.ts` |
| `review_request` | Ζήτα μια αξιολόγηση, όσο είναι φρέσκια | **με το χέρι** · Θέλει ολοκληρωμένη διαμονή με στοιχεία επισκέπτη. Η σκανδάλη γράφεται όταν σταθεροποιηθεί το μοντέλο διαμονών. |
| `payout_received` | Μπήκε μια πληρωμή από κράτηση | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `str_season_recap` | Ο απολογισμός της σεζόν σου | **με το χέρι** · Ανασκόπηση σεζόν με πληρότητα και βαθμολογία, νούμερα που ζουν σε υπολογισμό της εφαρμογής και όχι σε στήλη. |

## PRODUCT

Τι καινούριο υπάρχει στο προϊόν.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `feature_launch` | c.featureName ? `Νέο: ${esc(c.featureName)}` : 'Κάτι νέο σε περιμένει', html: emailShell({ | **με το χέρι** · Ανακοίνωση χαρακτηριστικού. Ποιο και πότε, το ξέρει μόνο όποιος το κυκλοφόρησε. |
| `assistant_upgraded` | Ο βοηθός σου έγινε πιο έξυπνος | **με το χέρι** · Ανακοίνωση αναβάθμισης του βοηθού. |
| `assistant_showcase` | Ο βοηθός σου κάνει τη δουλειά | `supabase/functions/_shared/emailPolicy.ts` |
| `changelog_monthly` | Τι φτιάξαμε αυτόν τον μήνα | **με το χέρι** · Μηνιαία σύνοψη αλλαγών, γραμμένη με το χέρι. |
| `roadmap_preview` | Τι ετοιμάζουμε στη συνέχεια | `supabase/functions/_shared/emailPolicy.ts` |
| `anniversary` | (has(c.anniversaryYears) && c.anniversaryYears > 1) ? `Κλείνουμε ${c.anniversaryYears} χρόνια μαζί` : 'Κλείνουμε έναν χρόνο μαζί', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` (+4) |
| `milestone_reached` | Ένα ορόσημο που αξίζει αναγνώριση | **με το χέρι** · Το ορόσημο δεν είναι ορισμένο πουθενά. Ενα κατώφλι εδώ θα ήταν αυθαίρετο. |
| `nps_survey` | Θα μας πρότεινες σε έναν φίλο; | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `feedback_lottery` | Ένα λεπτό η γνώμη σου, ένας χρόνος δώρο | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `best_practice_tip` | c.headline ? esc(c.headline) : 'Η συμβουλή της εβδομάδας', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `webinar_invite` | Πρόσκληση σε δωρεάν masterclass | `supabase/functions/_shared/emailPolicy.ts` |

## CONVERSION

Από δωρεάν σε συνδρομή.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `roi_proof` | Πόσο σου απέδωσε το PROPERWISE | `supabase/functions/_shared/emailPolicy.ts` |
| `plan_comparison` | Ποιο πλάνο συμφέρει για τη δική σου χρήση | `supabase/functions/_shared/emailPolicy.ts` |
| `social_proof` | Γιατί οι επαγγελματίες επιλέγουν το PROPERWISE | `supabase/functions/_shared/emailPolicy.ts` |
| `rent_benchmark_alert` | Το ενοίκιό σου σε σχέση με την αγορά | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260723091000_lifecycle_enqueue.sql` (+2) |

## COMPLIANCE

Νομικά και συμμόρφωση.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `lease_declaration_reminder` | Δήλωσε τη μίσθωση στο myAADE | `supabase/functions/_shared/emailPolicy.ts` |
| `str_registration_reminder` | Ανάρτησε τον Αριθμό Μητρώου Ακινήτου | `supabase/functions/_shared/emailPolicy.ts` |
| `str_stay_tax` | Απόδοση τέλους ανθεκτικότητας | `supabase/functions/_shared/emailPolicy.ts` |
| `takk_seasonal_rate_switch` | Αλλάζει το τέλος ανθεκτικότητας | `supabase/functions/_shared/emailPolicy.ts` |

## BILLING

Χρεώσεις και πληρωμές.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `card_expiring` | Η κάρτα πληρωμής σου λήγει σύντομα | `supabase/functions/_shared/emailPolicy.ts` |
| `charge_upcoming` | first ? 'Η δοκιμή σου τελειώνει και ξεκινά η συνδρομή' : 'Η συνδρομή σου ανανεώνεται σύντομα' | `supabase/functions/_shared/emailPolicy.ts`, `supabase/migrations/20260820240000_kamia_chreosi_choris_proeidopoiisi.sql` (+1) |
| `account_lapse_warning` | last ? 'Αύριο διαγράφεται ο λογαριασμός σου' : 'Ο λογαριασμός σου διαγράφεται σε μία εβδομάδα' | `supabase/migrations/20260823140000_o_logariasmos_choris_syndromi_den_menei_gia_panta.sql` |

## RELATIONSHIP

Σχέση με τον χρήστη: επέτειοι, ευχαριστίες.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `tenant_welcome` | Καλωσόρισες στο νέο σου σπίτι | `supabase/migrations/20260824130000_ta_email_pou_den_estelne_kaneis.sql`, `scripts/db/rls-probe.sql` |
| `tenant_rent_receipt` | c.period ? `Απόδειξη ενοικίου ${esc(c.period)}` : 'Η απόδειξη του ενοικίου σου', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts` |
| `coowner_statement` | Η κατάστασή σου ως συνιδιοκτήτη | **με το χέρι** · Απαιτεί διεύθυνση συνιδιοκτήτη, που δεν κρατάμε. |

## VALUE

Απόδειξη αξίας με τα δικά του νούμερα.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `energy_savings` | Πλήρωσε λιγότερο για το ρεύμα | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `insurance_enfia` | Ασφάλισε το ακίνητο, δες αν κερδίζεις και στον ΕΝΦΙΑ | `supabase/functions/_shared/emailPolicy.ts` |
| `loan_costs` | Δάνειο για ακίνητο; Δες όλο το κόστος | `supabase/functions/_shared/emailPolicy.ts` |
| `rate_alert` | Επιτόκια και δόση: δες πού βρίσκεσαι | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |
| `document_pack` | Ο φάκελος του ακινήτου σου, με ένα κλικ | `supabase/functions/_shared/emailPolicy.ts` |
| `yield_boost` | Τρεις κινήσεις για μεγαλύτερη απόδοση | `supabase/functions/_shared/emailPolicy.ts` |
| `loan_first_scenario` | Έφτιαξες το πρώτο σου σενάριο δανείου. Να τι να προσέξεις | **με το χέρι** · Χωρίς σήμα «έχει δάνειο και δεν δοκίμασε σενάριο» δεν υπάρχει τίμια σκανδάλη. |
| `energy_pulse` | Νέες πράσινες τιμές ρεύματος · ο παλμός του μήνα | `supabase/functions/_shared/emailPolicy.ts`, `supabase/functions/_shared/verify-policy.ts` |

## NEWS

Ενημερωτικό δελτίο.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `news_rate_move` | c.headline ? esc(c.headline) : 'Τα επιτόκια κινήθηκαν. Δες τι σημαίνει για σένα', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts` |
| `news_insurance_risk` | c.headline ? esc(c.headline) : 'Προστάτεψε το ακίνητό σου, με το σωστό ασφαλιστήριο', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts` |
| `news_tax_change` | c.headline ? esc(c.headline) : 'Νέα ρύθμιση για τα ακίνητα. Τι αλλάζει για σένα', html: emailShell({ | **με το χέρι** · Το ίδιο: φορολογική αλλαγή με πηγή. |
| `news_market` | c.headline ? esc(c.headline) : 'Η αγορά κινείται. Εσύ πού βρίσκεσαι;', html: emailShell({ | **με το χέρι** · Είδηση αγοράς, με αριθμούς που θέλουν πηγή. |
| `news_utility_prices` | c.headline ? esc(c.headline) : 'Άλλαξαν οι τιμές σε ρεύμα και internet. Μήπως αξίζει καλύτερο πρόγραμμα;', html: emailShell({ | `supabase/functions/_shared/emailPolicy.ts` |

## DIGESTS

Συνόψεις αγοράς και χαρτοφυλακίου.

| Αναγνωριστικό | Θέμα | Πυροδοτείται από |
|---|---|---|
| `digest_obligations` | n > 1 ? `${n} θέματα χρειάζονται την προσοχή σου` : 'Ένα θέμα χρειάζεται την προσοχή σου', html: emailShell({ | `supabase/functions/_shared/verify-policy.ts` |
| `digest_tax` | Οι φορολογικές σου προθεσμίες | `supabase/functions/_shared/verify-policy.ts` |
| `digest_str_today` | Το πρόγραμμα της ημέρας | `supabase/functions/_shared/verify-policy.ts` |

