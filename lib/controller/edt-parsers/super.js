/* ------------------------------------------------------------------
* hemscontroller - controller/edt-parsers/super.js
* Date: 2021-11-25
*
* - 機器オブジェクトスーパークラスの EDT パーサー
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
    } else if (epc === '81') {
      name = '設置場所';
      data = this._parse81(buf);
    } else if (epc === '82') {
      name = '規格 Version 情報';
      data = this._parse82(buf);
    } else if (epc === '83') {
      name = '識別番号';
      data = this._parse83(buf);
    } else if (epc === '84') {
      name = '瞬時消費電力計測値';
      data = this._parse84(buf);
    } else if (epc === '85') {
      name = '積算消費電力計測値';
      data = this._parse85(buf);
    } else if (epc === '86') {
      name = 'メーカ異常コード';
      data = this._parse86(buf);
    } else if (epc === '87') {
      name = '電流制限設定';
      data = this._parse87(buf);
    } else if (epc === '88') {
      name = '異常発生状態';
      data = this._parse88(buf);
    } else if (epc === '89') {
      name = '異常内容';
      data = this._parse89(buf);
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
      name = '製造番号';
      data = this._parse8D(buf);
    } else if (epc === '8E') {
      name = '製造年月日';
      data = this._parse8E(buf);
    } else if (epc === '8F') {
      name = '節電動作設定';
      data = this._parse8F(buf);
    } else if (epc === '93') {
      name = '遠隔操作設定';
      data = this._parse93(buf);
    } else if (epc === '97') {
      name = '現在時刻設定';
      data = this._parse97(buf);
    } else if (epc === '98') {
      name = '現在年月日設定';
      data = this._parse97(buf);
    } else if (epc === '99') {
      name = '電力制限設定';
      data = this._parse99(buf);
    } else if (epc === '9A') {
      name = '積算運転時間';
      data = this._parse9A(buf);
    } else if (epc === '9D') {
      name = '状変アナウンスプロパティマップ';
      data = this._parse9D(buf);
    } else if (epc === '9E') {
      name = 'Set プロパティマップ';
      data = this._parse9E(buf);
    } else if (epc === '9F') {
      name = 'Get プロパティマップ';
      data = this._parse9F(buf);
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
      return { status: true };
    } else if (v === 0x31) {
      return { status: false };
    } else {
      return null;
    }
  }

  // 設置場所
  _parse81(buf) {
    let len = buf.length;
    if (len === 1) {
      let v = buf.readUInt8(0);
      let code = 0; // 設置場所コード
      let index = 0; // 場所番号
      let desc = ''; // 設置場所名
      if(v === 0b00000000) {
        desc = '設置場所未設定';
      } else if(v === 0b11111111) {
        desc = '設置場所不定';
      } else if(v === 0b00000001) {
        desc = '位置情報定義';
      } else if(v & 0b10000000) {
        desc = 'フリー定義';
      } else {
        index = v & 0b00000111;
        code = v >>> 3;
        if(code === 0b0001) {
          desc = '居間、リビング';
        } else if(code === 0b0010) {
          desc = '食堂、ダイニング';
        } else if(code === 0b0011) {
          desc = '台所、キッチン';
        } else if(code === 0b0100) {
          desc = '浴室、バス';
        } else if(code === 0b0101) {
          desc = 'トイレ';
        } else if(code === 0b0110) {
          desc = '洗面所、脱衣所';
        } else if(code === 0b0111) {
          desc = '廊下';
        } else if(code === 0b1000) {
          desc = '部屋';
        } else if(code === 0b1001) {
          desc = '階段';
        } else if(code === 0b1010) {
          desc = '玄関';
        } else if(code === 0b1011) {
          desc = '納戸';
        } else if(code === 0b1100) {
          desc = '庭、外周';
        } else if(code === 0b1101) {
          desc = '車庫';
        } else if(code === 0b1110) {
          desc = 'ベランダ、バルコニー';
        } else if(code === 0b1111) {
          desc = 'その他';
        }
      }
      return {
        type: 0,
        code: code,
        index: index,
        desc: desc
      };
    } else if (len === 17) {
      if(v === 0x01) {
        if(buf.slice(1, 9).toString('hex').toUpperCase() === '00001B0000000003') {
          // 国土地理院が定める場所情報コード (ucode)
          // https://ucopendb.gsi.go.jp/ucode/explain.html
          // 緯度・経度・階層はパースせずに 16 進数文字列で返す
          let ubuf = buf.slice(1, 17); // 16 バイト
          return {
            type: 1,
            desc: '国土地理院場所情報コード',
            ucode: ubuf.toString('hex').toUpperCase()
          };

        } else {
          // 緯度・経度・高さを表すことになるがフォーマットは規定されて
          // いないので、ここでは 16 進数文字列を返す
          let locbuf = buf.slice(1, 17);
          return {
            type: 2,
            desc: '緯度・経度・高さ',
            hex: locbuf.toString('hex').toUpperCase()
          };
        }

      }
    } else {
      return null;
    }
  }

  // 規格 Version 情報
  _parse82(buf) {
    if (buf.length !== 4) {
      return null;
    }
    return {
      version: buf.slice(2, 3).toString('utf8').toUpperCase()
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

  // 瞬時消費電力計測値
  _parse84(buf) {
    if (buf.length !== 2) {
      return null;
    }
    return {
      unit: 'W',
      value: buf.readUInt16BE(0)
    };
  }

  // 積算消費電力計測値
  _parse85(buf) {
    if (buf.length !== 4) {
      return null;
    }
    return {
      unit: 'kWh',
      value: buf.readUInt32BE(0) / 1000
    };
  }

  // メーカ異常コード
  _parse86(buf) {
    let len = buf.length;
    if(len < 5) {
      return null;
    }
    let size = buf.readUInt8(0);
    if(len !== 4 + size) {
      return null;
    }
    return {
      mcode: buf.slice(1, 4).toString('hex').toUpperCase(), // メーカーコード
      ecode: buf.slice(4).toString('hex').toUpperCase() // 各メーカー独自の異常コード
    };
  }

  // 電流制限設定
  _parse87(buf) {
    if (buf.length !== 1) {
      return null;
    }
    return {
      limit: buf.readUInt8(0)
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
    } else {
      return null;
    }

    return {
      code: byte1, // 異常内容コード
      desc1: desc1,
      desc2: desc2
    };
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
    let number = this._parseAsciiString(buf);
    return { number: number };
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

  // 遠隔操作設定
  _parse93(buf) {
    if (buf.length !== 1) {
      return null;
    }
    let code = buf.readUInt8(0);
    let desc = '';
    if (code === 0x41) {
      desc = '公衆回線未経由操作';
    } else if (code === 0x42) {
      desc = '公衆回線経由操作'
    } else if (code === 0x61) {
      desc = '通信回線正常（公衆回線経由の操作不可）';
    } else if (code === 0x62) {
      desc = '通信回線正常（公衆回線経由の操作可能）';
    } else {
      return null;
    }

    return {
      code: code,
      desc: desc
    };
  }

  // 現在時刻設定
  _parse97(buf) {
    if (buf.length !== 2) {
      return null;
    }
    let h = buf.readUInt8(0);
    let m = buf.readUInt8(1);
    return { h: h, m: m };
  }

  // 現在年月日設定
  _parse98(buf) {
    if (buf.length !== 4) {
      return null;
    }
    let y = buf.readUInt16BE(0);
    let m = buf.readUInt8(2);
    let d = buf.readUInt8(3);
    return { Y: y, M: m, D: d };
  }

  // 電力制限設定
  _parse99(buf) {
    if (buf.length !== 2) {
      return null;
    }
    return {
      unit: 'W',
      limit: buf.readUInt16BE(0)
    };
  }

  // 積算運転時間
  _parse9A(buf) {
    if (buf.length !== 5) {
      return null;
    }
    let ucode = buf.readUInt8(0);
    let time = buf.readUInt32BE(1);
    let unit = '';
    if(ucode === 0x41) {
      unit = 's';
    } else if(ucode === 0x42) {
      unit = 'm';
    } else if(ucode === 0x43) {
      unit = 'h';
    } else if(ucode === 0x44) {
      unit = 'D';
    }

    return {
      time: time,
      unit: unit
    };
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


}

module.exports = new EdtParser();
