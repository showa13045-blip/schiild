export type SchiilId = string & { readonly __brand: 'SchiilId' };
export type SchiildId = string & { readonly __brand: 'SchiildId' };
export type AtelierId = string & { readonly __brand: 'AtelierId' };
export type Atelier = { atelierId: AtelierId; name: string; capacity: number; createdAt: string };
export type Schiil = { schiilId: SchiilId; schiildDate: string; uri: string; atelierIds: AtelierId[]; createdAt: string };
export type State = { version: number; ateliers: Atelier[]; schiils: Schiil[]; timezone: string };
