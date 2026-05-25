import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { syncHandler } from './routes/sync';

const app = new Hono();

app.post('/sync', syncHandler);
app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT) || 3000;
console.log(`Starting server on 0.0.0.0:${port}`);

serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
}, (info) => {
  console.log(`Server listening on http://0.0.0.0:${info.port}`);
});
