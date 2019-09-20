import { google } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { GaxiosOptions, GaxiosResponse } from 'gaxios';
import { getPortPromise } from 'portfinder';
import { Configuration } from './iConfiguration';
import { RecivingAuthorizationCodeServer } from './createRecivingAuthorizationCodeServer';
import authorizationCodeRecivingSucsessHTML from './authorizationCodeRecivingSucsess.html';
const SCOPES = {
  READ_ONLY: 'https://www.googleapis.com/auth/photoslibrary.readonly',
  APPEND_ONLY: 'https://www.googleapis.com/auth/photoslibrary.appendonly',
  READ_DEV_DATA: 'https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata',
  READ_AND_APPEND: 'https://www.googleapis.com/auth/photoslibrary',
  SHARING: 'https://www.googleapis.com/auth/photoslibrary.sharing',
};
const scopes = [SCOPES.READ_AND_APPEND, SCOPES.SHARING];
export class AuthManager {
  private configuration: Configuration;
  private oauth2Client: OAuth2Client;
  /** reserve port */
  private server: RecivingAuthorizationCodeServer;
  private constructor(
    configuration: Configuration,
    server: RecivingAuthorizationCodeServer,
    clientId: string,
    clientSecret: string
  ) {
    this.configuration = configuration;
    this.server = server;
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, `http://127.0.0.1:${this.server.port}`);
    const accessToken = this.configuration.get('access_token');
    const refreshToken = this.configuration.get('refresh_token');
    if (accessToken && refreshToken) {
      this.oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
    this.oauth2Client.on('tokens', tokens => {
      if (tokens.access_token) {
        this.configuration.set('access_token', tokens.access_token);
      }
      if (tokens.refresh_token) {
        this.configuration.set('refresh_token', tokens.refresh_token);
      }
    });
  }
  static async init(
    configuration: Configuration,
    openAuthWebPage: (url: string) => Promise<boolean>,
    clientId: string,
    clientSecret: string
  ) {
    const server = await RecivingAuthorizationCodeServer.init(
      await getPortPromise(),
      authorizationCodeRecivingSucsessHTML
    );
    const re = new AuthManager(configuration, server, clientId, clientSecret);
    if (!(await re.checkTokensIsValid().catch(() => false))) {
      await re.firstTimeAuth(openAuthWebPage);
    }
    return re;
  }
  private createAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }
  private async setAuthorizationCode(code: string): Promise<void> {
    const { tokens } = await this.oauth2Client.getToken(code);
    console.log(`expiry_date: ${tokens.expiry_date}`);
    this.oauth2Client.setCredentials(tokens);
    if (tokens.access_token) {
      this.configuration.set('access_token', tokens.access_token);
    }
    if (tokens.refresh_token) {
      this.configuration.set('refresh_token', tokens.refresh_token);
    }
  }
  async firstTimeAuth(openAuthWebPage: (url: string) => Promise<boolean>): Promise<void> {
    const getter = this.server.get();
    if (!(await openAuthWebPage(this.createAuthUrl()))) {
      throw new Error('Fail to open authorization web page.');
    }
    const code = await getter;
    await this.setAuthorizationCode(code);
  }
  async request<T>(opts: GaxiosOptions): Promise<GaxiosResponse<T>> {
    opts.retryConfig = opts.retryConfig || {};
    opts.retryConfig.retry = 4;
    opts.retryConfig.retryDelay = 1000;
    opts.retry = true;
    return this.oauth2Client.request(opts);
  }
  private async checkTokensIsValid(): Promise<boolean> {
    const token = await this.accessToken();
    if (!token) {
      return false;
    } else {
      const info = await this.oauth2Client.getTokenInfo(token);
      return undefined !== info.access_type;
    }
  }
  async accessToken(): Promise<string | null | undefined> {
    const { token } = await this.oauth2Client.getAccessToken();
    return token;
  }
}
