import { randomUUID } from 'crypto';
import { Pool } from 'pg';
import { DbService } from '../src/db/db.service';
import { ChildrenService } from '../src/children/children.service';

// Requer o banco migrado (db/migrations) e as variáveis DATABASE_URL (app_login) e ADMIN_DATABASE_URL.
const admin = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
const db = new DbService();
const children = new ChildrenService(db);
const rid = () => randomUUID();
const sfx = randomUUID().slice(0, 8);

let adminId: string, mon1: string, mon2: string, roomA: string, roomB: string;
let kids: string[] = [];

async function one<T = any>(sql: string, p: unknown[] = []): Promise<T> { return (await admin.query(sql, p)).rows[0]; }

beforeAll(async () => {
  const u = async (n: string, role: string) =>
    (await one(`INSERT INTO users(name,email,password_hash,role) VALUES ($1,$2,'x',$3) RETURNING id`, [n, `${n}-${sfx}@t.com`, role])).id;
  [adminId, mon1, mon2] = [await u('adm', 'admin'), await u('m1', 'monitor'), await u('m2', 'monitor')];
  roomA = (await one(`INSERT INTO rooms(name) VALUES ($1) RETURNING id`, [`A-${sfx}`])).id;
  roomB = (await one(`INSERT INTO rooms(name) VALUES ($1) RETURNING id`, [`B-${sfx}`])).id;
  for (const [m, r] of [[mon1, roomA], [mon2, roomB]]) {
    await admin.query(`INSERT INTO room_monitors(room_id,user_id,started_on,assigned_by) VALUES ($1,$2,'2026-01-01',$3)`, [r, m, adminId]);
  }
  // 3 crianças na sala A e 1 na sala B
  for (const [name, room] of [['Ana', roomA], ['Bia', roomA], ['Caio', roomA], ['Davi', roomB]]) {
    const id = (await one(`INSERT INTO children(full_name,birth_date) VALUES ($1,'2020-01-01') RETURNING id`, [`${name}-${sfx}`])).id;
    await admin.query(`INSERT INTO child_room_movements(child_id,to_room_id,started_on,moved_by) VALUES ($1,$2,'2026-01-01',$3)`, [id, room, adminId]);
    kids.push(id);
  }
});
afterAll(async () => { await admin.end(); await db.onModuleDestroy(); });

const mark = (user: string, child: string, room: string, date: string, status = 'present') =>
  db.withUser(user, rid(), (c) => c.query(
    `INSERT INTO attendance(child_id,room_id,attendance_date,status,marked_by) VALUES ($1,$2,$3,$4,$5)`, [child, room, date, status, user]));

describe('escopo do monitor', () => {
  it('monitor lista apenas crianças da própria sala', async () => {
    const r = await children.list({ id: mon1, role: 'monitor' }, rid(), 50);
    expect(r.items.map((i) => i.full_name)).toEqual([`Ana-${sfx}`, `Bia-${sfx}`, `Caio-${sfx}`]);
    const r2 = await children.list({ id: mon2, role: 'monitor' }, rid(), 50);
    expect(r2.items.map((i) => i.full_name)).toEqual([`Davi-${sfx}`]);
  });
  it('paginação por cursor não repete nem perde itens', async () => {
    const p1 = await children.list({ id: mon1, role: 'monitor' }, rid(), 2);
    const p2 = await children.list({ id: mon1, role: 'monitor' }, rid(), 2, p1.nextCursor!);
    expect([...p1.items, ...p2.items].map((i) => i.full_name)).toEqual([`Ana-${sfx}`, `Bia-${sfx}`, `Caio-${sfx}`]);
    expect(p2.nextCursor).toBeNull();
  });
  it('monitor não marca presença em criança de outra sala', async () => {
    await expect(mark(mon1, kids[3], roomB, '2026-03-02')).rejects.toThrow(/row-level security/);
    await expect(mark(mon1, kids[3], roomA, '2026-03-02')).rejects.toThrow();
  });
  it('sem contexto de usuário, nada é visível', async () => {
    const c = await db.pool.connect();
    try { expect((await c.query('SELECT 1 FROM children')).rowCount).toBe(0); } finally { c.release(); }
  });
});

describe('frequência', () => {
  it('uma marcação por criança por dia', async () => {
    await mark(mon1, kids[0], roomA, '2026-03-03');
    await expect(mark(mon1, kids[0], roomA, '2026-03-03', 'absent')).rejects.toThrow(/duplicate key/);
  });
  it('justificativa só é aceita em ausência', async () => {
    await expect(db.withUser(mon1, rid(), (c) => c.query(
      `INSERT INTO attendance(child_id,room_id,attendance_date,status,justification,marked_by) VALUES ($1,$2,'2026-03-04','present','x',$3)`,
      [kids[0], roomA, mon1]))).rejects.toThrow(/check constraint/);
  });
});

describe('movimentação', () => {
  it('realocar preserva histórico e retira o acesso do monitor anterior', async () => {
    await mark(mon1, kids[1], roomA, '2026-03-05');
    await db.withUser(adminId, rid(), async (c) => {
      await c.query(`UPDATE child_room_movements SET ended_on='2026-03-10' WHERE child_id=$1 AND ended_on IS NULL`, [kids[1]]);
      await c.query(`INSERT INTO child_room_movements(child_id,from_room_id,to_room_id,started_on,moved_by) VALUES ($1,$2,$3,'2026-03-10',$4)`,
        [kids[1], roomA, roomB, adminId]);
    });
    const names = (await children.list({ id: mon1, role: 'monitor' }, rid(), 50)).items.map((i) => i.full_name);
    expect(names).not.toContain(`Bia-${sfx}`);
    expect((await children.list({ id: mon2, role: 'monitor' }, rid(), 50)).items.map((i) => i.full_name)).toContain(`Bia-${sfx}`);
    // presença antiga continua ligada à sala A
    expect((await one(`SELECT room_id FROM attendance WHERE child_id=$1 AND attendance_date='2026-03-05'`, [kids[1]])).room_id).toBe(roomA);
    // nova sala só aceita marcação a partir da data da mudança
    await expect(mark(mon2, kids[1], roomB, '2026-03-09')).rejects.toThrow(/não estava nesta sala/);
    await mark(mon2, kids[1], roomB, '2026-03-11');
  });
  it('movimentação é imutável e não pode ser apagada', async () => {
    await expect(admin.query(`UPDATE child_room_movements SET to_room_id=$1 WHERE child_id=$2`, [roomB, kids[0]])).rejects.toThrow(/imutável/);
    await expect(db.withUser(adminId, rid(), (c) => c.query(`DELETE FROM child_room_movements`))).rejects.toThrow(/permission denied/);
  });
});

describe('auditoria', () => {
  it('registra o autor e é append-only', async () => {
    const reqId = rid();
    await db.withUser(mon1, reqId, (c) => c.query(
      `INSERT INTO observations(child_id,room_id,author_id,body) VALUES ($1,$2,$3,'observação de teste')`, [kids[0], roomA, mon1]));
    const row = await one(`SELECT actor_id, action, entity_type FROM audit_log WHERE request_id=$1`, [reqId]);
    expect(row).toEqual({ actor_id: mon1, action: 'create', entity_type: 'observations' });
    await expect(admin.query(`UPDATE audit_log SET action='x'`)).rejects.toThrow(/append-only/);
    await expect(admin.query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
    await expect(admin.query(`TRUNCATE audit_log`)).rejects.toThrow(/append-only/);
  });
  it('monitor não edita nem lê observações de outra sala', async () => {
    const n = await db.withUser(mon2, rid(), (c) => c.query(`SELECT 1 FROM observations WHERE room_id=$1`, [roomA]));
    expect(n.rowCount).toBe(0);
    await expect(db.withUser(mon1, rid(), (c) => c.query(`INSERT INTO observations(child_id,room_id,author_id,body) VALUES ($1,$2,$3,'x')`,
      [kids[3], roomB, mon1]))).rejects.toThrow(/row-level security/);
  });
});
