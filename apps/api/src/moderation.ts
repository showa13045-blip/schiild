import { createHash } from 'node:crypto';
import { ApiError } from './errors.js';
import type { Moderator, ModerationResult } from './ports.js';

/** Contract with a server-controlled moderation gateway; never a client URL. */
export class HttpModerator implements Moderator {
  private endpoint: string;
  constructor(endpoint: string, private token: string, private request: typeof fetch = fetch, private timeoutMs = 10000) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || !token.trim()) throw new Error('Invalid moderation configuration');
    this.endpoint = url.toString();
  }
  async review(bytes: Buffer): Promise<ModerationResult> {
    const hash = createHash('sha256').update(bytes).digest('hex');
    try {
      const response = await this.request(this.endpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(this.timeoutMs),
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'image/jpeg', 'x-image-sha256': hash, 'idempotency-key': hash },
        body: new Uint8Array(bytes),
      });
      if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('application/json') || !response.body) throw new Error('invalid_response');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          size += value.length;
          if (size > 16384) throw new Error('response_too_large');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (result?.schema !== 'schiild-moderation-v1' || result.image_sha256 !== hash) throw new Error('invalid_result');
      if (result.decision === 'approved') return { decision: 'approved' };
      if (result.decision === 'rejected' && ['person', 'other'].includes(result.reason)) return { decision: 'rejected', reason: result.reason };
      throw new Error('invalid_decision');
    } catch { throw new ApiError(503, 'moderation_unavailable', { copyKey: 'error.server.title' }); }
  }
}
export function configuredModerator(env: NodeJS.ProcessEnv, fallback: Moderator): Moderator {
  if (!env.MODERATION_URL && !env.MODERATION_TOKEN) return fallback;
  if (!env.MODERATION_URL || !env.MODERATION_TOKEN) throw new Error('Both MODERATION_URL and MODERATION_TOKEN are required');
  return new HttpModerator(env.MODERATION_URL, env.MODERATION_TOKEN);
}
