import { createServer } from 'http';
import { URL } from 'url';
import { Socket } from 'net';
export async function createRecivingAuthorizationCodeServer(
  port: number,
  serverResponceText: string,
  onServerListening: () => void
) {
  return new Promise<string>((resolve, reject) => {
    const connections = new Map<string, Socket>();
    const server = createServer((req, res) => {
      if (typeof req.url === 'undefined') {
        reject();
        return;
      }
      const dummyBaseURL = 'http://www.example.com';
      const u = new URL(req.url, dummyBaseURL);
      try {
        if (u.pathname === '/oauth2callback') {
          const code = u.searchParams.get('code');
          if (typeof code !== 'string') {
            reject();
            return;
          }
          res.end(serverResponceText);
          server.close();
          for (const c of connections.values()) {
            c.destroy();
          }
          resolve(code);
        }
      } catch (e) {
        reject(e);
      }
    }).listen(port, onServerListening);
    server.on('connection', conn => {
      const key = `${conn.remoteAddress}:${conn.remotePort}`;
      connections.set(key, conn);
      conn.on('close', () => {
        connections.delete(key);
      });
    });
  });
}
