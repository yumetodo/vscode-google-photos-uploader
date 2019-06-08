import * as vscode from 'vscode';
import * as path from 'path';
import { Configuration } from './configuration';
import { AuthManager } from './authManager';
import { Photos } from './googlePhotos';
import AbortController from 'abort-controller';
import { markdownImgUrlEditor } from 'markdown_img_url_editor';
import { waitFor } from './timer';
const getUrl = (r: Photos.MediaItemResult) => (r.mediaItem ? r.mediaItem.baseUrl : undefined);
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  const configuration = new Configuration();
  const authManager = await AuthManager.init(configuration);
  const photos = new Photos(authManager);
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('google-photos-uploader.upload', async () => {
    vscode.window.showErrorMessage(
      'Currently, to get img url, we are using `baseUrl` that is valid **only for 60 minutes**',
      'DO NOT USE THIS PLUGIN UNTIL THIS BUG IS TO BE FIXED'
    );
    const continueFlag = await vscode.window.showQuickPick(['YES(NOT RECOMMENDED'], {
      placeHolder: 'Are you really continue process?',
    });
    if (!continueFlag || continueFlag !== 'YES(NOT RECOMMENDED') {
      return;
    }
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
      const listAllAbortController = new AbortController();
      AbortControllerMap.set('listAll', listAllAbortController);
      const albumListResponce = photos.albums.listAll(listAllAbortController.signal, true);
      const defaltChoice: vscode.QuickPickItem[] = [
        {
          label: `I don't want to add photos to albums`,
          description: 'command',
        },
        {
          label: 'Create a new album',
          description: 'command',
        },
      ];
      const albumList = albumListResponce.then(r => {
        AbortControllerMap.delete('listAll');
        return [
          ...defaltChoice,
          ...r.map(
            (a): vscode.QuickPickItem => ({
              label: a.title,
              description: `Contents: ${a.mediaItemsCount}`,
            })
          ),
        ];
      });
      const selectedAlbumTitle = await vscode.window.showQuickPick(albumList, {
        placeHolder: 'Please select the album where you want to add',
        ignoreFocusOut: true,
      });
      let albumId: string | undefined = undefined;
      if (selectedAlbumTitle) {
        switch (selectedAlbumTitle.label) {
          case `I don't want to add photos to albums`:
            break;
          case 'Create a new album':
            {
              const title = await vscode.window.showInputBox({
                placeHolder: 'What is a new album name?',
                ignoreFocusOut: true,
                validateInput: value => (defaltChoice.find(v => v.label === value) ? 'It is reserved' : null),
              });
              if (title) {
                const albumCreateAbortController = new AbortController();
                AbortControllerMap.set('album create', albumCreateAbortController);
                const allbum = await photos.albums.create(
                  { album: { title: title } },
                  albumCreateAbortController.signal
                );
                AbortControllerMap.delete('album create');
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
        const uploadingImagePath = new Map<string, number>();
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
              const c = new AbortController();
              AbortControllerMap.set(k, c);
              const index =
                tokenGetters.push(
                  timer
                    .then(_ => photos.upload(p, c.signal))
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
            const batchCreateAbortController = new AbortController();
            AbortControllerMap.set('batchCreate', batchCreateAbortController);
            const res = await vscode.window.withProgress(
              {
                cancellable: false,
                title: 'registering images...',
                location: vscode.ProgressLocation.Notification,
              },
              () =>
                photos.mediaItems.batchCreate(
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
                )
            );
            AbortControllerMap.delete('batchCreate');
            const ids = res.map(r => (r.mediaItem ? r.mediaItem.id : undefined));
            const batchGetAbortController = new AbortController();
            AbortControllerMap.set('batchGet', batchGetAbortController);
            //The mediaItems info batchCreate return lacks baseUrl so that we need to get again using batchGet
            const res2 = await photos.mediaItems.batchGet(
              ids.filter((id: string | undefined): id is string => !(undefined === id)),
              batchGetAbortController.signal
            );
            AbortControllerMap.delete('batchGet');
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
