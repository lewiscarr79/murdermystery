import express from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './src/server/rooms.ts';

async function main() {
  const app = express();
  const http = createServer(app);
  const io = new Server(http, { pingInterval: 10_000, pingTimeout: 20_000 });
  registerSocketHandlers(io);

  app.get('/api/health', (_req, res) => res.json({ ok: true, time: Date.now() }));

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createVite } = await import('vite');
    const vite = await createVite({ server: { middlewareMode: true, hmr: { server: http } }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.join(process.cwd(), 'dist');
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  const port = Number(process.env.PORT ?? 3000);
  http.listen(port, '0.0.0.0', () => console.log(`Launch Night listening on http://0.0.0.0:${port}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
