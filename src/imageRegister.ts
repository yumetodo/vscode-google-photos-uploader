import * as vscode from 'vscode';
import { GooglePhotos } from 'google-photos-album-image-url-fetch';
import AbortController from 'abort-controller';
import { Photos } from './googlePhotos';
import { SelectTargetAlbumResult } from './selectTargetAlbum';
import { waitFor } from './timer';
import { request } from 'gaxios';
import crypto from 'crypto';
import { ImageInfo } from 'google-photos-album-image-url-fetch/dist/imageInfo';

async function fetchImageUrlsWrap(shareableUrl: string, AbortControllerMap: Map<string, AbortController>) {
  const fetchImageUrlsAbortController = new AbortController();
  AbortControllerMap.set('fetchImageUrls', fetchImageUrlsAbortController);
  const re = await GooglePhotos.Album.fetchImageUrls(shareableUrl, fetchImageUrlsAbortController.signal);
  AbortControllerMap.delete('fetchImageUrls');
  return re;
}
async function getFileAndHash(url: string, AbortControllerMap: Map<string, AbortController>) {
  const controller = new AbortController();
  AbortControllerMap.set(`getFileAndHash:${url}`, controller);
  const img = await request<ArrayBuffer>({ url: url, responseType: 'arraybuffer', signal: controller.signal });
  AbortControllerMap.delete(`getFileAndHash:${url}`);
  const cipher = crypto.createHash('sha512');
  cipher.update(new DataView(img.data));
  return cipher.digest('hex');
}
async function getImghasesfromWebScraping(
  info: readonly ImageInfo[],
  AbortControllerMap: Map<string, AbortController>
) {
  return Promise.all(info.map(async i => getFileAndHash(`${i.url}=w${i.width}-h${i.height}`, AbortControllerMap)));
}
async function getImghasesfromAPI(photos: Photos, ids: string[], AbortControllerMap: Map<string, AbortController>) {
  const batchGetAbortController = new AbortController();
  AbortControllerMap.set('batchGet', batchGetAbortController);
  const re2 = await photos.mediaItems.batchGet(ids, batchGetAbortController.signal);
  AbortControllerMap.delete('batchGet');
  const hashPromises = re2.map(async m => {
    if (
      m.mediaItem &&
      m.mediaItem.baseUrl &&
      m.mediaItem.mediaMetadata &&
      m.mediaItem.mediaMetadata.width &&
      m.mediaItem.mediaMetadata.height
    ) {
      return getFileAndHash(
        `${m.mediaItem.baseUrl}=w${m.mediaItem.mediaMetadata.width}-h${m.mediaItem.mediaMetadata.height}`,
        AbortControllerMap
      );
    } else {
      throw new Error('batchGet fail');
    }
  });
  return await Promise.all(hashPromises);
}
async function batchCreateWrap(
  photos: Photos,
  albumId: string,
  tokens: [string, string][],
  AbortControllerMap: Map<string, AbortController>
): Promise<string[]> {
  const batchCreateAbortController = new AbortController();
  AbortControllerMap.set('batchCreate', batchCreateAbortController);
  const re1 = await photos.mediaItems.batchCreate(
    {
      albumId: albumId,
      newMediaItems: tokens.map(
        (t): Photos.NewMediaItem => ({
          simpleMediaItem: {
            uploadToken: t[1],
          },
          description: t[0],
        })
      ),
    },
    batchCreateAbortController.signal
  );
  AbortControllerMap.delete('batchCreate');
  return re1.map(m => {
    if (m.mediaItem && m.mediaItem.id) {
      return m.mediaItem.id;
    } else {
      throw new Error('batchCreate fail');
    }
  });
}
async function imageRegisterRetryAfterExtractAppended(
  before: ImageInfo[] | null,
  targetAlbum: SelectTargetAlbumResult,
  AbortControllerMap: Map<string, AbortController>
) {
  let appended: ImageInfo[] = [];
  let j = 0;
  do {
    await waitFor(10000);
    const after = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
    if (null === after) {
      throw new Error('GooglePhotos.Album.fetchImageUrls fail');
    }
    appended = null === before ? after : GooglePhotos.Album.extractAppended(before, after);
    ++j;
  } while (j <= 12 && 0 === appended.length);
  if (0 === appended.length) {
    throw new Error('Unexpected behavior was occurred while registering image');
  }
  return appended;
}
export async function imageRegister(
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  AbortControllerMap: Map<string, AbortController>,
  targetAlbum: SelectTargetAlbumResult,
  photos: Photos,
  tokens: [string, string][]
) {
  progress.report({ message: 'Get album info before register' });
  const before = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
  progress.report({ message: 'Register images' });
  const ids = await batchCreateWrap(photos, targetAlbum.albumId, tokens, AbortControllerMap);
  progress.report({ message: 'Get image hashes' });
  const fromAPIPromise = getImghasesfromAPI(photos, ids, AbortControllerMap);
  await waitFor(2000);
  let after = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
  if (null === after) {
    for (
      let j = 0;
      j < 12 && null === (after = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap));
      ++j
    ) {
      await waitFor(10000);
    }
    if (null === after) {
      throw new Error('GooglePhotos.Album.fetchImageUrls fail');
    }
  }
  const appended = null === before ? after : GooglePhotos.Album.extractAppended(before, after);
  const fromWebScraping = await getImghasesfromWebScraping(
    Object.freeze(
      0 === appended.length
        ? appended
        : await imageRegisterRetryAfterExtractAppended(before, targetAlbum, AbortControllerMap)
    ),
    AbortControllerMap
  );
  progress.report({ message: 'Match image info' });
  const fromAPI = await fromAPIPromise;
  return fromAPI.map(a => {
    const i = fromWebScraping.findIndex(v => a === v);
    if (-1 === i || appended.length <= i) {
      return undefined;
    } else {
      return `${appended[i].url}=w${appended[i].width}-h${appended[i].height}`;
    }
  });
}
