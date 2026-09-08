import type { SchiilId, SchiildId } from '../../packages/shared/types';
declare const schiilId: SchiilId;
declare const schiildId: SchiildId;
declare function acceptSchiil(value: SchiilId): void;
declare function acceptSchiild(value: SchiildId): void;
acceptSchiil(schiilId);
acceptSchiild(schiildId);
// @ts-expect-error A generated work cannot be passed as a photograph.
acceptSchiil(schiildId);
// @ts-expect-error A photograph cannot be passed as a generated work.
acceptSchiild(schiilId);
// @ts-expect-error Boundary identifiers cannot be plain strings.
acceptSchiil('unbranded');
