use gen::{bsp, color::lab, render::*};
use sha2::{Digest, Sha256};
fn config(capacity: usize) -> Config {
    Config {
        atelier_id: "00000000-0000-0000-0000-000000000001".into(),
        date: "2026-09-08".into(),
        capacity,
        tier: if capacity > 800 {
            "bucket"
        } else if capacity > 200 {
            "bsp_256"
        } else {
            "bsp_128"
        }
        .into(),
        resolution: if capacity > 200 { 256 } else { 128 },
        variance: 0.55,
        dither: 0.6,
        posterize: None,
        gutter: 0,
        schiild_index: 1,
        palette: (0..32)
            .map(|n| [(n * 8) as u8, (n * 5) as u8, (n * 3) as u8])
            .collect(),
    }
}
fn prepared(c: &Config, seed: [u8; 32], n: usize) -> Vec<Prepared> {
    let rects = if c.tier == "bucket" {
        vec![]
    } else {
        bsp(seed, c.capacity, c.resolution, c.variance).unwrap()
    };
    (0..n)
        .map(|slot| Prepared {
            member: Member {
                user_id: format!("00000000-0000-0000-0000-{slot:012}"),
                slot_index: slot,
                image_sha256: hex(&Sha256::digest(slot.to_le_bytes())),
            },
            samples: vec![
                lab([(slot * 31 % 256) as f64, 90.0, 150.0]);
                if c.tier == "bucket" {
                    1
                } else {
                    (rects[slot].w * rects[slot].h) as usize
                }
            ],
        })
        .collect()
}
#[test]
fn determinism_png_and_input_order() {
    for n in [1, 3, 7, 12, 50, 200, 500, 2000] {
        let c = config(n);
        let mut inputs = prepared(&c, [7; 32], n);
        let a = generate(&c, [7; 32], &inputs, None).unwrap();
        inputs.reverse();
        let b = generate(&c, [7; 32], &inputs, None).unwrap();
        assert_eq!(a.png, b.png, "capacity {n}");
        assert_eq!(a.thumbnail, b.thumbnail);
        assert_eq!(a.state.pixels, b.state.pixels);
        let image = image::load_from_memory(&a.png).unwrap();
        assert_eq!((image.width(), image.height()), (1024, 1024));
    }
}
#[test]
fn determinism_frozen_seed_removal_preserves_every_other_pixel() {
    for n in [12, 500, 2000] {
        let c = config(n);
        let mut inputs = prepared(&c, [3; 32], n);
        let a = generate(&c, [3; 32], &inputs, None).unwrap();
        let removed = inputs.remove(n / 2);
        let target = a
            .regions
            .iter()
            .find(|r| r.slot_index == removed.member.slot_index)
            .unwrap()
            .rect
            .unwrap();
        let b = generate(
            &c,
            [3; 32],
            &inputs,
            if n > 800 { Some(&a.state) } else { None },
        )
        .unwrap();
        for y in 0..c.resolution {
            for x in 0..c.resolution {
                if x < target.x
                    || y < target.y
                    || x >= target.x + target.w
                    || y >= target.y + target.h
                {
                    let position = (y * c.resolution + x) as usize;
                    assert_eq!(
                        a.state.pixels[position], b.state.pixels[position],
                        "outside removed region {n} at {x},{y}"
                    );
                }
            }
        }
    }
}
#[test]
fn determinism_repeated_bucket_removals_and_noop() {
    let c = config(2000);
    let mut inputs = prepared(&c, [2; 32], 2000);
    let mut state = generate(&c, [2; 32], &inputs, None).unwrap().state;
    for _ in 0..3 {
        let removed = inputs.remove(400);
        let coordinate = bucket(&removed.member, &c.date).unwrap();
        let next = generate(&c, [2; 32], &inputs, Some(&state)).unwrap().state;
        assert_eq!(state.metadata, next.metadata);
        for p in 0..state.pixels.len() {
            if p != coordinate {
                assert_eq!(state.pixels[p], next.pixels[p]);
            }
        }
        state = next;
    }
    let noop = generate(&c, [2; 32], &inputs, Some(&state)).unwrap();
    assert_eq!(state.pixels, noop.state.pixels);
}
#[test]
fn layout_partitions_integer_grid_without_gaps_or_overlaps() {
    for n in [1, 3, 7, 12, 50, 200, 500, 2000] {
        for byte in [0, 42, 255] {
            let rects = bsp([byte; 32], n, 256, 0.55).unwrap();
            let mut coverage = vec![0; 256 * 256];
            for r in rects {
                assert!(r.w > 0 && r.h > 0 && r.x + r.w <= 256 && r.y + r.h <= 256);
                for y in r.y..r.y + r.h {
                    for x in r.x..r.x + r.w {
                        coverage[(y * 256 + x) as usize] += 1;
                    }
                }
            }
            assert!(coverage.into_iter().all(|n| n == 1));
        }
    }
}
#[test]
fn seed_frozen_bypasses_recalculation() {
    let c = config(12);
    let mut members = prepared(&c, [1; 32], 12)
        .into_iter()
        .map(|p| p.member)
        .collect::<Vec<_>>();
    let a = generation_seed(&c, &members, None).unwrap();
    members.reverse();
    assert_eq!(a, generation_seed(&c, &members, None).unwrap());
    members.pop();
    assert_ne!(a, generation_seed(&c, &members, None).unwrap());
    assert_eq!(a, generation_seed(&c, &members, Some(a)).unwrap());
}
#[test]
fn rejects_replacement_or_incompatible_previous() {
    let c = config(2000);
    let inputs = prepared(&c, [2; 32], 3);
    let a = generate(&c, [2; 32], &inputs, None).unwrap();
    assert!(generate(&c, [3; 32], &inputs, Some(&a.state)).is_err());
    let mut changed = inputs.clone();
    changed[0].member.image_sha256 = "00".repeat(32);
    assert!(generate(&c, [2; 32], &changed, Some(&a.state)).is_err());
    let mut bad = a.state.clone();
    bad.pixels.pop();
    assert!(generate(&c, [2; 32], &inputs, Some(&bad)).is_err());
}
#[test]
fn empty_and_extreme_parameters() {
    for n in [1, 2000] {
        let c = config(n);
        assert!(generate(&c, [0; 32], &[], None).is_ok());
    }
    for variance in [0.0, 1.0] {
        assert!(bsp([0; 32], 2000, 256, variance).is_ok());
    }
    assert!(bsp([0; 32], 0, 128, 0.5).is_err());
    assert!(bsp([0; 32], 1, 128, f64::NAN).is_err());
}
#[test]
fn area_average_and_color_conversion() {
    let c = config(1);
    let member = prepared(&c, [0; 32], 1).remove(0).member;
    let image = image::RgbImage::from_pixel(1080, 1080, image::Rgb([255, 0, 0]));
    let p = prepare(
        &image,
        member,
        Some(gen::Rect {
            x: 0,
            y: 0,
            w: 3,
            h: 7,
        }),
        &c,
    )
    .unwrap();
    assert!(p
        .samples
        .iter()
        .all(|sample| (sample[0] - 0.62795536).abs() < 1e-6));
    assert!((lab([255.0; 3])[0] - 1.0).abs() < 1e-6);
}
#[test]
#[ignore = "release-only performance gate: cargo test --release --test determinism performance -- --ignored --nocapture"]
fn performance_2000_prepared_members_under_200ms() {
    let c = config(2000);
    let inputs = prepared(&c, [2; 32], 2000);
    generate(&c, [2; 32], &inputs, None).unwrap();
    let start = std::time::Instant::now();
    let output = generate(&c, [2; 32], &inputs, None).unwrap();
    let elapsed = start.elapsed();
    println!(
        "2000 prepared members including PNG encoding: {elapsed:?}, {} bytes",
        output.png.len()
    );
    assert!(elapsed < std::time::Duration::from_millis(200));
}

#[test]
fn rgb_cache_preserves_full_image_average_bits() {
    let c = config(2000);
    let member = prepared(&c, [0; 32], 1).remove(0).member;
    let image = image::RgbImage::from_fn(1080, 1080, |x, y| {
        image::Rgb([
            ((x * 17 + y * 11) % 256) as u8,
            ((x * 7 + y * 29) % 256) as u8,
            ((x + y * 13) % 256) as u8,
        ])
    });
    let actual = prepare(&image, member, None, &c).unwrap().samples[0];
    let mut sum = [0.0; 3];
    for pixel in image.pixels() {
        let value = lab(pixel.0.map(f64::from));
        for k in 0..3 {
            sum[k] += value[k];
        }
    }
    assert_eq!(
        actual.map(f64::to_bits),
        sum.map(|v| (v / (1080.0 * 1080.0)).to_bits())
    );
}
