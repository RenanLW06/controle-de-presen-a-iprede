import { BadRequestException } from '@nestjs/common';

export const encodeCursor = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function decodeCursor<T>(s?: string): T | null {
  if (!s) return null;
  try { return JSON.parse(Buffer.from(s, 'base64url').toString()) as T; }
  catch { throw new BadRequestException('cursor inválido'); }
}
export function parseLimit(v: string | undefined, def = 50): number {
  const n = Number(v ?? def);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new BadRequestException('limit deve estar entre 1 e 100');
  return n;
}
