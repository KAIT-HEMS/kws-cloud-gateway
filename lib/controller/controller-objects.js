/* ------------------------------------------------------------------
* hemscontroller - controller/controller-objects.js
* Date: 2021-03-07
* 
* - ノードプロファイルとコントローラー機器オブジェクトの定義と EDT 管理
* ---------------------------------------------------------------- */
const mPath = require('path');
const mFs = require('fs');
const mOs = require('os');
const mEdtParser = require('./controller-packet-edt-parser.js');
const mControllerUtils = require('./controller-utils.js');

class ControllerObjects {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - conf                   | Object  | Required | 設定情報を格納したオブジェクト
  *   - data_dir_path        | String  | Required | 各種データ保存ディレクトリのパス
  *   - el_manufacturer_code | String  | Required | ECHONET Lite メーカーコード
  *                          |         |          | 16 進数文字列 6 桁 (3 バイト分)
  *   - el_facility_code     | String  | Required | ECHONET Lite 事業場コード (EPC: 0x8B)
  *                          |         |          | 16 進数文字列 6 桁 (3 バイト分)
  *   - el_product_code      | String  | Required | ECHONET Lite 商品コード (EPC: 0x8C)
  *                          |         |          | 半角英数字および記号で 12 文字まで
  *   - el_production_number | String  | Required | ECHONET Lite 製造番号 (EPC: 0x8D)
  *                          |         |          | 半角英数字および記号で 12 文字まで
  *   - el_production_date   | String  | Required | ECHONET Lite 製造年月日 (EPC: 0x8E)
  *                          |         |          | YYYY-MM-DD 形
  * ---------------------------------------------------------------- */
  constructor(conf) {
    // conf のチェック
    if (!conf || typeof (conf) !== 'object') {
      throw new Error('The `conf` is invalid.');
    }

    // EDT 保存ファイルパス
    this._edt_json_fpath = mPath.join(conf.data_dir_path, 'controller_edt.json');

    // ECHONET メーカーコード (EPC: 0x8A)
    this._manufacturer_code = (conf.el_manufacturer_code || '000000').toUpperCase();
    // ECHONET 事業場コード (EPC: 0x8B)
    this._facility_code = (conf.el_facility_code || '000000').toUpperCase();
    // ECHONET 商品コード (EPC: 0x8C)
    this._product_code = (conf.el_product_code || '');
    // ECHONET 製造番号 (EPC: 0x8D)
    this._production_number = (conf.el_production_number || '');
    // ECHONET 製造年月日 (EPC: 0x8E)
    this._production_date = (conf.el_production_date || '2020-01-01');

    // 機器オブジェクトの定義
    // - 必ず EOJ は "0EF001" と "05FF01" とすること
    this._objects = {
      // -----------------------------------------------------------
      // ノードプロファイル
      // -----------------------------------------------------------
      "0EF001": {
        // -----------------------------------------------------------
        // プロファイルオブジェクトスーパークラス構成プロパティ
        // -----------------------------------------------------------
        // 異常発生状態
        "88": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "42" // 1 バイト (異常発生有=0x41, 異常発生無=0x42)
        },
        // メーカーコード
        "8A": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 3 バイト (自動でセットするので定義しないこと)
        },
        // 事業場コード
        "8B": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 3 バイト (自動でセットするので定義しないこと)
        },
        // 商品コード
        "8C": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 12 バイト (自動でセットするので定義しないこと)
        },
        // 製造番号
        "8D": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 12 バイト (自動でセットするので定義しないこと)
        },
        // 製造年月日
        "8E": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "07E40101" // 4 バイト (自動でセットするので定義しないこと)
        },
        // 状変アナウンスプロパティマップ
        "9D": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        },
        // Set プロパティマップ
        "9E": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        },
        // Get プロパティマップ
        "9F": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        },
        // -----------------------------------------------------------
        // ノードプロファイルクラス
        // -----------------------------------------------------------
        // 動作状態
        "80": {
          "rule": {
            "get": true,
            "set": false,
            "inf": true
          },
          "edt": "30" // 1 バイト (起動中=0x30, 未起動中=0x31) 
        },
        // Version 情報
        "82": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "00010100" // 4 バイト (ver 0.1)
        },
        // 識別番号
        "83": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 17 バイト (自動でセットするので定義しないこと)
        },
        // 異常内容
        "89": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "0000" // 2 バイト
        },
        // 個体識別情報
        "BF": {
          "rule": {
            "get": true,
            "set": true,
            "inf": false
          },
          "edt": "8001" // 2 バイト (0b10000000 00000001)
        },
        // 自ノードインスタンス数
        "D3": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 3 バイト (自動でセットするので定義しないこと)
        },
        // 自ノードクラス数
        "D4": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 2 バイト (自動でセットするので定義しないこと)
        },
        // インスタンスリスト通知
        "D5": {
          "rule": {
            "get": false,
            "set": false,
            "inf": true
          },
          "edt": "" // Max. 253 バイト (自動でセットするので定義しないこと)
        },
        // 自ノードインスタンスリスト S
        "D6": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 253 バイト (自動でセットするので定義しないこと)
        },
        // 自ノードクラスリスト S
        "D7": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        }
      },

      // -----------------------------------------------------------
      // コントローラー機器オブジェクト
      // -----------------------------------------------------------
      "05FF01": {
        // 動作状態
        "80": {
          "rule": {
            "get": true,
            "set": false,
            "inf": true
          },
          "edt": "30" // 1 バイト (ON=0x30, OFF=0x31)
        },
        // 設置場所
        "81": {
          "rule": {
            "get": true,
            "set": true,
            "inf": true
          },
          "edt": "00" // 1 or 17 バイト
        },
        // 規格Version 情報
        "82": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "00004C00" // 4 バイト (Release L)
        },
        // 識別番号
        "83": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 17 バイト (自動でセットするので定義しないこと)
        },
        // 異常発生状態
        "88": {
          "rule": {
            "get": true,
            "set": false,
            "inf": true
          },
          "edt": "42" // 1 バイト (異常発生有=0x41, 異常発生無=0x42)
        },
        // メーカーコード
        "8A": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 3 バイト (自動でセットするので定義しないこと)
        },
        // 事業場コード
        "8B": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 3 バイト (自動でセットするので定義しないこと)
        },
        // 商品コード
        "8C": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 12 バイト (自動でセットするので定義しないこと)
        },
        // 製造番号
        "8D": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 12 バイト (自動でセットするので定義しないこと)
        },
        // 製造年月日
        "8E": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // 4 バイト (自動でセットするので定義しないこと)
        },
        // 状変アナウンスプロパティマップ
        "9D": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        },
        // Set プロパティマップ
        "9E": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        },
        // Get プロパティマップ
        "9F": {
          "rule": {
            "get": true,
            "set": false,
            "inf": false
          },
          "edt": "" // Max. 17 バイト (自動でセットするので定義しないこと)
        }
      }
    };

  }

  /* ------------------------------------------------------------------
  * init()
  * - ECHONET Lite コントローラーの EPC 値を初期化
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない
  * ---------------------------------------------------------------- */
  init() {
    return new Promise((resolve, reject) => {
      // JSON から EPC 値をロード
      this._loadEpcValues().then(() => {
        // 識別子ベースを生成
        let mac = this._getMacAddress();
        mac = mac.replace(/\:/g, '').toUpperCase();
        let identifier_base = 'FE' + this._manufacturer_code + mac;

        // 自ノードインスタンスリスト (ノードプロファイルを除く) (EPC: 0xD6)
        let self_node_instance_list = [];
        Object.keys(this._objects).forEach((eoj) => {
          let ccode = eoj.substring(0, 4).toUpperCase();
          if (ccode !== '0EF0') {
            self_node_instance_list.push(eoj);
          }
        });
        // 自ノードインスタンス数 (ノードプロファイルを除く) (EPC: 0xD3)
        let self_node_instance_num = self_node_instance_list.length;

        // 自ノードクラスリスト S (ノードプロファイルを除く) (EPC: 0xD7)
        let self_node_class_map = {};
        Object.keys(this._objects).forEach((eoj) => {
          let ccode = eoj.substring(0, 4).toUpperCase();
          if (ccode !== '0EF0') {
            self_node_class_map[ccode] = 1;
          }
        });
        let self_node_class_list = Object.keys(self_node_class_map);
        // 自ノードクラス数 (ノードプロファイルを含む) (EPC: 0xD4)
        let self_node_class_num = self_node_class_list.length + 1;

        // 各 EPC の値の初期値を設定
        for (let [eoj, obj] of Object.entries(this._objects)) {

          // プロパティマップ
          let pmap = {
            inf: [],
            set: [],
            get: []
          };
          for (let [epc, data] of Object.entries(obj)) {
            let r = data.rule;
            if (r.inf) {
              pmap.inf.push(epc);
            }
            if (r.set) {
              pmap.set.push(epc);
            }
            if (r.get) {
              pmap.get.push(epc);
            }
          }

          // EDT 初期値を生成
          let ccode = eoj.substring(0, 4).toUpperCase();
          for (let [epc, data] of Object.entries(obj)) {
            epc = epc.toUpperCase();
            if (ccode === '0EF0') {
              // ノードプロファイル
              if (epc === '83') {
                // 識別番号 17 バイト
                // - 万が一、ネットワークインタフェースの構成が変わる可能性を
                //   考慮して、一度、識別番号を確定したら使いまわす
                if (!data.edt) {
                  data.edt = this._hexZeroPadding(identifier_base + eoj, 17);
                }
              } else if (epc === '8A') {
                // メーカーコード 3 バイト
                data.edt = this._manufacturer_code;
              } else if (epc === '8B') {
                // 事業場コード 3 バイト
                data.edt = this._facility_code;
              } else if (epc === '8C') {
                // 商品コード 12 バイト
                data.edt = this._createProductCodeEdtHex(this._product_code)
              } else if (epc === '8D') {
                // 製造番号 12 バイト
                data.edt = this._createProductionNumberEdtHex(this._production_number);
              } else if (epc === '8E') {
                // 製造年月日
                data.edt = this._createProductionDateEdtHex(this._production_date);
              } else if (epc === '9D') {
                // 状変アナウンスプロパティマップ Max. 17 バイト
                data.edt = this._createPropertyMapHexValue(pmap.inf);
              } else if (epc === '9E') {
                // Set プロパティマップ Max. 17 バイト
                data.edt = this._createPropertyMapHexValue(pmap.set);
              } else if (epc === '9F') {
                // Get プロパティマップ Max. 17 バイト
                data.edt = this._createPropertyMapHexValue(pmap.get);
              } else if (epc === 'D3') {
                // 自ノードインスタンス数 3 バイト
                let buf = Buffer.alloc(4);
                buf.writeUInt32BE(self_node_instance_num, 0);
                data.edt = buf.slice(1, 4).toString('hex').toUpperCase();
              } else if (epc === 'D4') {
                // 自ノードクラス数 2 バイト
                let buf = Buffer.alloc(2);
                buf.writeUInt16BE(self_node_class_num, 0);
                data.edt = buf.toString('hex').toUpperCase();
              } else if (epc === 'D5') {
                // インスタンスリスト通知 Max. 253 バイト
                let num = Buffer.from([self_node_instance_list.length]).toString('hex').toUpperCase();
                data.edt = num + self_node_instance_list.join('');
              } else if (epc === 'D6') {
                // 自ノードインスタンスリスト S Max. 253 バイト
                let num = Buffer.from([self_node_instance_list.length]).toString('hex').toUpperCase();
                data.edt = num + self_node_instance_list.join('');
              } else if (epc === 'D7') {
                // 自ノードクラスリスト S Max. 17 バイト
                let num = Buffer.from([self_node_class_list.length]).toString('hex').toUpperCase();
                data.edt = num + self_node_class_list.join('');
              }
            } else if (ccode === '05FF') {
              // コントローラー
              if (epc === '83') {
                // 識別番号 17 バイト
                data.edt = this._hexZeroPadding(identifier_base + eoj, 17);
              } else if (epc === '8A') {
                // メーカーコード 3 バイト
                data.edt = this._manufacturer_code;
              } else if (epc === '8B') {
                // 事業場コード 3 バイト
                data.edt = this._facility_code;
              } else if (epc === '8C') {
                // 商品コード 12 バイト
                data.edt = this._createProductCodeEdtHex(this._product_code)
              } else if (epc === '8D') {
                // 製造番号 12 バイト
                data.edt = this._createProductionNumberEdtHex(this._production_number);
              } else if (epc === '8E') {
                // 製造年月日
                data.edt = this._createProductionDateEdtHex(this._production_date);
              } else if (epc === '9D') {
                // 状変アナウンスプロパティマップ Max. 17 バイト
                data.edt = this._createPropertyMapHexValue(pmap.inf);
              } else if (epc === '9E') {
                // Set プロパティマップ Max. 17 バイト
                data.edt = this._createPropertyMapHexValue(pmap.set);
              } else if (epc === '9F') {
                // Get プロパティマップ Max. 17 バイト
                data.edt = this._createPropertyMapHexValue(pmap.get);
              }
            }
          }
        }

        // EPC 値をファイルに JSON 形式で保存する
        return this.save();
      }).then(() => {
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  // 商品コードの EDT 16 進数文字列を生成
  _createProductCodeEdtHex(str) {
    let buf = Buffer.alloc(12);
    if (str) {
      let char_buf = Buffer.from(str, 'utf8');
      buf = Buffer.concat([char_buf, buf]).slice(0, 12);
    }
    return buf.toString('hex').toUpperCase();
  }

  // 製造番号の EDT 16 進数文字列を生成
  _createProductionNumberEdtHex(str) {
    return this._createProductCodeEdtHex(str);
  }

  // 製造年月日の EDT 16 進数文字列を生成
  _createProductionDateEdtHex(date) {
    let ymd = '2020-01-01';
    if (date && /^\d{4}\-\d{2}\-\d{2}$/.test(date)) {
      ymd = date;
    }
    let ymd_parts = ymd.split('-');
    let Y = parseInt(ymd_parts[0], 10);
    let M = parseInt(ymd_parts[1], 10);
    let D = parseInt(ymd_parts[2], 10);
    let buf = Buffer.alloc(4);
    buf.writeUInt16BE(Y, 0);
    buf.writeUInt8(M, 2);
    buf.writeUInt8(D, 3);
    return buf.toString('hex').toUpperCase()
  }

  _createPropertyMapHexValue(epc_list) {
    let num = epc_list.length;
    if (num < 16) {
      let hex = Buffer.from([num]).toString('hex').toUpperCase();
      hex += epc_list.join('');
      return hex;
    } else {
      let bytes = [num, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      epc_list.forEach((epc) => {
        let bit_idx = parseInt(epc.substring(0, 1), 16) - 8;
        let byte_idx = parseInt(epc.substring(1, 2), 16) + 1;
        bytes[byte_idx] = bytes[byte_idx] | (1 << bit_idx);
      });
      let buf = Buffer.from(bytes);
      let hex = buf.toString('hex').toUpperCase();
      return hex;
    }
  }

  _hexZeroPadding(hex, byte_num) {
    let num = (byte_num * 2) - hex.length;
    if (num <= 0) {
      return hex;
    }
    for (let i = 0; i < num; i++) {
      hex += '0';
    }
    return hex;
  }

  // ネットワークインタフェースの MAC アドレスを取得
  _getMacAddress() {
    let mac = '';
    let netifs = mOs.networkInterfaces();
    for (let dev in netifs) {
      netifs[dev].forEach((info) => {
        // ローカルアドレスは除外
        if (info.internal) {
          return;
        }
        // IPv4でなければ除外
        if (info.family !== 'IPv4') {
          return;
        }
        // リンクローカルアドレスは除外
        let addr = info.address;
        if (/^169\.254\./.test(addr)) {
          return;
        }
        // IPv4 が .1 で終わるものは除外
        if (/\.1$/.test(addr)) {
          return;
        }

        mac = info.mac;
      });
    }
    return mac;
  }

  // JSON ファイルに保存された EPC 値を読み取り this._objects を更新
  _loadEpcValues() {
    return new Promise((resolve, reject) => {
      // JSON ファイルのパス
      let fpath = this._edt_json_fpath;

      // JSON ファイルがなければ何もせずに終了
      if (!mFs.existsSync(fpath)) {
        resolve();
        return;
      }

      // JSON ファイルを読み取る
      mFs.readFile(fpath, (error, json) => {
        if (error) {
          reject(error);
          return;
        }

        let vals = null;
        try {
          vals = JSON.parse(json);
        } catch (e) {
          reject(e);
          return;
        }

        for (let [eoj, obj] of Object.entries(vals)) {
          if (!this._objects[eoj]) {
            continue;
          }
          for (let [epc, edt] of Object.entries(obj)) {
            if (this._objects[eoj][epc]) {
              this._objects[eoj][epc].edt = edt;
            }
          }
        }

        resolve();
      });
    });
  }

  /* ------------------------------------------------------------------
  * save()
  * - EPC 値をファイルに JSON 形式で保存する
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - Promise オブジェクト
  * ---------------------------------------------------------------- */
  save() {
    return new Promise((resolve, reject) => {
      let vals = {};
      for (let [eoj, obj] of Object.entries(this._objects)) {
        vals[eoj] = {};
        for (let [epc, data] of Object.entries(obj)) {
          vals[eoj][epc] = data.edt;
        }
      }

      let fpath = this._edt_json_fpath;
      let json = JSON.stringify(vals, null, '  ');

      mFs.writeFile(fpath, json, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /* ------------------------------------------------------------------
  * getEdtHex(eoj, epc)
  * - 指定の EPC の値 (EDT) を 16 進数文字列で取得
  * 
  * [引数]
  * - eoj   | String  | Required | EOJ ("0EF001" または "05FF01")
  * - epc   | String  | Required | EPC (例: "80")
  * - force | Boolean | Optional | ルールにかかわらず強制的にセットするフラグ
  *         |         |          | デフォルトは false
  * 
  * [戻値]
  * - EDT を表す 16 進数文字列
  * - 指定の EPC がなければ null を返す
  * ---------------------------------------------------------------- */
  getEdtHex(eoj, epc, force) {
    let eoj_data = this._objects[eoj];
    if (!eoj_data) {
      return null;
    }
    let epc_data = eoj_data[epc];
    if (!epc_data) {
      return null;
    }

    // アクセスルールをチェック
    if (!force) {
      if (!this.checkRule(eoj, epc, 'get')) {
        return null;
      }
    }

    return epc_data.edt || null;
  }

  /* ------------------------------------------------------------------
  * getEdtBuf(eoj, epc)
  * - 指定の EPC の値 (EDT) を Buffer オブジェクトで取得
  * 
  * [引数]
  * - eoj   | String  | Required | EOJ ("0EF001" または "05FF01")
  * - epc   | String  | Required | EPC (例: "80")
  * - force | Boolean | Optional | ルールにかかわらず強制的にセットするフラグ
  *         |         |          | デフォルトは false
  * 
  * [戻値]
  * - EDT を表す Buffer オブジェクト
  * - 指定の EPC がなければ null を返す
  * ---------------------------------------------------------------- */
  getEdtBuf(eoj, epc, force) {
    let hex = this.getEdtHex(eoj, epc, force);
    if (hex) {
      return mControllerUtils.convHexToBuffer(hex);
    } else {
      return null;
    }
  }

  /* ------------------------------------------------------------------
  * checkRule(eoj, epc, method)
  * - 指定の EPC のルールをチェック
  * 
  * [引数]
  * - eoj    | String  | Required | EOJ ("0EF001" または "05FF01")
  * - epc    | String  | Required | EPC (例: "80")
  * - method | String  | Required | "get", "set", "inf" のいずれか
  * 
  * [戻値]
  * - 指定のメソッドが許可されているなら true を、そうでなければ false を返す
  * ---------------------------------------------------------------- */
  checkRule(eoj, epc, method) {
    let eoj_data = this._objects[eoj];
    if (!eoj_data) {
      return false;
    }
    let epc_data = eoj_data[epc];
    if (!epc_data) {
      return false;
    }

    if (!method || typeof (method) !== 'string') {
      return false;
    }
    method = method.toLowerCase();
    if (!/^(get|set|inf)$/.test(method)) {
      return false;
    }

    let rule = epc_data.rule;
    if (!rule) {
      return false;
    }

    return rule[method] ? true : false;
  }

  /* ------------------------------------------------------------------
  * getTargetEoj(eoj)
  * - 指定の EOJ が自分自身のインスタンスなのかどうかをチェックして、
  *   処理に妥当な EOJ を返す
  * 
  * [引数]
  * - eoj         | String  | Required | EOJ (例: "0EF001")
  * 
  * [戻値]
  * - EOJ を返す
  * - もし自分自身の EOJ でなければ null を返す
  * - EOJ に 0EF000 が指定された場合は 0EF001 を返す
  * ---------------------------------------------------------------- */
  getTargetEoj(eoj) {
    if (typeof (eoj) === 'string' && /^[a-fA-F0-9]{6}$/.test(eoj)) {
      eoj = eoj.toUpperCase();
      if (eoj === '0EF000') {
        eoj = '0EF001';
      }
      if (this._objects[eoj]) {
        return eoj;
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  /* ------------------------------------------------------------------
  * setEdt(eoj, epc, edt)
  * - 指定の EPC の値 (EDT) を保存
  * 
  * [引数]
  * - eoj   | String  | Required | EOJ ("0EF001" または "05FF01")
  * - epc   | String  | Required | EPC (例: "80")
  * - edt   | Buffer  | Required | EDT を表す Buffer オブジェクト
  *         | String  |          | または 16 進数文字列
  * - force | Boolean | Optional | ルールにかかわらず強制的にセットするフラグ
  *         |         |          | デフォルトは false
  * 
  * [戻値]
  * - 処理結果を含んだオブジェクト
  * {
  *   result: true, // 成功なら true、そうでなければ false
  *   changed: true, // EDT に変化があれば true、そうでなければ false
  *   message: '' // 失敗した場合にそのエラーメッセージが格納される
  * }
  * 
  * * このメソッドでは JSON に保存されないので、別途、save() メソッドを
  *   呼び出すこと。でないと、再起動したときにデフォルト値に戻ってしまうので
  *   注意すること。
  * ---------------------------------------------------------------- */
  setEdt(eoj, epc, edt, force) {

    let res = {
      result: false,
      changed: false,
      message: ''
    };

    let eoj_data = this._objects[eoj];
    if (!eoj_data) {
      res.message = 'The `eoj` is unknown.';
      return res;
    }
    let epc_data = eoj_data[epc];
    if (!epc_data) {
      res.message = 'The `epc` is unknown.';
      return res;
    }

    let edt_hex = '';
    if (edt) {
      if (Buffer.isBuffer(edt)) {
        edt_hex = edt.toString('hex').toUpperCase();
      } else if (typeof (edt) === 'string' && /^[a-fA-F0-9]+/.test(edt) && edt.length % 2 === 0) {
        edt_hex = edt.toUpperCase();
      } else {
        res.message = 'The `edt` is invalid.';
        return res;
      }
    } else {
      res.message = 'The `edt` is required.';
      return res;
    }

    // set アクセスルールをチェック
    if (!force) {
      if (!this.checkRule(eoj, epc, 'set')) {
        res.message = 'The `epc` is not allowed to set.';
        return res;
      }
    }

    // EDT の内容をチェック
    if (!mEdtParser.parse(eoj, epc, edt)) {
      res.message = 'The `edt` is invalid.';
      return res;
    }

    // EDT に変化があるかどうかをチェック
    res.result = true;
    if (epc_data.edt === edt_hex) {
      return res;
    } else {
      // EDT をセット
      epc_data.edt = edt_hex;
      res.changed = true;
      return res;
    }
  }

  /* ------------------------------------------------------------------
  * getEojListForPowerStatusInf()
  * - 動作状態 INF 対象の EOJ のリストを取得
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - EOJ のリストを表す Array
  * ---------------------------------------------------------------- */
  getEojListForPowerStatusInf() {
    let eoj_list = [];
    for (let [eoj, obj] of Object.entries(this._objects)) {
      let epc80data = obj['80'];
      if (epc80data && epc80data.rule && epc80data.rule.inf) {
        eoj_list.push(eoj);
      }
    }
    return eoj_list;
  }

};

module.exports = ControllerObjects;
