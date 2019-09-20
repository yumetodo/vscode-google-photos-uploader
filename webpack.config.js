//@ts-check

'use strict';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const TerserPlugin = require('terser-webpack-plugin');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node', // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

  entry: './src/extension.ts', // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
    // webassemblyModuleFilename: '[modulehash].wasm',
  },
  devtool: 'source-map',
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          mangle: false,
          keep_classnames: true,
          keep_fnames: true,
        },
      }),
    ],
  },
  externals: {
    vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
    markdown_img_url_editor_rust: 'commonjs2 markdown_img_url_editor_rust',
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js', '.wasm'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            // options: {
            //   compilerOptions: {
            //     "module": "es6" // override `tsconfig.json` so that TypeScript emits native JavaScript modules.
            //   }
            // }
          },
        ],
      },
      {
        test: /\.html$/,
        use: 'raw-loader',
      },
      {
        test: /\.wasm$/,
        type: 'webassembly/experimental',
      },
    ],
  },
};
module.exports = config;
