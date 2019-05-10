// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import AbortController from 'abort-controller';
import { markdownImgUrlEditor } from 'markdown_img_url_editor';
// const promises: Promise<any>[] = [];
const getUrl = (r: Photos.MediaItemResult) => (r.mediaItem ? r.mediaItem.baseUrl : undefined);
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const configuration = new Configuration();
  const controller = new AbortController();
  const onCancellationRequested = () => {
    controller.abort();
  };
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
    const activeEditorLock = vscode.window.onDidChangeActiveTextEditor(onCancellationRequested);
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
      const albumList = albumListResponce.then(r => [
        ...defaltChoice,
        ...r.map(
          (a): vscode.QuickPickItem => ({
            label: a.title,
            description: `Contents: ${a.mediaItemsCount}`,
          })
        ),
      ]);
      const selectedAlbumTitle = await vscode.window.showQuickPick(albumList, {
        placeHolder: 'Please select the album where you want to add',
        ignoreFocusOut: true,
      });
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
        const tokenGetters: Array<Promise<[string, string]>> = [];
        let urls: (string | undefined)[] = [];
        const replaced = await markdownImgUrlEditor(
          text,
          (alt: string, s: string) => {
            const index = tokenGetters.push(photos.upload(path.resolve(dir, s)).then(t => [alt, t])) - 1;
            return () => urls[index] || s;
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
            const res = await photos.mediaItems.batchCreate({
              albumId: albumId,
              newMediaItems: tokens.map(
                (t): Photos.NewMediaItem => ({
                  simpleMediaItem: {
                    uploadToken: t[1],
                  },
                  description: t[0],
                })
              ),
            });
            const ids = res.map(r => (r.mediaItem ? r.mediaItem.id : undefined));
            //The mediaItems info batchCreate return lacks baseUrl so that we need to get again using batchGet
            const res2 = await photos.mediaItems.batchGet(ids.filter(id => !(undefined === id)) as string[]);
            let i = 0;
            urls = ids.map(id => (id ? getUrl(res2[i++]) : undefined));
          }
        );
        textEditor.edit(builder => {
          builder.replace(allRange, replaced);
        });
      }
    } catch (er) {
      if (!(er instanceof Error && er.name === 'AbortError')) {
        controller.abort();
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
