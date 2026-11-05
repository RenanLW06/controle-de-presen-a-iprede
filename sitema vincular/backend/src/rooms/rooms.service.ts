import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthUser } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';

@Injectable()
export class RoomsService {
  constructor(private readonly db: DbService) {}

  create(u: AuthUser, rid: string, name: string) {
    return this.db.withUser(u.id, rid, async (c) =>
      (await c.query(`INSERT INTO rooms(name) VALUES ($1) RETURNING id, name`, [name.trim()])).rows[0]);
  }

  async list(u: AuthUser, rid: string, limit: number, cursor?: string) {
    const after = decodeCursor<{ n: string; i: string }>(cursor);
    const rows = await this.db.withUser(u.id, rid, async (c) => {
      const p: unknown[] = after ? [after.n, after.i, limit + 1] : [limit + 1];
      return (await c.query(
        `SELECT id, name FROM rooms WHERE deleted_at IS NULL ${after ? 'AND (name, id) > ($1, $2::uuid)' : ''}
          ORDER BY name, id LIMIT $${p.length}`, p)).rows;
    });
    const more = rows.length > limit; const items = more ? rows.slice(0, limit) : rows; const l = items[items.length - 1];
    return { items, nextCursor: more ? encodeCursor({ n: l.name, i: l.id }) : null };
  }

  /** Vincula o monitor à sala; encerra o vínculo anterior dele (um monitor, uma sala por vez). */
  assignMonitor(u: AuthUser, rid: string, roomId: string, monitorId: string, startedOn?: string) {
    return this.db.withUser(u.id, rid, async (c) => {
      const room = await c.query(`SELECT 1 FROM rooms WHERE id = $1 AND deleted_at IS NULL`, [roomId]);
      if (!room.rowCount) throw new NotFoundException('Sala não encontrada');
      const mon = await c.query(
        `SELECT 1 FROM users WHERE id = $1 AND role = 'monitor' AND is_active AND deleted_at IS NULL FOR UPDATE`, [monitorId]);
      if (!mon.rowCount) throw new NotFoundException('Monitor não encontrado');
      const day = (await c.query(`SELECT COALESCE($1::date, current_date)::text AS d`, [startedOn])).rows[0].d;
      const open = await c.query(`SELECT room_id FROM room_monitors WHERE user_id = $1 AND ended_on IS NULL`, [monitorId]);
      if (open.rows[0]?.room_id === roomId) throw new ConflictException('Monitor já vinculado a esta sala');
      await c.query(`UPDATE room_monitors SET ended_on = $2::date WHERE user_id = $1 AND ended_on IS NULL`, [monitorId, day]);
      return (await c.query(
        `INSERT INTO room_monitors(room_id, user_id, started_on, assigned_by) VALUES ($1,$2,$3::date,$4)
         RETURNING id, room_id, user_id, started_on::text`, [roomId, monitorId, day, u.id])).rows[0];
    });
  }
}
