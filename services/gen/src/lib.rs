//! Deterministic generation. The WASM build shares this exact BSP implementation.
#[cfg(feature = "native")]
pub mod color;
pub mod layout;
#[cfg(feature = "native")]
pub mod render;
#[cfg(target_arch = "wasm32")]
mod wasm;
pub use layout::{bsp, Rect};

#[cfg(feature = "native")]
pub mod domain;
