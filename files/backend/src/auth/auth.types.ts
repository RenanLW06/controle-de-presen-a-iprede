import { Request } from 'express';
export type Role = 'admin' | 'monitor';
export interface AuthUser { id: string; role: Role }
export interface AuthedRequest extends Request { user: AuthUser; id: string }
