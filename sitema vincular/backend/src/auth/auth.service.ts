import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DbService } from '../db/db.service';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  private dummyHash?: Promise<string>;
  constructor(private readonly db: DbService, private readonly jwt: JwtService) {}

  async login(email: string, password: string): Promise<string> {
    const { rows } = await this.db.pool.query(
      `SELECT id, role, password_hash, is_active, locked_until
         FROM users WHERE email = $1 AND deleted_at IS NULL`, [email]);
    const u = rows[0];

    // Verifica sempre um hash (mesmo sem usuário) para não vazar existência por tempo de resposta.
    this.dummyHash ??= argon2.hash('dummy-password', { type: argon2.argon2id });
    const ok = await argon2.verify(u?.password_hash ?? (await this.dummyHash), password).catch(() => false);

    const locked = u?.locked_until && new Date(u.locked_until) > new Date();
    if (!u || !u.is_active || locked || !ok) {
      if (u && !ok) {
        await this.db.pool.query(
          `UPDATE users SET failed_logins = failed_logins + 1,
                  locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
            WHERE id = $1`, [u.id, MAX_FAILURES, LOCK_MINUTES]);
      }
      throw new UnauthorizedException('Credenciais inválidas');   // mensagem única para todos os casos
    }
    await this.db.pool.query(`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = $1`, [u.id]);
    return this.jwt.signAsync({ sub: u.id, role: u.role });
  }
}
