import { createServer, Server } from 'http';
import { URL } from 'url';
import { Socket } from 'net';
export class RecivingAuthorizationCodeServer {
  private connections: Map<string, Socket>;
  private server: Server;
  private usingPort: number;
  private codeGetters: [(value?: string | PromiseLike<string> | undefined) => void, (reason?: any) => void][];
  private constructor(port: number, serverResponceText: string, onServerListening: () => void) {
    this.codeGetters = [];
    this.usingPort = port;
    this.connections = new Map<string, Socket>();
    const dummyBaseURL = 'http://www.example.com';
    this.server = createServer((req, res) => {
      const codeGetter = this.codeGetters.shift();
      if (typeof codeGetter === 'undefined') {
        return;
      }
      const resolve = codeGetter[0];
      const reject = codeGetter[1];
      if (typeof req.url === 'undefined') {
        reject();
        return;
      }
      const u = new URL(req.url, dummyBaseURL);
      try {
        if (u.pathname === '/oauth2callback') {
          const code = u.searchParams.get('code');
          if (typeof code !== 'string') {
            reject();
            return;
          }
          res.end(serverResponceText);
          resolve(code);
        }
      } catch (e) {
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
      this.codeGetters.push([resolve, reject]);
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
