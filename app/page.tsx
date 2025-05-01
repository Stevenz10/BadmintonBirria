'use client';

import useSWR from 'swr';
import { useState } from 'react';

const fetchCSV = (url: string) =>
  fetch(url)
    .then((r) => r.text())
    .then((txt) =>
      txt
        .trim()
        .split('\n')
        .slice(1)
        .map((l) => {
          const [name, elo] = l.split(',');
          return { name, elo: Number(elo) };
        })
    );

export default function NewSession() {
  const { data } = useSWR('/players.csv', fetchCSV);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  function toggle(p: string) {
    const s = new Set(checked);
    s.has(p) ? s.delete(p) : s.add(p);
    setChecked(s);
  }

  async function startSession() {
    const res = await fetch('/api/new-session');
    const { sessionId } = await res.json();
    if (!sessionId) return alert('Error');
    location.href = `/${sessionId}?players=${[...checked].join(',')}`;
  }

  if (!data) return <p>Cargando…</p>;

  return (
    <>
      <h1>Crear nueva sesión</h1>
      <p>Marca quién juega y pulsa <strong>Comenzar</strong>.</p>

      {data.map((p: any) => (
        <label key={p.name} style={{ display: 'block', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={checked.has(p.name)}
            onChange={() => toggle(p.name)}
            style={{ marginRight: 8 }}
          />
          {p.name} — Elo {p.elo}
        </label>
      ))}

      <button
        disabled={checked.size < 2}
        onClick={startSession}
        style={{ marginTop: 20, padding: '8px 20px' }}
      >
        Comenzar sesión
      </button>
    </>
  );
}
