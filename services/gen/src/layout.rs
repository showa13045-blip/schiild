use rand_chacha::ChaCha20Rng;
use rand_core::{RngCore, SeedableRng};
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Rect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}
fn pick(rng: &mut ChaCha20Rng, count: usize) -> usize {
    let bound = count as u32;
    let threshold = bound.wrapping_neg() % bound;
    loop {
        let value = rng.next_u32();
        if value >= threshold {
            return (value % bound) as usize;
        }
    }
}
pub fn bsp(seed: [u8; 32], capacity: usize, size: u32, variance: f64) -> Result<Vec<Rect>, String> {
    if size == 0
        || size > 256
        || capacity == 0
        || capacity > (size * size) as usize
        || !variance.is_finite()
        || !(0.0..=1.0).contains(&variance)
    {
        return Err("invalid BSP parameters".into());
    }
    let mut rng = ChaCha20Rng::from_seed(seed);
    let mut rects = vec![Rect {
        x: 0,
        y: 0,
        w: size,
        h: size,
    }];
    while rects.len() < capacity {
        let mut ranked: Vec<usize> = (0..rects.len())
            .filter(|&n| rects[n].w * rects[n].h > 1)
            .collect();
        ranked.sort_by_key(|&n| (std::cmp::Reverse(rects[n].w * rects[n].h), n));
        let count = ((rects.len() * 45 / 100).max(1)).min(ranked.len());
        let target = ranked[pick(&mut rng, count)];
        let rect = rects[target];
        let vertical = rect.w >= rect.h;
        let length = if vertical { rect.w } else { rect.h };
        let unit = f64::from(rng.next_u32()) / 4294967296.0;
        let cut = ((f64::from(length) / 2.0
            + (unit * 2.0 - 1.0) * variance * f64::from(length) * 0.34)
            .round() as u32)
            .clamp(1, length - 1);
        if vertical {
            rects[target].w = cut;
            rects.push(Rect {
                x: rect.x + cut,
                w: rect.w - cut,
                ..rect
            });
        } else {
            rects[target].h = cut;
            rects.push(Rect {
                y: rect.y + cut,
                h: rect.h - cut,
                ..rect
            });
        }
    }
    for index in (1..rects.len()).rev() {
        let other = pick(&mut rng, index + 1);
        rects.swap(index, other);
    }
    Ok(rects)
}
