# ical-sync — Αυτόματος συγχρονισμός iCal (Airbnb/Booking)

Κατεβάζει ημερολόγια iCal **server-side** (παρακάμπτει το CORS του browser),
τα αναλύει και εισάγει τις κρατήσεις ως `client_stays` σε συγκεντρωτικό πελάτη
ανά κανάλι. Το iCal δίνει μόνο ημερομηνίες (όχι όνομα επισκέπτη ή τιμή).

## Ενέργειες (body.action)

| action     | Ποιος καλεί            | Τι κάνει                                                   |
|------------|------------------------|-----------------------------------------------------------|
| `preview`  | χρήστης (JWT)          | Κατεβάζει ένα URL και επιστρέφει τα events (χωρίς εγγραφή) |
| `sync`     | χρήστης (JWT)          | Συγχρονίζει τους αποθηκευμένους συνδέσμους του χρήστη      |
| `sync-all` | cron (x-cron-secret)   | Συγχρονίζει ΟΛΟΥΣ τους ενεργούς συνδέσμους όλων            |

## Deploy

```bash
# 1. Σύνδεση στο project
supabase link --project-ref <PROJECT_REF>

# 2. Μυστικά (το SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY υπάρχουν ήδη)
supabase secrets set ICAL_CRON_SECRET="<τυχαίο-μακρύ-μυστικό>"

# 3. Deploy (verify_jwt=false — η function ελέγχει μόνη της το JWT)
supabase functions deploy ical-sync --no-verify-jwt
```

Το πίνακα `ical_feeds` τον δημιουργεί το migration
`20260708180000_ical_feeds.sql`.

## Προαιρετικό: αυτόματος καθημερινός συγχρονισμός (pg_cron + pg_net)

Τρέξε στο SQL Editor (χρειάζεται τα extensions `pg_cron` και `pg_net`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Καθημερινά στις 04:00 UTC: κάλεσε την function με το cron secret.
select cron.schedule(
  'ical-sync-daily',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.functions.supabase.co/ical-sync',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<το-ίδιο-μυστικό>'),
    body    := jsonb_build_object('action','sync-all')
  );
  $$
);
```

Χωρίς cron, ο συγχρονισμός γίνεται με το κουμπί «Συγχρονισμός τώρα» ή αυτόματα
μετά την αποθήκευση ενός συνδέσμου, μέσα από το Πελατολόγιο.
