# M2 API and workers

## Run

Build the native M1 executable and WASM with `pnpm build:gen` and `pnpm build:wasm`, then `pnpm db:migrate`, `pnpm --filter api build`.
`pnpm dev:api` starts HTTP; `pnpm dev:worker` starts the Redis/BullMQ workers.

Required environment: `DATABASE_URL`, `S3_BUCKET`, `AWS_REGION`, `GEN_EXECUTABLE`, `GEN_WASM`, `GEN_PALETTE`; workers also require `REDIS_URL`. M1 paths are absolute. Firebase uses application default credentials and its configured project. No credentials are committed.

**Image moderation is not configured yet.** The production entry point uses UnconfiguredModerator and rejects uploads with 503 until a reviewed provider is wired in. Integration tests inject an explicit approved mock; production never auto-approves images. This is not a deployable finished M2 release.

Firebase ID tokens are verified with revocation checking. The verified UID must match an active `users.firebase_uid` row. Client-supplied user IDs are not accepted. Account provisioning and push-device registration are currently administrative DB operations; the original Phase 1 endpoint list does not specify their APIs. Do not use the migration/admin DB credentials for the deployed application; use a login granted schiild_app.

## HTTP contract

All §9 endpoints are implemented. The lottery verification endpoint is public; other HTTP endpoints require `Authorization: Bearer <Firebase ID token>`. Image submission is multipart with `image`, `atelier_ids` (JSON array), and optional `caption` (50 characters). Other writes use JSON. Invalid UUIDs and request values are rejected before queries. Error responses use machine codes, with existing copy keys where available; no new Japanese UI copy is invented.

Schiil creation serializes by user and inserts Schiil/posts in one transaction. JPEG dimensions must already be 1080²; the server strips metadata by decoding/re-encoding JPEG q85. Stored SHA and mean refer to the cleaned image. Duplicate submissions return 409 plus the existing Schiil's additional-post action. Store failure produces no DB post. A disconnected/uncertain commit can leave an unreferenced S3 object; orphan collection is an operational follow-up, not an extra posted Schiil.

Today uses the actual shared Rust WASM wrapper and the current input hashes. Per the approved decision it is provisional until generation. Responses contain anonymous rectangles/counts, not member names or user IDs. WebSocket connects to `/v1/ateliers/{atelierId}/live`, sends `{ "token": "Firebase ID token" }` as its first frame within 10 seconds, and receives the same anonymous state. PostgreSQL LISTEN/NOTIFY propagates committed posts across API instances. Reconnect fetches a fresh state; durable event replay is not provided.

Read responses currently return private storage keys for generated files. CloudFront delivery configuration is a deployment integration item; original photos are not returned by these routes.

## Daily execution

UTC midnight plans the preceding UTC day's work. Generation uses its own queue; the UTC 00:15 notification scheduler has a separate control queue so image jobs do not delay its start. Atelier jobs complete or fail before global generation is queued. Initial attempt plus three retries lead to a DLQ. Session advisory locks and the DB unique constraint prevent duplicate committed works. Failure records have no substitute image or Schiild row.

Lottery seeds use CSPRNG independently of M1 generation seeds. The approved verifier uses HMAC-SHA256(seed, big-endian uint64 counter), takes the first big-endian u32, rejection-samples each Fisher–Yates bound, and starts with sorted unique participant UUIDs. The persisted order is consumed without reshuffling on decline. Global works have an empty lottery order and no individual custodian.

Global M1 generation uses the zero UUID as a fixed namespace (no real atelier row) and approved preprocessed means. This namespace and v1.0.0 remain stable for reproducibility. Atelier generation uses original cleaned JPEGs and M1 BSP.

Notifications are an idempotent per-user/per-day outbox created at UTC 00:15. users.timezone is never used for scheduling. Device delivery is at-least-once: a crash after FCM accepts a message and before DB commit may repeat it. Clients should deduplicate by logical date and event type. Payloads contain a day and event type, not other people's posting state. FCM is data-only; M3 must map events to formal notification copy.

## Tests

`pnpm --filter api test` needs a dedicated PostgreSQL 16 DATABASE_URL with database-creation permission, plus built native/WASM artifacts. HTTP tests create a randomly named isolated database and drop it on completion. External auth, storage and moderation are mocked; JPEG processing, Rust generation, WASM and PostgreSQL run for real. Queue schedule contracts are unit-tested; live Redis/FCM/S3/Firebase credentials are not exercised locally.

Official references: [Firebase token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Nest uploads](https://docs.nestjs.com/techniques/file-upload), [BullMQ schedulers](https://docs.bullmq.io/guide/job-schedulers/).
