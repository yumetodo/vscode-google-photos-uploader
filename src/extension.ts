import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import AbortController from 'abort-controller';
import { MarkdownImgUrlEditor } from 'markdown_img_url_editor';
import { GooglePhotos } from 'google-photos-album-image-url-fetch';
import { URL } from 'url';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import { waitFor } from './timer';
import { selectTargetAlbum } from './selectTargetAlbum';
import { imageRegister } from './imageRegister';
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
      const allRange = new vscode.Range(textEditor.document.positionAt(0), textEditor.document.positionAt(text.length));
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
      const markdownImgUrlEditor = await MarkdownImgUrlEditor.init(text, (alt: string, s: string) => {
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
      });
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
        async progress => imageRegister(progress, AbortControllerMap, targetAlbum, photos, timestamps, tokens)
      );
      textEditor.edit(builder => {
        builder.replace(allRange, markdownImgUrlEditor.replace());
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
