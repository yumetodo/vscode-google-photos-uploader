import * as vscode from 'vscode';
import { google } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { GaxiosOptions, GaxiosResponse } from 'gaxios';
import { getPortPromise } from 'portfinder';
import { Configuration } from './configuration';
import { RecivingAuthorizationCodeServer } from './createRecivingAuthorizationCodeServer';
import authorizationCodeRecivingSucsessHTML from './authorizationCodeRecivingSucsess.html';
//ここは馬鹿にしか見えない
const clientInfo = {
  installed: {
    client_id: '60080774031-sl0osvubtlfj9pisg9kmaocrqirgddk0.apps.googleusercontent.com',
    project_id: 'resolute-cat-232404',
    auth_uri: 'https://accounts.google.com/o/oauth2/auth',
    token_uri: 'https://oauth2.googleapis.com/token',
    auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
    client_secret: 'icg6tV3DMbjBCYYKS2T-e6zF',
    redirect_uris: ['urn:ietf:wg:oauth:2.0:oob', 'http://localhost'],
  },
};
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
  private constructor(configuration: Configuration, server: RecivingAuthorizationCodeServer) {
    this.configuration = configuration;
    this.server = server;
    this.oauth2Client = new google.auth.OAuth2(
      clientInfo.installed.client_id,
      clientInfo.installed.client_secret,
      `http://127.0.0.1:${this.server.port}`
    );
    const access_token = this.configuration.get('access_token');
    const refresh_token = this.configuration.get('refresh_token');
    if (access_token && refresh_token) {
      this.oauth2Client.setCredentials({
        access_token: access_token,
        refresh_token: refresh_token,
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
  static async init(configuration: Configuration) {
    const server = await RecivingAuthorizationCodeServer.init(
      await getPortPromise(),
      authorizationCodeRecivingSucsessHTML
    );
    const re = new AuthManager(configuration, server);
    if (!(await re.checkTokensIsValid().catch(() => false))) {
      await re.firstTimeAuth();
    }
    return re;
  }
  private createAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
    });
  }
  private openAuthWebPage() {
    vscode.env.openExternal(vscode.Uri.parse(this.createAuthUrl()));
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
  async firstTimeAuth(): Promise<void> {
    const getter = this.server.get();
    this.openAuthWebPage();
    const code = await getter;
    this.setAuthorizationCode(code);
  }
  async request<T = any>(opts: GaxiosOptions): Promise<GaxiosResponse<T>> {
    opts.retryConfig = opts.retryConfig || {};
    opts.retryConfig.retry = 4;
    opts.retryConfig.retryDelay = 1000;
    opts.retry = true;
    return this.oauth2Client.request(opts);
  }
  private async checkTokensIsValid(): Promise<boolean> {
    const token = await this.access_token();
    if (!token) {
      return false;
    } else {
      const info = await this.oauth2Client.getTokenInfo(token);
      return undefined !== info.access_type;
    }
  }
  async access_token(): Promise<string | null | undefined> {
    const { token } = await this.oauth2Client.getAccessToken();
    return token;
  }
}
