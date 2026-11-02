"""Benchmark non-personal generated samples. This is not an accuracy audit."""
import argparse
import json
import pathlib
import statistics
import time
from local_model import LocalModel, MODEL_REPOSITORY, MODEL_REVISION


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("model")
    parser.add_argument("samples")
    parser.add_argument("output")
    args = parser.parse_args()
    started = time.monotonic()
    model = LocalModel(args.model)
    load_seconds = time.monotonic() - started
    results = []
    for sample in sorted(pathlib.Path(args.samples).glob("demo-*.jpg")):
        started = time.monotonic()
        scores = model.score(sample.read_bytes())
        results.append({"sample": sample.name, "seconds": time.monotonic()-started, "scores": scores})
    if not results:
        raise ValueError("No generated samples")
    try:
        import resource
        peak_kib = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    except ImportError:
        peak_kib = None
    report = {"model": MODEL_REPOSITORY, "revision": MODEL_REVISION, "provider": "local-onnx-cpu", "threads": 1, "load_seconds": load_seconds, "samples": len(results), "mean_seconds": statistics.mean(v["seconds"] for v in results), "max_seconds": max(v["seconds"] for v in results), "peak_rss_kib": peak_kib, "external_image_transmission": False, "accuracy_validated": False, "results": results}
    pathlib.Path(args.output).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k != "results"}))


if __name__ == "__main__":
    run()
