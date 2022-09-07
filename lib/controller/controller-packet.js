/* ------------------------------------------------------------------
* hemscontroller - controller/controller-packet.js
* Date: 2021-03-07
* 
* - ECHONET Lite パケットのパースと生成
* ---------------------------------------------------------------- */
'use strict';
const mEdtParser = require('./controller-packet-edt-parser.js');
const mControllerUtils = require('./controller-utils.js');

class ControllerPacket {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - なし
  * ---------------------------------------------------------------- */
  constructor() {
    // ESV の 16 進数と意味の対応
    this._esv_name_code_map = {
      'SETI': 0x60,
      'SETC': 0x61,
      'GET': 0x62,
      'INF_REQ': 0x63,
      'SETGET': 0x6E,
      'SET_RES': 0x71,
      'GET_RES': 0x72,
      'INF': 0x73,
      'INFC': 0x74,
      'INFC_RES': 0x7A,
      'SETGET_RES': 0x7E,
      'SETI_SNA': 0x50,
      'SETC_SNA': 0x51,
      'GET_SNA': 0x52,
      'INF_SNA': 0x53,
      'SETGET_SNA': 0x5E
    };
    this._esv_code_name_map = null;
  }

  /* ------------------------------------------------------------------
  * parse()
  * - 受信パケットの Buffer オブジェクトをパース
  * 
  * [引数]
  * - buf   | Buffer | Required | ECHONET Lite パケットを表す Buffer オブジェクト
  * 
  * [戻値]
  * - パースに失敗したら null を返す
  * - パースに成功したら結果を格納したオブジェクトを返す
  * 
  * {
  *   tid: 1,
  *   seoj: "013001",
  *   deoj: "05FF01",
  *   esv: "GET_RES",
  *   opc: 1,
  *   props: [
  *     {
  *       epc: "80",
  *       pdc: 1,
  *       edt: {...}
  *     }
  *   ]
  * }
  * 
  * ESV が SetGet 系なら props2 が追加される
  * 
  * {
  *   tid: 1,
  *   seoj: "013001",
  *   deoj: "05FF01",
  *   esv: "SETGET_RES",
  *   opc: 1,
  *   props: [
  *     {
  *       epc: "80",
  *       pdc: 1,
  *       edt: {...}
  *     }
  *   ],
  *   opc2: 1,
  *   props2: [
  *     {
  *       epc: "80",
  *       pdc: 1,
  *       edt: {...}
  *     }
  *   ]
  * }
  * ---------------------------------------------------------------- */
  parse(buf) {
    if (!this._esv_code_name_map) {
      this._esv_code_name_map = {};
      for (let [k, v] of Object.entries(this._esv_name_code_map)) {
        let hex = Buffer.from([v]).toString('hex').toUpperCase();
        this._esv_code_name_map[hex] = k;
      }
    }

    let data = {};

    // パケットのサイズをチェック
    if (buf.length < 12) {
      return null;
    }

    // EHD1
    let ehd1_buf = buf.slice(0, 1);
    let ehd1_value = ehd1_buf.readUInt8(0);
    if (ehd1_value !== 0b00010000) {
      return null;
    }

    // EHD2
    let ehd2_buf = buf.slice(1, 2);
    let ehd2_value = ehd2_buf.readUInt8(0);
    if (ehd2_value !== 0x81) {
      return null;
    }

    // TID
    let tid_buf = buf.slice(2, 4);
    data.tid = tid_buf.readUInt16BE(0);

    // SEOJ
    let seoj_buf = buf.slice(4, 7);
    data.seoj = seoj_buf.toString('hex').toUpperCase();

    // DEOJ
    let deoj_buf = buf.slice(7, 10);
    data.deoj = deoj_buf.toString('hex').toUpperCase();

    // ESV
    let esv_buf = buf.slice(10, 11);
    let esv_hex = esv_buf.toString('hex').toUpperCase();
    if (!this._esv_code_name_map[esv_hex]) {
      return null;
    }
    data.esv = this._esv_code_name_map[esv_hex];

    // EDT パースの対象となる EOJ を判定 (SEOJ か DEOJ)
    let edt_parse_target_eoj = data.seoj;
    if (/^6/.test(esv_hex)) { // 要求系の ESV
      edt_parse_target_eoj = data.deoj;
    }

    // OPC とプロパティ
    let pparsed = this._parseOpcProps(buf.slice(11), edt_parse_target_eoj);
    if (!pparsed) {
      return null;
    }
    data.opc = pparsed.opc;
    data.props = pparsed.props;


    // ESV が SetGet 系なら追加の Buffer が残っているはず
    if (pparsed.remain_buf) {
      if (/^(6E|7E|5E)$/.test(esv_hex)) {
        let pparsed2 = this._parseOpcProps(pparsed.remain_buf, edt_parse_target_eoj);
        if (!pparsed2) {
          return null;
        }
        data.opc2 = pparsed2.opc;
        data.props2 = pparsed2.props;
      }
    }

    return data;
  }

  _parseOpcProps(buf, edt_parse_target_eoj) {
    let data = {
      opc: 0,
      props: [],
      remain: null
    };

    // OPC
    let opc_buf = buf.slice(0, 1);
    let opc_value = opc_buf.readUInt8(0);
    data.opc = opc_value;

    let offset = 1;
    let fail = false;

    for (let i = 0; i < opc_value; i++) {
      // EPC
      if (buf.length < offset + 1) {
        fail = true;
        break;
      }
      let epc_buf = buf.slice(offset, offset + 1);
      let epc_hex = epc_buf.toString('hex').toUpperCase();
      offset += 1;

      // PDC
      if (buf.length < offset + 1) {
        fail = true;
        break;
      }

      let pdc_buf = buf.slice(offset, offset + 1);
      let pdc_value = pdc_buf.readUInt8(0);
      offset += 1;
      if (buf.length < offset + pdc_value) {
        fail = true;
        break;
      }

      // EDT
      let edt_buf = null;
      if (pdc_value > 0) {
        edt_buf = buf.slice(offset, offset + pdc_value);
        offset += pdc_value;
      }
      data.props.push({
        epc: epc_hex,
        pdc: pdc_value,
        edt: mEdtParser.parse(edt_parse_target_eoj, epc_hex, edt_buf)
      });
    }

    if (fail) {
      return null;
    }

    if (buf.length > offset) {
      data.remain = buf.slice(offset);
    }

    return data;
  }

  /* ------------------------------------------------------------------
  * compose(packet)
  * - ECHONET Lite パケットを表す Buffer オブジェクトを生成
  * 
  * [引数]
  * - packet   | Object  | Required |
  *   - tid    | Integer | Required | TID
  *   - seoj   | String  | Required | 16進数文字列 (例: "013001")
  *   - deoj   | String  | Required | 16進数文字列 (例: "05FF01")
  *   - esv    | String  | Required | ESV キーワード (例: "GET_RES")
  *   - props  | Array   | Required | プロパティのリスト
  *     - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  *     - edt  | Buffer  | Optional | EDT を表す Buffer オブジェクト
  *            | String  |          | または 16 進数文字列
  *   - props2 | Array   | *1       | プロパティのリスト
  *     - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  *     - edt  | Buffer  | Optional | EDT を表す Buffer オブジェクト
  *            | String  |          | または 16 進数文字列
  * 
  * *1 props2 は ESV が SETGET または SETGET_RES の場合のみ必須
  * 
  * [戻値]
  * - 生成に失敗したら Exception を throw する
  * - 生成に成功したら Buffer オブジェクトを返す
  * ---------------------------------------------------------------- */
  compose(packet) {
    let buf_list = [];

    // EHD1, EHD2
    let ehd_buf = Buffer.from([0x10, 0x81]);
    buf_list.push(ehd_buf);

    // TID
    let tid = packet.tid;
    if (typeof (tid) !== 'number' || tid % 1 !== 0) {
      throw new Error('The `tid` must be an integer.');
    } else if (tid < 0 || tid > 0xffff) {
      throw new Error('The `tid` must be an integer between 0 and 0xffff.');
    }
    let tid_buf = Buffer.alloc(2);
    tid_buf.writeUInt16BE(tid, 0);
    buf_list.push(tid_buf);

    // SEOJ
    let seoj = packet.seoj;
    if (!seoj || typeof (seoj) !== 'string' || !/^[a-fA-F0-9]{6}$/.test(seoj)) {
      throw new Error('The `seoj` is invalid.');
    }
    let seoj_buf = mControllerUtils.convHexToBuffer(seoj);
    buf_list.push(seoj_buf);

    // DEOJ
    let deoj = packet.deoj;
    if (!deoj || typeof (deoj) !== 'string' || !/^[a-fA-F0-9]{6}$/.test(deoj)) {
      throw new Error('The `deoj` is invalid.');
    }
    let deoj_buf = mControllerUtils.convHexToBuffer(deoj);
    buf_list.push(deoj_buf);

    // ESV
    let esv_name = packet.esv;
    let esv = 0;
    if (typeof (esv_name) === 'string') {
      esv_name = esv_name.toUpperCase();
      if (this._esv_name_code_map[esv_name]) {
        esv = this._esv_name_code_map[esv_name];
      } else {
        throw new Error('The `esv` is unknown.');
      }
    } else {
      throw new Error('The `esv` must be a keyword representing an ESV.');
    }
    let esv_buf = Buffer.from([esv]);
    buf_list.push(esv_buf);

    // OPC とプロパティ (ESV が SETGET_SNA の場合)
    if (esv_name === 'SETGET_SNA') {
      let opc_buf = Buffer.from([0x00, 0x00]);
      buf_list.push(opc_buf);
      let buf = Buffer.concat(buf_list);
      return buf;
    }

    // OPC とプロパティ (ESV が SETGET_SNA でない場合)
    let props = packet.props;
    if (!props || !Array.isArray(props) || props.length === 0) {
      throw new Error('The `props` is invalid.');
    }
    let props_list = [props];

    if (/^(SETGET|SETGET_RES)$/.test(esv_name)) {
      let props2 = packet.props2;
      if (!props2 || !Array.isArray(props2) || props2.length === 0) {
        throw new Error('The `props2` is invalid.');
      }
      props_list.push(props2);
    }

    props_list.forEach((props) => {
      let opc_buf = Buffer.from([props.length]);
      buf_list.push(opc_buf);

      props.forEach((prop) => {
        let epc = prop.epc;
        if (typeof (epc) !== 'string' || !/^[0-9A-Fa-f]{2}$/.test(epc)) {
          throw new Error('The `epc` is invalid.');
        }
        let epc_buf = mControllerUtils.convHexToBuffer(epc);
        if (!epc_buf) {
          throw new Error('The `epc` is invalid.');
        }
        buf_list.push(epc_buf);

        let edt_buf = null;
        if (prop.edt) {
          edt_buf = prop.edt;
          if (typeof(edt_buf) === 'string') {
            edt_buf = mControllerUtils.convHexToBuffer(prop.edt);
          }
          if(!Buffer.isBuffer(edt_buf)) {
            throw new Error('The `edt` is invalid.');
          }
        }
        if (edt_buf) {
          let pdc_buf = Buffer.from([edt_buf.length]);
          buf_list.push(pdc_buf, edt_buf);
        } else {
          let pdc_buf = Buffer.from([0x00]);
          buf_list.push(pdc_buf);
        }
      });
    });

    let buf = Buffer.concat(buf_list);
    return buf;
  }

};

module.exports = ControllerPacket;
