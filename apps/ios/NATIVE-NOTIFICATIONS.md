# iOS notifications

Prepared on 2026-11-02 for `app.schiild.mobile`, version 1.0.0, build 6.
This document covers native notifications only. It does not change image review.

## Delivery and controls

The native application requests notification permission only after the user selects
the enable button in settings. It obtains an APNs device token and registers it with
the authenticated session. Cloudflare sends directly to Apple APNs; Expo Push Service
is not used. The production signing key is restricted to this application's topic.
Private keys belong in protected Windows storage and Cloudflare secrets, never in
the application bundle, this document, or Git.

Atelier completion, GLOBAL completion, atelier posts, and image-review notices use
the existing server outbox and independent preferences. Delivery checks the current
session, account, membership where applicable, and notification preferences. An
invalid device token disables its subscription. Logout invalidates delivery through
that session; account deletion removes the account's notification subscriptions.
Delivered notifications are also cleared on the native logout/deletion path.

Notification taps accept only explicitly allowed first-party view routes. Authentication
callbacks and arbitrary external links cannot be opened through the notification payload.
Review reasons and image bytes are not sent in APNs payloads.

## Verification

- Native policy, provider and bridge tests; TypeScript checks and Hermes export passed.
- EAS build 6 completed using a refreshed push-enabled production provisioning profile.
- A temporary authenticated Cloudflare Worker signed a request and reached production
  APNs. A synthetic token returned `BadDeviceToken`, as expected. No real device was
  targeted; the temporary Worker was deleted. This is transport verification, not
  proof that a physical device received a notification.
- The live APNs signing fix changes only the signing key representation. Other Worker
  modules, image-review behavior, secrets, assets and stored accounts were preserved.

## Disclosure preparation before App Store release

When notifications are enabled, Cloudflare stores the APNs token, device proof hash,
language, subscription status, registration time, and account/session association.
Apple receives the device token and alert payload to deliver the notification.
These data are used for app functionality, not advertising or cross-service tracking.

Include this collection in the App Privacy draft as **Device ID**, used for **App
Functionality**, **linked to the user**, and **not used for tracking**. This classification
is based on the implemented persistent, account-linked device registration and Apple's
[App Privacy data definitions](https://developer.apple.com/app-store/app-privacy-details/).
It is a prepared disclosure, not a claim that the App Store declaration has been published.
Update the public privacy explanation to describe native APNs support before release;
do not retain an unconditional statement that native iOS notifications are unavailable.

## Physical-device acceptance still required

Install build 6 through TestFlight, sign in, and enable notifications in settings.
Check permission granted and denied paths, foreground and background arrival, a cold
launch from a notification, correct destination, each category toggle, device disable,
and no new delivery after logout/account deletion. Repeat on the supported iPhone/iPad
versions available to the tester. Server/APNs tests do not replace these checks.

TestFlight submission and processing status are recorded separately under the local
`outputs/schiild-ios-preparation` evidence directory. This work does not submit the
application for public App Store review.
