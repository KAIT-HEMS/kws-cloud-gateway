/* ------------------------------------------------------------------
* hemscontroller - controller/edt-parsers/0130.js
* Date: 2021-03-07
* 
* - 家庭用エアコンクラス (クラスコード: 0x0130) の EDT パーサー
* ---------------------------------------------------------------- */
'use strict';

class EdtParser {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - なし
  * ---------------------------------------------------------------- */
  constructor() {

  }

  /* ------------------------------------------------------------------
  * parse(epc, buf)
  * - EDT の Buffer オブジェクトを指定の EPC でパース
  * 
  * [引数]
  * - epc   | String | Required | EPC を表す 16 進数文字列 (大文字・小文字の区別なし) (例: "B3")
  * - buf   | Buffer | Required | EDT を表す Buffer オブジェクト
  * 
  * [戻値]
  * - パースに失敗したら null を返す
  * - パースに成功したら結果を格納したオブジェクトを返す
  * - 返すオブジェクトの内容は EPC に依存する
  * ---------------------------------------------------------------- */
  parse(epc, buf) {
    let name = '';
    let data = null;

    if (epc === '80') {
      name = '動作状態';
      data = this._parse80(buf);
    } else if (epc === '8F') {
      name = '節電動作設定';
      data = this._parse8F(buf);
    } else if (epc === 'B0') {
      name = '運転モード設定';
      data = this._parseB0(buf);
    } else if (epc === 'B3') {
      name = '温度設定値';
      data = this._parseB3(buf);
    } else if (epc === 'BB') {
      name = '室内温度計測値';
      data = this._parseBB(buf);
    } else if (epc === 'BE') {
      name = '外気温度計測値';
      data = this._parseBE(buf);
    } else if (epc === 'A0') {
      name = '風量設定';
      data = this._parseA0(buf);
    } else {
      return null;
    }

    return {
      name: name,
      data: data
    };
  }

  // 動作状態
  _parse80(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    if (v === 0x30) {
      return { status: true }; // ON
    } else if (v === 0x31) {
      return { status: false }; // OFF
    } else {
      return null;
    }
  }

  // 節電動作設定
  _parse8F(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    if (v === 0x41) {
      return { status: true }; // 節電動作中
    } else if (v === 0x42) {
      return { status: false }; // 通常動作中
    } else {
      return null;
    }
  }

  // 運転モード設定
  _parseB0(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    let code = v - 0x40;
    let desc = '';
    if (code === 0) {
      desc = 'その他の運転モード';
    } else if (code === 1) {
      desc = '自動';
    } else if (code === 2) {
      desc = '冷房';
    } else if (code === 3) {
      desc = '暖房';
    } else if (code === 4) {
      desc = '除湿';
    } else if (code === 5) {
      desc = '送風';
    }

    if (desc) {
      return { code: code, desc: desc };
    } else {
      return null;
    }
  }

  // 温度設定値
  _parseB3(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    return {
      temperature: v,
      unit: '℃'
    };
  }

  // 室内温度計測値
  _parseBB(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readInt8(0);
    return {
      temperature: v,
      unit: '℃'
    };
  }

  // 外気温度計測値
  _parseBE(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readInt8(0);
    return {
      temperature: v,
      unit: '℃'
    };
  }

  // 風量設定
  _parseA0(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    let level = 0;
    let auto = true;
    if (v === 0x41) {
      level = 0;
      auto = true;
    } else if (v >= 0x31 && v <= 0x38) {
      level = v - 0x30;
      auto = false;
    } else {
      return null;
    }
    return { auto: auto, level: level };
  }

}

module.exports = new EdtParser();
