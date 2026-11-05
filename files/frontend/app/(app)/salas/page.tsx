'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, Page } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Room { id: string; name: string }

export default function Salas() {
  const { user } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api<Page<Room>>('GET', '/rooms?limit=100').then((r) => setRooms(r.items)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setSaving(true); setError('');
    try { await api('POST', '/rooms', { name: String(new FormData(form).get('name')).trim() }); form.reset(); await load(); }
    catch (err) { setError((err as Error).message); } finally { setSaving(false); }
  }

  if (user.role !== 'admin') return <p className="empty">Apenas administradores gerenciam salas.</p>;

  return (
    <>
      <div className="page-head"><h1>Salas</h1><p className="muted">Crie salas e use-as para distribuir as crianças.</p></div>
      <form className="panel grid-form" onSubmit={create}>
        <label className="field">Nome da sala<input name="name" required maxLength={80} /></label>
        <button className="btn" disabled={saving}>{saving ? 'Salvando…' : 'Criar sala'}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {rooms.length === 0 ? <p className="empty">Nenhuma sala criada ainda.</p> : (
        <div className="table-wrap"><table>
          <caption className="sr-only">Salas</caption>
          <thead><tr><th scope="col">Sala</th></tr></thead>
          <tbody>{rooms.map((r) => <tr key={r.id}><td>{r.name}</td></tr>)}</tbody>
        </table></div>
      )}
    </>
  );
}
