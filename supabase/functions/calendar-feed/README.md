# calendar-feed — Ζωντανό .ics feed ημερολογίου (webcal)

Σερβίρει ένα `text/calendar` feed των `calendar_events` ενός χρήστη, ώστε
Google / Apple / Outlook να **συνδράμουν μία φορά** και να ενημερώνονται μόνα
τους (χωρίς χειροκίνητες εξαγωγές).

## Πρόσβαση

`GET /calendar-feed?token=<TOKEN>[&property=<UUID>]` — μόνο με το μυστικό
`token` του χρήστη (πίνακας `calendar_feed_tokens`, ένα ανά χρήστη, RLS ανά
χρήστη). Το function το επιλύει με service role. Χωρίς έγκυρο token → 401/404.
`verify_jwt = false` (το token είναι το μυστικό). Τα timed γεγονότα βγαίνουν με
ώρα (event_time/duration_minutes)· τα υπόλοιπα ως ολοήμερα. `REFRESH-INTERVAL`
6 ώρες + `Cache-Control`.

## Deploy (μία φορά)

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push                      # δημιουργεί τον πίνακα calendar_feed_tokens
supabase functions deploy calendar-feed --no-verify-jwt
```

Το token φτιάχνεται αυτόματα την πρώτη φορά που ο χρήστης πατά «Συνδρομή σε
ζωντανό ημερολόγιο» στην καρτέλα Ημερολόγιο (insert στο `calendar_feed_tokens`,
default token). Ο σύνδεσμος συνδρομής έχει τη μορφή:

```
webcal://<PROJECT_REF>.supabase.co/functions/v1/calendar-feed?token=...&property=...
```
