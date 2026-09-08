//! Distinct identifiers prevent exchanging photographs and generated works.
//! ```compile_fail
//! use gen::domain::{SchiilId, SchiildId};
//! fn photograph(_: SchiilId) {}
//! let artwork = SchiildId(uuid::Uuid::nil());
//! photograph(artwork);
//! ```
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchiilId(pub uuid::Uuid);
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SchiildId(pub uuid::Uuid);
