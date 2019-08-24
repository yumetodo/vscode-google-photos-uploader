import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import AbortController from 'abort-controller';
import { markdownImgUrlEditor } from 'markdown_img_url_editor';
import { GooglePhotos } from 'google-photos-album-image-url-fetch';
import { URL } from 'url';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import { waitFor } from './timer';
import { selectTargetAlbum } from './selectTargetAlbum';
const googlePhotosAcceptableUseReferenceUrl = 'https://developers.google.com/photos/library/guides/acceptable-use';
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const configuration = new Configuration();
  const authManager = await AuthManager.init(configuration);
  const photos = new Photos(authManager);
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand('google-photos-uploader.upload', async () => {
    if (!(await GooglePhotos.Album.validityVerification())) {
      vscode.window
        .showErrorMessage(
          'GooglePhotos.Album.fetchImageUrls is currently broken. Please watch Issue tracker.',
          'Issue tracker'
        )
        .then(r => {
          if ('Issue tracker' === r) {
            vscode.env.openExternal(
              vscode.Uri.parse('https://github.com/yumetodo/google-photos-album-image-url-fetch/issues')
            );
          }
        });
      return;
    }
    vscode.window
      .showInformationMessage(
        'You must use this plugin only for a personal nature because of Google Photos API limitation\n' +
          googlePhotosAcceptableUseReferenceUrl,
        'visit'
      )
      .then(r => {
        if ('visit' === r) {
          vscode.env.openExternal(vscode.Uri.parse(googlePhotosAcceptableUseReferenceUrl));
        }
      });
    if (!vscode.window.activeTextEditor) {
      vscode.window.showErrorMessage('Please open target markdown text file.');
      return;
    }
    const AbortControllerMap = new Map<string, AbortController>();
    const onCancellationRequested = () => {
      for (const c of AbortControllerMap.values()) {
        c.abort();
      }
    };
    const activeEditorLock = vscode.window.onDidChangeActiveTextEditor(onCancellationRequested);
    try {
      const textEditor = vscode.window.activeTextEditor;
      const text = textEditor.document.getText();
      const startPos = textEditor.document.positionAt(0);
      const endPos = textEditor.document.positionAt(text.length);
      const allRange = new vscode.Range(startPos, endPos);
      const targetAlbum = await selectTargetAlbum(AbortControllerMap, photos);
      if (null === targetAlbum) {
        return;
      }
      const selectedTabFilePath = vscode.window.activeTextEditor.document.fileName;
      const dir = path.dirname(selectedTabFilePath);
      const tokenGetters: Array<Promise<[string, string]>> = [];
      const uploadingImagePath = new Map<string, number>();
      const timestamps: Promise<number>[] = [];
      let urls: (string | undefined)[] = [];
      let timer = waitFor(1);
      const replaced = await markdownImgUrlEditor(
        text,
        (alt: string, s: string) => {
          const p = path.resolve(dir, s);
          //avoid duplicate upload
          if (uploadingImagePath.has(p)) {
            const index = uploadingImagePath.get(p);
            return () => (index ? urls[index] || s : s);
          } else {
            const k = `upload::${p}`;
            timestamps.push(fs.stat(p).then(stat => stat.mtimeMs));
            const c = new AbortController();
            AbortControllerMap.set(k, c);
            const index =
              tokenGetters.push(
                timer
                  .then(() => photos.upload(p, c.signal))
                  .then(t => {
                    timer = waitFor(300);
                    AbortControllerMap.delete(k);
                    return [alt, t];
                  })
              ) - 1;
            uploadingImagePath.set(p, index);
            return () => urls[index] || s;
          }
        },
        async () => {
          const tokens = await vscode.window.withProgress(
            {
              cancellable: true,
              title: 'uploading images...',
              location: vscode.ProgressLocation.Notification,
            },
            (_, token) => {
              token.onCancellationRequested(onCancellationRequested);
              return Promise.all(tokenGetters);
            }
          );
          urls = await vscode.window.withProgress(
            { cancellable: false, title: 'registering images...', location: vscode.ProgressLocation.Notification },
            async progress => {
              progress.report({ increment: 0 });
              const re: (string | undefined)[] = [];
              const fetchImageUrlsAbortController = new AbortController();
              AbortControllerMap.set('fetchImageUrls', fetchImageUrlsAbortController);
              let before = await GooglePhotos.Album.fetchImageUrls(
                targetAlbum.shareableUrl,
                fetchImageUrlsAbortController.signal
              );
              AbortControllerMap.delete('fetchImageUrls');
              let fetchImageUrlsTimer = waitFor(1500);
              for (let i = 0; i < tokens.length; ++i) {
                const t = tokens[i];
                const timestamp = await timestamps[i];
                const batchCreateAbortController = new AbortController();
                AbortControllerMap.set('batchCreate', batchCreateAbortController);
                await photos.mediaItems.batchCreate(
                  {
                    albumId: targetAlbum.albumId,
                    newMediaItems: [
                      {
                        simpleMediaItem: {
                          uploadToken: t[1],
                        },
                        description: t[0],
                      },
                    ],
                  },
                  batchCreateAbortController.signal
                );
                AbortControllerMap.delete('batchCreate');
                const fetchImageUrlsAbortController = new AbortController();
                AbortControllerMap.set('fetchImageUrls', fetchImageUrlsAbortController);
                await fetchImageUrlsTimer;
                const after = await GooglePhotos.Album.fetchImageUrls(
                  targetAlbum.shareableUrl,
                  fetchImageUrlsAbortController.signal
                );
                fetchImageUrlsTimer = waitFor(1500);
                AbortControllerMap.delete('fetchImageUrls');
                if (null === after) {
                  throw new Error('GooglePhotos.Album.fetchImageUrls fail');
                }
                let appended = null === before ? after : GooglePhotos.Album.extractAppended(before, after);
                if (0 === appended.length) {
                  throw new Error('Unexpected behavior was occurred while registering image');
                }
                if (1 < appended.length) {
                  appended = appended.filter(e => e.imageUpdateDate === timestamp);
                }
                if (1 === appended.length) {
                  const url = new URL(appended[0].url);
                  url.searchParams.set('w', `${appended[0].width}`);
                  url.searchParams.set('h', `${appended[0].height}`);
                  re.push(url.toString());
                } else {
                  re.push(undefined);
                }
                before = after;
                progress.report({ increment: (100 * i) / tokens.length });
              }
              return re;
            }
          );
        }
      );
      textEditor.edit(builder => {
        builder.replace(allRange, replaced);
      });
    } catch (er) {
      if (!(er instanceof Error && er.name === 'AbortError')) {
        onCancellationRequested();
        throw er;
      }
    } finally {
      activeEditorLock.dispose();
    }
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
// export function deactivate() {
//   return Promise.all(promises);
// }
