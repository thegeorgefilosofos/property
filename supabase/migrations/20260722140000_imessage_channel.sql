-- ─────────────────────────────────────────────────────────────────────────────
-- iMessage (Apple Messages for Business) as a fourth opt-in messaging channel.
--
-- Same rule as the rest: strictly opt-in, one delivery on exactly one channel, and
-- the cadence caps in emailPolicy span every channel — adding iMessage never adds
-- volume. dispatch-message reads wants_imessage and routes glanceable obligations/
-- transactional to it (renderIMessage) when IMESSAGE_API_URL + IMESSAGE_TOKEN exist,
-- otherwise falls back to email. Nothing sends without an MSP credential.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.messaging_prefs
  add column if not exists wants_imessage boolean not null default false;
