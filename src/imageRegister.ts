import * as vscode from 'vscode';
import { GooglePhotos } from 'google-photos-album-image-url-fetch';
import AbortController from 'abort-controller';
import { URL } from 'url';
import { Photos } from './googlePhotos';
import { SelectTargetAlbumResult } from './selectTargetAlbum';
import { waitFor } from './timer';

async function fetchImageUrlsWrap(shareableUrl: string, AbortControllerMap: Map<string, AbortController>) {
  const fetchImageUrlsAbortController = new AbortController();
  AbortControllerMap.set('fetchImageUrls', fetchImageUrlsAbortController);
  const re = await GooglePhotos.Album.fetchImageUrls(shareableUrl, fetchImageUrlsAbortController.signal);
  AbortControllerMap.delete('fetchImageUrls');
  return re;
}
async function batchCreateWrap(
  photos: Photos,
  albumId: string,
  uploadToken: string,
  description: string,
  AbortControllerMap: Map<string, AbortController>
) {
  const batchCreateAbortController = new AbortController();
  AbortControllerMap.set('batchCreate', batchCreateAbortController);
  await photos.mediaItems.batchCreate(
    {
      albumId: albumId,
      newMediaItems: [
        {
          simpleMediaItem: {
            uploadToken: uploadToken,
          },
          description: description,
        },
      ],
    },
    batchCreateAbortController.signal
  );
  AbortControllerMap.delete('batchCreate');
}
function formatURL(appended: GooglePhotos.Album.ImageInfo) {
  const url = new URL(appended.url);
  url.searchParams.set('w', `${appended.width}`);
  url.searchParams.set('h', `${appended.height}`);
  return url.toString();
}
export async function imageRegister(
  progress: vscode.Progress<{ message?: string; increment?: number }>,
  AbortControllerMap: Map<string, AbortController>,
  targetAlbum: SelectTargetAlbumResult,
  photos: Photos,
  timestamps: Promise<number>[],
  tokens: [string, string][]
) {
  progress.report({ increment: 0 });
  const re: (string | undefined)[] = [];
  let before = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
  /**
   * To avoid [岡崎市立中央図書館事件](https://ja.wikipedia.org/wiki/岡崎市立中央図書館事件),
   * we need to take more than 1s waiting.
   */
  let fetchImageUrlsTimer = waitFor(2000);
  for (let i = 0; i < tokens.length; ++i) {
    const [description, uploadToken] = tokens[i];
    await batchCreateWrap(photos, targetAlbum.albumId, uploadToken, description, AbortControllerMap);
    // To guarantee batchCreate background task executed on Google's server, wait at least 1.5sec.
    await Promise.all([fetchImageUrlsTimer, waitFor(1500)]);
    let after = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
    fetchImageUrlsTimer = waitFor(2000);
    if (null === after) {
      // retry
      await fetchImageUrlsTimer;
      after = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
      fetchImageUrlsTimer = waitFor(2000);
      if (null === after) {
        throw new Error('GooglePhotos.Album.fetchImageUrls fail');
      }
    }
    let appended = null === before ? after : GooglePhotos.Album.extractAppended(before, after);
    if (0 === appended.length) {
      // retry
      await fetchImageUrlsTimer;
      const after = await fetchImageUrlsWrap(targetAlbum.shareableUrl, AbortControllerMap);
      fetchImageUrlsTimer = waitFor(2000);
      if (null === after) {
        throw new Error('GooglePhotos.Album.fetchImageUrls fail');
      }
      appended = null === before ? after : GooglePhotos.Album.extractAppended(before, after);
      if (0 === appended.length) {
        throw new Error('Unexpected behavior was occurred while registering image');
      }
    }
    if (1 < appended.length) {
      const timestamp = await timestamps[i];
      appended = appended.filter(e => e.imageUpdateDate === timestamp);
    }
    re.push(1 === appended.length ? formatURL(appended[0]) : undefined);
    before = after;
    progress.report({ increment: 100 / tokens.length, message: `(${i}/${tokens.length})` });
  }
  return re;
}
