/* ------------------------------------------------------------------
* cloud-gateway - uconf-manager.js
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');
const mFs = require('fs');
const mFsPromises = require('fs/promises');

class UconfManager {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * ---------------------------------------------------------------- */
  constructor() {
    // config.user.json のファイルパス
    this._fpath = mPath.resolve(__dirname, '../data/config.user.json');
  }


  /* ------------------------------------------------------------------
  * init()
  * - 初期化
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() にはユーザー設定のオブジェクトが渡される。
  * ---------------------------------------------------------------- */
  async init() {
    if (!mFs.existsSync(this._fpath)) {
      try {
        await mFsPromises.writeFile(this._fpath, '{}');
      } catch (error) {
        throw new Error(this._fpath + ' の生成に失敗しました: ' + error.message);
      }
    }

    const conf = await this.read();
    return conf;
  };

  /* ------------------------------------------------------------------
  * read()
  * - ユーザー設定を一括で読み取る
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() にはユーザー設定のオブジェクトが渡される。
  * ---------------------------------------------------------------- */
  async read() {
    let conf = null;
    try {
      const json = await mFsPromises.readFile(this._fpath, 'utf8');
      conf = JSON.parse(json);
    } catch (error) {
      throw new Error(this._fpath + ' の読み取りに失敗しました: ' + error.message);
    }
    return conf;
  }

  /* ------------------------------------------------------------------
  * write(conf)
  * - ユーザー設定を一括で書き込む
  *
  * [引数]
  * - conf  | Object | 必須 | ユーザー設定を格納したオブジェクト
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない。
  * ---------------------------------------------------------------- */
  async write(conf) {
    try {
      const json = JSON.stringify(conf, null, '  ');
      conf = await mFsPromises.writeFile(this._fpath, json, 'utf8');
    } catch (error) {
      throw new Error(this._fpath + ' の書き込みに失敗しました: ' + error.message);
    }
  }

  /* ------------------------------------------------------------------
  * update(params)
  * - 指定のユーザー設定のみを更新
  *
  * [引数]
  * - parmas | Object | 必須 | 更新したいユーザー設定を格納したオブジェクト
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない。
  * ---------------------------------------------------------------- */
  async update(params) {
    try {
      const conf = await this.read();
      Object.assign(conf, params);
      await this.write(conf);
    } catch (error) {
      throw new Error(this._fpath + ' の更新に失敗しました: ' + error.message);
    }
  }

}

module.exports = UconfManager;
