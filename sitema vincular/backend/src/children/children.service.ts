import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthUser } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';

export interface ChildRow { id: string; full_name: string; birth_date: string; room_id: string }

@Injectable()
export class ChildrenService {
  constructor(private readonly db: DbService) {}

  /** Cursor (full_name, id). Sem filtro de sala de propósito: quem restringe o monitor é o RLS. */
  async list(user: AuthUser, requestId: string, limit: number, cursor?: string) {
    const after = decodeCursor<{ n: string; i: string }>(cursor);
    const rows = await this.db.withUser(user.id, requestId, async (c) => {
      const params: unknown[] = [];
      let where = 'c.deleted_at IS NULL';
      if (after) { params.push(after.n, after.i); where += ' AND (c.full_name, c.id) > ($1, $2::uuid)'; }
      params.push(limit + 1);
      return (await c.query<ChildRow>(
        `SELECT c.id, c.full_name, c.birth_date::text, m.to_room_id AS room_id
           FROM children c JOIN child_room_movements m ON m.child_id = c.id AND m.ended_on IS NULL
          WHERE ${where} ORDER BY c.full_name, c.id LIMIT $${params.length}`, params)).rows;
    });
    const more = rows.length > limit; const items = more ? rows.slice(0, limit) : rows; const l = items[items.length - 1];
    return { items, nextCursor: more ? encodeCursor({ n: l.full_name, i: l.id }) : null };
  }

  create(u: AuthUser, rid: string, d: { fullName: string; birthDate: string; roomId: string; startedOn?: string }) {
    return this.db.withUser(u.id, rid, async (c) => {
      const room = await c.query(`SELECT 1 FROM rooms WHERE id = $1 AND deleted_at IS NULL`, [d.roomId]);
      if (!room.rowCount) throw new NotFoundException('Sala não encontrada');
      const child = (await c.query(
        `INSERT INTO children(full_name, birth_date) VALUES ($1, $2::date) RETURNING id, full_name, birth_date::text`,
        [d.fullName.trim(), d.birthDate])).rows[0];
      await c.query(
        `INSERT INTO child_room_movements(child_id, to_room_id, started_on, moved_by)
         VALUES ($1, $2, COALESCE($3::date, current_date), $4)`, [child.id, d.roomId, d.startedOn ?? null, u.id]);
      return { ...child, room_id: d.roomId };
    });
  }

  /**
   * Realocação: fecha a permanência atual e abre a nova. Nada é apagado nem reatribuído.
   * Ordem importa: o UPDATE trava a permanência (e espera marcações de presença em curso)
   * antes de checarmos se já existem presenças a partir da data da mudança.
   */
  move(u: AuthUser, rid: string, childId: string, d: { toRoomId: string; effectiveDate: string; reason?: string }) {
    return this.db.withUser(u.id, rid, async (c) => {
      const child = await c.query(`SELECT 1 FROM children WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [childId]);
      if (!child.rowCount) throw new NotFoundException('Criança não encontrada');
      const cur = (await c.query(
        `SELECT id, to_room_id FROM child_room_movements WHERE child_id = $1 AND ended_on IS NULL`, [childId])).rows[0];
      if (!cur) throw new ConflictException('Criança sem sala atual');
      if (cur.to_room_id === d.toRoomId) throw new ConflictException('A criança já está nesta sala');
      const room = await c.query(`SELECT 1 FROM rooms WHERE id = $1 AND deleted_at IS NULL`, [d.toRoomId]);
      if (!room.rowCount) throw new NotFoundException('Sala de destino não encontrada');
      const future = (await c.query(`SELECT $1::date > current_date AS f`, [d.effectiveDate])).rows[0].f;
      if (future) throw new ConflictException('A data da mudança não pode ser futura');

      await c.query(`UPDATE child_room_movements SET ended_on = $2::date WHERE id = $1`, [cur.id, d.effectiveDate]);
      const att = await c.query(`SELECT 1 FROM attendance WHERE child_id = $1 AND attendance_date >= $2::date LIMIT 1`, [childId, d.effectiveDate]);
      if (att.rowCount) throw new ConflictException('Há presenças na sala atual a partir desta data');
      return (await c.query(
        `INSERT INTO child_room_movements(child_id, from_room_id, to_room_id, started_on, moved_by, reason)
         VALUES ($1,$2,$3,$4::date,$5,$6)
         RETURNING id, child_id, from_room_id, to_room_id, started_on::text, ended_on::text`,
        [childId, cur.to_room_id, d.toRoomId, d.effectiveDate, u.id, d.reason ?? null])).rows[0];
    });
  }

  /** Histórico de salas. Para o monitor, o RLS só devolve as permanências na sala dele. */
  movements(u: AuthUser, rid: string, childId: string) {
    return this.db.withUser(u.id, rid, async (c) => (await c.query(
      `SELECT id, from_room_id, to_room_id, started_on::text, ended_on::text, reason
         FROM child_room_movements WHERE child_id = $1 ORDER BY started_on, id`, [childId])).rows);
  }
}
