import * as vscode from 'vscode';
import * as path from 'path';
import AbortController from 'abort-controller';
import { MarkdownImgUrlEditor } from 'markdown_img_url_editor';
import { validityVerification } from 'google-photos-album-image-url-fetch';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import { selectTargetAlbum } from './selectTargetAlbum';
import { imageRegister } from './imageRegister';
import { UploadManager } from './upload';
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
export function activate(context: vscode.ExtensionContext): void {
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
      const abortControllerMap = new Map<string, AbortController>();
      const onCancellationRequested = () => {
        for (const c of abortControllerMap.values()) {
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
        const targetAlbum = await selectTargetAlbum(abortControllerMap, photos);
        if (null === targetAlbum) {
          return;
        }
        const selectedTabFilePath = vscode.window.activeTextEditor.document.fileName;
        const dir = path.dirname(selectedTabFilePath);
        const uploadManager = new UploadManager();
        const markdownImgUrlEditor = await MarkdownImgUrlEditor.init(text, (alt, s) =>
          uploadManager.createSrcGenerator(alt, s, dir, photos, abortControllerMap)
        );
        try {
          await uploadManager.waitFileCheck();
          const tokens = await vscode.window.withProgress(
            {
              cancellable: true,
              title: 'uploading images...',
              location: vscode.ProgressLocation.Notification,
            },
            (progress, token) => {
              token.onCancellationRequested(onCancellationRequested);
              return uploadManager.execUpload(progress);
            }
          );
          const pureUrls = await vscode.window.withProgress(
            { cancellable: false, title: 'registering images...', location: vscode.ProgressLocation.Notification },
            async progress => imageRegister(progress, abortControllerMap, targetAlbum, photos, tokens)
          );
          uploadManager.mergePureUrls(pureUrls);
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
  context.subscriptions.push(
    vscode.commands.registerCommand('google-photos-uploader.clear', () => {
      configuration.clear();
    })
  );
}

// this method is called when your extension is deactivated
// export function deactivate() {
//   return Promise.all(promises);
// }
