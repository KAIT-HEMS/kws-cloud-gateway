/* ------------------------------------------------------------------
* hemscontroller - controller/edt-parsers/0EF0.js
* Date: 2021-03-07
*
* - ノードプロファイル (クラスコード: 0x0EF0) の EDT パーサー
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

    if (epc === '88') {
      name = '異常発生状態';
      data = this._parse88(buf);
    } else if (epc === '8A') {
      name = 'メーカーコード';
      data = this._parse8A(buf);
    } else if (epc === '8B') {
      name = '事業場コード';
      data = this._parse8B(buf);
    } else if (epc === '8C') {
      name = '商品コード';
      data = this._parse8C(buf);
    } else if (epc === '8D') {
      name = '製造番号'
      data = this._parse8D(buf);
    } else if (epc === '8E') {
      name = '製造年月日';
      data = this._parse8E(buf);
    } else if (epc === '9D') {
      name = '状変アナウンスプロパティマップ';
      data = this._parse9D(buf);
    } else if (epc === '9E') {
      name = 'Set プロパティマップ';
      data = this._parse9E(buf);
    } else if (epc === '9F') {
      name = 'Get プロパティマップ';
      data = this._parse9F(buf);

    } else if (epc === '80') {
      name = '動作状態';
      data = this._parse80(buf);
    } else if (epc === '82') {
      name = 'Version 情報';
      data = this._parse82(buf);
    } else if (epc === '83') {
      name = '識別番号';
      data = this._parse83(buf);
    } else if (epc === '89') {
      name = '異常内容';
      data = this._parse89(buf);
    } else if (epc === 'BF') {
      name = '個体識別情報';
      data = this._parseBF(buf);
    } else if (epc === 'D3') {
      name = '自ノードインスタンス数';
      data = this._parseD3(buf);
    } else if (epc === 'D4') {
      name = '自ノードクラス数';
      data = this._parseD4(buf);
    } else if (epc === 'D5') {
      name = 'インスタンスリスト通知';
      data = this._parseD5(buf);
    } else if (epc === 'D6') {
      name = '自ノードインスタンスリストS';
      data = this._parseD6(buf);
    } else if (epc === 'D7') {
      name = '自ノードクラスリストS';
      data = this._parseD7(buf);
    } else {
      return null;
    }

    return {
      name: name,
      data: data
    };
  }

  // 異常発生状態
  _parse88(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    if (v === 0x41) {
      return { status: true };
    } else if (v === 0x42) {
      return { status: false };
    } else {
      return null;
    }
  }

  // メーカーコード
  _parse8A(buf) {
    if (buf.length !== 3) {
      return null;
    }
    let code = buf.toString('hex').toUpperCase();
    return { code: code };
  }

  // 事業場コード
  _parse8B(buf) {
    if (buf.length !== 3) {
      return null;
    }
    let code = buf.toString('hex').toUpperCase();
    return { code: code };
  }

  // 商品コード
  _parse8C(buf) {
    if (buf.length !== 12) {
      return null;
    }
    let code = this._parseAsciiString(buf);
    return { code: code };
  }

  _parseAsciiString(buf) {
    let last_idx = buf.length;
    for (let i = 0; i < buf.length; i++) {
      if (buf.readUInt8(i) === 0x00) {
        last_idx = i;
        break;
      }
    }
    let valid_buf = buf;
    if (last_idx < buf.length) {
      valid_buf = buf.slice(0, last_idx);
    }
    let str = valid_buf.toString('utf8');
    str = str.replace(/\s+$/, '');
    return str;
  }

  // 製造番号
  _parse8D(buf) {
    if (buf.length !== 12) {
      return null;
    }
    let code = this._parseAsciiString(buf);
    return { code: code };
  }

  // 製造年月日
  _parse8E(buf) {
    if (buf.length !== 4) {
      return null;
    }
    let y = buf.readUInt16BE(0);
    let m = buf.readUInt8(2);
    let d = buf.readUInt8(3);
    return { Y: y, M: m, D: d };
  }

  // 状変アナウンスプロパティマップ
  _parse9D(buf) {
    return this._parsePropertyMap(buf);
  }

  _parsePropertyMap(buf) {
    let len = buf.length;
    if (len < 1 || len > 17) {
      return null;
    }

    let num = buf.readUInt8(0);
    let code_list = [];

    if (num > 0 && num < 16) {
      if (len !== num + 1) {
        return null;
      }
      for (let i = 1; i < len; i++) {
        let epc = buf.readUInt8(i);
        code_list.push(epc);
      }
    } else if (num >= 16) {
      if (len !== 17) {
        return null;
      }
      for (let i = 1; i < len; i++) {
        let byte = buf.readUInt8(i);
        for (let j = 0; j < 8; j++) {
          if (byte & (0b00000001 << j)) {
            let epc = ((j + 8) * 16) + (i - 1);
            code_list.push(epc);
          }
        }
      }
    }

    if (code_list.length === 0) {
      return { list: [] };
    }

    if (code_list.length > 1) {
      // EPC コードリストを数値ソート
      code_list.sort((a, b) => { return a - b; });
    }

    // 各コードを 16 進数文字列に変換して返す
    let list = [];
    code_list.forEach((code) => {
      let hex = Buffer.from([code]).toString('hex').toUpperCase();
      list.push(hex);
    });
    return { list: list };
  }

  // Set プロパティマップ
  _parse9E(buf) {
    return this._parsePropertyMap(buf);
  }

  // Get プロパティマップ
  _parse9F(buf) {
    return this._parsePropertyMap(buf);
  }

  // 動作状態
  _parse80(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let v = buf.readUInt8(0);
    if (v === 0x30) {
      return { status: true };
    } else if (v === 0x31) {
      return { status: false };
    } else {
      return null;
    }
  }

  // Version 情報
  _parse82(buf) {
    if (buf.length !== 4) {
      return null;
    }
    let major = buf.readUInt8(0);
    let minor = buf.readUInt8(1);

    return {
      version: major.toString() + '.' + minor.toString(),
      major: major,
      minor: minor
    };
  }

  // 識別番号
  _parse83(buf) {
    if (buf.length !== 17) {
      return null;
    }
    return {
      id: buf.toString('hex').toUpperCase()
    };
  }

  // 異常内容
  _parse89(buf) {
    if (buf.length !== 2) {
      return null;
    }
    let v = buf.readUInt16BE(0);
    let byte1 = buf.readUInt8(1);
    let desc1 = '';
    let desc2 = '';
    if (v >= 0x0000 && v <= 0x03E8) {
      if (byte1 === 0x00) {
        desc1 = '異常無し';
      } else if (byte1 >= 0x01 && byte1 <= 0x09) {
        desc1 = '復帰可能な異常';
        if (byte1 === 0x01) {
          desc2 = '運転／電源スイッチを切るか、コンセントを抜き再操作';
        } else if (byte1 === 0x02) {
          desc2 = 'リセットボタンを押し再操作';
        } else if (byte1 === 0x03) {
          desc2 = 'セット不良';
        } else if (byte1 === 0x04) {
          desc2 = '補給';
        } else if (byte1 === 0x05) {
          desc2 = '掃除(フィルタ等)';
        } else if (byte1 === 0x06) {
          desc2 = '電池交換';
        }
      } else if (byte1 >= 0x0A && byte1 <= 0x6E) {
        desc1 = '復帰可能な異常';
        if(byte1 >= 0x1A && byte <= 0x13) {
          desc2 = '異常現象／安全装置作動';
        } else if(byte1 >= 0x14 && byte1 <= 0x1D) {
          desc2 = 'スイッチ異常';
        } else if(byte1 >= 0x1E && byte1 <= 0x3B) {
          desc2 = 'センサ異常';
        } else if(byte1 >= 0x3C && byte1 <= 0x59) {
          desc2 = '機能部品異常';
        } else if(byte1 >= 0x5A && byte1 <= 0x6E) {
          desc2 = '制御基板異常';
        }
      } else {
        desc1 = '復帰可能な異常';
        desc2 = 'ユーザー定義領域';
      }
    } else if (v === 0x03FF) {
      desc1 = '異常あり';
    } else if (v >= 0x03E9 && v <= 0x03EC) {
      if (v === 0x03E9) {
        desc1 = '通信不能';
        desc2 = 'ミドルウェアアダプタ認識異常';
      } else if (v === 0x03EA) {
        desc1 = '設定異常';
        desc2 = 'オブジェクト異常';
      } else if (v === 0x03EB) {
        desc1 = '設定異常';
        desc2 = 'アダプタ初期化異常';
      } else if (v === 0x03EC) {
        desc1 = '設定異常';
        desc2 = 'その他設定異常';
      }
    } else {
      return null;
    }

    return {
      code: byte1, // 異常内容コード
      desc1: desc1,
      desc2: desc2
    };
  }

  // 個体識別情報
  _parseBF(buf) {
    if (buf.length !== 2) {
      return null;
    }
    let msb = buf.readUInt8(0);
    return {
      memory: (msb & 0b10000000) ? false : true, // 不揮発記憶可かどうか
      numbering: (msb & 0b01000000) ? true : false, // システムによる採番値かどうか
      code: buf.readUInt16BE(0) & 0b0011111111111111 // コード
    };
  }

  // 自ノードインスタンス数
  _parseD3(buf) {
    if (buf.length !== 3) {
      return null;
    }
    let buf32 = Buffer.concat([Buffer.from([0x00]), buf]);
    let num = buf32.readUInt32BE(0);
    return {
      num: num
    };
  }

  // 自ノードクラス数
  _parseD4(buf) {
    if (buf.length !== 2) {
      return null;
    }
    return {
      num: buf.readUInt16BE(0)
    };
  }

  // インスタンスリスト通知
  _parseD5(buf) {
    return this._parseInstanceList(buf);
  }

  _parseInstanceList(buf) {
    let len = buf.length;
    if (len < 1 || len > 253) {
      return null;
    }
    let num = buf.readUInt8(0);
    if ((len - 1) / 3 !== num) {
      return null;
    }
    let list = [];
    for (let i = 1; i < len; i += 3) {
      let eoj = buf.slice(i, i + 3).toString('hex').toUpperCase();
      list.push(eoj);
    }
    return {
      list: list
    };
  }

  // 自ノードインスタンスリストS
  _parseD6(buf) {
    return this._parseInstanceList(buf);
  }

  // 自ノードクラスリストS
  _parseD7(buf) {
    let len = buf.length;
    if (len < 1 || len > 17) {
      return null;
    }
    let num = buf.readUInt8(0);
    if ((len - 1) / 2 !== num) {
      return null;
    }
    let list = [];
    for (let i = 1; i < len; i += 2) {
      let class_code = buf.slice(i, i + 2).toString('hex').toUpperCase();
      list.push(class_code);
    }
    return {
      list: list
    };
  }

}

module.exports = new EdtParser();
