'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, Page, qs } from '@/lib/api';
import { initials, today } from '@/lib/dates';

interface Room { id: string; name: string }
interface Row { id: string; full_name: string; status: 'present' | 'absent' | null; justification: string | null }

export default function Chamada() {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [roomId, setRoomId] = useState('');
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<string | null>(null);
  const req = useRef(0);   // ignora respostas de consultas que ficaram para trás

  useEffect(() => {
    api<Page<Room>>('GET', '/rooms?limit=100')
      .then((r) => { setRooms(r.items); setRoomId(r.items[0]?.id ?? ''); })
      .catch((e) => setError(e.message));
  }, []);

  const load = useCallback(async (after?: string | null) => {
    if (!roomId || !date) return;
    const id = ++req.current;
    setLoading(true); setError('');
    try {
      const r = await api<Page<Row>>('GET', `/rooms/${roomId}/roster?${qs({ date, limit: 100, cursor: after })}`);
      if (id !== req.current) return;
      setRows((cur) => (after ? [...cur, ...r.items] : r.items));
      setCursor(r.nextCursor);
    } catch (e) { if (id === req.current) setError((e as Error).message); }
    finally { if (id === req.current) setLoading(false); }
  }, [roomId, date]);

  useEffect(() => { setRows([]); setCursor(null); load(); }, [load]);

  async function mark(id: string, status: 'present' | 'absent', justification?: string) {
    const before = rows;
    setFresh(id); setError('');
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status, justification: status === 'absent' ? justification ?? r.justification : null } : r)));
    try {
      await api('PUT', '/attendance', { childId: id, date, status, ...(status === 'absent' && justification ? { justification } : {}) });
    } catch (e) { setRows(before); setError(`Não foi possível salvar: ${(e as Error).message}`); }
  }

  const done = rows.filter((r) => r.status).length;
  const room = rooms?.find((r) => r.id === roomId);

  if (rooms && rooms.length === 0) {
    return (
      <section className="empty">
        <h1>Chamada</h1>
        <p>Você ainda não está vinculado a uma sala. Peça a um administrador para vincular você a uma sala.</p>
      </section>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Chamada{room ? `: ${room.name}` : ''}</h1>
        <p className="muted">Toque em Presente ou Falta para cada criança. Cada marcação é salva na hora.</p>
      </div>

      <div className="toolbar">
        {rooms && rooms.length > 1 && (
          <label className="field">Sala
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">Data
          <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="progress" role="status" aria-live="polite">
        <p><strong>{done}</strong> de {rows.length}{cursor ? '+' : ''} crianças marcadas</p>
        <div className="bar" aria-hidden><span style={{ width: rows.length ? `${(done / rows.length) * 100}%` : '0%' }} /></div>
      </div>

      {!loading && rows.length === 0 && !error && (
        <p className="empty">Nenhuma criança nesta sala na data escolhida.</p>
      )}

      <ul className="board">
        {rows.map((r) => (
          <li key={r.id} className="kid" data-s={r.status ?? 'none'}>
            <span className={`token${fresh === r.id ? ' pop' : ''}`} data-s={r.status ?? 'none'} aria-hidden>{initials(r.full_name)}</span>
            <div>
              <p className="kid-name">{r.full_name}</p>
              <p className="muted">{r.status === 'present' ? 'Presente' : r.status === 'absent' ? 'Falta' : 'Sem marcação'}</p>
            </div>
            <div className="seg" role="group" aria-label={`Marcar ${r.full_name}`}>
              <button className="yes" aria-pressed={r.status === 'present'} onClick={() => mark(r.id, 'present')}>Presente</button>
              <button className="no" aria-pressed={r.status === 'absent'} onClick={() => mark(r.id, 'absent')}>Falta</button>
            </div>
            {r.status === 'absent' && (
              <input className="input" aria-label={`Justificativa da falta de ${r.full_name}`} placeholder="Justificativa (opcional)" maxLength={1000}
                defaultValue={r.justification ?? ''} onBlur={(e) => e.target.value !== (r.justification ?? '') && mark(r.id, 'absent', e.target.value)} />
            )}
          </li>
        ))}
      </ul>

      {cursor && <button className="btn ghost" onClick={() => load(cursor)} disabled={loading}>{loading ? 'Carregando…' : 'Carregar mais crianças'}</button>}
    </>
  );
}
