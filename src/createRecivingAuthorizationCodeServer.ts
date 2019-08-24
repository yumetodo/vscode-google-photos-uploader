import { createServer, Server } from 'http';
import { URL } from 'url';
import { Socket } from 'net';
export class RecivingAuthorizationCodeServer {
  private connections: Map<string, Socket>;
  private server: Server;
  private usingPort: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private codeGetter: [(value?: string | PromiseLike<string> | undefined) => void, (reason?: any) => void] | null;
  private constructor(port: number, serverResponceText: string, onServerListening: () => void) {
    this.codeGetter = null;
    this.usingPort = port;
    this.connections = new Map<string, Socket>();
    const dummyBaseURL = 'http://www.example.com';
    this.server = createServer((req, res) => {
      if (null === this.codeGetter) {
        res.statusCode = 500;
        res.end('Server is currently not working.');
        return;
      }
      if (typeof req.url === 'undefined') {
        res.statusCode = 400;
        res.end();
        return;
      }
      const resolve = this.codeGetter[0];
      const reject = this.codeGetter[1];
      this.codeGetter = null;
      const u = new URL(req.url, dummyBaseURL);
      try {
        const code = u.searchParams.get('code');
        if (typeof code !== 'string') {
          res.statusCode = 404;
          res.end('Malformed authorization response.');
          reject(`Malformed authorization response. ${u.searchParams.toString()}`);
          return;
        }
        res.end(serverResponceText);
        resolve(code);
      } catch (e) {
        res.statusCode = 404;
        res.end();
        reject(e);
      }
    }).listen(port, onServerListening);
    this.server.on('connection', conn => {
      const key = `${conn.remoteAddress}:${conn.remotePort}`;
      this.connections.set(key, conn);
      conn.on('close', () => {
        this.connections.delete(key);
      });
    });
  }
  get port() {
    return this.usingPort;
  }
  async get() {
    return new Promise<string>((resolve, reject) => {
      if (null === this.codeGetter) {
        this.codeGetter = [resolve, reject];
      } else {
        reject('already waiting responce.');
      }
    });
  }
  close() {
    this.server.close();
    for (const c of this.connections.values()) {
      c.destroy();
    }
  }
  static async init(port: number, serverResponceText: string) {
    return new Promise<RecivingAuthorizationCodeServer>((resolve, reject) => {
      try {
        const re = new RecivingAuthorizationCodeServer(port, serverResponceText, () => {
          resolve(re);
        });
      } catch (e) {
        reject(e);
      }
    });
  }
}
