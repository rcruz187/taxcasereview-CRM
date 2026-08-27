-- Prevent duplicate accounting entries when a Stripe PaymentIntent confirmation is retried.
create unique index if not exists payments_stripe_payment_intent_uidx
  on public.payments (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null
    and stripe_payment_intent_id <> '';
