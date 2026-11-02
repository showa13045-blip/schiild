import base64
import hashlib
import json
import pathlib
import secrets
import tempfile
import unittest
from local_model import automatic_decision
from review_queue import ReviewError, ReviewQueue, signature


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.time = 1793610000
        self.secret = "a" * 64
        self.queue = ReviewQueue(":memory:", self.secret, "test-v1", now=lambda:self.time)

    def tearDown(self):
        self.queue.close()

    def request(self, value):
        body = json.dumps(value).encode()
        nonce = secrets.token_hex(16)
        stamp = str(self.time)
        headers = {"x-review-timestamp":stamp,"x-review-nonce":nonce,"x-review-signature":signature(self.secret,stamp,nonce,body)}
        return body, headers

    def submit(self, **changes):
        value = dict(action="enqueue", job_key="b"*64, policy_version="test-v1", image_base64=base64.b64encode(b"\xff\xd8test\xff\xd9").decode())
        value.update(changes)
        return self.queue.handle(*self.request(value))

    def test_signed_requests_expiry_replay_and_deduplication(self):
        body, headers = self.request({"action":"health"})
        self.assertFalse(self.queue.handle(body,headers)["inference_enabled"])
        with self.assertRaises(ReviewError): self.queue.handle(body,headers)
        body, headers = self.request({"action":"health"})
        with self.assertRaises(ReviewError): self.queue.handle(body+b" ",headers)
        self.time += 121
        with self.assertRaises(ReviewError): self.queue.handle(body,headers)
        self.assertEqual(self.submit()["status"],"queued")
        self.assertEqual(self.submit()["status"],"queued")
        with self.assertRaises(ReviewError): self.submit(image_base64=base64.b64encode(b"\xff\xd8other\xff\xd9").decode())
        with self.assertRaises(ReviewError): self.submit(policy_version="old")

    def test_lease_recovery_cancellation_and_terminal_image_purge(self):
        self.submit()
        first = self.queue.claim()
        self.assertIsNone(self.queue.claim())
        self.time += 121
        second = self.queue.claim()
        result = {"decision":"rejected","reasons":["uncertain"]}
        self.assertFalse(self.queue.finish(first,result))
        self.assertTrue(self.queue.finish(second,result))
        self.assertIsNone(self.queue.db.execute("SELECT image FROM jobs").fetchone()[0])
        self.submit(job_key="c"*64)
        job = self.queue.claim()
        self.queue.handle(*self.request({"action":"cancel","job_key":"c"*64}))
        self.assertFalse(self.queue.finish(job,result))

    def test_provider_failure_never_becomes_approval(self):
        self.submit()
        for _ in range(5):
            job = self.queue.claim()
            self.queue.retry(job)
            self.time += 4000
        self.assertIsNone(self.queue.claim())
        self.assertEqual(self.queue.db.execute("SELECT status FROM jobs").fetchone()[0],"failed")


class PolicyTests(unittest.TestCase):
    def test_configured_automatic_decisions_and_invalid_results(self):
        self.assertEqual(automatic_decision(dict(gore=0.001,sexual=0.001,clear=0.998),.98,.98)["decision"],"approved")
        self.assertEqual(automatic_decision(dict(gore=.99,sexual=.005,clear=.005),.98,.98)["reasons"],["gore"])
        self.assertEqual(automatic_decision(dict(gore=.2,sexual=.2,clear=.6),.98,.98)["reasons"],["uncertain"])
        for scores in ({},dict(gore=float("nan"),sexual=0,clear=1),dict(gore=.9,sexual=.9,clear=.9)):
            with self.assertRaises(ValueError): automatic_decision(scores,.98,.98)


if __name__ == "__main__":
    unittest.main()
