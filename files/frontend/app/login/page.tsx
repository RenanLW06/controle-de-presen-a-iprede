'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { PRODUCT_NAME } from '@/lib/config';

// Padrão decorativo da "chamada": p = presente, a = falta, . = ainda sem marcação.
const PATTERN = 'pp.ppp.app.pppa.ppp.pp';

export default function Login() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError('');
    try {
      await api('POST', '/auth/login', { email: String(f.get('email')).trim(), password: String(f.get('password')) });
      router.replace('/chamada');
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401
        ? 'Não foi possível entrar. Confira e-mail e senha. Após 5 tentativas erradas, a conta fica bloqueada por 15 minutos.'
        : 'Não foi possível conectar ao servidor. Tente novamente em instantes.');
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <section className="login-form">
        <span className="brand"><span className="brand-dot" aria-hidden /> {PRODUCT_NAME}</span>
        <form onSubmit={submit} noValidate={false}>
          <h1>Entrar</h1>
          <label className="field">E-mail<input name="email" type="email" autoComplete="username" required /></label>
          <label className="field">Senha<input name="password" type="password" autoComplete="current-password" required minLength={8} /></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </section>
      <aside className="login-panel" aria-hidden>
        <h2>Cada criança na sala certa. Cada chamada registrada.</h2>
        <div className="roll">
          {PATTERN.split('').map((c, i) => <i key={i} data-s={c} style={{ ['--i' as string]: i }} />)}
        </div>
      </aside>
    </main>
  );
}
