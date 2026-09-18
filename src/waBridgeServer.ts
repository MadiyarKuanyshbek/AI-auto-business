import http from 'node:http';
import { getStatus, notifySelf, startBot, stopBot } from './waManager';

// Служебный HTTP-мост между процессом сайта (web) и процессом демона
// (wa-daemon) — они отдельные PM2-процессы, сокет WhatsApp живёт только тут.
// Слушает исключительно 127.0.0.1, авторизация — общий секрет в заголовке.

const START_TIMEOUT_MS = 25000;

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

export function startBridgeServer() {
  const port = Number(process.env.WA_BRIDGE_PORT ?? 4001);
  const secret = process.env.INTERNAL_BRIDGE_SECRET;

  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (!secret || req.headers['x-internal-secret'] !== secret) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const match = req.url?.match(/^\/bots\/([^/]+)\/(start|stop|status|notify)$/);
    if (!match) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const [, ownerId, action] = match;

    try {
      if (action === 'start' && req.method === 'POST') {
        const body = await readBody(req);
        const { phoneNumber } = body ? JSON.parse(body) : {};
        const { pairingCode } = await withTimeout(startBot(ownerId, phoneNumber), START_TIMEOUT_MS);
        res.writeHead(200);
        res.end(JSON.stringify({ pairingCode }));
        return;
      }

      if (action === 'stop' && req.method === 'POST') {
        const stopped = stopBot(ownerId);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: stopped }));
        return;
      }

      if (action === 'status' && req.method === 'GET') {
        res.writeHead(200);
        res.end(JSON.stringify({ status: getStatus(ownerId) }));
        return;
      }

      if (action === 'notify' && req.method === 'POST') {
        const body = await readBody(req);
        const { text } = body ? JSON.parse(body) : {};
        if (typeof text !== 'string' || !text) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'missing_text' }));
          return;
        }
        const sent = await notifySelf(ownerId, text);
        res.writeHead(200);
        res.end(JSON.stringify({ ok: sent }));
        return;
      }

      res.writeHead(405);
      res.end(JSON.stringify({ error: 'method_not_allowed' }));
    } catch (err) {
      console.error(`[bridge] ${action} failed for owner ${ownerId}:`, err);
      res.writeHead(502);
      res.end(JSON.stringify({ error: 'internal_error' }));
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`WA bridge server listening on 127.0.0.1:${port}`);
  });

  return server;
}
