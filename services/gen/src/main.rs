use clap::Parser;
use gen::{bsp, render::*};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    path::PathBuf,
    time::Instant,
};
#[derive(Parser)]
#[command(
    about = "Deterministic Schiild generator; input-dir contains manifest.json",
    version
)]
struct Args {
    #[arg(long)]
    atelier_id: Option<uuid::Uuid>,
    #[arg(long)]
    date: Option<String>,
    #[arg(long, default_value_t = 12)]
    capacity: usize,
    #[arg(long)]
    input_dir: Option<PathBuf>,
    #[arg(long)]
    palette: Option<PathBuf>,
    #[arg(long)]
    out: Option<PathBuf>,
    #[arg(long)]
    frozen_seed: Option<String>,
    #[arg(long)]
    previous: Option<PathBuf>,
    #[arg(long)]
    render_tier: Option<String>,
    #[arg(long)]
    resolution: Option<u32>,
    #[arg(long, default_value_t = 0.55)]
    variance: f64,
    #[arg(long, default_value_t = 0.6)]
    dither: f64,
    #[arg(long)]
    posterize: Option<u8>,
    #[arg(long, default_value_t = 0)]
    gutter: u32,
    #[arg(long)]
    layout_only: bool,
    #[arg(long, default_value_t = 1)]
    schiild_index: u64,
    #[arg(long)]
    workers: Option<usize>,
}
#[derive(Deserialize)]
struct Entry {
    user_id: uuid::Uuid,
    slot_index: usize,
    image: String,
    #[serde(default)]
    image_sha256: Option<String>,
}
fn date_valid(date: &str) -> bool {
    let parts = date.split('-').collect::<Vec<_>>();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return false;
    }
    let nums = parts
        .iter()
        .map(|s| s.parse::<u32>())
        .collect::<Result<Vec<_>, _>>();
    let Ok(n) = nums else { return false };
    let leap = n[0] % 4 == 0 && (n[0] % 100 != 0 || n[0] % 400 == 0);
    let days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    n[0] > 0 && n[1] >= 1 && n[1] <= 12 && n[2] >= 1 && n[2] <= days[n[1] as usize - 1]
}
fn run() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let start = Instant::now();
    if args.layout_only {
        let seed = seed_hex(
            args.frozen_seed
                .as_deref()
                .ok_or("--frozen-seed required for layout")?,
        )?;
        println!(
            "{}",
            serde_json::to_string(&bsp(
                seed,
                args.capacity,
                args.resolution.unwrap_or(128),
                args.variance
            )?)?
        );
        return Ok(());
    }
    let root = fs::canonicalize(args.input_dir.ok_or("--input-dir required")?)?;
    let date = args.date.ok_or("--date required")?;
    if !date_valid(&date) {
        return Err("invalid UTC calendar date".into());
    }
    let palette: Vec<[u8; 3]> =
        serde_json::from_slice(&fs::read(args.palette.ok_or("--palette required")?)?)?;
    let tier = args.render_tier.unwrap_or_else(|| {
        if args.capacity <= 200 {
            "bsp_128"
        } else if args.capacity <= 800 {
            "bsp_256"
        } else {
            "bucket"
        }
        .into()
    });
    let resolution = args
        .resolution
        .unwrap_or(if tier == "bsp_128" { 128 } else { 256 });
    let config = Config {
        atelier_id: args.atelier_id.ok_or("--atelier-id required")?.to_string(),
        date,
        capacity: args.capacity,
        tier,
        resolution,
        variance: args.variance,
        dither: args.dither,
        posterize: args.posterize,
        gutter: args.gutter,
        palette,
        schiild_index: args.schiild_index,
    };
    config.validate()?;
    let entries: Vec<Entry> = serde_json::from_slice(&fs::read(root.join("manifest.json"))?)?;
    let mut members = Vec::new();
    let mut paths = Vec::new();
    let mut seen = BTreeSet::new();
    let mut file_cache: BTreeMap<String, (PathBuf, String)> = BTreeMap::new();
    for entry in entries {
        if entry.slot_index >= config.capacity || !seen.insert(entry.slot_index) {
            return Err("invalid manifest slot".into());
        }
        let (path, hash) = if let Some(cached) = file_cache.get(&entry.image) {
            cached.clone()
        } else {
            let path = fs::canonicalize(root.join(&entry.image))?;
            if !path.starts_with(&root) {
                return Err("image escapes input directory".into());
            }
            let hash = hex(&Sha256::digest(fs::read(&path)?));
            file_cache.insert(entry.image.clone(), (path.clone(), hash.clone()));
            (path, hash)
        };
        if entry.image_sha256.is_some_and(|expected| expected != hash) {
            return Err("image hash mismatch".into());
        }
        members.push(Member {
            user_id: entry.user_id.to_string(),
            slot_index: entry.slot_index,
            image_sha256: hash,
        });
        paths.push(path);
    }
    let indexed_ms = start.elapsed().as_secs_f64() * 1000.0;
    let frozen = args.frozen_seed.as_deref().map(seed_hex).transpose()?;
    let seed = generation_seed(&config, &members, frozen)?;
    let previous = args
        .previous
        .map(|path| -> Result<State, Box<dyn std::error::Error>> {
            Ok(serde_json::from_slice(&fs::read(path.join("state.json"))?)?)
        })
        .transpose()?;
    if previous.is_some() && frozen.is_none() {
        return Err("--previous requires --frozen-seed".into());
    }
    if frozen.is_some() && previous.is_none() {
        return Err("regeneration requires --previous to preserve generation metadata".into());
    }
    let rects = if config.tier == "bucket" {
        Vec::new()
    } else {
        bsp(seed, config.capacity, resolution, config.variance)?
    };
    let workers = args.workers.unwrap_or_else(|| {
        std::thread::available_parallelism()
            .map_or(1, usize::from)
            .min(8)
    });
    if workers == 0 || workers > 8 {
        return Err("workers must be between 1 and 8".into());
    }
    type Group = (PathBuf, Vec<Member>);
    let mut groups: BTreeMap<String, Group> = BTreeMap::new();
    for (member, path) in members.into_iter().zip(paths) {
        groups
            .entry(member.image_sha256.clone())
            .or_insert_with(|| (path, Vec::new()))
            .1
            .push(member);
    }
    let groups = groups.into_values().collect::<Vec<_>>();
    let decode_count = groups.len();
    let batch_size = groups.len().div_ceil(workers).max(1);
    // Each image is decoded once, then all required shapes are prepared on the same worker.
    // Pixel accumulation inside prepare() stays strictly sequential.
    let results = std::thread::scope(|scope| {
        let handles = groups
            .chunks(batch_size)
            .map(|chunk| {
                let config = &config;
                let rects = &rects;
                scope.spawn(move || -> Result<(Vec<Prepared>, usize), String> {
                    let mut prepared_inputs = Vec::new();
                    let mut hits = 0usize;
                    for (path, members) in chunk {
                        let bytes = fs::read(path).map_err(|e| e.to_string())?;
                        if hex(&Sha256::digest(&bytes)) != members[0].image_sha256 {
                            return Err("input changed during preparation".into());
                        }
                        if image::guess_format(&bytes).map_err(|e| e.to_string())?
                            != image::ImageFormat::Jpeg
                        {
                            return Err("input must be JPEG".into());
                        }
                        let image = image::load_from_memory(&bytes)
                            .map_err(|e| e.to_string())?
                            .to_rgb8();
                        if image.dimensions() != (1080, 1080) {
                            return Err("input must be 1080 x 1080".into());
                        }
                        let mut samples_by_shape: BTreeMap<
                            Option<(u32, u32)>,
                            Vec<gen::color::Lab>,
                        > = BTreeMap::new();
                        for member in members {
                            let rect = rects.get(member.slot_index).copied();
                            let key = rect.map(|r| (r.w, r.h));
                            let samples = if let Some(samples) = samples_by_shape.get(&key) {
                                hits += 1;
                                samples.clone()
                            } else {
                                let samples =
                                    prepare(&image, member.clone(), rect, config)?.samples;
                                samples_by_shape.insert(key, samples.clone());
                                samples
                            };
                            prepared_inputs.push(Prepared {
                                member: member.clone(),
                                samples,
                            });
                        }
                    }
                    Ok((prepared_inputs, hits))
                })
            })
            .collect::<Vec<_>>();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .map_err(|_| "image worker panicked".to_string())?
            })
            .collect::<Result<Vec<_>, String>>()
    })?;
    let mut inputs = Vec::new();
    let mut sample_hits = 0usize;
    for (batch, hits) in results {
        inputs.extend(batch);
        sample_hits += hits;
    }
    let prepared_ms = start.elapsed().as_secs_f64() * 1000.0;
    let render_start = Instant::now();
    let artifact = generate(&config, seed, &inputs, previous.as_ref())?;
    let render_ms = render_start.elapsed().as_secs_f64() * 1000.0;
    let out = args.out.ok_or("--out required")?;
    if out.exists() {
        return Err("output directory already exists; choose a new revision directory".into());
    }
    fs::create_dir_all(&out)?;
    fs::write(out.join("schiild.png"), &artifact.png)?;
    fs::write(out.join("thumbnail.png"), &artifact.thumbnail)?;
    fs::write(
        out.join("region_map.json"),
        serde_json::to_vec_pretty(&artifact.regions)?,
    )?;
    fs::write(
        out.join("metadata.json"),
        serde_json::to_vec_pretty(&artifact.state.metadata)?,
    )?;
    fs::write(out.join("state.json"), serde_json::to_vec(&artifact.state)?)?;
    fs::write(out.join("used_seed.txt"), format!("{}\n", hex(&seed)))?;
    println!(
        "{}",
        serde_json::json!({"workers":workers,"index_ms":indexed_ms,"sample_ms":prepared_ms-indexed_ms,"unique_paths":file_cache.len(),"decode_count":decode_count,"sample_cache_hits":sample_hits,"prepare_ms":prepared_ms,"render_encode_ms":render_ms,"total_ms":start.elapsed().as_secs_f64()*1000.0,"output":out})
    );
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
