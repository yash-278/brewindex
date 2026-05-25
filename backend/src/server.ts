import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { syncHandler } from './routes/sync';

const app = new Hono();

app.post('/sync', syncHandler);
app.get('/health', (c) => c.json({ ok: true }));

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT) || 3000,
});
