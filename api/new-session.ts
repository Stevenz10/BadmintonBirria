import { kv } from '@vercel/kv';

export default async function handler() {
  const id = Date.now().toString();
  await kv.hset(`session:${id}`, { history: JSON.stringify({}) });
  return new Response(JSON.stringify({ sessionId: id }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
