'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

const post = (url: string, body: any) =>
  fetch(url, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());

const fetchCSV = async () => {
  const txt = await fetch('/players.csv').then((r) => r.text());
  return txt
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => {
      const [name, elo] = l.split(',');
      return { name, elo: Number(elo) };
    });
};

export default function Session({ params }: { params: { session: string } }) {
  const router = useRouter();
  const search = useSearchParams();
  const initial = (search.get('players') || '').split(',').filter(Boolean);
  const [players, setPlayers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>(initial);
  const [duos, setDuos] = useState<any[]>([]);

  useEffect(() => {
    fetchCSV().then(setPlayers);
  }, []);

  function toggle(p: string) {
    setSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function generate() {
    const data = await post('/api/generate-round', {
      sessionId: params.session,
      players: selected,
    });
    setDuos(data.duos);
  }

  return (
    <main>
      <h1>Sesión {params.session}</h1>

      <h2>Jugadores activos</h2>
      {players.map((p) => (
        <label key={p.name} style={{ display: 'block' }}>
          <input
            type="checkbox"
            checked={selected.includes(p.name)}
            onChange={() => toggle(p.name)}
          />{' '}
          {p.name} — Elo {p.elo}
        </label>
      ))}

      <button onClick={generate} disabled={selected.length < 2}>
        Generar ronda
      </button>

      {duos.length > 0 && (
        <>
          <h2>Ronda</h2>
          <ol>
            {duos.map(([a, b], i) => (
              <li key={i}>
                {a} {b ? ` & ${b}` : '(descansa)'}
              </li>
            ))}
          </ol>
        </>
      )}

      <button onClick={() => router.push('/')} style={{ marginTop: 20 }}>
        Terminar sesión
      </button>
    </main>
  );
}
