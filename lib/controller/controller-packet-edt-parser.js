/* ------------------------------------------------------------------
* hemscontroller - controller/controller-packet-edt-parser.js
* Date: 2021-03-07
* 
* - EDT パーサー
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mPath = require('path');
const mControllerUtils = require('./controller-utils.js');

class ControllerPacketEdtParser {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - なし
  * ---------------------------------------------------------------- */
  constructor() {
    // デバイスクラスのパーサーをロード
    this._parsers = {
      super: require(mPath.join(__dirname, 'edt-parsers', 'super.js'))
    };
    let dpath = mPath.join(__dirname, 'edt-parsers');
    let file_list = mFs.readdirSync(dpath);
    file_list.forEach((fname) => {
      if (/^[A-F0-9]{4}\.js$/.test(fname)) {
        let ccode = fname.replace(/\.js$/, '');
        let fpath = mPath.join(dpath, fname);
        this._parsers[ccode] = require(fpath);
      }
    });
  }

  /* ------------------------------------------------------------------
  * parse(ccode, epc, edt, release)
  * - EDT の Buffer オブジェクトを指定の EPC でパース
  * 
  * [引数]
  * - eoj     | String | Required | EOJ (16進数 6 桁の文字列, 例 "0EF001")
  * - epc     | String | Required | EPC を表す 16 進数文字列 (大文字・小文字の区別なし) (例: "B3")
  * - edt     | Buffer | Required | EDT を表す Buffer オブジェクト
  * -         | String |          | または EDT を表す 16 進数文字列
  * - release | String | Optional | ECHONET Lite 規格リリースバージョン (例: "L")
  * 
  * [戻値]
  * - パースに失敗したら null を返す
  * - パースに成功したら結果を格納したオブジェクトを返す
  * - 返すオブジェクトの内容は EPC に依存する
  * - 例:
  * {
  *   hex: "0105FF01",
  *   name: "自ノードインスタンスリストS",
  *   data: {
  *     list: ["05FF01"]
  *   }
  * }
  * 
  * - data は null になる場合もある
  * ---------------------------------------------------------------- */
  parse(eoj, epc, edt, release) {
    // パラメータのチェック
    if (typeof (eoj) !== 'string' || !/^[a-fA-F0-9]{4,6}$/.test(eoj)) {
      return null;
    }
    if (typeof (epc) !== 'string' || !/^[a-fA-F0-9]{2}$/.test(epc)) {
      return null;
    }
    if (edt) {
      if (Buffer.isBuffer(edt)) {
        // Do nothing
      } else if (typeof (edt) === 'string') {
        edt = mControllerUtils.convHexToBuffer(edt);
        if (edt === null) {
          return null;
        }
      } else {
        return null;
      }
    } else {
      return null;
    }

    if (release) {
      if (typeof (release) !== 'string' || !/^[A-Za-z]$/.test(release)) {
        return null;
      }
      release = release.toUpperCase();
    }
    // EOJ からクラスコードを抽出
    let ccode = eoj.substring(0, 4).toUpperCase();

    // 結果のオブジェクト
    let res = {
      hex: edt.toString('hex').toUpperCase(),
      name: '',
      data: null
    };

    // 対象のデバイスクラスのパーサーを選定
    let parser = this._parsers[ccode];
    if (parser) {
      let parsed = parser.parse(epc, edt, release);
      if (parsed) {
        res.name = parsed.name;
        res.data = parsed.data;
        return res;
      }
    }
    // ノードプロファイルなら終了
    // - すでに前のコードでノードプロファイルは処理が終わっているはずだから
    if (ccode === '0EF0') {
      return res;
    }
    // ここに辿り着いたということはスーパークラスの EPC の可能性がある
    // スーパークラスのパーサー
    let parsed = this._parsers.super.parse(epc, edt, release);
    if (parsed) {
      res.name = parsed.name;
      res.data = parsed.data;
      return res;
    }

    return res;
  }

}

module.exports = new ControllerPacketEdtParser();
