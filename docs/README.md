# google-photos-uploader の製作背景と技術的解説

## 製作背景

自分は[はてなブログ](https://hatenablog.com/)を使ってブログを書いています。はてなブログの特徴として、ブログを Markdown で記述できるようになっています。

ブログには当然写真を用いたいものです。はてなブログでは画像をはてなブログ自身にアップロードする他に、Google Photos から写真を貼り付けるシステムがかつて存在していました([現在この機能は一時的に封鎖されています](https://staff.hatenablog.com/entry/2020/06/10/155523))。

しかしながら、大量の写真を貼り付けるようなときに GUI を操作するのは不便であること、この機能を使ったときに画像が HTML 形式で書かれており、Markdown として記述されないことなどの不満がありました。

純粋な Markdown を書く上で、VSCode は書きやすい環境であることから、写真を少ない手順で Google Photos にアップロードして写真のリンクを取得し、Markdown を置換するプラグインが開発できれば、この不満を解決できると考え、このプラグインを制作しました。

## 技術的解説

### 処理概要

このプラグインは概ね以下のような手順を行います。

1. Markdown をパースして`![alt](path/to/image)`のような記法で表される画像記法を探す
2. 画像ファイルを Google Photos にアップロードする
3. アップロードした画像を共有アルバムに追加する
4. 共有アルバムをスクレイピングして画像の URL を取得する
5. 画像を DL したものと手元にあるファイルの Hash を取り同一性を検証する
6. 画像パスを置換する
7. Markdown に書き戻す

### Markdown のパーサー

Markdown をパースするライブラリは数あれど、パースした構文木から Markdown に戻せるものがなかなか見つかりませんでした。

そこで当初自作を試みましたが、[yumetodo/markdown_img_url_editor#7](https://github.com/yumetodo/markdown_img_url_editor/issues/7)や[yumetodo/vscode-google-photos-uploader#12](https://github.com/yumetodo/vscode-google-photos-uploader/issues/12)といったバグに悩まされました。

その後見つけた Rust 製の[pulldown-cmark](https://crates.io/crates/pulldown-cmark)/[pulldown-cmark-to-cmark]はこの要求を満たすライブラリでした。

まずこれをラップするプログラムを Rust で記述し、`wasm-pack`を用いて WASM に変換しました。  
[https://github.com/yumetodo/markdown_img_url_editor_rust](https://github.com/yumetodo/markdown_img_url_editor_rust)

次にこれだと TypeScript の型がうまくつかないことと非同期処理を扱いにくいのでラップしたものを制作しました。  
[https://github.com/yumetodo/markdown_img_url_editor](https://github.com/yumetodo/markdown_img_url_editor)

その後某所の指摘により構文木から文字列中の URL の位置を取り出せることがわかり、単なる文字列置換にすることで[pulldown-cmark-to-cmark]を排除しました([yumetodo/markdown_img_url_editor#40](https://github.com/yumetodo/markdown_img_url_editor/issues/40))。

[pulldown-cmark-to-cmark]: https://crates.io/crates/pulldown-cmark-to-cmark

#### WASM と非同期処理

Rust 側で非同期処理の仕様がまだ固まっていなかったこと、またその実装が乱立していることもあり、JavaScript 側から`Promise`を渡して Rust 側で取り扱うのはうまくいきませんでした。そこで極めて原始的なコールバック関数を渡す方法を採用しました。今回で言えば、画像のパスの部分の文字列置換が必要になりますが、置換後の文字列を返す関数を渡すようにしました(`upload.ts`の`createSrcGenerator`関数を参照)。

### Google Photos から写真の URL を取る方法

制作当初、そういう機能は Google Photos API にあるものと信じていました。また[`mediaItems.batchGet`](https://developers.google.com/photos/library/reference/rest/v1/mediaItems/batchGet)で取れる`MediaItemResult`オブジェクトの中の`mediaItem`には[`baseUrl`というのが含まれており](https://developers.google.com/photos/library/reference/rest/v1/mediaItems#MediaItem)、これをブラウザでアクセスしてみると画像が見てるため、発見が遅れました。

実際にはこの`baseUrl`は今回の用途に使ってはならなかったのです。なぜなら 60 分程度で無効となる URL だからです。

実はこのことは Google のドキュメントに記載されていました。しかしそれが記されていたのは

> [https://developers.google.com/photos/library/reference/rest/v1/mediaItems#MediaItem](https://developers.google.com/photos/library/reference/rest/v1/mediaItems#MediaItem)
>
> A URL to the media item's bytes. This shouldn't be used as is. Parameters should be appended to this URL before use. See the [developer documentation](https://developers.google.com/photos/library/guides/access-media-items#base-urls) for a complete list of supported parameters. For example, `=w2048-h1024` will set the dimensions of a media item of type photo to have a width of 2048 px and height of 1024 px.

このようにひっそりと記されたリンク先であったことと、60 分というのが厳密ではなく、数日後でも閲覧できることもあったため当初発見できませんでした。

> [https://developers.google.com/photos/library/guides/access-media-items#base-urls](https://developers.google.com/photos/library/guides/access-media-items#base-urls)
>
> Base URLs are strings which are included in the response when you list albums or access media items. They are valid for 60 minutes and require additional parameters as they cannot be used as is.

こういった事情でどうにかして永続的な画像の URL を取得する必要が出てきました。

Google Photos の共有アルバムのページの HTML を取得して解析していたところ、[アルバム内の写真数が 500 を超えない限り](https://github.com/yumetodo/google-photos-album-image-url-fetch/issues/3)において、写真の URL が HTML に含まれていることを発見しました。

これをパースするのが  
[https://github.com/yumetodo/google-photos-album-image-url-fetch](https://github.com/yumetodo/google-photos-album-image-url-fetch)  
です。

Web スクレイピングを使うということは Google 側の仕様変更を迅速に察知する必要があります。そこで毎日 CI を回すことで検知しています。実際 2020/06/15 頃と 2020/08/25 頃に仕様変更がありましたが CI によって検知されました。  
[yumetodo/google-photos-album-image-url-fetch@`3865e2c`](https://github.com/yumetodo/google-photos-album-image-url-fetch/commit/3865e2ca89d8b0517274c50ba59ff1dfc1e576c2)
[yumetodo/google-photos-album-image-url-fetch@`a6943a2`](https://github.com/yumetodo/google-photos-album-image-url-fetch/commit/a6943a25687d5dee5af75bbb84fc1a33cf3da8df)

しかしながら先行きの不透明感は否めません。Picasa 時代から受け継いできたもう一つの形式の画像の URL であり、Google Picker API で取得できていたものは、2020/3/10 頃以降突如として表示されなくなったりログインが必要になってしまいました。この方法もいつまで使えるのかわかりません。

### OAuth

Google の API を叩くには当然 OAuth による認可フローが必要です。認可が出たことを知るにはいくつか方法がありますが、当初認可コードをユーザーにコピーしてもらい、VSCode のダイアログに貼り付けてもらう方式を採用しました。ところが製作中に Google にセキュリティが強化され、この方法は非推奨になりました。

[OAuth 2.0 for Mobile & Desktop Apps | Google Identity Platform](https://developers.google.com/identity/protocols/oauth2/native-app)

そこで`Loopback IP address`方式を実装しました。つまりプラグイン側で HTTP サーバーを立て、そこにリダイレクトしてもらうことで認可コードを渡す方法です。
([`1bc6583`](https://github.com/yumetodo/vscode-google-photos-uploader/commit/1bc6583295e61c7f0e068bf6f932abf95f479ac2))
