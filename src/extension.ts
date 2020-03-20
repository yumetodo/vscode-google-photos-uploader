import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import AbortController from 'abort-controller';
import { MarkdownImgUrlEditor } from 'markdown_img_url_editor';
import { validityVerification } from 'google-photos-album-image-url-fetch';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import { waitFor } from './timer';
import { selectTargetAlbum } from './selectTargetAlbum';
import { imageRegister } from './imageRegister';
import { mergePureUrlsAndNoReplaceIndexes } from './mergePureUrlsAndNoReplaceIndexes';
const googlePhotosAcceptableUseReferenceUrl = 'https://developers.google.com/photos/library/guides/acceptable-use';
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
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const configuration = new Configuration();
  let authManager: AuthManager | null = null;
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  context.subscriptions.push(
    vscode.commands.registerCommand('google-photos-uploader.upload', async () => {
      if (!(await validityVerification())) {
        vscode.window
          .showErrorMessage(
            'GooglePhotosAlbum.fetchImageUrls is currently broken. Please watch Issue tracker.',
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
      if (authManager == null) {
        authManager = await AuthManager.init(
          configuration,
          url => Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url))),
          clientInfo.installed.client_id,
          clientInfo.installed.client_secret
        );
      }
      const photos = new Photos(authManager);
      configuration.reload();
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
        const allRange = new vscode.Range(
          textEditor.document.positionAt(0),
          textEditor.document.positionAt(text.length)
        );
        const targetAlbum = await selectTargetAlbum(AbortControllerMap, photos);
        if (null === targetAlbum) {
          return;
        }
        const selectedTabFilePath = vscode.window.activeTextEditor.document.fileName;
        const dir = path.dirname(selectedTabFilePath);
        const tokenGetters: Array<() => Promise<[string, string] | null>> = [];
        const uploadingImagePath = new Map<string, number>();
        const noReplaceIndexes: number[] = [];
        let urls: readonly (string | undefined)[] = [];
        const markdownImgUrlEditor = await MarkdownImgUrlEditor.init(text, (alt: string, s: string) => {
          const p = path.resolve(dir, s);
          //avoid duplicate upload
          if (uploadingImagePath.has(p)) {
            const index = uploadingImagePath.get(p);
            return () => (index ? urls[index] || s : s);
          } else {
            const k = `upload::${p}`;
            const c = new AbortController();
            AbortControllerMap.set(k, c);
            const index = tokenGetters.length;
            tokenGetters.push(async () => {
              try {
                await fs.stat(p);
                const t = await photos.upload(p, c.signal);
                return [alt, t];
              } catch (_) {
                noReplaceIndexes.push(index);
                return null;
              } finally {
                AbortControllerMap.delete(k);
              }
            });
            uploadingImagePath.set(p, index);
            return () => urls[index] || s;
          }
        });
        try {
          const tokens = await vscode.window.withProgress(
            {
              cancellable: true,
              title: 'uploading images...',
              location: vscode.ProgressLocation.Notification,
            },
            async (progress, token) => {
              token.onCancellationRequested(onCancellationRequested);
              const tokens: [string, string][] = [];
              let t = waitFor(1);
              progress.report({ increment: 0 });
              let i = 0;
              for (const getter of tokenGetters) {
                await t;
                // request sequentially
                const token = await getter();
                if (token) {
                  tokens.push(token);
                }
                t = waitFor(1000);
                progress.report({
                  increment: 100 / tokenGetters.length,
                  message: `(${i++}/${tokenGetters.length})`,
                });
              }
              await t;
              progress.report({ message: 'upload finished.' });
              return tokens;
            }
          );
          const pureUrls = await vscode.window.withProgress(
            { cancellable: false, title: 'registering images...', location: vscode.ProgressLocation.Notification },
            async progress => imageRegister(progress, AbortControllerMap, targetAlbum, photos, tokens)
          );
          urls = mergePureUrlsAndNoReplaceIndexes(pureUrls, noReplaceIndexes);
          const replaced = markdownImgUrlEditor.replace();
          if ('\n' !== replaced.slice(-1)) {
            replaced.concat('\n');
          }
          textEditor.edit(builder => {
            builder.replace(allRange, replaced);
          });
        } finally {
          markdownImgUrlEditor.free();
        }
      } catch (er) {
        if (!(er instanceof Error && er.name === 'AbortError')) {
          onCancellationRequested();
          throw er;
        }
      } finally {
        activeEditorLock.dispose();
      }
    })
  );
}

// this method is called when your extension is deactivated
// export function deactivate() {
//   return Promise.all(promises);
// }
