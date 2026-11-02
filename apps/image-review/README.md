# Demo image checks on Xserver

This is demo-only infrastructure, separate from production M1–M4. Existing application/authentication/storage remain on Cloudflare. Image inference runs on Xserver CPU, not Cloudflare, Hugging Face Inference Providers or Azure. No paid inference plan is used.

## Scope and policy

The model checks sexual content and gore/graphic injury only. It does not establish legality, age, copyright, consent, harassment or overall guideline compliance. Reports, blocking and operator removal remain available. eSafety Safety by Design informs operational transparency and user controls; it is not a claim of certification or an exhaustive model taxonomy.

Policy `2026-11-02.local1`: reject if sexual or gore probability is at least 0.8; otherwise approve if clear probability is at least 0.8; otherwise reject with a neutral `uncertain` retake notice. These are application confidence thresholds, not measured accuracy. The author describes gore as underrepresented. Harmless generated demo images verified compatibility and latency; harmful-content recall and false-positive rates have not been validated.

Every new photo and profile image is queued before provisional publication. A delayed rejection removes only the matching source, its thumbnails and its contributions to atelier/GLOBAL works. Other participants remain. Persisted verdicts make recovery idempotent, including publication after an interrupted request. Previously accepted, still-private manual-queue photos are migrated with a separately audited service-transition basis and published only after an allow verdict; approved historical photos are not rescanned. Account deletion and stale-avatar checks prevent applying a late result to a deleted account or replacement.

Rejection notices include reasons and a camera retake link. Photo retakes require that person's notice, the original target and the original UTC day. No retake after UTC 00:00 closing that day; no 24-hour extension. Technical failures retry without approving or accusing the user. Notices remain in the app; push delivery requires a configured channel, device permission and subscription.

## Model and runtime provenance

- Model: [OwenElliott/image-safety-classifier-s](https://huggingface.co/OwenElliott/image-safety-classifier-s), card metadata declares MIT.
- Revision: `015042b0eab17f1b17f2986527386346fb0d94be`.
- File: `onnx/image-safety-classifier-s.onnx`, 23,701,765 bytes.
- SHA256: `fef443ed68ae25ed693b6fef9e456071692ed3963cff4168acb39c3de6f017e7`.
- RGB float32 0–255, NCHW 224×224; input `image`; outputs NSFL, NSFW, SFW. Normalization/softmax are embedded.
- Portable CPython 3.12.16, [python-build-standalone](https://github.com/astral-sh/python-build-standalone/releases/tag/20261026), release 20261026, x86_64 Linux install-only stripped archive SHA256 `ce4f6d0a6cfdb3bed6e44c2f9affd85943c76a42e25ad3a259002f31d6fb8a20`.
- CPU dependencies: `onnxruntime==1.23.2`, `pillow==11.3.0`, `numpy==2.2.6`; isolate them from system Python. Keep their licenses and the model card with deployment. No remote model code or pickle weights are executed.

Xserver benchmark (2026-11-02): 8 generated harmless samples, 1 CPU thread; load 0.157s, mean inference 0.026s, maximum 0.032s, peak RSS 142,552KiB. This does not predict queue/network latency or establish detection accuracy.

## Deployment contract

Keep Python, dependencies, model, configuration and SQLite outside `public_html`, mode 0700/0600. The only public file is a CGI wrapper importing the private gateway. Use an existing valid HTTPS host; do not disable certificate verification or overwrite another site's files. Deployment requires a fresh live-worker backup/manifest and preservation of all other modules, secrets, assets and accounts.

Private configuration: `enabled`, `secret` (random 32-byte hex), `policy_version`, `database`, `model`, `safe_threshold`, `reject_threshold`. The Cloudflare secret `AUTOMATIC_MODERATION_CONFIG` contains only enabled/endpoint/key. Never commit either secret. Disabled configuration preserves the previous operator workflow.

CGI accepts bounded JSON POST only with HMAC-SHA256 over version, timestamp, random nonce and body hash; 120-second skew, replay protection and no redirects. JPEG bytes are validated in memory. The persistent database contains only short-lived replay-prevention nonces; the gateway never stores photographs in SQLite, temporary files or logs. A nonblocking file lock limits model execution to one concurrent CPU process. Busy/error responses cause the application’s durable alarm to retry. No daemon or Cron is necessary.

Before enabling: run `python -m unittest discover -s apps/image-review -p 'test_*.py'` on Linux, the iOS automatic tests, repository lint/typecheck/test/Rust checks, then exercise signed real inference with harmless generated images and verify unsigned access is denied. Never create a real harmful upload merely to exercise rejection; deterministic injected verdict tests cover the removal path.

References: [eSafety](https://www.esafety.gov.au/industry/safety-by-design), [Apple UGC guidelines](https://developer.apple.com/app-store/review/guidelines/#user-generated-content), [Xserver Cron/resource policy](https://www.xserver.ne.jp/support/faq/service_server_cron.php).
