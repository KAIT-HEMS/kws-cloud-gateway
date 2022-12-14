/* ------------------------------------------------------------------
* cloud-gateway - debug.js
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mFsPromise = require('fs').promises;
const mPath = require('path');

class Debug {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - params    | Object  | Required |
  *   - console | Boolean | Optional | コンソール出力フラグ (デフォルトは false)
  *   - file    | Boolean | Optional | ログファイル出力フラグ (デフォルトは false)
  *   - rotate  | Integer | Optional | ログファイル保存個数 (デフォルトは 3)
  *   - path    | String  | Required | ログファイル格納ディレクトリのパス
  * 
  * - `file` が true の場合、`path` は必須
  * ---------------------------------------------------------------- */
  constructor(params = {}) {
    // パラメータチェック
    let bool_params = {
      console: false,
      file: false,
    };
    for (let name of Object.keys(bool_params)) {
      if (name in params) {
        let val = params[name];
        if (typeof (val) === 'boolean') {
          bool_params[name] = val;
        } else {
          throw new Error('[hemscontroller-debug.js][constructor] コンソール出力フラグ `' + name + '` は true または false でなければいけません: ' + name + '=' + val);
        }
      }
    }

    let rotate = 3;
    if (bool_params.file && 'rotate' in params) {
      rotate = params.rotate;
      if (typeof (rotate) !== 'number' || rotate % 1 !== 0 || rotate < 1 || rotate > 7) {
        throw new Error('[hemscontroller-debug.js][constructor] ログファイル保存個数 `rotate` は 1 ～ 7 の範囲の整数でなければいけません: rotate=' + rotate);
      }
    }

    let path = '';
    if ('path' in params) {
      path = params.path;
      if (typeof (path) !== 'string') {
        throw new Error('[hemscontroller-debug.js][constructor] ログファイル格納ディレクトリパス `path` は文字列でなければいけません: path=' + path);
      }
    } else {
      throw new Error('[hemscontroller-debug.js][constructor] ログファイル格納ディレクトリパス `path` は必須です。');
    }

    this._console_enabled = bool_params.console;
    this._file_enabled = bool_params.file;
    this._file_rotate = rotate;
    this._file_dir_path = path;

    this._file_stream = null;
    this._mem_stream = null;

    // 現在のログファイルのパス
    this._file_path = '';

    // 過去ログファイルのローテーション実行間隔 (秒)
    this._ROTATION_INTERVAL = 3600;

    // イベントハンドラー
    // - HttpAdmin.js から、システムログモニターの用途のみで利用する
    this._onlog = () => { };
    this._onerror = () => { };
  }

  set onlog(fn) {
    if (typeof (fn) !== 'function') {
      throw new Error('The `fn` must be a function object.');
    }
    this._onlog = fn;
  }

  set onerror(fn) {
    if (typeof (fn) !== 'function') {
      throw new Error('The `fn` must be a function object.');
    }
    this._onerror = fn;
  }

  /* ------------------------------------------------------------------
  * init()
  * - 初期化
  *   - 過去ログを削除
  *   - メモリー消費量ログ出力開始
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない
  * - エラーが発生しても resolve() を返す
  * ---------------------------------------------------------------- */
  async init() {
    if (this._file_enabled) {
      // ログファイル格納ディレクトリの存在をチェックし、なければ生成する
      this._makeLogDirectory();

      // 過去ログをローテーション
      await this._rotate();

      // 過去ログのローテーションタイマーをセット
      setInterval(async () => {
        await this._rotate();
      }, this._ROTATION_INTERVAL * 1000);
    }
  }

  async _makeLogDirectory() {
    let dpath = this._file_dir_path;

    // ディレクトリの存在をチェックし、存在すれば終了
    if (mFs.existsSync(dpath)) {
      let stat = await mFsPromise.stat(dpath);
      if (stat.isDirectory()) {
        return;
      }
    }

    // ディレクトリを生成
    await mFsPromise.mkdir(dpath, { recursive: true });
  }

  async _rotate() {
    let entry_list = await mFsPromise.readdir(this._file_dir_path);
    let file_list = [];
    for (let name of entry_list) {
      if (!/^\d{4}\-\d{2}\-\d{2}\.log$/.test(name)) {
        continue;
      }
      let path = mPath.join(this._file_dir_path, name);
      let stat = await mFsPromise.stat(path);
      if (!stat.isFile()) {
        continue;
      }
      file_list.push(path);
    }
    if (file_list.length < this._file_rotate) {
      return;
    }
    file_list.sort();
    for (let i = 0; i < file_list.length - this._file_rotate; i++) {
      await mFsPromise.unlink(file_list[i])
    }
  }

  /* ------------------------------------------------------------------
  * log(title, content)
  * - 通常メッセージを出力
  * 
  * [引数]
  * - title   | String | Required | メッセージタイトル
  * - content | Any    | Optional | 追加情報
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  log(title, content) {
    if (!this._file_enabled && !this._console_enabled) {
      return;
    }

    let timestamp = this._getTimeStamp();
    let log = '[' + timestamp + '] ' + title + '\n';

    if (content) {
      let logcontent = '';
      if (typeof (content) === 'object') {
        logcontent = JSON.stringify(content, null, '  ');
      } else if (typeof (content) === 'string') {
        logcontent = content;
      } else {
        logcontent = content.toString();
      }
      log += logcontent + '\n';
    }

    if (this._file_enabled) {
      this._writeLogFile(log, timestamp);
    }
    if (this._console_enabled) {
      process.stdout.write(log);
    }

    this._onlog(log);
  }

  _writeLogFile(log, timestamp) {
    let fname = timestamp.substring(0, 10) + '.log';
    let fpath = mPath.join(this._file_dir_path, fname);
    if (!this._file_stream || this._file_path !== fpath) {
      if (this._file_stream) {
        this._file_stream.end();
      }
      this._file_stream = mFs.createWriteStream(fpath, {
        flags: 'a',
        encoding: 'utf8'
      });
      this._file_path = fpath;
    }
    this._file_stream.write(log);
  }

  /* ------------------------------------------------------------------
  * error(title, content, error)
  * - エラーを出力
  * 
  * [引数]
  * - title   | String | Required | メッセージタイトル
  * - content | Any    | Optional | 追加情報 (必要なければ null または空文字列を指定すること)
  * - error   | Error  | Optional | Error オブジェクト
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  error(title, content, error) {
    if (!this._file_enabled && !this._console_enabled) {
      return;
    }

    let timestamp = this._getTimeStamp();
    let log = '[' + timestamp + '] ERROR ' + title + '\n';

    if (content) {
      let logcontent = '';
      if (typeof (content) === 'object') {
        logcontent = JSON.stringify(content, null, '  ');
      } else if (typeof (content) === 'string') {
        logcontent = content;
      } else {
        logcontent = content.toString();
      }
      log += logcontent + '\n';
    }

    if (typeof (error) === 'object' && error.stack) {
      log += error.stack;
      log += '\n';
    }

    if (this._file_enabled) {
      this._file_stream.write(log);
    }
    if (this._console_enabled) {
      process.stdout.write('\u001b[31m' + log + '\u001b[0m');
    }

    this._onerror(log);
  }

  _getTimeStamp() {
    let dt = new Date();

    let date = [
      dt.getFullYear().toString(),
      ('0' + (dt.getMonth() + 1).toString()).slice(-2),
      ('0' + dt.getDate().toString()).slice(-2)
    ].join('-');

    let time = [
      ('0' + dt.getHours().toString()).slice(-2),
      ('0' + dt.getMinutes().toString()).slice(-2),
      ('0' + dt.getSeconds().toString()).slice(-2),
    ].join(':');

    let timestamp = date + 'T' + time;
    return timestamp;
  }



  /* ------------------------------------------------------------------
  * getLogFileList()
  * - ログファイルの一覧を取得
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  *
  * resolve() には以下の配列が渡される:
  * ["2021-06-04.log", "2021-06-05.log"]
  * ---------------------------------------------------------------- */
  getLogFileList() {
    return new Promise((resolve, reject) => {
      mFs.readdir(this._file_dir_path, (error, files) => {
        if (error) {
          reject(error);
          return;
        }
        let list = [];
        files.forEach((fname) => {
          if (/^\d{4}\-\d{2}\-\d{2}\.log$/.test(fname)) {
            list.push(fname);
          }
        });
        list.sort();
        list = list.reverse();
        resolve(list);
      });
    });
  }

  /* ------------------------------------------------------------------
  * getLogFilePath(fname)
  * - 指定のログファイル名のパスを返す
  *
  * [引数]
  * - fname  | String | 必須 | ログファイル名 (例: "2021-06-04.log")
  *
  * [返値]
  * - ファイルのパス (例: "/var/www/elwebapi/logs/2021-06-04.log")
  * - 指定のファイルが存在しなければ `null` が返される
  * ---------------------------------------------------------------- */
  getLogFilePath(fname) {
    if (!/^\d{4}\-\d{2}\-\d{2}\.log$/.test(fname)) {
      return null;
    }
    let fpath = this._file_dir_path + '/' + fname;
    if (mFs.existsSync(fpath)) {
      return fpath;
    } else {
      return null;
    }
  }

};

module.exports = Debug;
