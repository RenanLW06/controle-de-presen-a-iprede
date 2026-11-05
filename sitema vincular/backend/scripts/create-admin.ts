// Uso: ADMIN_DATABASE_URL=... npm run create-admin -- "Nome" email@dominio.com 'SenhaForte123!'
import * as argon2 from 'argon2';
import { Pool } from 'pg';

(async () => {
  const [name, email, password] = process.argv.slice(2);
  if (!name || !email || !password || password.length < 12) throw new Error('Informe nome, e-mail e senha (mín. 12 caracteres)');
  const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  await pool.query(`INSERT INTO users (name, email, password_hash, role, must_change_password) VALUES ($1,$2,$3,'admin',false)`, [name, email, hash]);
  await pool.end();
  console.log('Administrador criado.');
})();
