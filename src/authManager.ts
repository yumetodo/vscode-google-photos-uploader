import * as vscode from 'vscode';
import { Configuration } from './configuration';
import { google } from 'googleapis';
import { OAuth2Client } from 'googleapis-common';
import { GaxiosOptions, GaxiosResponse } from 'gaxios';
import AbortController from 'abort-controller';
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
const scopes = [SCOPES.READ_AND_APPEND];
export class AuthManager {
  private configuration: Configuration;
  private oauth2Client: OAuth2Client;
  private constructor(configuration: Configuration) {
    this.configuration = configuration;
    this.oauth2Client = new google.auth.OAuth2(
      clientInfo.installed.client_id,
      clientInfo.installed.client_secret,
      clientInfo.installed.redirect_uris[0]
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
    const re = new AuthManager(configuration);
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
    this.openAuthWebPage();
    const code = await vscode.window.showInputBox({
      placeHolder: 'paste authorization code from browser',
      ignoreFocusOut: true,
    });
    if (code) {
      await this.setAuthorizationCode(code);
    }
  }
  async request<T = any>(opts: GaxiosOptions): Promise<GaxiosResponse<T>> {
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
