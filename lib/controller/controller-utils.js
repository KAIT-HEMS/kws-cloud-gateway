/* ------------------------------------------------------------------
* hemscontroller - controller/controller-utils.js
* Date: 2021-03-07
* 
* - コントローラーの各種モジュールで共通して良く使うメソッド集
* ---------------------------------------------------------------- */
'use strict';

class ControllerUtils {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - なし
  * ---------------------------------------------------------------- */
  constructor() {

  }

  /* ------------------------------------------------------------------
  * convHexToBuffer(hex)
  * - 16進数文字列を Buffer オブジェクトに変換
  * 
  * [引数]
  * - hex  | String | Required | 16進数文字列 (例 "0EF001")
  * 
  * [戻値]
  * - Buffer オブジェクト
  * - 変換に失敗したら null を返す
  * ---------------------------------------------------------------- */
  convHexToBuffer(hex) {
    if (!hex || typeof (hex) !== 'string' || !/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
      return null;
    }
    let byte_num = hex.length / 2;
    let num_list = [];
    for (let i = 0; i < byte_num; i++) {
      let n = parseInt(hex.substr(i * 2, 2), 16);
      num_list.push(n);
    }
    let buf = Buffer.from(num_list);
    return buf;
  }
}

module.exports = new ControllerUtils();
