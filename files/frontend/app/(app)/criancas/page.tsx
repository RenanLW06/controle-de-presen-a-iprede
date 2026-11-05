'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, Page, qs } from '@/lib/api';
import { formatDay, today } from '@/lib/dates';
import { useSession } from '@/lib/session';

interface Room { id: string; name: string }
interface Child { id: string; full_name: string; birth_date: string; room_id: string }

export default function Criancas() {
  const { user } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [items, setItems] = useState<Child[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (after?: string | null) => {
    setLoading(true); setError('');
    try {
      const r = await api<Page<Child>>('GET', `/children?${qs({ limit: 50, cursor: after })}`);
      setItems((cur) => (after ? [...cur, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    api<Page<Room>>('GET', '/rooms?limit=100').then((r) => setRooms(r.items)).catch((e) => setError(e.message));
  }, [load]);

  const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? '—';

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    setSaving(true); setError('');
    try {
      await api('POST', '/children', { fullName: String(f.get('name')).trim(), birthDate: String(f.get('birth')), roomId: String(f.get('room')) });
      form.reset(); await load();
    } catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }

  return (
    <>
      <div className="page-head">
        <h1>Crianças</h1>
        <p className="muted">{user.role === 'admin' ? 'Todas as crianças cadastradas, com a sala atual.' : 'Crianças da sua sala.'}</p>
      </div>

      {user.role === 'admin' && (
        <form className="panel grid-form" onSubmit={create}>
          <label className="field">Nome completo<input name="name" required minLength={2} maxLength={160} /></label>
          <label className="field">Nascimento<input name="birth" type="date" required max={today()} /></label>
          <label className="field">Sala inicial
            <select name="room" required defaultValue="">
              <option value="" disabled>Escolha a sala</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <button className="btn" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar criança'}</button>
        </form>
      )}

      {error && <p className="error" role="alert">{error}</p>}

      {!loading && items.length === 0 ? (
        <p className="empty">Nenhuma criança por aqui ainda.{user.role === 'admin' ? ' Cadastre a primeira acima.' : ''}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Lista de crianças</caption>
            <thead><tr><th scope="col">Nome</th><th scope="col">Nascimento</th><th scope="col">Sala</th></tr></thead>
            <tbody>{items.map((c) => (
              <tr key={c.id}><th scope="row" style={{ background: 'none', fontFamily: 'var(--f-body)', fontWeight: 600 }}>{c.full_name}</th><td>{formatDay(c.birth_date)}</td><td>{roomName(c.room_id)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {cursor && <button className="btn ghost" onClick={() => load(cursor)} disabled={loading}>{loading ? 'Carregando…' : 'Carregar mais'}</button>}
    </>
  );
}
