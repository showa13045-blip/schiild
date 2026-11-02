"""DEMO ONLY: authenticated Xserver CGI, local CPU inference, no external AI calls.

The caller retries pending jobs. No daemon/cron or paid inference service is used.
Image bytes are erased at the end of every request, including technical failures.
Only short-lived replay-prevention nonces remain in the private database.
"""
import json
import os
import pathlib
import sys

from local_model import LocalModel, automatic_decision
from review_queue import MAX_BODY, ReviewError, ReviewQueue


def process(body, headers, config, factory=LocalModel):
    import fcntl
    queue = ReviewQueue(config["database"], config["secret"], config["policy_version"])
    validation = ReviewQueue(":memory:", config["secret"], config["policy_version"])
    try:
        queue.authenticate(body, headers)
        value = json.loads(body)
        if not isinstance(value, dict):
            raise ReviewError(400, "invalid_request")
        if value == {"action": "health"}:
            return {"service": "schiild-image-review", "policy_version": config["policy_version"], "inference_enabled": bool(config.get("enabled"))}
        if value.get("action") != "enqueue":
            raise ReviewError(400, "invalid_action")
        # Validation and image decoding happen in memory. No photograph is ever
        # inserted into the persistent SQLite database, WAL, log or a temp file.
        pending = validation.enqueue(value)
        key = pending["job_key"]
        if not config.get("enabled"):
            raise ReviewError(503, "inference_disabled")
        with open(config["database"] + ".lock", "a") as lock:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return pending
            job = validation.claim()
            scores = factory(config["model"]).score(bytes(job["image"]))
            result = automatic_decision(scores, config["safe_threshold"], config["reject_threshold"])
            return dict(pending, status=result["decision"], result=result)
    finally:
        validation.close()
        queue.close()


def main():
    os.umask(0o077)
    status, result = 503, {"error": "review_unavailable"}
    try:
        config_path = pathlib.Path(os.environ["SCHIILD_REVIEW_CONFIG"]).resolve(strict=True)
        if config_path.stat().st_mode & 0o077:
            raise ValueError("private_configuration_required")
        config = json.loads(config_path.read_text())
        if os.environ.get("REQUEST_METHOD") != "POST":
            raise ReviewError(405, "post_required")
        if os.environ.get("HTTPS", "").lower() not in ("on", "1"):
            raise ReviewError(400, "https_required")
        length = int(os.environ.get("CONTENT_LENGTH", "0"))
        if not 0 < length <= MAX_BODY:
            raise ReviewError(413, "request_too_large")
        if os.environ.get("CONTENT_TYPE", "").split(";")[0] != "application/json":
            raise ReviewError(415, "json_required")
        body = sys.stdin.buffer.read(length)
        if len(body) != length:
            raise ReviewError(400, "incomplete_request")
        headers = {name: os.environ.get("HTTP_" + name.upper().replace("-", "_"), "") for name in ("x-review-timestamp", "x-review-nonce", "x-review-signature")}
        result, status = process(body, headers, config), 200
    except ReviewError as error:
        status, result = error.status, {"error": error.code}
    except Exception:
        pass  # Never emit configuration, credentials, image bytes or a stack trace.
    sys.stdout.write("Status: {}\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n".format(status))
    sys.stdout.write(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
