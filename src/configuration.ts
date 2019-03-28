import * as vscode from 'vscode';
//note: When you change valid key string, you must also update package.json

export class Configuration {
  private wspConf: vscode.WorkspaceConfiguration;
  private cache: Map<string, string>;

  constructor() {
    this.wspConf = vscode.workspace.getConfiguration('googlePhotosUploader');
    this.cache = new Map();
  }
  get(key: 'access_token' | 'refresh_token'): string | undefined {
    if (!this.cache.has(key)) {
      const v: string | undefined = this.wspConf.get(key);
      if (undefined === v) {
        return undefined;
      }
      this.cache.set(key, v);
    }
    return this.cache.get(key);
  }
  set(key: 'access_token' | 'refresh_token', value: string): Thenable<void> {
    this.cache.set(key, value);
    return this.wspConf.update(key, value, true);
  }
}
