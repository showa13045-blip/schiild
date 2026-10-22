# Receive-only WhatsApp authentication

Approved scope: customers register and sign in by sending a pre-filled WhatsApp message to the connected business number. Schiild sends no messages and uses no sending API key, template, payment method, or paid subscription.

## Protocol

1. A browser starts a register/login/delete challenge, bound to its existing credential and intent. The cryptographic random challenge expires in five minutes.
2. The customer follows a wa.me link, sends the complete message, and returns to the original browser. Whitespace-only transformations (including a single-line prefill) are normalized before matching the intent, token and complete warning.
3. Kapso delivers only `whatsapp.message.received` events (v2, buffering off) to `https://schiild.app/api/auth/whatsapp`.
4. The Worker validates HMAC SHA-256 over the exact raw body, event, configured destination number, inbound classification, timestamp, and challenge. Live v2 deliveries carry `type: whatsapp.message.received` and may omit `message.kapso.direction`; explicit outbound direction or a conflicting root type is always rejected. It stores the hashed sender identity; the webhook cannot issue a login session.
5. The bound browser checks for receipt and explicitly continues with the masked sender. Atomic consumption prevents replay and duplicate registration. Login cannot register a new identity, registration cannot silently sign into an existing identity, and deletion requires fresh proof from the registered sender.

The phone number or business-scoped user ID is hashed before storage. The BSUID can come from `message.from_user_id` or the signed conversation’s `business_scoped_user_id`. A short-lived challenge stores only the final four phone digits for the confirmation screen (or a generic WhatsApp hint for BSUID-only events). Raw unrelated messages are ignored and not stored or logged by Schiild. Kapso retains its own records under its service settings. Existing LINE accounts are not automatically merged.

## Configuration and rollout

`WHATSAPP_LOGIN_CONFIG` is a Cloudflare encrypted Worker secret containing `phoneNumber` (international digits, no plus), `phoneNumberId`, and `webhookSecret` (the Kapso endpoint signing secret, 32–256 characters). Never commit its value. An absent or invalid configuration disables discovery and all WhatsApp auth actions. Preserve all existing LINE/push/storage secrets, Durable Object namespace, and public assets when deploying.

Application caps: 400 challenge starts per UTC day and 1,900 per UTC month; existing IP rate limits also apply. These cap challenge creation, not provider-level inbound traffic. The Kapso Free plan includes 2,000 total sent/received messages monthly; unrelated business traffic and repeated messages also count. No automatic paid upgrade or top-up is authorized. Existing hosting usage remains subject to its own plan and quotas.

Webhook subscriptions receive the selected event for the whole business number, including non-authentication messages. Enabling forwarding therefore requires approval of the business-number-to-Schiild data flow. No secret or subscription is created by this source change alone.

## Validation

Run root lint, typecheck, test, `cargo test -p gen`, and the demo server suite. WhatsApp tests cover exact-body signatures, replay, expiry, credential/intent binding, sender mismatch, duplicate identities, BSUID-only messages, quota enforcement, and account deletion against memory and actual SQLite stores. Verify the real browser through local workerd with a signed synthetic webhook, then perform a separate real-phone acceptance check after the production subscription is enabled.

[ASSUMPTION] New UI messages use English for languages other than Japanese until translations are supplied. Existing interface catalogs are unchanged. Provider identity migration between phone-only and BSUID-only events is not automatically merged; explicit account recovery is required if Meta changes the identifier without providing a common identity.
