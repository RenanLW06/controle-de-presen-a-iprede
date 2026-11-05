import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthedRequest } from '../auth/auth.types';
import { JwtGuard, Roles, RolesGuard } from '../auth/guards';
import { DbService } from '../db/db.service';
import { parseLimit } from '../common/cursor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('audit')
@UseGuards(JwtGuard, RolesGuard)
export class AuditController {
  constructor(private readonly db: DbService) {}

  /** Trilha de auditoria (somente administrador; o RLS de audit_log reforça). Cursor = último id. */
  @Get() @Roles('admin')
  async list(@Req() r: AuthedRequest, @Query('entityType') type?: string, @Query('entityId') entityId?: string,
             @Query('limit') l?: string, @Query('cursor') cursor?: string) {
    const limit = parseLimit(l);
    if (type && !/^[a-z_]{1,40}$/.test(type)) throw new BadRequestException('entityType inválido');
    if (entityId && !UUID.test(entityId)) throw new BadRequestException('entityId inválido');
    if (cursor && !/^\d{1,18}$/.test(cursor)) throw new BadRequestException('cursor inválido');
    const p: unknown[] = []; const w: string[] = [];
    if (type) { p.push(type); w.push(`entity_type = $${p.length}`); }
    if (entityId) { p.push(entityId); w.push(`entity_id = $${p.length}::uuid`); }
    if (cursor) { p.push(cursor); w.push(`id < $${p.length}::bigint`); }
    p.push(limit + 1);
    const rows = await this.db.withUser(r.user.id, r.id, async (c) => (await c.query(
      `SELECT id::text, occurred_at::text, actor_id, action, entity_type, entity_id, old_values, new_values, request_id
         FROM audit_log ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY id DESC LIMIT $${p.length}`, p)).rows);
    const more = rows.length > limit; const items = more ? rows.slice(0, limit) : rows;
    return { items, nextCursor: more ? items[items.length - 1].id : null };
  }
}
