import * as path from 'path';
import { Progress } from 'vscode';
import { promises as fs } from 'fs';
import AbortController from 'abort-controller';
import { Photos } from './googlePhotos';
import { waitFor } from './timer';
import { mergePureUrlsAndNoReplaceIndexes } from './mergePureUrlsAndNoReplaceIndexes';

export class UploadManager {
  private fileCheckPromises_: Promise<void>[] = [];
  private uploadingImagePath_ = new Map<string, number>();
  private urls_: readonly (string | undefined)[] = [];
  private noReplaceIndexes_: number[] = [];
  private tokenGetters_: (() => Promise<[string, string] | null>)[] = [];
  async waitFileCheck(): Promise<void> {
    await Promise.all(this.fileCheckPromises_);
  }
  createSrcGenerator(
    alt: string,
    s: string,
    dir: string,
    photos: Photos,
    abortControllerMap: Map<string, AbortController>
  ): () => string {
    const p = path.resolve(dir, s);
    if (this.uploadingImagePath_.has(p)) {
      const index = this.uploadingImagePath_.get(p);
      return () => (index != null ? this.urls_[index] || s : s);
    } else {
      const index = this.fileCheckPromises_.length;
      this.fileCheckPromises_.push(this.createFileChecker_(index, alt, p, photos, abortControllerMap));
      this.uploadingImagePath_.set(p, index);
      return () => this.urls_[index] || s;
    }
  }
  private async createFileChecker_(
    index: number,
    alt: string,
    p: string,
    photos: Photos,
    abortControllerMap: Map<string, AbortController>
  ) {
    try {
      await fs.stat(p);
    } catch (_) {
      this.noReplaceIndexes_.push(index);
      return;
    }
    this.tokenGetters_.push(() => this.upload_(index, alt, p, photos, abortControllerMap));
  }
  private async upload_(
    index: number,
    alt: string,
    p: string,
    photos: Photos,
    abortControllerMap: Map<string, AbortController>
  ): Promise<[string, string] | null> {
    const k = `upload::${p}`;
    const c = new AbortController();
    abortControllerMap.set(k, c);
    try {
      const t = await photos.upload(p, c.signal);
      return [alt, t];
    } catch (_) {
      this.noReplaceIndexes_.push(index);
      return null;
    } finally {
      abortControllerMap.delete(k);
    }
  }
  async execUpload(progress: Progress<{ message?: string; increment?: number }>): Promise<[string, string][]> {
    const tokens: [string, string][] = [];
    let t = waitFor(1);
    progress.report({ increment: 0 });
    let i = 0;
    for (const getter of this.tokenGetters_) {
      await t;
      // request sequentially
      const token = await getter();
      if (token) {
        tokens.push(token);
      }
      t = waitFor(1000);
      progress.report({
        increment: 100 / this.tokenGetters_.length,
        message: `(${i++}/${this.tokenGetters_.length})`,
      });
    }
    await t;
    progress.report({ message: 'upload finished.' });
    return tokens;
  }
  mergePureUrls(pureUrls: (string | undefined)[]): void {
    this.urls_ = mergePureUrlsAndNoReplaceIndexes(pureUrls, this.noReplaceIndexes_);
  }
}
