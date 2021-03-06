# google-photos-uploaderの製作背景と技術的解説

## 製作背景

自分は[はてなブログ](https://hatenablog.com/)を使ってブログを書いています。はてなブログの特徴として、ブログをMarkdownで記述できるようになっています。

ブログには当然写真を用いたいものです。はてなブログでは画像をはてなブログ自身にアップロードする他に、Google Photosから写真を貼り付けるシステムがかつて存在していました([現在この機能は一時的に封鎖されています](https://staff.hatenablog.com/entry/2020/06/10/155523))。

しかしながら、大量の写真を貼り付けるようなときにGUIを操作するのは不便であること、この機能を使ったときに画像がHTML形式で書かれており、Markdownとして記述されないことなどの不満がありました。

純粋なMarkdownを書く上で、VSCodeは書きやすい環境であることから、写真を少ない手順でGoogle Photosにアップロードして写真のリンクを取得し、Markdownを置換するプラグインが開発できれば、この不満を解決できると考え、このプラグインを制作しました。

## 技術的解説

### 処理概要

このプラグインは概ね以下のような手順を行います。

1. Markdownをパースして`![alt](path/to/image)`のような記法で表される画像記法を探す
2. 画像ファイルをGoogle Photosにアップロードする
3. アップロードした画像を共有アルバムに追加する
4. 共有アルバムをスクレイピングして画像のURLを取得する
5. 画像をDLしたものと手元にあるファイルのHashを取り同一性を検証する
6. 画像パスを置換する
7. Markdownに書き戻す

### Markdownのパーサー

Markdownをパースするライブラリは数あれど、パースした構文木からMarkdownに戻せるものがなかなか見つかりませんでした。

そこで当初自作を試みましたが、[yumetodo/markdown_img_url_editor#7](https://github.com/yumetodo/markdown_img_url_editor/issues/7)や[yumetodo/vscode-google-photos-uploader#12](https://github.com/yumetodo/vscode-google-photos-uploader/issues/12)といったバグに悩まされました。

その後見つけたRust製の[pulldown-cmark](https://crates.io/crates/pulldown-cmark)/[pulldown-cmark-to-cmark]はこの要求を満たすライブラリでした。

まずこれをラップするプログラムをRustで記述し、`wasm-pack`を用いてWASMに変換しました。  
[https://github.com/yumetodo/markdown_img_url_editor_rust](https://github.com/yumetodo/markdown_img_url_editor_rust)

次にこれだとTypeScriptの型がうまくつかないことと非同期処理を扱いにくいのでラップしたものを制作しました。  
[https://github.com/yumetodo/markdown_img_url_editor](https://github.com/yumetodo/markdown_img_url_editor)

その後某所の指摘により構文木から文字列中のURLの位置を取り出せることがわかり、単なる文字列置換にすることで[pulldown-cmark-to-cmark]を排除しました([yumetodo/markdown_img_url_editor#40](https://github.com/yumetodo/markdown_img_url_editor/issues/40))。

[pulldown-cmark-to-cmark]: https://crates.io/crates/pulldown-cmark-to-cmark

#### WASMと非同期処理

Rust側で非同期処理の仕様がまだ固まっていなかったこと、またその実装が乱立していることもあり、JavaScript側から`Promise`を渡してRust側で取り扱うのはうまくいきませんでした。そこで極めて原始的なコールバック関数を渡す方法を採用しました。今回で言えば、画像のパスの部分の文字列置換が必要になりますが、置換後の文字列を返す関数を渡すようにしました(`upload.ts`の`createSrcGenerator`関数を参照)。

### Google Photosから写真のURLを取る方法

制作当初、そういう機能はGoogle Photos APIにあるものと信じていました。また[`mediaItems.batchGet`](https://developers.google.com/photos/library/reference/rest/v1/mediaItems/batchGet)で取れる`MediaItemResult`オブジェクトの中の`mediaItem`には[`baseUrl`というのが含まれており](https://developers.google.com/photos/library/reference/rest/v1/mediaItems#MediaItem)、これをブラウザでアクセスしてみると画像が見てるため、発見が遅れました。

実際にはこの`baseUrl`は今回の用途に使ってはならなかったのです。なぜなら60分程度で無効となるURLだからです。

実はこのことはGoogleのドキュメントに記載されていました。しかしそれが記されていたのは

> [https://developers.google.com/photos/library/reference/rest/v1/mediaItems#MediaItem](https://developers.google.com/photos/library/reference/rest/v1/mediaItems#MediaItem)
>
> A URL to the media item's bytes. This shouldn't be used as is. Parameters should be appended to this URL before use. See the [developer documentation](https://developers.google.com/photos/library/guides/access-media-items#base-urls) for a complete list of supported parameters. For example, `=w2048-h1024` will set the dimensions of a media item of type photo to have a width of 2048 px and height of 1024 px.

このようにひっそりと記されたリンク先であったことと、60分というのが厳密ではなく、数日後でも閲覧できることもあったため当初発見できませんでした。

> [https://developers.google.com/photos/library/guides/access-media-items#base-urls](https://developers.google.com/photos/library/guides/access-media-items#base-urls)
>
> Base URLs are strings which are included in the response when you list albums or access media items. They are valid for 60 minutes and require additional parameters as they cannot be used as is.

こういった事情でどうにかして永続的な画像のURLを取得する必要が出てきました。

Google Photosの共有アルバムのページのHTMLを取得して解析していたところ、[アルバム内の写真数が500を超えない限り](https://github.com/yumetodo/google-photos-album-image-url-fetch/issues/3)において、写真のURLがHTMLに含まれていることを発見しました。

これをパースするのが  
[https://github.com/yumetodo/google-photos-album-image-url-fetch](https://github.com/yumetodo/google-photos-album-image-url-fetch)  
です。

Webスクレイピングを使うということはGoogle側の仕様変更を迅速に察知する必要があります。そこで毎日CIを回すことで検知しています。実際2020/06/15頃と2020/08/25頃に仕様変更がありましたがCIによって検知されました。  
[yumetodo/google-photos-album-image-url-fetch@`3865e2c`](https://github.com/yumetodo/google-photos-album-image-url-fetch/commit/3865e2ca89d8b0517274c50ba59ff1dfc1e576c2)
[yumetodo/google-photos-album-image-url-fetch@`a6943a2`](https://github.com/yumetodo/google-photos-album-image-url-fetch/commit/a6943a25687d5dee5af75bbb84fc1a33cf3da8df)

しかしながら先行きの不透明感は否めません。Picasa時代から受け継いできたもう一つの形式の画像のURLであり、Google Picker APIで取得できていたものは、2020/3/10頃以降突如として表示されなくなったりログインが必要になってしまいました。この方法もいつまで使えるのかわかりません。

### OAuth

GoogleのAPIを叩くには当然OAuthによる認可フローが必要です。認可が出たことを知るにはいくつか方法がありますが、当初認可コードをユーザーにコピーしてもらい、VSCodeのダイアログに貼り付けてもらう方式を採用しました。ところが製作中にGoogleにセキュリティが強化され、この方法は非推奨になりました。

[OAuth 2.0 for Mobile & Desktop Apps  |  Google Identity Platform](https://developers.google.com/identity/protocols/oauth2/native-app)

そこで`Loopback IP address`方式を実装しました。つまりプラグイン側でHTTPサーバーを立て、そこにリダイレクトしてもらうことで認可コードを渡す方法です。
([`1bc6583`](https://github.com/yumetodo/vscode-google-photos-uploader/commit/1bc6583295e61c7f0e068bf6f932abf95f479ac2))
