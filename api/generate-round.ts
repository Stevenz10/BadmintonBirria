import { kv } from '@vercel/kv';
import { makeDuos } from '../utils/pairings';

// ⚠️  Cambiamos el runtime a Node, igual que arriba
export const config = { runtime: 'nodejs20.x' };

export default async function handler(req: Request) {
  if (req.method !== 'POST')
    return new Response('Only POST', { status: 405 });

  const { sessionId, players } = await req.json();
  if (!sessionId || !Array.isArray(players))
    return new Response('Bad Request', { status: 400 });

  const rawHist = await kv.hget(`session:${sessionId}`, 'history') as string | null;
  const hist = rawHist ? JSON.parse(rawHist) : {};

  const { duos, newHist } = makeDuos(players, hist);
  await kv.hset(`session:${sessionId}`, { history: JSON.stringify(newHist) });

  return new Response(JSON.stringify({ duos }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
