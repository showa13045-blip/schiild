# Automatic image review

Demo/iOS only. This implementation does not change production M1–M4.

## Release status

Enabled on 2026-11-02. Inference runs on the existing Xserver shared rental server.
Hugging Face supplies a pinned MIT-declared ONNX model; user images are not sent to
Hugging Face, Azure or another external inference service. No paid inference plan is used.
The Xserver gateway stores no photographs or verdicts; only short-lived HMAC replay nonces.
Existing application records, account authentication and durable review jobs remain on Cloudflare.
See [local service details](../image-review/README.md) for model provenance, scope and benchmark limitations.
Previously accepted photos still waiting in the old private moderation queue are now handed to automatic review. They remain private until an allow verdict. This service-policy transition is audited separately from explicit submission consent; no contributor checkbox is invented. Already approved photos are not rescanned. A saved allow verdict also repairs an interrupted publication without another model call. Old transport-failure backoffs are made due once by a versioned recovery marker.

The Schiild-only, production, topic-specific APNs key has been created with the user's approval.
It is stored in Windows Credential Manager (`LocalApiKeys/schiild-apns`) and the protected local
deployment folder, and copied to the Worker's `APNS_CONFIG` secret. The app's push capability
is enabled; Apple sign-in remains enabled. The private key is excluded from Git and EAS archives.
The current TestFlight build does not contain the new notification library.

## Policy and behavior

Policy version: `2026-11-02.local1`.

- Use eSafety Safety by Design operational principles and the local model's two supported categories: sexual content and gore/graphic injury. This is not eSafety certification or comprehensive guideline verification.
- Application thresholds: reject a harmful class at 0.8 or above; otherwise approve clear at 0.8 or above; otherwise reject neutrally as `uncertain`. These confidence values are not measured accuracy. The model card notes underrepresented gore; harmful-content recall has not been validated.
- Both photos and profile pictures require explicit, unchecked consent to local Xserver image checks. Names, account identifiers, original metadata and credentials are not sent to the image-review gateway.
- Accept the submission and publish provisionally without waiting for the network review. Persist the job first; recover interrupted reviews with an alarm and a lease. Invalid, partial, failed or rate-limited responses never count as approval.
- On rejection, remove only that original and its contribution from every recorded destination. Rebuild ready works; preserve other contributors, anonymous contributions, the existing custodian and the original logical date. Regenerate GLOBAL from its remaining contributors and purge indexed derivatives of the rejected image.
- Provide a per-account reason notice. Retakes use the existing camera-only, square capture flow and explicit confirmation. A server-only capability authorizes replacing only a rejected submission. Client-supplied flags cannot authorize ordinary replacements.
- The original day's UTC 00:00 deadline is enforced server-side, including at commit. In Japan this is 09:00. A delayed verdict can remove an older contribution, but cannot reopen that day's recording window.
- New profile picture revisions supersede old jobs. A verdict for an older picture cannot remove the replacement.
- Account deletion removes jobs, notices and original-photo index links in the same account-deletion transaction.
- Operator settings link to `/automatic-review/`; private result notices are at `/moderation-notices/`. Normal and App Review records remain in different Durable Objects, with the same moderation policy when enabled. App Review push delivery stays disabled.

Copyright, consent to depiction, private information and all contextual harms cannot be reliably
established by the two-category image classifier. Existing posting rules, reports, blocks, operator
removal and the support route remain available.

## Notifications

The private inbox works when the app is open. The existing encrypted Web Push outbox gains an
independent `moderation` preference. The lock-screen payload says only that review updates are
available; detailed reasons and destinations require an authenticated inbox request.

The next iOS build uses the official `expo-notifications` library to request notification permission
only on the settings button. Device tokens go to Cloudflare and notifications go directly to APNs;
Expo Push Service is not used. APNs credentials use ES256, a fixed Schiild topic, short-lived provider
tokens, no redirects, bounded delivery retries, invalid-device retirement and the existing session,
logout, account-deletion and preference checks. Notification taps accept only approved app routes.

New iOS signing and a TestFlight build, followed by physical-device permission/delivery/tap/logout
tests, are still required before claiming native push works. Hermes export is not an installed build.

## Configuration and activation

`AUTOMATIC_MODERATION_CONFIG` is a Cloudflare secret containing `enabled`, the signed Xserver HTTPS `endpoint`, and `key`. Only the designated CGI path on allowed Xserver/Schiild hosts is accepted. Requests use HMAC-SHA256 with timestamp and nonce. Redirects are not followed; `manual` mode is used because Cloudflare does not implement `error` redirect mode. Non-2xx responses retry without approving.

`APNS_CONFIG` contains `teamId`, `keyId`, `topic`, `environment` and `privateKey`; the topic and team are restricted in code. Do not put key values in chat, Git, app bundles, logs or examples.

The dedicated Xserver host is `schiild.pickleballnavi.jp`. Only `/schiild-image-review.cgi` is excluded from its existing redirect to `schiild.app`; all other paths retain their redirect. Other sites' Workers and DNS records were preserved. Python, model and configuration are outside `public_html`, independent of benchmark files. The API requires a valid signature; it is not a public image-upload endpoint.

Prepare a guarded build from the pinned pre-community foundation and a fresh live manifest:

```sh
node apps/ios/scripts/prepare-automatic.mjs <foundation-runtime> <live-manifest.json> <output-directory>
```

Before publishing, compare every live module hash with the fresh backup, preserve entrypoint/other modules/assets/secrets/accounts, and check the current plan's script limit. Enable only after signed inference succeeds over verified HTTPS. To disable new automatic handling, save `{"enabled":false}` to the same secret; do not erase user data. Previously accepted provisional submissions need explicit operational follow-up if the service is disabled while jobs remain.

Verification: six Linux service tests passed on Xserver; app tests cover exact-source retraction, rebuilding and retaining others, notice privacy, stale avatar/account protection, leases, retries and UTC cutoff. Live isolated review data exercised provisional publication and completed through real Xserver inference after a durable retry. Synthetic/injected model verdicts test rejection; real harmful material was not uploaded. Native notification delivery on a physical device remains a separate next-build check.

## Verification

Tests cover strict category parsing, endpoint validation, job deduplication, leases, retry recovery,
account deletion during a review, retraction from ready atelier/GLOBAL works, unrelated-image retention,
private notices, UTC cutoff, rejected-only retry, stale profile revisions, all ten consent translations,
Web Push preferences, native device subscriptions, session revocation, APNs JWT signatures and safe
notification routes. The prepared bundle is also tested with automatic review enabled and a mocked
local model response. Node tests do not certify Cloudflare's live HTTP/2/APNs transport or physical devices.
