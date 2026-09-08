import type { State, Atelier, AtelierId, Schiil, SchiilId } from './types';
export function logicalDate(now?: Date): string;
export function timeWindow(date: string, timeZone?: string): string;
export function initialState(): State;
export function addAtelier(state: State, atelier: Atelier): State;
export function recordSchiil(state: State, schiil: Schiil, now?: Date): State;
export function addToAtelier(state: State, schiilId: SchiilId, atelierId: AtelierId, now?: Date): State;
