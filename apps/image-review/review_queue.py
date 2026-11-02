"""Schiild demo image-review queue. Runs on Xserver, with Python 3.6+ stdlib.

No inference, external transmission or automatic approval is enabled by this module.
The application keeps the account mapping; this service accepts only opaque keys.
"""
import base64
import contextlib
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time

MAX_BODY = 6 * 1024 * 1024
MAX_IMAGE = 4 * 1024 * 1024
KEY = re.compile(r"^[a-f0-9]{64}$")
NONCE = re.compile(r"^[a-f0-9]{32}$")
TERMINAL = ("approved", "rejected", "failed", "cancelled")


class ReviewError(Exception):
    def __init__(self, status, code):
        self.status = status
        self.code = code
        super().__init__(code)


def signature(secret, timestamp, nonce, body):
    digest = hashlib.sha256(body).hexdigest()
    value = ("schiild-image-review-v1\n" + str(timestamp) + "\n" + nonce + "\n" + digest).encode("ascii")
    return hmac.new(secret.encode("ascii"), value, hashlib.sha256).hexdigest()


class ReviewQueue:
    def __init__(self, database, secret, policy_version, now=time.time):
        if not KEY.fullmatch(secret) or not re.fullmatch(r"[a-z0-9.-]{1,80}", policy_version):
            raise ValueError("Invalid service configuration")
        self.secret, self.policy_version, self.now = secret, policy_version, now
        self.db = sqlite3.connect(database, timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=10000")
        self.db.executescript("""
          CREATE TABLE IF NOT EXISTS nonces(nonce TEXT PRIMARY KEY, expires REAL NOT NULL);
          CREATE TABLE IF NOT EXISTS jobs(
            job_key TEXT PRIMARY KEY, image_hash TEXT NOT NULL, policy_version TEXT NOT NULL,
            image BLOB, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
            available REAL NOT NULL, lease TEXT, lease_until REAL NOT NULL DEFAULT 0,
            result TEXT, error_code TEXT, created REAL NOT NULL, updated REAL NOT NULL);
          CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status,available,lease_until);
        """)

    @contextlib.contextmanager
    def transaction(self):
        self.db.execute("BEGIN IMMEDIATE")
        try:
            yield
        except BaseException:
            self.db.execute("ROLLBACK")
            raise
        else:
            self.db.execute("COMMIT")

    def close(self):
        self.db.close()

    def authenticate(self, body, headers):
        if not isinstance(body, bytes) or len(body) > MAX_BODY:
            raise ReviewError(413, "request_too_large")
        stamp = headers.get("x-review-timestamp", "")
        nonce = headers.get("x-review-nonce", "")
        provided = headers.get("x-review-signature", "")
        if not re.fullmatch(r"[0-9]{10}", stamp) or not NONCE.fullmatch(nonce) or not KEY.fullmatch(provided):
            raise ReviewError(401, "unauthorized")
        if abs(self.now() - int(stamp)) > 120 or not hmac.compare_digest(signature(self.secret, stamp, nonce, body), provided):
            raise ReviewError(401, "unauthorized")
        with self.transaction():
            self.db.execute("DELETE FROM nonces WHERE expires<?", (self.now(),))
            try:
                self.db.execute("INSERT INTO nonces VALUES(?,?)", (nonce, self.now() + 300))
            except sqlite3.IntegrityError:
                raise ReviewError(409, "request_replayed")

    def handle(self, body, headers):
        self.authenticate(body, headers)
        try:
            value = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeError):
            raise ReviewError(400, "invalid_json")
        if not isinstance(value, dict):
            raise ReviewError(400, "invalid_request")
        action = value.get("action")
        if action == "health" and set(value) == {"action"}:
            return {"service": "schiild-image-review", "policy_version": self.policy_version, "inference_enabled": False}
        if action == "enqueue":
            return self.enqueue(value)
        if action in ("result", "cancel"):
            if set(value) != {"action", "job_key"} or not isinstance(value["job_key"], str) or not KEY.fullmatch(value["job_key"]):
                raise ReviewError(400, "invalid_request")
            if action == "cancel":
                with self.transaction():
                    self.db.execute("UPDATE jobs SET status='cancelled',image=NULL,result=NULL,lease=NULL,lease_until=0,updated=? WHERE job_key=?", (self.now(), value["job_key"]))
                return {"cancelled": True}
            row = self.db.execute("SELECT * FROM jobs WHERE job_key=?", (value["job_key"],)).fetchone()
            if row is None:
                raise ReviewError(404, "not_found")
            return self.public(row)
        raise ReviewError(400, "invalid_action")

    def enqueue(self, value):
        if set(value) != {"action", "job_key", "policy_version", "image_base64"}:
            raise ReviewError(400, "invalid_request")
        if not isinstance(value["job_key"], str) or not KEY.fullmatch(value["job_key"]) or value["policy_version"] != self.policy_version:
            raise ReviewError(409, "policy_mismatch")
        if not isinstance(value["image_base64"], str):
            raise ReviewError(400, "invalid_image")
        try:
            image = base64.b64decode(value["image_base64"], validate=True)
        except (ValueError, TypeError):
            raise ReviewError(400, "invalid_image")
        if not 4 <= len(image) <= MAX_IMAGE or not image.startswith(b"\xff\xd8") or not image.endswith(b"\xff\xd9"):
            raise ReviewError(400, "invalid_image")
        digest = hashlib.sha256(image).hexdigest()
        with self.transaction():
            row = self.db.execute("SELECT * FROM jobs WHERE job_key=?", (value["job_key"],)).fetchone()
            if row is not None:
                if row["image_hash"] != digest or row["policy_version"] != self.policy_version:
                    raise ReviewError(409, "submission_conflict")
                if row["status"] in ("queued", "retry"):
                    self.db.execute("UPDATE jobs SET image=? WHERE job_key=?", (image, value["job_key"]))
                return self.public(row)
            self.db.execute("INSERT INTO jobs(job_key,image_hash,policy_version,image,status,available,created,updated) VALUES(?,?,?,?,'queued',?,?,?)", (value["job_key"], digest, self.policy_version, image, self.now(), self.now(), self.now()))
        return {"job_key": value["job_key"], "image_hash": digest, "status": "queued", "policy_version": self.policy_version, "result": None}

    @staticmethod
    def public(row):
        return {"job_key": row["job_key"], "image_hash": row["image_hash"], "status": row["status"], "policy_version": row["policy_version"], "result": json.loads(row["result"]) if row["result"] else None}

    def claim(self):
        with self.transaction():
            row = self.db.execute("SELECT * FROM jobs WHERE image IS NOT NULL AND status IN ('queued','retry','running') AND available<=? AND lease_until<=? ORDER BY created,job_key LIMIT 1", (self.now(), self.now())).fetchone()
            if row is None:
                return None
            if row["attempts"] >= 5 or self.now() - row["created"] > 86400:
                self.db.execute("UPDATE jobs SET status='failed',image=NULL,error_code='review_unavailable',lease=NULL,lease_until=0,updated=? WHERE job_key=?", (self.now(), row["job_key"]))
                return None
            lease = secrets.token_hex(16)
            self.db.execute("UPDATE jobs SET status='running',attempts=attempts+1,lease=?,lease_until=?,updated=? WHERE job_key=?", (lease, self.now()+120, self.now(), row["job_key"]))
            job = dict(row)
            job["lease"], job["attempts"] = lease, row["attempts"] + 1
            return job

    def finish(self, job, result):
        if not isinstance(result, dict) or result.get("decision") not in ("approved", "rejected") or not isinstance(result.get("reasons"), list) or not all(isinstance(reason, str) and re.fullmatch(r"[a-z0-9_]{1,40}", reason) for reason in result["reasons"]):
            raise ReviewError(502, "invalid_model_result")
        if result["decision"] == "rejected" and not result["reasons"]:
            raise ReviewError(502, "missing_rejection_reason")
        # A result may only affect the exact leased image and policy, never its replacement.
        encoded = json.dumps(result, separators=(",", ":"))
        with self.transaction():
            changed = self.db.execute("UPDATE jobs SET status=?,result=?,image=NULL,lease=NULL,lease_until=0,error_code=NULL,updated=? WHERE job_key=? AND lease=? AND image_hash=? AND policy_version=? AND status='running' AND lease_until>?", (result["decision"], encoded, self.now(), job["job_key"], job["lease"], job["image_hash"], job["policy_version"], self.now())).rowcount
        return bool(changed)

    def retry(self, job):
        with self.transaction():
            self.db.execute("UPDATE jobs SET status='retry',available=?,lease=NULL,lease_until=0,error_code='provider_unavailable',updated=? WHERE job_key=? AND lease=? AND status='running'", (self.now()+min(3600,30*2**min(6,job["attempts"])), self.now(), job["job_key"], job["lease"]))
