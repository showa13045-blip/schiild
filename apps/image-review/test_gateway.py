"""Exercise the real Linux gateway without downloading models or user photos."""
import base64
import hashlib
import json
import os
import pathlib
import secrets
import sqlite3
import tempfile
import time
import unittest
from gateway import process
from review_queue import ReviewError, signature


@unittest.skipIf(os.name == "nt", "Xserver uses Linux flock")
class GatewayTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.config = dict(database=str(pathlib.Path(self.directory.name) / "results.sqlite3"), secret="a"*64, policy_version="test-v1", model="not-loaded", enabled=True, safe_threshold=.8, reject_threshold=.8)
        self.calls = 0
        outer = self
        class Model:
            def __init__(self, path):
                outer.calls += 1
            def score(self, image):
                return dict(gore=.01, sexual=.01, clear=.98)
        self.factory = Model

    def tearDown(self):
        self.directory.cleanup()

    def request(self, image=b"\xff\xd8test\xff\xd9"):
        value = dict(action="enqueue", job_key="b"*64, policy_version="test-v1", image_base64=base64.b64encode(image).decode())
        body = json.dumps(value).encode()
        stamp, nonce = str(int(time.time())), secrets.token_hex(16)
        headers = {"x-review-timestamp":stamp, "x-review-nonce":nonce, "x-review-signature":signature(self.config["secret"], stamp, nonce, body)}
        return body, headers

    def test_signed_inference_and_no_persistent_photographs(self):
        result = process(*self.request(), self.config, self.factory)
        self.assertEqual(result["status"], "approved")
        self.assertEqual(process(*self.request(), self.config, self.factory), result)
        self.assertEqual(self.calls, 2)
        with sqlite3.connect(self.config["database"]) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='local_results'").fetchone()[0], 0)
        body, headers = self.request()
        with self.assertRaises(ReviewError):
            process(body+b" ", headers, self.config, self.factory)

    def test_technical_failure_never_approves_or_persists_image(self):
        def broken(path):
            raise RuntimeError("test model unavailable")
        with self.assertRaises(RuntimeError):
            process(*self.request(), self.config, broken)
        with sqlite3.connect(self.config["database"]) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sqlite_master WHERE name='local_results'").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
