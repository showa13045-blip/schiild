use crate::{
    bsp,
    color::{lab, nearest, Lab},
    Rect,
};
use image::{
    codecs::png::{CompressionType, FilterType, PngEncoder},
    ImageEncoder, Rgb, RgbImage,
};
use rand_chacha::ChaCha20Rng;
use rand_core::{RngCore, SeedableRng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet, VecDeque};

pub const VERSION: &str = "v1.0.0";
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Config {
    pub atelier_id: String,
    pub date: String,
    pub capacity: usize,
    pub tier: String,
    pub resolution: u32,
    pub variance: f64,
    pub dither: f64,
    pub posterize: Option<u8>,
    pub gutter: u32,
    pub palette: Vec<[u8; 3]>,
    pub schiild_index: u64,
}
impl Config {
    pub fn validate(&self) -> Result<(), String> {
        if self.capacity == 0
            || self.capacity > 10000
            || self.palette.len() != 32
            || self.gutter > 3
            || !self.variance.is_finite()
            || !(0.0..=1.0).contains(&self.variance)
            || !self.dither.is_finite()
            || !(0.0..=1.0).contains(&self.dither)
            || self.posterize.is_some_and(|n| n < 2)
        {
            return Err("invalid configuration".into());
        }
        if !["bsp_128", "bsp_256", "bucket"].contains(&self.tier.as_str())
            || self.resolution == 0
            || self.resolution > 256
        {
            return Err("invalid tier or resolution".into());
        }
        if self.tier == "bucket" && self.resolution != 256 {
            return Err("bucket resolution must be 256".into());
        }
        if self.tier != "bucket" && self.capacity > (self.resolution * self.resolution) as usize {
            return Err("capacity exceeds integer grid".into());
        }
        Ok(())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Member {
    pub user_id: String,
    pub slot_index: usize,
    pub image_sha256: String,
}
#[derive(Clone)]
pub struct Prepared {
    pub member: Member,
    pub samples: Vec<Lab>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct State {
    pub version: String,
    pub config: Config,
    pub seed: String,
    pub members: Vec<Member>,
    pub pixels: Vec<u8>,
    pub metadata: serde_json::Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Region {
    pub slot_index: usize,
    pub user_id: Option<String>,
    pub rect: Option<Rect>,
    pub void_cell: bool,
}
pub struct Artifact {
    pub state: State,
    pub regions: Vec<Region>,
    pub png: Vec<u8>,
    pub thumbnail: Vec<u8>,
}
pub fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|v| format!("{v:02x}")).collect()
}
pub fn seed_hex(text: &str) -> Result<[u8; 32], String> {
    if text.len() != 64 || !text.is_ascii() {
        return Err("seed must be 64 hex characters".into());
    }
    let mut seed = [0; 32];
    for (n, byte) in seed.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&text[n * 2..n * 2 + 2], 16).map_err(|_| "invalid seed")?;
    }
    Ok(seed)
}
pub fn generation_seed(
    config: &Config,
    members: &[Member],
    frozen: Option<[u8; 32]>,
) -> Result<[u8; 32], String> {
    if let Some(seed) = frozen {
        return Ok(seed);
    }
    let mut hashes = members
        .iter()
        .map(|m| seed_hex(&m.image_sha256))
        .collect::<Result<Vec<_>, _>>()?;
    hashes.sort();
    let mut hasher = Sha256::new();
    hasher.update(VERSION.as_bytes());
    hasher.update(config.atelier_id.as_bytes());
    hasher.update(config.date.as_bytes());
    for hash in hashes {
        hasher.update(hash);
    }
    Ok(hasher.finalize().into())
}
pub fn bucket(member: &Member, date: &str) -> Result<usize, String> {
    let mut hasher = Sha256::new();
    hasher.update(seed_hex(&member.image_sha256)?);
    hasher.update(date.as_bytes());
    let digest = hasher.finalize();
    Ok(u16::from_be_bytes([digest[30], digest[31]]) as usize)
}
/// Exact overlap-weighted area average on the encoded sRGB sample grid; centered fractional crop.
pub fn prepare(
    image: &RgbImage,
    member: Member,
    rect: Option<Rect>,
    config: &Config,
) -> Result<Prepared, String> {
    if image.dimensions() != (1080, 1080) {
        return Err("input must be 1080 x 1080".into());
    }
    if config.tier == "bucket" {
        let mut sum = [0.0; 3];
        for pixel in image.pixels() {
            let value = lab(pixel.0.map(f64::from));
            for k in 0..3 {
                sum[k] += value[k];
            }
        }
        return Ok(Prepared {
            member,
            samples: vec![sum.map(|v| v / (1080.0 * 1080.0))],
        });
    }
    let rect = rect.ok_or("BSP rectangle required")?;
    let (cw, ch) = if rect.w >= rect.h {
        (1080.0, 1080.0 * f64::from(rect.h) / f64::from(rect.w))
    } else {
        (1080.0 * f64::from(rect.w) / f64::from(rect.h), 1080.0)
    };
    let (ox, oy) = ((1080.0 - cw) / 2.0, (1080.0 - ch) / 2.0);
    let mut samples = Vec::with_capacity((rect.w * rect.h) as usize);
    for y in 0..rect.h {
        for x in 0..rect.w {
            let (x0, x1) = (
                ox + f64::from(x) * cw / f64::from(rect.w),
                ox + f64::from(x + 1) * cw / f64::from(rect.w),
            );
            let (y0, y1) = (
                oy + f64::from(y) * ch / f64::from(rect.h),
                oy + f64::from(y + 1) * ch / f64::from(rect.h),
            );
            let mut sum = [0.0; 3];
            for sy in y0.floor() as u32..(y1.ceil() as u32).min(1080) {
                for sx in x0.floor() as u32..(x1.ceil() as u32).min(1080) {
                    let weight = (x1.min(f64::from(sx + 1)) - x0.max(f64::from(sx)))
                        * (y1.min(f64::from(sy + 1)) - y0.max(f64::from(sy)));
                    for (k, value) in sum.iter_mut().enumerate() {
                        *value += f64::from(image.get_pixel(sx, sy)[k]) * weight;
                    }
                }
            }
            let mut rgb = sum.map(|v| v / ((x1 - x0) * (y1 - y0)));
            if let Some(levels) = config.posterize {
                rgb = rgb.map(|v| {
                    (v / 255.0 * f64::from(levels - 1)).round() / f64::from(levels - 1) * 255.0
                });
            }
            samples.push(lab(rgb));
        }
    }
    Ok(Prepared { member, samples })
}
fn void_pixels(seed: [u8; 32], count: usize, darkest: usize, palette: &[Lab]) -> Vec<u8> {
    // A dedicated full-canvas stream is always consumed in row-major order.
    // Occupancy cannot change the random number associated with any coordinate.
    let mut rng = ChaCha20Rng::from_seed(seed);
    rng.set_stream(u64::MAX);
    let mut ranked = (0..palette.len()).collect::<Vec<_>>();
    ranked.sort_by(|&a, &b| palette[a][0].total_cmp(&palette[b][0]));
    (0..count)
        .map(|_| {
            if rng.next_u32().is_multiple_of(16) {
                ranked[1] as u8
            } else {
                darkest as u8
            }
        })
        .collect()
}

fn png(pixels: &[u8], size: u32, palette: &[[u8; 3]], output: u32) -> Result<Vec<u8>, String> {
    let mut image = RgbImage::new(output, output);
    for y in 0..output {
        for x in 0..output {
            image.put_pixel(
                x,
                y,
                Rgb(palette
                    [pixels[((y * size / output) * size + x * size / output) as usize] as usize]),
            );
        }
    }
    let mut bytes = Vec::new();
    PngEncoder::new_with_quality(&mut bytes, CompressionType::Fast, FilterType::Sub)
        .write_image(
            image.as_raw(),
            output,
            output,
            image::ExtendedColorType::Rgb8,
        )
        .map_err(|e| e.to_string())?;
    Ok(bytes)
}
/// Four nearest occupied cells by Manhattan distance, ties follow row-major source order.
/// Propagation is synchronous in BFS layers. No occupied cells means seeded VoidCells.
fn interpolate(pixels: &mut [u8], occupied: &BTreeMap<usize, Lab>, size: usize, palette: &[Lab]) {
    let mut queue = VecDeque::new();
    let mut sources = vec![Vec::<usize>::new(); pixels.len()];
    for &source in occupied.keys() {
        queue.push_back((source, source));
    }
    while let Some((position, source)) = queue.pop_front() {
        if sources[position].len() == 4 || sources[position].contains(&source) {
            continue;
        }
        sources[position].push(source);
        let (x, y) = (position % size, position / size);
        if x > 0 {
            queue.push_back((position - 1, source));
        }
        if x + 1 < size {
            queue.push_back((position + 1, source));
        }
        if y > 0 {
            queue.push_back((position - size, source));
        }
        if y + 1 < size {
            queue.push_back((position + size, source));
        }
    }
    for (position, neighbors) in sources.iter().enumerate() {
        if occupied.contains_key(&position) || neighbors.is_empty() {
            continue;
        }
        let mut value = [0.0; 3];
        for source in neighbors {
            for (k, v) in value.iter_mut().enumerate() {
                *v += occupied[source][k];
            }
        }
        pixels[position] = nearest(value.map(|v| v / neighbors.len() as f64), palette) as u8;
    }
}
pub fn generate(
    config: &Config,
    seed: [u8; 32],
    inputs: &[Prepared],
    previous: Option<&State>,
) -> Result<Artifact, String> {
    config.validate()?;
    let mut inputs = inputs.iter().collect::<Vec<_>>();
    inputs.sort_by_key(|p| p.member.slot_index);
    let mut users = BTreeSet::new();
    let mut slots = BTreeSet::new();
    for input in &inputs {
        seed_hex(&input.member.image_sha256)?;
        if input.member.slot_index >= config.capacity
            || !users.insert(&input.member.user_id)
            || !slots.insert(input.member.slot_index)
            || input.samples.iter().flatten().any(|v| !v.is_finite())
        {
            return Err("invalid or duplicate member".into());
        }
    }
    let members = inputs.iter().map(|p| p.member.clone()).collect::<Vec<_>>();
    let size = config.resolution;
    let count = (size * size) as usize;
    let palette = config
        .palette
        .iter()
        .map(|p| lab(p.map(f64::from)))
        .collect::<Vec<_>>();
    let darkest = palette
        .iter()
        .enumerate()
        .min_by(|(_, a), (_, b)| a[0].total_cmp(&b[0]))
        .unwrap()
        .0;
    if let Some(old) = previous {
        if old.version != VERSION
            || old.config != *config
            || old.seed != hex(&seed)
            || old.pixels.len() != count
            || old.pixels.iter().any(|&p| p >= 32)
        {
            return Err("previous artifact does not match configuration or seed".into());
        }
        if members.iter().any(|m| !old.members.contains(m)) {
            return Err("regeneration permits removals only".into());
        }
    }
    let void_values = void_pixels(seed, count, darkest, &palette);
    let mut pixels = previous.map_or_else(|| void_values.clone(), |old| old.pixels.clone());
    let mut regions = Vec::new();
    if config.tier == "bucket" {
        let mut sums: BTreeMap<usize, (Lab, usize)> = BTreeMap::new();
        for input in &inputs {
            if input.samples.len() != 1 {
                return Err("bucket requires one prepared Oklab average".into());
            }
            let coordinate = bucket(&input.member, &config.date)?;
            let entry = sums.entry(coordinate).or_insert(([0.0; 3], 0));
            for k in 0..3 {
                entry.0[k] += input.samples[0][k];
            }
            entry.1 += 1;
            regions.push(Region {
                slot_index: input.member.slot_index,
                user_id: Some(input.member.user_id.clone()),
                rect: Some(Rect {
                    x: coordinate as u32 % size,
                    y: coordinate as u32 / size,
                    w: 1,
                    h: 1,
                }),
                void_cell: false,
            });
        }
        let means = sums
            .iter()
            .map(|(&n, (sum, total))| (n, sum.map(|v| v / *total as f64)))
            .collect::<BTreeMap<_, _>>();
        let affected = if let Some(old) = previous {
            old.members
                .iter()
                .filter(|m| !members.contains(m))
                .map(|m| bucket(m, &config.date))
                .collect::<Result<BTreeSet<_>, _>>()?
        } else {
            means.keys().copied().collect()
        };
        for coordinate in affected {
            pixels[coordinate] = if let Some(value) = means.get(&coordinate) {
                nearest(*value, &palette) as u8
            } else {
                void_values[coordinate]
            };
        }
        if previous.is_none() {
            interpolate(&mut pixels, &means, size as usize, &palette);
        }
    } else {
        let rects = bsp(seed, config.capacity, size, config.variance)?;
        for (slot, rect) in rects.iter().enumerate() {
            let input = inputs.iter().find(|p| p.member.slot_index == slot);
            regions.push(Region {
                slot_index: slot,
                user_id: input.map(|p| p.member.user_id.clone()),
                rect: Some(*rect),
                void_cell: input.is_none(),
            });
            let mut samples = if let Some(input) = input {
                if input.samples.len() != (rect.w * rect.h) as usize {
                    return Err("prepared tile shape mismatch".into());
                }
                input.samples.clone()
            } else {
                Vec::new()
            };
            for y in 0..rect.h {
                for x in 0..rect.w {
                    let position = ((rect.y + y) * size + rect.x + x) as usize;
                    // Gutter is trailing inset, in base canvas pixels. Never outline the canvas edge.
                    let gutter = (rect.x + rect.w < size
                        && x >= rect.w.saturating_sub(config.gutter))
                        || (rect.y + rect.h < size && y >= rect.h.saturating_sub(config.gutter));
                    if gutter {
                        pixels[position] = darkest as u8;
                        continue;
                    }
                    if input.is_none() {
                        pixels[position] = void_values[position];
                        continue;
                    }
                    let offset = (y * rect.w + x) as usize;
                    let value = samples[offset];
                    let chosen = nearest(value, &palette);
                    pixels[position] = chosen as u8;
                    let error = [
                        value[0] - palette[chosen][0],
                        value[1] - palette[chosen][1],
                        value[2] - palette[chosen][2],
                    ];
                    for (dx, dy, weight) in [
                        (1i32, 0i32, 7.0 / 16.0),
                        (-1, 1, 3.0 / 16.0),
                        (0, 1, 5.0 / 16.0),
                        (1, 1, 1.0 / 16.0),
                    ] {
                        let nx = x as i32 + dx;
                        let ny = y as i32 + dy;
                        if nx >= 0 && ny >= 0 && nx < rect.w as i32 && ny < rect.h as i32 {
                            let next = (ny as u32 * rect.w + nx as u32) as usize;
                            for k in 0..3 {
                                samples[next][k] += error[k] * weight * config.dither;
                            }
                        }
                    }
                }
            }
        }
    }
    // Four one-pixel version marks at each corner. Stable across revisions.
    let signature = Sha256::digest(VERSION.as_bytes());
    for (cx, cy) in [(0, 0), (size - 1, 0), (0, size - 1), (size - 1, size - 1)] {
        for step in 0..4.min(size) {
            let x = if cx == 0 { step } else { size - 1 - step };
            pixels[(cy * size + x) as usize] = signature[step as usize] % 32;
        }
    }
    let metadata = if let Some(old) = previous {
        old.metadata.clone()
    } else {
        let mut histogram = [0usize; 32];
        for &p in &pixels {
            histogram[p as usize] += 1;
        }
        let entropy = histogram
            .iter()
            .filter(|&&n| n > 0)
            .map(|&n| {
                let p = n as f64 / count as f64;
                -p * p.log2()
            })
            .sum::<f64>();
        let mean = (0..3)
            .map(|k| {
                histogram
                    .iter()
                    .enumerate()
                    .map(|(n, &v)| palette[n][k] * v as f64 / count as f64)
                    .sum::<f64>()
            })
            .collect::<Vec<_>>();
        let symmetric = (0..count)
            .filter(|&p| {
                pixels[p]
                    == pixels[(p / size as usize) * size as usize
                        + (size as usize - 1 - p % size as usize)]
            })
            .count();
        let histogram_map = histogram
            .iter()
            .enumerate()
            .map(|(n, &v)| (format!("c{n:02}"), v as f64 / count as f64))
            .collect::<BTreeMap<_, _>>();
        serde_json::json!({"schiild_index":config.schiild_index,"dominant_hue":mean[2].atan2(mean[1]).to_degrees().rem_euclid(360.0),"symmetry_score":symmetric as f64/count as f64,"algorithm_version":VERSION,"participant_count":members.len(),"capacity_at_gen":config.capacity,"fill_rate":members.len() as f64/config.capacity as f64,"is_perfect":members.len()==config.capacity,"void_ratio":1.0-members.len() as f64/config.capacity as f64,"palette_histogram":histogram_map,"color_entropy":entropy})
    };
    let full = png(&pixels, size, &config.palette, 1024)?;
    let thumbnail = png(&pixels, size, &config.palette, 256)?;
    Ok(Artifact {
        state: State {
            version: VERSION.into(),
            config: config.clone(),
            seed: hex(&seed),
            members,
            pixels,
            metadata,
        },
        regions,
        png: full,
        thumbnail,
    })
}
