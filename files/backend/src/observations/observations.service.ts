import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthUser } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';

@Injectable()
export class ObservationsService {
  constructor(private readonly db: DbService) {}

  /** A observação nasce vinculada à sala atual da criança; autor = usuário autenticado. */
  add(u: AuthUser, rid: string, childId: string, body: string) {
    return this.db.withUser(u.id, rid, async (c) => {
      const stay = (await c.query(`SELECT to_room_id FROM child_room_movements WHERE child_id = $1 AND ended_on IS NULL`, [childId])).rows[0];
      if (!stay) throw new NotFoundException('Criança não encontrada');
      return (await c.query(
        `INSERT INTO observations(child_id, room_id, author_id, body) VALUES ($1,$2,$3,$4)
         RETURNING id, child_id, room_id, created_at::text`, [childId, stay.to_room_id, u.id, body.trim()])).rows[0];
    });
  }

  async list(u: AuthUser, rid: string, childId: string, limit: number, cursor?: string) {
    const after = decodeCursor<{ t: string; i: string }>(cursor);
    const rows = await this.db.withUser(u.id, rid, async (c) => {
      const p: unknown[] = [childId];
      if (after) p.push(after.t, after.i);
      p.push(limit + 1);
      // created_at como texto: preserva microssegundos no cursor (Date do JS só tem milissegundos)
      return (await c.query(
        `SELECT o.id, o.room_id, o.body, o.created_at::text AS created_at, us.name AS author_name
           FROM observations o JOIN users us ON us.id = o.author_id
          WHERE o.child_id = $1 AND o.deleted_at IS NULL
            ${after ? 'AND (o.created_at, o.id) < ($2::timestamptz, $3::uuid)' : ''}
          ORDER BY o.created_at DESC, o.id DESC LIMIT $${p.length}`, p)).rows;
    });
    const more = rows.length > limit; const items = more ? rows.slice(0, limit) : rows; const l = items[items.length - 1];
    return { items, nextCursor: more ? encodeCursor({ t: l.created_at, i: l.id }) : null };
  }

  remove(u: AuthUser, rid: string, id: string) {
    return this.db.withUser(u.id, rid, async (c) => {
      const r = await c.query(`UPDATE observations SET deleted_at = now(), deleted_by = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING id`, [id, u.id]);
      if (!r.rowCount) throw new NotFoundException('Observação não encontrada');
    });
  }
}
