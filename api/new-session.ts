import { kv } from '@vercel/kv';

// ❌  ya NO necesitamos  export const config = { runtime: 'edge' };
// Vercel detectará automáticamente Node.js (o puedes indicar nodejs20.x así):
export const config = { runtime: 'nodejs20.x' };

export default async function handler() {
  const id = Date.now().toString();
  await kv.hset(`session:${id}`, { history: JSON.stringify({}) });
  return new Response(JSON.stringify({ sessionId: id }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
