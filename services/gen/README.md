# Generation engine (M1)

Rust implements integer BSP, centered area averaging, Oklab palette quantization, tile-local Floyd–Steinberg diffusion, VoidCells, version marks, PNG output and bucket rendering. The TypeScript wrapper calls the same Rust BSP compiled to WASM.

## Build and test

```sh
pnpm build:gen
rustup target add wasm32-unknown-unknown
pnpm build:wasm
pnpm test:rust
pnpm test:wasm
pnpm test:gen-performance
```

The performance test measures **prepared samples → rendering and PNG encoding**, not JPEG decoding, hashing, sample preparation or disk writes. The full CLI currently exceeds 200 ms. See `docs/M1-REPORT.md`; do not interpret the core benchmark as passing the entire M1 latency requirement.

## Input

`--input-dir` contains JPEG files (1080×1080) and `manifest.json`:

```json
[
  {"user_id":"00000000-0000-0000-0000-000000000001","slot_index":0,"image":"photo.jpg"}
]
```

`image_sha256` is optional; if provided it must match file bytes. Slots are zero-based and stable across removals. Missing slots are not compacted. Duplicate slots/users, invalid dates, wrong formats/sizes, mismatched hashes and paths outside the input directory are rejected. Input files must remain immutable throughout generation.

```sh
cargo run --release -p gen -- --atelier-id 00000000-0000-0000-0000-000000000001 --date 2026-09-08 --capacity 12 --input-dir input --palette services/gen/palettes/provisional-32.json --out result
```

Output: `schiild.png` (1024²), `thumbnail.png` (256²), `region_map.json`, `metadata.json`, `used_seed.txt`, and `state.json`. The last file is the revision input: it contains base-canvas palette indices, configuration, seed, member/hash/slot mapping and immutable initial metadata. Existing output directories are rejected.

## Revisions (user-approved design)

Remove entries from the manifest without renumbering slots. Supply `--frozen-seed HEX --previous result --out revision-1`.

- The previous configuration, palette, seed and version must match. Additions/replacements are rejected.
- Bucket mode changes only coordinates belonging to removed inputs. Remaining members in a shared bucket determine its new mean; empty affected buckets become VoidCells. Other coordinates retain previous pixels; interpolation is not rerun.
- Initial metadata is preserved, including JSON floating-point round trips. `--previous` is therefore required for CLI revisions in **both** rendering modes. The library can use a chosen seed for initial rendering, independently of revision mode.
- This is a rights-removal engine capability, not a user-facing withdrawal/repost feature.

## Reproducibility conventions

These are implementation conventions to make the pseudocode executable; they are recorded for review, not changes to the original documents.

- SHA input: UTF-8 version (`v1.0.0`), canonical lowercase UUID, ISO date, then lexicographically sorted **raw 32-byte** image hashes. Hash multiplicity is retained. Frozen seeds bypass recalculation.
- ChaCha20 0.3.1 uses explicit u32 draws, rejection-sampled bounded indices and Fisher–Yates shuffle. Area ties use stable list indices; top 45% rounds down, at least one. Split positions round halfway upward and clamp to integer bounds.
- Variance 0.55, dither 0.6, no posterize, gutter 0. Gutter candidates 0–3 are trailing interior insets in base-canvas pixels. Narrow tiles may be consumed by an inset; the comparison sheet exposes this tradeoff. No gutter choice has been approved for production.
- Void noise uses a dedicated ChaCha20 stream consumed over the entire grid in row-major order regardless of occupancy: 1/16 second-darkest palette color, otherwise darkest.
- Bucket hash is raw image SHA + UTF-8 date, modulo 65536 (big-endian hash integer). Collisions are averaged in slot order in Oklab.
- Initial bucket fill averages the four nearest occupied coordinates by Manhattan distance (equal weight); ties follow deterministic BFS insertion order starting with row-major sources. Edge neighbors do not wrap. Fewer than four sources use available sources; all-empty input uses VoidCells. This interpretation of unspecified interpolation details is provisional and reviewable.
- A four-pixel horizontal version mark at each corner uses the version SHA bytes modulo palette length. Marks are invariant across revisions.
- `schiild_index` is supplied with `--schiild-index`; the default 1 is for standalone evaluation. M2 must provide the actual index. `void_ratio` follows the specification's slot-count example; symmetry is horizontal mirror pixel equality; dominant hue is the hue of the histogram-weighted Oklab mean. These metric definitions are provisional where the specification has no formula.
- Algorithm changes after acceptance require a version change and regenerated reproducibility fixtures. Do not mutate accepted behavior under the same version string.

## Palette and evaluation

Python 3.12+, numpy 2.3.5 and Pillow 12.3.0:

```sh
python scripts/build-palette.py --out services/gen/palettes/provisional-32.json
python scripts/build-palette.py --corpus photos --out corpus-candidate.json
python scripts/test-gen-cli.py --gen target/release/gen
python scripts/evaluate-gen.py --gen target/release/gen --palette services/gen/palettes/provisional-32.json --out evaluation
```

Use `gen.exe` on Windows. The analytical palette is provisional: six fixed neutrals and 26 deterministic farthest-point choices in Oklab. Corpus mode samples an 8×8 grid per image, performs 20 Lloyd iterations with fixed neutral centers, and snaps non-neutral centers to distinct in-gamut candidates. Production still requires a representative corpus and manual spacing review.

Evaluation produces participation/fill, gutter and resolution/dither/posterize contact sheets plus timing JSON. Inputs are explicitly synthetic JPEG fixtures, not real user photographs or substitute works in the app. Synthetic images cannot establish photographic G-4 visual acceptance.

Oklab conversion follows the [author's published matrices](https://bottosson.github.io/posts/oklab/). Native/WASM tests compare layout only; cross-architecture rendering PNG equality is not yet claimed.

## Preparation optimizations

Per invocation, repeated manifest image paths share canonicalization and SHA calculation. Expected hashes are still checked on every row. Images are grouped by SHA and decoded once per group; samples are shared by tile dimensions. `--workers 1..8` controls bounded parallel preparation (default: available CPUs capped at eight, about 28 MB of decoded RGB at most). Pixel accumulation within each image remains sequential. Inputs must stay immutable during a run.
Bucket averages use an exact 256-value sRGB transfer lookup and a bounded 4096-entry full-RGB-key cache. No pixels are skipped and accumulation order is unchanged. Bucket interpolation uses flat arrays with the same BFS order. See `docs/M1-PERFORMANCE.md` for byte-compatibility evidence and the still-unmet complete CLI latency requirement.
