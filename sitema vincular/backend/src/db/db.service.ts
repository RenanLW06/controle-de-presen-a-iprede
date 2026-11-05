import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 20),
  });

  /**
   * Toda consulta autenticada passa por aqui. O contexto do usuário vale só
   * dentro da transação (set_config local), então não vaza entre conexões do pool.
   * RLS e auditoria dependem desse contexto.
   */
  async withUser<T>(userId: string, requestId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(`SELECT set_config('app.user_id', $1, true), set_config('app.request_id', $2, true)`, [userId, requestId]);
      const result = await fn(c);
      await c.query('COMMIT');
      return result;
    } catch (err) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      c.release();
    }
  }

  onModuleDestroy() { return this.pool.end(); }
}
