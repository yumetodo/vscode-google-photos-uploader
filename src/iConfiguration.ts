export interface Configuration {
  get(key: 'access_token' | 'refresh_token'): string | undefined;
  set(key: 'access_token' | 'refresh_token', value: string): Thenable<void>;
}
