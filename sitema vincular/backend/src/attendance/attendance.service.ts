import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { AuthUser } from '../auth/auth.types';
import { decodeCursor, encodeCursor } from '../common/cursor';

@Injectable()
export class AttendanceService {
  constructor(private readonly db: DbService) {}

  /**
   * Marca (ou corrige) a presença do dia. A sala NUNCA vem do cliente: é a permanência da criança
   * naquela data. Para o monitor, o RLS esconde permanências de outras salas → 404 (sem vazar existência).
   */
  mark(u: AuthUser, rid: string, d: { childId: string; date: string; status: 'present' | 'absent'; justification?: string }) {
    return this.db.withUser(u.id, rid, async (c) => {
      if ((await c.query(`SELECT $1::date > current_date AS f`, [d.date])).rows[0].f) throw new BadRequestException('Data futura');
      const stay = (await c.query(
        `SELECT to_room_id FROM child_room_movements
          WHERE child_id = $1 AND started_on <= $2::date AND (ended_on IS NULL OR $2::date < ended_on)`, [d.childId, d.date])).rows[0];
      if (!stay) throw new NotFoundException('Criança não encontrada nesta data');
      return (await c.query(
        `INSERT INTO attendance(child_id, room_id, attendance_date, status, justification, marked_by)
         VALUES ($1,$2,$3::date,$4,$5,$6)
         ON CONFLICT (child_id, attendance_date)
         DO UPDATE SET status = EXCLUDED.status, justification = EXCLUDED.justification, marked_by = EXCLUDED.marked_by
         RETURNING id, child_id, room_id, attendance_date::text, status, justification`,
        [d.childId, stay.to_room_id, d.date, d.status, d.status === 'absent' ? d.justification ?? null : null, u.id])).rows[0];
    });
  }

  /** Lista de chamada: quem estava na sala na data, com a marcação (se houver). */
  async roster(u: AuthUser, rid: string, roomId: string, date: string, limit: number, cursor?: string) {
    const after = decodeCursor<{ n: string; i: string }>(cursor);
    const rows = await this.db.withUser(u.id, rid, async (c) => {
      const p: unknown[] = [roomId, date];
      if (after) p.push(after.n, after.i);
      p.push(limit + 1);
      return (await c.query(
        `SELECT ch.id, ch.full_name, a.status, a.justification
           FROM child_room_movements m
           JOIN children ch ON ch.id = m.child_id AND ch.deleted_at IS NULL
           LEFT JOIN attendance a ON a.child_id = ch.id AND a.attendance_date = $2::date
          WHERE m.to_room_id = $1 AND m.started_on <= $2::date AND (m.ended_on IS NULL OR $2::date < m.ended_on)
            ${after ? 'AND (ch.full_name, ch.id) > ($3, $4::uuid)' : ''}
          ORDER BY ch.full_name, ch.id LIMIT $${p.length}`, p)).rows;
    });
    const more = rows.length > limit; const items = more ? rows.slice(0, limit) : rows; const l = items[items.length - 1];
    return { items, nextCursor: more ? encodeCursor({ n: l.full_name, i: l.id }) : null };
  }
}
