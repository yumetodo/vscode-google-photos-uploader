import { Progress } from 'vscode';
import { fetchImageUrls, ImageInfo } from 'google-photos-album-image-url-fetch';
import AbortController from 'abort-controller';
import { Photos } from './googlePhotos';
import { SelectTargetAlbumResult } from './selectTargetAlbum';
import { waitFor } from './timer';
import { request } from 'gaxios';
import crypto from 'crypto';

async function fetchImageUrlsWrap(shareableUrl: string, abortControllerMap: Map<string, AbortController>) {
  const fetchImageUrlsAbortController = new AbortController();
  abortControllerMap.set('fetchImageUrls', fetchImageUrlsAbortController);
  const re = await fetchImageUrls(shareableUrl, fetchImageUrlsAbortController.signal);
  abortControllerMap.delete('fetchImageUrls');
  return re;
}
async function getFileAndHash(url: string, abortControllerMap: Map<string, AbortController>) {
  const controller = new AbortController();
  abortControllerMap.set(`getFileAndHash:${url}`, controller);
  const img = await request<ArrayBuffer>({ url: url, responseType: 'arraybuffer', signal: controller.signal });
  abortControllerMap.delete(`getFileAndHash:${url}`);
  const cipher = crypto.createHash('sha512');
  cipher.update(new DataView(img.data));
  return cipher.digest('hex');
}
async function getImghasesfromWebScraping(
  info: readonly ImageInfo[],
  abortControllerMap: Map<string, AbortController>
) {
  return Promise.all(info.map(async i => getFileAndHash(`${i.url}=w${i.width}-h${i.height}`, abortControllerMap)));
}
async function getImghasesfromAPI(photos: Photos, ids: string[], abortControllerMap: Map<string, AbortController>) {
  const batchGetAbortController = new AbortController();
  abortControllerMap.set('batchGet', batchGetAbortController);
  const re2 = await photos.mediaItems.batchGet(ids, batchGetAbortController.signal);
  abortControllerMap.delete('batchGet');
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
        abortControllerMap
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
  abortControllerMap: Map<string, AbortController>
): Promise<string[]> {
  const batchCreateAbortController = new AbortController();
  abortControllerMap.set('batchCreate', batchCreateAbortController);
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
  abortControllerMap.delete('batchCreate');
  return re1.map(m => {
    if (m.mediaItem && m.mediaItem.id) {
      return m.mediaItem.id;
    } else {
      throw new Error('batchCreate fail');
    }
  });
}
async function imageRegisterRetryAfterfetchImageUrls(
  targetAlbum: SelectTargetAlbumResult,
  abortControllerMap: Map<string, AbortController>
) {
  let info: ImageInfo[] | null = [];
  for (
    let j = 0;
    j < 12 && null === (info = await fetchImageUrlsWrap(targetAlbum.shareableUrl, abortControllerMap));
    ++j
  ) {
    await waitFor(10000);
  }
  if (null === info) {
    throw new Error('GooglePhotosAlbum.fetchImageUrls fail');
  }
  return info;
}
export async function imageRegister(
  progress: Progress<{ message?: string; increment?: number }>,
  abortControllerMap: Map<string, AbortController>,
  targetAlbum: SelectTargetAlbumResult,
  photos: Photos,
  tokens: [string, string][]
): Promise<(string | undefined)[]> {
  progress.report({ message: 'Register images' });
  const ids = await batchCreateWrap(photos, targetAlbum.albumId, tokens, abortControllerMap);
  progress.report({ message: 'Get image hashes' });
  const fromAPIPromise = getImghasesfromAPI(photos, ids, abortControllerMap);
  await waitFor(2000);
  const info =
    (await fetchImageUrlsWrap(targetAlbum.shareableUrl, abortControllerMap)) ||
    (await imageRegisterRetryAfterfetchImageUrls(targetAlbum, abortControllerMap));
  const fromWebScraping = await getImghasesfromWebScraping(Object.freeze(info), abortControllerMap);
  progress.report({ message: 'Match image info' });
  const fromAPI = await fromAPIPromise;
  return fromAPI.map(a => {
    const i = fromWebScraping.findIndex(v => a === v);
    if (-1 === i || info.length <= i) {
      return undefined;
    } else {
      return `${info[i].url}=w${info[i].width}-h${info[i].height}`;
    }
  });
}
