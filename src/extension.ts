// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import AbortController from 'abort-controller';
// const promises: Promise<any>[] = [];
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const configuration = new Configuration();
  const controller = new AbortController();
  const authManager = await AuthManager.init(configuration, controller);
  const photos = new Photos(authManager);
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('extension.helloWorld', async () => {
    if (!vscode.window.activeTextEditor) {
      vscode.window.showErrorMessage('Please open target markdown text file.');
      return;
    }
    const activeEditorLock = vscode.window.onDidChangeActiveTextEditor(e => {
      controller.abort();
    });
    try {
      const textEditor = vscode.window.activeTextEditor;
      const text = textEditor.document.getText();
      const startPos = textEditor.document.positionAt(0);
      const endPos = textEditor.document.positionAt(text.length);
      const allRange = new vscode.Range(startPos, endPos);
      const albumListResponce = photos.albums.listAll(true);
      const defaltChoice: vscode.QuickPickItem[] = [
        {
          label: `I don't want to add photos to album`,
          description: 'command',
        },
        {
          label: 'Create new album',
          description: 'command',
        },
      ];
      const selectedAlbumTitle = await vscode.window.showQuickPick(
        albumListResponce.then(r => [
          ...defaltChoice,
          ...r.map(
            (a): vscode.QuickPickItem => ({
              label: a.title,
              description: `Contents: ${a.mediaItemsCount}`,
            })
          ),
        ]),
        {
          placeHolder: 'Please select the album where you want to add',
          ignoreFocusOut: true,
        }
      );
      let albumId: string | undefined = undefined;
      if (selectedAlbumTitle) {
        switch (selectedAlbumTitle.label) {
          case `I don't want to add photos to album`:
            break;
          case 'Create new album':
            {
              const title = await vscode.window.showInputBox({
                placeHolder: 'What is a new album name?',
                ignoreFocusOut: true,
                validateInput: value => (defaltChoice.find(v => v.label === value) ? 'It is reserved' : null),
              });
              if (title) {
                const allbum = await photos.albums.create({ album: { title: title } });
                albumId = allbum.id;
              }
            }
            break;
          default:
            {
              const album = await albumListResponce.then(r => r.filter(a => a.title === selectedAlbumTitle.label));
              albumId = album[0].id;
            }
            break;
        }
        const selectedTabFilePath = vscode.window.activeTextEditor.document.fileName;
        const dir = path.dirname(selectedTabFilePath);
        const imgPath = path.resolve(dir, 'IE.jpg');
        const tokens = await vscode.window.withProgress(
          {
            cancellable: false,
            title: 'uploading images...',
            location: vscode.ProgressLocation.Notification,
          },
          () => photos.uploadAll([imgPath])
        );
        const res = await photos.mediaItems.batchCreate({
          albumId: albumId,
          newMediaItems: tokens.map(
            (t): Photos.NewMediaItem => ({
              simpleMediaItem: {
                uploadToken: t,
              },
              description: 'hoge',
            })
          ),
        });
        const ids = res
          .map(r => (r.mediaItem ? r.mediaItem.id : undefined))
          .filter(id => !(undefined === id)) as string[];
        const res2 = await photos.mediaItems.batchGet(ids);
        for (const r of res2) {
          if (r.mediaItem) {
            console.log(`r.mediaItem.baseUrl: ${r.mediaItem.baseUrl}`);
          }
        }
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
