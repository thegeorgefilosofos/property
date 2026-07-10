# send-reminders — Αυτόματες υπενθυμίσεις email

Σαρώνει καθημερινά τα `calendar_events` (πηγή `checklist`, `bills`, `maintenance`
κ.λπ.), εφαρμόζει τα lead-times κάθε χρήστη από το `notification_preferences`
(7 / 3 / 1 ημέρα, σήμερα, εκπρόθεσμα) και το **dunning** ληξιπρόθεσμου ενοικίου,
στέλνει τα emails μέσω **Resend** και καταγράφει στο `notification_log` ώστε να μη
διπλοστέλνει. Καλείται **μόνο** από τον χρονοπρογραμματιστή (pg_cron).

## Ασφάλεια

`verify_jwt = false` (config.toml) — η function ελέγχει μόνη της το header
`x-cron-secret == REMINDERS_CRON_SECRET`. Χωρίς σωστό μυστικό → `401`. Δεν
χρησιμοποιείται το service-role key στην κλήση (least privilege)· η function
κρατά το δικό της service key εσωτερικά για τα queries.

## One-time setup (τρέξε μία φορά)

```bash
# 1. Σύνδεση στο project
supabase link --project-ref <PROJECT_REF>

# 2. Μυστικά της function (το RESEND_API_KEY / SUPABASE_URL / SERVICE_ROLE_KEY υπάρχουν ήδη)
supabase secrets set REMINDERS_CRON_SECRET="<τυχαίο-μακρύ-μυστικό>"

# 3. Deploy (verify_jwt=false — η function ελέγχει μόνη της το cron secret)
supabase functions deploy send-reminders --no-verify-jwt
```

Στο **SQL Editor**, αποθήκευσε URL + μυστικό στο Vault (τα διαβάζει το pg_cron job
του migration `20260710170000_reminders_pg_cron.sql`):

```sql
select vault.create_secret(
  'https://<PROJECT_REF>.functions.supabase.co/send-reminders',
  'reminders_fn_url', 'URL του send-reminders Edge Function');

select vault.create_secret(
  '<το-ίδιο-μυστικό-με-το-REMINDERS_CRON_SECRET>',
  'reminders_cron_secret', 'x-cron-secret για το send-reminders');
```

Μετά το `supabase db push`, το job `send-reminders-daily` τρέχει κάθε μέρα στις
**06:00 UTC**. Αν αλλάξουν οι τιμές, ενημέρωσέ τες με `vault.update_secret(id, ...)`.

## Χειροκίνητη δοκιμή

```bash
curl -X POST 'https://<PROJECT_REF>.functions.supabase.co/send-reminders' \
  -H 'x-cron-secret: <το-μυστικό>' -H 'Content-Type: application/json' -d '{}'
```

Χωρίς το σωστό `x-cron-secret` επιστρέφει `401`.
