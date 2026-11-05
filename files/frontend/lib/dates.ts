const pad = (n: number) => String(n).padStart(2, '0');
/** Hoje no relógio do navegador, como AAAA-MM-DD. */
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
/** AAAA-MM-DD → DD/MM/AAAA, sem passar por Date (evita deslocamento de fuso). */
export const formatDay = (s: string) => s.split('-').reverse().join('/');
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
