import { HttpException } from '@nestjs/common';
export class ApiError extends HttpException {
  constructor(status: number, code: string, details: Record<string, unknown> = {}) {
    super({ code, ...details }, status);
  }
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new ApiError(400,'invalid_request');
  return value.toLowerCase();
}
export function utcDay(now: Date): string { return now.toISOString().slice(0,10); }
export function dayWindow(day: string) {
  const start = new Date(`${day}T00:00:00Z`);
  return { start: start.toISOString(), end: new Date(start.getTime()+86400000).toISOString() };
}
