'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { PRODUCT_NAME } from '@/lib/config';
import { SessionContext, User } from '@/lib/session';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    api<User>('GET', '/auth/me').then(setUser).catch(() => router.replace('/login'));
  }, [router]);

  if (!user) return <p className="page muted" role="status">Carregando…</p>;

  const links = [
    { href: '/chamada', label: 'Chamada' },
    { href: '/criancas', label: 'Crianças' },
    ...(user.role === 'admin' ? [{ href: '/salas', label: 'Salas' }] : []),
  ];
  const logout = async () => { await api('POST', '/auth/logout').catch(() => undefined); router.replace('/login'); };

  return (
    <SessionContext.Provider value={{ user, logout }}>
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand"><span className="brand-dot" aria-hidden /> {PRODUCT_NAME}</span>
          <nav className="nav" aria-label="Principal">
            {links.map((l) => <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>{l.label}</Link>)}
          </nav>
          <div className="who">
            <span>{user.name} <span className="muted">({user.role === 'admin' ? 'administrador' : 'monitor'})</span></span>
            <button className="btn ghost" onClick={logout}>Sair</button>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
    </SessionContext.Provider>
  );
}
