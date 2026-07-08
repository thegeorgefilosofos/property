-- ═══════════════════════════════════════════════════════════════════════════
-- Ο όροφος γίνεται κείμενο (Ισόγειο, Υπόγειο, Υπερυψωμένο ισόγειο, Δώμα, 1ος…)
-- αντί για ακέραιος, ώστε το dropdown να αποδίδει σωστά την ελληνική ονοματολογία.
-- Idempotent και ασφαλές (διατηρεί τυχόν υπάρχουσες αριθμητικές τιμές ως κείμενο).
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.user_properties add column if not exists floor text;
do $$ begin alter table public.user_properties alter column floor type text using floor::text; exception when others then null; end $$;
