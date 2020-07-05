import * as vscode from 'vscode';
import AbortController from 'abort-controller';
import { Photos } from './googlePhotos';

export interface SelectTargetAlbumResult {
  albumId: string;
  shareableUrl: string;
}
export async function selectTargetAlbum(
  abortControllerMap: Map<string, AbortController>,
  photos: Photos
): Promise<SelectTargetAlbumResult | null> {
  const listAllAbortController = new AbortController();
  abortControllerMap.set('listAll', listAllAbortController);
  const albumListResponce = photos.albums
    .listAll(listAllAbortController.signal, true)
    .then(r => r.filter(a => null !== a.shareInfo));
  const defaltChoice: vscode.QuickPickItem[] = [
    {
      label: 'Create a new album',
      description: 'command',
    },
  ];
  const albumList = albumListResponce.then(r => {
    abortControllerMap.delete('listAll');
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
  if (selectedAlbumTitle) {
    switch (selectedAlbumTitle.label) {
      case 'Create a new album': {
        const title = await vscode.window.showInputBox({
          placeHolder: 'What is a new album name?',
          ignoreFocusOut: true,
          validateInput: value => (defaltChoice.find(v => v.label === value) ? 'It is reserved' : null),
        });
        if (title) {
          const albumCreateAbortController = new AbortController();
          abortControllerMap.set('album create', albumCreateAbortController);
          const album = await photos.albums.create({ album: { title: title } }, albumCreateAbortController.signal);
          abortControllerMap.delete('album create');
          const albumShareAbortController = new AbortController();
          abortControllerMap.set('album share', albumShareAbortController);
          const shareinfo = await photos.albums.share(
            album.id,
            { isCollaborative: false, isCommentable: true },
            albumShareAbortController.signal
          );
          abortControllerMap.delete('album share');
          return shareinfo.shareableUrl ? { albumId: album.id, shareableUrl: shareinfo.shareableUrl } : null;
        }
        return null;
      }
      default: {
        const albums = await albumListResponce.then(r => r.filter(a => a.title === selectedAlbumTitle.label));
        if (albums.length !== 1) {
          return null;
        }
        const album = albums[0];
        return album.shareInfo && album.shareInfo.shareableUrl
          ? { albumId: album.id, shareableUrl: album.shareInfo.shareableUrl }
          : null;
      }
    }
  }
  return null;
}
