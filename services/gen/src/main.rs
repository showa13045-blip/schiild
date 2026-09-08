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
    for entry in entries {
        if entry.slot_index >= config.capacity || !seen.insert(entry.slot_index) {
            return Err("invalid manifest slot".into());
        }
        let path = fs::canonicalize(root.join(&entry.image))?;
        if !path.starts_with(&root) {
            return Err("image escapes input directory".into());
        }
        let bytes = fs::read(&path)?;
        let hash = hex(&Sha256::digest(&bytes));
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
    type SampleCache = BTreeMap<(String, Option<(u32, u32)>), Vec<gen::color::Lab>>;
    let mut cache: SampleCache = BTreeMap::new();
    let mut inputs = Vec::new();
    for (member, path) in members.into_iter().zip(paths) {
        let rect = rects.get(member.slot_index).copied();
        let key = (member.image_sha256.clone(), rect.map(|r| (r.w, r.h)));
        let samples = if let Some(samples) = cache.get(&key) {
            samples.clone()
        } else {
            let bytes = fs::read(path)?;
            if hex(&Sha256::digest(&bytes)) != member.image_sha256 {
                return Err("input changed during preparation".into());
            }
            if image::guess_format(&bytes)? != image::ImageFormat::Jpeg {
                return Err("input must be JPEG".into());
            }
            let image = image::load_from_memory(&bytes)?.to_rgb8();
            let prepared = prepare(&image, member.clone(), rect, &config)?;
            cache.insert(key, prepared.samples.clone());
            prepared.samples
        };
        inputs.push(Prepared { member, samples });
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
        serde_json::json!({"prepare_ms":prepared_ms,"render_encode_ms":render_ms,"total_ms":start.elapsed().as_secs_f64()*1000.0,"output":out})
    );
    Ok(())
}
fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
