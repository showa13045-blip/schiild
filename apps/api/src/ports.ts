import type { SchiilId, SchiildId } from '@schiild/shared/types';
export interface Identity { uid: string }
export interface Authenticator { verify(token: string): Promise<Identity> }
export interface ObjectStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
export interface Moderator { review(bytes: Buffer): Promise<'approved' | 'rejected'> }
export interface GenerationInput { userId: string; slotIndex: number; hash: string; imageKey: string; mean: number[] }
export interface Generated {
  image: Buffer; thumbnail: Buffer; state: Buffer;
  seed: string; metadata: Record<string,unknown>; regions: unknown;
}
export interface Engine {
  prepare(bytes: Buffer): Promise<number[]>;
  layout(atelierId: string, day: string, hashes: string[], capacity: number): Promise<unknown[]>;
  generate(atelierId: string, day: string, capacity: number, index: number, inputs: GenerationInput[], global: boolean): Promise<Generated>;
}
export interface PushSender { send(token: string, data: Record<string,string>): Promise<void> }
export interface Recorded { schiilId: SchiilId; schiildDate: string }
export interface Assignment { schiildId: SchiildId; custodianUserId: string | null }
