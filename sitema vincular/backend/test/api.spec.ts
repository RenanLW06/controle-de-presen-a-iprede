import { randomUUID } from 'crypto';
import * as argon2 from 'argon2';
import { Pool } from 'pg';

process.env.JWT_SECRET ??= 'x'.repeat(48);
process.env.COOKIE_SECURE = 'false';

const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const sfx = randomUUID().slice(0, 8);
const PW = 'SenhaForte123!';
const day = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
let app: any, base: string;
let A: string, B: string, ana: string, bia: string, davi: string;
let cAdmin: string, c1: string, c2: string;

async function call(method: string, path: string, cookie?: string, body?: unknown, csrf = true) {
  const res = await fetch(base + path, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { 'content-type': 'application/json', ...(csrf ? { 'x-requested-with': 'fetch' } : {}), ...(cookie ? { cookie } : {}) },
  });
  const t = await res.text();
  if (process.env.DEBUG_API && res.status >= 400) console.log(method, path, res.status, t);
  return { status: res.status, body: t ? JSON.parse(t) : null, setCookie: res.headers.get('set-cookie') };
}
const login = async (email: string, password = PW) => (await call('POST', '/auth/login', undefined, { email, password }));
const names = (r: any) => r.body.items.map((i: any) => i.full_name?.split('-')[0]);

async function seedUser(name: string, role: string) {
  const email = `${name}-${sfx}@t.com`;
  const id = (await admin.query(`INSERT INTO users(name,email,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,false) RETURNING id`,
    [name, email, await argon2.hash(PW, { type: argon2.argon2id }), role])).rows[0].id;
  return { id, email };
}

beforeAll(async () => {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/setup');
  app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0);
  base = `http://127.0.0.1:${app.getHttpServer().address().port}`;
  const [a, m1, m2] = [await seedUser('adm', 'admin'), await seedUser('m1', 'monitor'), await seedUser('m2', 'monitor')];
  const ck = async (e: string) => (await login(e)).setCookie!.split(';')[0];
  [cAdmin, c1, c2] = [await ck(a.email), await ck(m1.email), await ck(m2.email)];
  (globalThis as any).ids = { m1: m1.id, m2: m2.id };
});
afterAll(async () => { await app.close(); await admin.end(); });

describe('autenticação e CSRF', () => {
  it('rejeita escrita sem o cabeçalho anti-CSRF e rota sem cookie', async () => {
    expect((await call('POST', '/rooms', cAdmin, { name: 'x' }, false)).status).toBe(403);
    expect((await call('GET', '/children')).status).toBe(401);
  });
  it('bloqueia a conta após 5 falhas, mesmo com a senha correta', async () => {
    const u = await seedUser('lock', 'monitor');
    for (let i = 0; i < 5; i++) expect((await login(u.email, 'senha-errada-1')).status).toBe(401);
    expect((await login(u.email)).status).toBe(401);
  });
});

describe('salas e escopo', () => {
  it('admin cria salas e vincula monitores; monitor não administra', async () => {
    A = (await call('POST', '/rooms', cAdmin, { name: `A-${sfx}` })).body.id;
    B = (await call('POST', '/rooms', cAdmin, { name: `B-${sfx}` })).body.id;
    expect((await call('POST', '/rooms', c1, { name: 'nova' })).status).toBe(403);
    const ids = (globalThis as any).ids;
    expect((await call('POST', `/rooms/${A}/monitors`, cAdmin, { userId: ids.m1 })).status).toBe(201);
    expect((await call('POST', `/rooms/${A}/monitors`, cAdmin, { userId: ids.m1 })).status).toBe(409);
    expect((await call('POST', `/rooms/${B}/monitors`, cAdmin, { userId: ids.m2 })).status).toBe(201);
    expect((await call('GET', '/rooms', c1)).body.items.map((r: any) => r.id)).toEqual([A]);
  });
  it('crianças: só admin cadastra; monitor lista apenas a própria sala', async () => {
    const mk = async (n: string, room: string) => (await call('POST', '/children', cAdmin, { fullName: `${n}-${sfx}`, birthDate: '2020-05-05', roomId: room, startedOn: day(20) })).body.id;
    [ana, bia, davi] = [await mk('Ana', A), await mk('Bia', A), await mk('Davi', B)];
    expect((await call('POST', '/children', c1, { fullName: 'X Y', birthDate: '2020-01-01', roomId: A })).status).toBe(403);
    expect(names(await call('GET', '/children', c1))).toEqual(['Ana', 'Bia']);
    expect(names(await call('GET', '/children', c2))).toEqual(['Davi']);
    expect((await call('GET', '/children/not-a-uuid/movements', c1)).status).toBe(400);
  });
});

describe('frequência', () => {
  it('marca, corrige (continua 1 por dia) e mostra na lista de chamada', async () => {
    expect((await call('PUT', '/attendance', c1, { childId: ana, date: day(5), status: 'present' })).status).toBe(200);
    const r = await call('PUT', '/attendance', c1, { childId: ana, date: day(5), status: 'absent', justification: 'febre' });
    expect(r.body).toMatchObject({ status: 'absent', justification: 'febre', room_id: A });
    const roster = await call('GET', `/rooms/${A}/roster?date=${day(5)}`, c1);
    expect(roster.body.items.map((i: any) => [i.full_name.split('-')[0], i.status])).toEqual([['Ana', 'absent'], ['Bia', null]]);
    const p = await call('PUT', '/attendance', c1, { childId: ana, date: day(5), status: 'present', justification: 'ignorada' });
    expect(p.body.justification).toBeNull();
  });
  it('rejeita data futura, status inválido e criança de outra sala', async () => {
    expect((await call('PUT', '/attendance', c1, { childId: ana, date: day(-3), status: 'present' })).status).toBe(400);
    expect((await call('PUT', '/attendance', c1, { childId: ana, date: day(1), status: 'talvez' })).status).toBe(400);
    expect((await call('PUT', '/attendance', c1, { childId: davi, date: day(1), status: 'present' })).status).toBe(404);
  });
});

describe('realocação', () => {
  it('preserva histórico, troca o acesso e respeita a data da mudança', async () => {
    expect((await call('POST', `/children/${bia}/move`, cAdmin, { toRoomId: B, effectiveDate: day(3), reason: 'idade' })).status).toBe(201);
    expect(names(await call('GET', '/children', c1))).toEqual(['Ana']);
    expect(names(await call('GET', '/children', c2))).toEqual(['Bia', 'Davi']);
    // chamada de antes da mudança continua mostrando a Bia na sala A; depois, só na B
    expect(names(await call('GET', `/rooms/${A}/roster?date=${day(5)}`, cAdmin))).toContain('Bia');
    expect(names(await call('GET', `/rooms/${A}/roster?date=${day(2)}`, cAdmin))).not.toContain('Bia');
    expect(names(await call('GET', `/rooms/${B}/roster?date=${day(2)}`, cAdmin))).toContain('Bia');
    expect((await call('PUT', '/attendance', c1, { childId: bia, date: day(2), status: 'present' })).status).toBe(404);
    expect((await call('PUT', '/attendance', c2, { childId: bia, date: day(2), status: 'present' })).status).toBe(200);
    expect((await call('PUT', '/attendance', c2, { childId: bia, date: day(4), status: 'present' })).status).toBe(404);
    expect((await call('GET', `/children/${bia}/movements`, cAdmin)).body).toHaveLength(2);
    expect((await call('GET', `/children/${bia}/movements`, c1)).body).toHaveLength(1);   // monitor antigo só vê a própria sala
  });
  it('bloqueia mudança que contradiz presenças, sala repetida e data futura', async () => {
    await call('PUT', '/attendance', c1, { childId: ana, date: day(1), status: 'present' });
    expect((await call('POST', `/children/${ana}/move`, cAdmin, { toRoomId: B, effectiveDate: day(1) })).status).toBe(409);
    expect((await call('POST', `/children/${ana}/move`, cAdmin, { toRoomId: A, effectiveDate: day(0) })).status).toBe(409);
    expect((await call('POST', `/children/${ana}/move`, cAdmin, { toRoomId: B, effectiveDate: day(-2) })).status).toBe(409);
    expect((await call('POST', `/children/${ana}/move`, c1, { toRoomId: B, effectiveDate: day(0) })).status).toBe(403);
  });
});

describe('observações e auditoria', () => {
  let obs: string;
  it('monitor registra na própria sala; outro monitor não enxerga; só admin exclui', async () => {
    const r = await call('POST', `/children/${ana}/observations`, c1, { body: 'Brincou bastante.' });
    expect(r.status).toBe(201); obs = r.body.id;
    expect((await call('POST', `/children/${ana}/observations`, c2, { body: 'x' })).status).toBe(404);
    expect((await call('GET', `/children/${ana}/observations`, c2)).body.items).toHaveLength(0);
    expect((await call('DELETE', `/observations/${obs}`, c1)).status).toBe(403);
    expect((await call('DELETE', `/observations/${obs}`, cAdmin)).status).toBe(204);
    expect((await call('GET', `/children/${ana}/observations`, c1)).body.items).toHaveLength(0);
  });
  it('lista observações em páginas sem repetir itens', async () => {
    for (const t of ['um', 'dois', 'tres']) await call('POST', `/children/${ana}/observations`, c1, { body: t });
    const p1 = await call('GET', `/children/${ana}/observations?limit=2`, c1);
    const p2 = await call('GET', `/children/${ana}/observations?limit=2&cursor=${p1.body.nextCursor}`, c1);
    expect([...p1.body.items, ...p2.body.items].map((o: any) => o.body)).toEqual(['tres', 'dois', 'um']);
    expect(p2.body.nextCursor).toBeNull();
  });
  it('auditoria: admin consulta quem/o quê; monitor não acessa', async () => {
    const r = await call('GET', `/audit?entityType=observations&entityId=${obs}`, cAdmin);
    expect(r.body.items.map((i: any) => i.action).sort()).toEqual(['create', 'soft_delete']);
    expect(r.body.items.find((i: any) => i.action === 'create').actor_id).toBe((globalThis as any).ids.m1);
    expect(r.body.items.find((i: any) => i.action === 'soft_delete').old_values.deleted_at).toBeNull();
    expect((await call('GET', '/audit', c1)).status).toBe(403);
  });
});
