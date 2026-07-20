# send-test-notification

Στέλνει ένα πραγματικό δοκιμαστικό email ειδοποίησης, ώστε ο χρήστης να
επιβεβαιώσει ότι όντως φτάνει στα εισερχόμενά του (κουμπί «Δοκιμή» στις
Ρυθμίσεις → Ειδοποιήσεις). Αντικαθιστά τον παλιό, μόνο-μορφής έλεγχο.

## Ασφάλεια

Εκτελείται με το JWT του καλούντος (όχι service role). Στέλνει ένα email στη
διεύθυνση που όρισε ο ίδιος ο συνδεδεμένος χρήστης.

## Ενεργοποίηση

```bash
# Τα RESEND_API_KEY / SUPABASE_URL / SUPABASE_ANON_KEY υπάρχουν ήδη
supabase functions deploy send-test-notification
```

Καλείται από την εφαρμογή με `supabase.functions.invoke('send-test-notification', { body: { email } })`.
