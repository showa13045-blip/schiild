"""Local-only Hugging Face ONNX inference. No uploads, telemetry or network client.

Scope: the selected model distinguishes sexual content and gore. It does not
verify copyright, consent, identities, dangerous instructions or legality.
"""
import hashlib
import io
import math
import warnings

MODEL_REPOSITORY = "OwenElliott/image-safety-classifier-s"
MODEL_REVISION = "015042b0eab17f1b17f2986527386346fb0d94be"
MODEL_SHA256 = "fef443ed68ae25ed693b6fef9e456071692ed3963cff4168acb39c3de6f017e7"


def automatic_decision(scores, safe_threshold, reject_threshold):
    if set(scores) != {"gore", "sexual", "clear"} or any(not isinstance(v, (float, int)) or not math.isfinite(v) or not 0 <= v <= 1 for v in scores.values()) or abs(sum(scores.values()) - 1) > 0.01:
        raise ValueError("invalid_model_scores")
    if not 0.5 < safe_threshold <= 1 or not 0.5 < reject_threshold <= 1:
        raise ValueError("invalid_policy_thresholds")
    reasons = [key for key in ("gore", "sexual") if scores[key] >= reject_threshold]
    if reasons:
        decision = "rejected"
    elif scores["clear"] >= safe_threshold:
        decision = "approved"
    else:
        decision, reasons = "rejected", ["uncertain"]
    return {"decision": decision, "reasons": reasons, "scores": scores, "model": MODEL_REPOSITORY, "revision": MODEL_REVISION, "coverage": ["sexual", "gore"]}


class LocalModel:
    def __init__(self, model_path):
        import onnxruntime as ort
        from PIL import Image
        with open(model_path, "rb") as handle:
            if hashlib.sha256(handle.read()).hexdigest() != MODEL_SHA256:
                raise ValueError("model_hash_mismatch")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 1
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        self.session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
        inputs = self.session.get_inputs()
        if len(inputs) != 1 or inputs[0].name != "image" or inputs[0].type != "tensor(float)":
            raise ValueError("unexpected_model_interface")
        Image.MAX_IMAGE_PIXELS = 16000000

    def score(self, image_bytes):
        import numpy as np
        from PIL import Image, ImageOps
        if not isinstance(image_bytes, bytes) or not 4 <= len(image_bytes) <= 4 * 1024 * 1024:
            raise ValueError("invalid_image")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(image_bytes)) as image:
                if image.format != "JPEG" or getattr(image, "n_frames", 1) != 1 or image.width * image.height > 16000000:
                    raise ValueError("unsupported_image")
                pixels = np.array(ImageOps.exif_transpose(image).convert("RGB").resize((224, 224), Image.Resampling.BILINEAR), dtype=np.float32).transpose(2, 0, 1)[np.newaxis]
        values = self.session.run(None, {"image": pixels})[0]
        if values.shape != (1, 3):
            raise ValueError("unexpected_model_output")
        scores = dict(zip(("gore", "sexual", "clear"), [float(v) for v in values[0]]))
        # Validate even when the caller only requests benchmark scores.
        automatic_decision(scores, 0.99, 0.99)
        return scores
