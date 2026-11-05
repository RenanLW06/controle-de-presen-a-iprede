import { Matches } from 'class-validator';
export const IsDay = () => Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'use o formato AAAA-MM-DD' });
