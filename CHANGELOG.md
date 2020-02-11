# Change Log

## 2.1.4

- This app's OAuth2 scope was verified by Google ( #3 )
- update dependencies

## 2.1.3

- web scrapping is required only one time ( c043fdd )

## 2.1.2

- rewrite img matching using img hash ( #2, b9fbb94 )
- `token` is filterd so that store lacking info and merge ( fa8cdd7 )

## 2.1.1

- upload image sequentially

## 2.1.0

- update `markdown_img_url_editor` to `v4.0.1`
  - use [pulldown-cmark](https://crates.io/crates/pulldown-cmark)(rustlibary) to parse.
  - use [pulldown-cmark-to-cmark](https://crates.io/crates/pulldown-cmark-to-cmark)(rustlibary) to replace.

## 2.0.0

- use Loopback IP address ( #3 )
- request sharing OAuth2 scope
- parse album HTML to extract image URL that can use eternally, I think.
- use webpack to reduce plugin size
- notify that this plugin is limited only for a personal nature

## 1.0.3

- critical bug notice

## 1.0.2

- enable retry and delay
- enable vscode progress report for batchCreate

## 1.0.1

- support batchxxx API limitation: array length must be less than 50 or equal.
- avoid duplicated image uploading

## 1.0.0

- Initial release
