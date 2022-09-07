/* ------------------------------------------------------------------
* hemscontroller - controller/controller.js
* Date: 2021-03-07
* 
* - ECHONET Lite コントローラー
* ---------------------------------------------------------------- */
'use strict';
const mControllerNet = require('./controller-net.js');
const mControllerObjects = require('./controller-objects.js');
const mControllerUtils = require('./controller-utils.js');

class Controller {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - conf                    | Object  | Required | 設定情報を格納したオブジェクト
  *   - data_dir_path         | String  | Required | 各種データ保存ディレクトリのパス
  *   - join_multicast        | Boolean | Required | マルチキャストグループにジョインするかどうかのフラグ
  *   - el_manufacturer_code  | String  | Required | ECHONET Lite メーカーコード (EPC: 0x8A)
  *                           |         |          | 16 進数文字列 6 桁 (3 バイト分)
  *   - el_facility_code      | String  | Required | ECHONET Lite 事業場コード (EPC: 0x8B)
  *                           |         |          | 16 進数文字列 6 桁 (3 バイト分)
  *   - el_product_code       | String  | Required | ECHONET Lite 商品コード (EPC: 0x8C)
  *                           |         |          | 半角英数字および記号で 12 文字まで
  *   - el_production_number  | String  | Required | ECHONET Lite 製造番号 (EPC: 0x8D)
  *                           |         |          | 半角英数字および記号で 12 文字まで
  *   - el_production_date    | String  | Required | ECHONET Lite 製造年月日 (EPC: 0x8E)
  *                           |         |          | YYYY-MM-DD 形式
  * ---------------------------------------------------------------- */
  constructor(conf) {
    // conf のチェック
    if (!conf || typeof (conf) !== 'object') {
      throw new Error('The `conf` is invalid.');
    }

    // 各種データ保存ディレクトリのパス
    this._data_dir_path = conf.data_dir_path;
    // 機器発見用のマルチキャストパケット送信間隔 (秒)
    this._EL_DISCOVERY_INTERVAL = 300;
    // 発見済み機器の死活監視の間隔 (秒)
    this._EL_MONITORING_INTERVAL = 120;
    // 発見済み機器の死活監視失敗回数上限
    this._EL_MONITORING_FAIL_LIMIT = 3;
    // 機器発見処理のタイマー
    this._el_discovery_timer = null;

    // 関連モジュールのインスタンス
    this._objects = new mControllerObjects(conf);
    this._net = new mControllerNet(conf);

    // ---------------------------------------------------------
    // リモートデバイス
    //    {
    //      "FE00000860F189BF5F4B00000000000000": {
    //        "address": "192.168.11.16",
    //        "id": "FE00000860F189BF5F4B00000000000000",
    //        "timestamp": 1577080700569, // 最後にパケットを受信した時間 (Date.now() の値)
    //        "fail": 0, // 死活監視で失敗した回数 (3 回失敗すると削除される)
    //        "instances": {
    //          "0EF001": {
    //            "eoj": "0EF001",
    //            "version": "1.10",
    //            "manufacturer_code": "000008",
    //            "product_code": "",
    //            "production_number": "",
    //            "inf_property_map": ["80","D5"],
    //            "set_property_map": ["BF"],
    //            "get_property_map": ["80", "82", ..., "D7"]
    //          },
    //          "013001": {
    //            "eoj": "013001",
    //            "version": "C",
    //            "manufacturer_code": "000008",
    //            "product_code": "",
    //            "production_number": "",
    //            "inf_property_map": ["80","81", ..., "B0"],
    //            "set_property_map": ["80", "81", ..., "C4"],
    //            "get_property_map": ["80", "81", ..., "C4"]
    //          }
    //        }
    //      },
    //      ...
    //    }
    // ---------------------------------------------------------
    this._remote_devices = {};

    // 調査中のリモートデバイス (キーは IP アドレス、値は true 固定)
    this._investigating_remote_devices = {};

    // -----------------------------------
    // パブリックなプロパティ
    // -----------------------------------

    // ECHONET Lite パケット送受信イベントハンドラ
    // - 主にデバッグ用
    this.onrecv = () => { }; // パケット受信イベントハンドラ
    this.onsent = () => { }; // パケット送信イベントハンドラ
    this.oninf = () => { }; // INF パケット受信イベントハンドラ

    // デバイス発見・消滅イベントハンドラ
    this.ondiscover = () => { };
    this.ondisappear = () => { };

    // 死活監視イベントハンドラ
    this.onalive = () => { };
    this.ondead = () => { };


    // ESV の 16 進数と意味の対応
    this._esv_code_name_map = {
      '60': 'SETI',
      '61': 'SETC',
      '62': 'GET',
      '63': 'INF_REQ',
      '6E': 'SETGET',
      '71': 'SET_RES',
      '72': 'GET_RES',
      '73': 'INF',
      '74': 'INFC',
      '7A': 'INFC_RES',
      '7E': 'SETGET_RES',
      '50': 'SETI_SNA',
      '51': 'SETC_SNA',
      '52': 'GET_SNA',
      '53': 'INF_SNA',
      '5E': 'SETGET_SNA'
    };
  }

  /* ------------------------------------------------------------------
  * refresh()
  * - 認識済みのデバイス情報をクリアして、デバイス発見用にマルチキャスト
  *   パケットを送信する
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  refresh() {
    this._remote_devices = {};
    this._investigating_remote_devices = {};
    this._sendDiscoveryPacket();
  }

  /* ------------------------------------------------------------------
  * start()
  * - ECHONET Lite コントローラーを起動
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない
  * ---------------------------------------------------------------- */
  start() {
    return new Promise((resolve, reject) => {
      // UDP を初期化
      this._net.init().then(() => {
        // ECHONET パケット受信イベントハンドラをセット
        this._net.onrecv = this._recvElPacket.bind(this);
        // ECHONET パケット送信イベントハンドラをセット
        this._net.onsent = this._sentElPacket.bind(this);
        // EPC 値を初期化
        return this._objects.init();
      }).then(() => {
        // インスタンスリスト通知 (EPC: 0xD5) の INF をマルチキャスト送信
        this._announceInstanceList();
        // 動作状態 (EPC: 0x80) の INF をマルチキャスト送信
        this._announcePowerStates();
        // 機器発見の処理を開始
        this._startDiscovery();
        // 機器死活監視を開始
        setTimeout(() => {
          this._startMonitoring();
        }, this._EL_MONITORING_INTERVAL * 1000);

        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  // 機器死活監視を開始
  _startMonitoring() {
    // 発見済みデバイスのうち、しばらくパケットを受信していないものを抽出
    let now = Date.now();
    let dev_list = [];
    for (let [id, dev] of Object.entries(this._remote_devices)) {
      if (now - dev.timestamp > this._EL_MONITORING_INTERVAL * 1000) {
        dev_list.push({
          id: id,
          address: dev.address
        });
      }
    }
    if (dev_list.length > 0) {
      let checkDevice = (callback) => {
        let dev = dev_list.shift();
        if (!dev) {
          callback();
          return;
        }
        this._checkDeviceHealth(dev.address, dev.id).then(() => {
          checkDevice(callback);
        }).catch((error) => {
          console.error(error);
          checkDevice(callback);
        });
      };
      checkDevice(() => {
        setTimeout(() => {
          this._startMonitoring();
        }, this._EL_MONITORING_INTERVAL * 1000);
      });
    } else {
      setTimeout(() => {
        this._startMonitoring();
      }, this._EL_MONITORING_INTERVAL * 1000);
    }
  }

  _checkDeviceHealth(address, id) {
    return new Promise((resolve, reject) => {
      let dev = this._remote_devices[id];

      // 応答がなかった場合の処理
      let failHealthCheck = (id) => {
        dev.fail++;
        this.ondead(JSON.parse(JSON.stringify(dev)));
        if (dev.fail >= this._EL_MONITORING_FAIL_LIMIT) {
          this.ondisappear(dev);
          delete this._remote_devices[id];
        }
      };

      // 識別番号 (EPC: 0x83) を取得
      this._requestRemoteDeviceEpcData(address, '0EF001', '83').then((res) => {
        if (res && res.id && res.id === id) {
          dev.fail = 0;
          this.onalive(JSON.parse(JSON.stringify(dev)));
        } else {
          failHealthCheck(id);
        }
        resolve();
      }).catch((error) => {
        failHealthCheck(id);
        resolve();
      });
    });
  }

  // 機器発見の処理を開始
  _startDiscovery() {
    if (this._el_discovery_timer) {
      clearInterval(this._el_discovery_timer);
      this._el_discovery_timer = null;
    }

    // 最初の 3 回は 10 秒おきに機器発見用のパケットを送信
    let cnt = 0;
    this._el_discovery_timer = setInterval(() => {
      this._sendDiscoveryPacket();
      cnt++;
      if (cnt === 3) {
        if (this._el_discovery_timer) {
          clearInterval(this._el_discovery_timer);
          this._el_discovery_timer = null;
        }
        // 以降は設定ファイルに指定した間隔で機器発見用のパケットを送信
        this._el_discovery_timer = setInterval(() => {
          this._sendDiscoveryPacket();
        }, this._EL_DISCOVERY_INTERVAL * 1000);
      }
    }, 10000);

  }

  // 機器発見のためのマルチキャストパケットを送信
  // - ノードプロファイルに対して自ノードインスタンスリストS (EPC: 0xD6) 
  //   を取得のために ESV: Get をマルチキャストで送信
  _sendDiscoveryPacket() {
    let packet = {
      seoj: '05FF01',
      deoj: '0EF001',
      esv: 'GET',
      props: [{
        epc: 'D6',
        edt: null
      }]
    };

    this._net.send(null, packet).then(() => {
      // Do nothing
    }).catch((error) => {
      console.error(error);
    });
  }

  // インスタンスリスト通知 (EPC: 0xD5) の INF をマルチキャスト送信
  _announceInstanceList() {
    this._sendElAutonomousInfPacket({
      seoj: '0EF001',
      props: [{
        epc: 'D5',
        edt: this._objects.getEdtHex('0EF001', 'D5', true)
      }]
    });
  }

  // 動作状態 (EPC: 0x80) の INF をマルチキャスト送信
  _announcePowerStates() {
    let eoj_list = this._objects.getEojListForPowerStatusInf();
    eoj_list.forEach((eoj) => {
      this._sendElAutonomousInfPacket({
        seoj: eoj,
        props: [{
          epc: '80',
          edt: this._objects.getEdtHex(eoj, '80', true)
        }]
      });
    });
  }

  // ECHONET Lite 自発的 INF パケットをマルチキャスト送信
  _sendElAutonomousInfPacket(data) {
    let seoj = data.seoj;
    let props = data.props;

    let packet = {
      seoj: seoj,
      deoj: '0EF001',
      esv: 'INF',
      props: props
    };

    this._net.send(null, packet).then(() => {
      // Do nothing
    }).catch((error) => {
      console.error(error);
    });
  }

  // ECHONET パケットを送信したときの処理
  _sentElPacket(data) {
    // パケット送信イベントハンドラを実行
    this.onsent(JSON.parse(JSON.stringify(data)));
  }

  // ECHONET パケットを受信したときの処理
  _recvElPacket(data) {
    // EDT の 16 進数文字列から Buffer を生成
    for (let prop of data.packet.props) {
      if (prop.edt) {
        prop.edt.buffer = mControllerUtils.convHexToBuffer(prop.edt.hex);
      }
    }

    if (data.packet.props2) {
      for (let prop of data.packet.props2) {
        if (prop.edt) {
          prop.edt.buffer = mControllerUtils.convHexToBuffer(prop.edt.hex);
        }
      }
    }

    // パケット受信イベントハンドラを実行
    this.onrecv(data);

    // INF パケット受信イベントハンドラを実行
    let esv = data.packet.esv;
    if (esv === 'INF') {
      this.oninf(data);
    }

    // 自分自身の EOJ 宛のリクエストなら処理する
    let eoj = this._objects.getTargetEoj(data.packet.deoj);
    if (eoj) {
      if (esv === 'SETI') { // SetI 書き込み要求：応答不要
        this._recvElPacketSetI(eoj, data);
      } else if (esv === 'SETC') { // SetC 書き込み要求：応答要
        this._recvElPacketSetC(eoj, data);
      } else if (esv === 'GET') { // Get 読み出し要求
        this._recvElPacketGet(eoj, data);
      } else if (esv === 'INF_REQ') { // INF_REQ 通知要求
        this._recvElPacketInfReq(eoj, data);
      } else if (esv === 'SETGET') { // SetGet 書き込み・読み出し要求
        this._recvElPacketSetGet(eoj, data);
      } else if (esv === 'INFC') { // INFC 通知：応答要
        this._recvElPacketInfC(eoj, data);
      }
    }

    // 新リモートデバイスの調査
    this._investigateNewRemoteDevice(data);

  }

  // ECHONET パケットを受信したときの処理 (SetI 書き込み要求：応答不要)
  _recvElPacketSetI(eoj, data) {
    this._saveEdts(eoj, data.packet.props).then((res) => {
      if (res.fail === 0) {
        return;
      }

      let rpacket = {
        tid: data.packet.tid,
        seoj: eoj,
        deoj: data.packet.seoj,
        esv: 'SETI_SNA',
        props: res.props_ng
      };

      // レスポンスを送信
      this._net.send(data.address, rpacket).then(() => {
        // Do nothing
      }).catch((error) => {
        console.error(error);
      });
    }).catch((error) => {
      console.error(error);
    });
  }

  // ECHONET パケットを受信したときの処理 (SetC 書き込み要求：応答要)
  _recvElPacketSetC(eoj, data) {
    this._saveEdts(eoj, data.packet.props).then((res) => {
      let rpacket = {
        tid: data.packet.tid,
        seoj: eoj,
        deoj: data.packet.seoj,
        esv: '',
        props: []
      };

      if (res.fail === 0) {
        rpacket.esv = 'SET_RES';
        rpacket.props = res.props_ok;
      } else {
        rpacket.esv = 'SETC_SNA';
        rpacket.props = res.props_ng;
      }

      this._net.send(data.address, rpacket).then(() => {
        // Do nothing
      }).catch((error) => {
        console.error(error);
      });
    }).catch((error) => {
      console.error(error);
    });
  }

  _saveEdts(eoj, props) {
    return new Promise((resolve, reject) => {
      // すべて保存が完了した場合 (Set_Res) の props
      let props_ok = [];
      // 1 つでも保存が失敗した場合 (SetC_SNA) の props
      let props_ng = [];

      // リクエストのプロパティ情報リスト
      let props_req = JSON.parse(JSON.stringify(props));

      // EDT 保存処理
      let saveEdt = (callback) => {
        let prop = props_req.shift();
        if (!prop) {
          callback();
          return;
        }
        // EPC のアクセスルールをチェックして EDT をセットする
        let epc = prop.epc;
        let edt = prop.edt;
        if (this._objects.checkRule(eoj, prop.epc, 'set')) {
          // アクセスルール set が許可されている場合
          let setres = this._objects.setEdt(eoj, epc, edt);
          if (setres.result) {
            if (setres.changed) {
              // EDT に変化があった場合
              // Lite 自発的 INF パケットをマルチキャスト
              this._sendElAutonomousInfPacket({
                seoj: eoj,
                props: { epc: epc, edt: edt }
              });
              // - EDT を保存する
              this._objects.save().then(() => {
                props_ok.push({ epc: epc, edt: null });
                saveEdt(callback);
              }).catch((error) => {
                props_ng.push({ epc: epc, edt: edt });
                fail++;
                saveEdt(callback);
              });
            } else {
              // EDT に変化がなかった場合
              props_ok.push({ epc: epc, edt: null });
              saveEdt(callback);
            }
          } else {
            props_ng.push({ epc: epc, edt: edt });
            fail++;
            saveEdt(callback);
          }
        } else {
          // アクセスルール set が許可されていない場合
          props_ng.push({ epc: epc, edt: edt });
          fail++;
          saveEdt(callback);
        }
      };

      saveEdt(() => {
        resolve({
          fail: fail,
          props_ok: props_ok,
          props_ng: props_ng
        });
      });
    });
  }

  // ECHONET パケットを受信したときの処理 (Get 読み出し要求)
  _recvElPacketGet(eoj, data) {
    let rpacket = {
      tid: data.packet.tid,
      seoj: eoj,
      deoj: data.packet.seoj,
      esv: 'GET_RES',
      props: []
    };

    let res = this._getEdts(eoj, data.packet.props);
    rpacket.props = res.props;
    if (res.fail > 0) {
      rpacket.esv = 'GET_SNA';
    }

    // レスポンスを送信
    this._net.send(data.address, rpacket).then(() => {
      // Do nothing
    }).catch((error) => {
      console.error(error);
    });
  }

  _getEdts(eoj, props) {
    let fail = 0;
    let props_res = [];

    props.forEach((prop) => {
      // EPC のアクセスルールをチェックして EDT を読み取る
      let edt_hex = null;
      if (this._objects.checkRule(eoj, prop.epc, 'get')) {
        edt_hex = this._objects.getEdtHex(eoj, prop.epc);
        if (edt_hex === null) {
          fail++;
        }
      } else {
        fail++;
      }
      props_res.push({
        epc: prop.epc,
        edt: edt_hex
      });
    });

    return {
      fail: fail,
      props: props_res
    };
  }


  // ECHONET パケットを受信したときの処理 (INF_REQ 通知要求)
  _recvElPacketInfReq(eoj, data) {
    let rpacket = {
      tid: data.packet.tid,
      seoj: eoj,
      deoj: data.packet.seoj,
      esv: 'INF',
      props: []
    };

    let res = this._getEdts(eoj, data.packet.props);
    rpacket.props = res.props;
    if (res.fail > 0) {
      rpacket.esv = 'GET_SNA';
    }

    // INF の場合はマルチキャスト返す
    let dest_addr = null;
    // INF_SNA の場合はユニキャストで返す
    if (res.fail > 0) {
      dest_addr = data.address;
      rpacket.esv = 'INF_SNA';
    }

    // レスポンスを送信
    this._net.send(dest_addr, rpacket).then(() => {
      // Do nothing
    }).catch((error) => {
      console.error(error);
    });
  }

  // ECHONET パケットを受信したときの処理 (SetGet 書き込み・読み出し要求)
  _recvElPacketSetGet(eoj, data) {
    let rpacket = {
      tid: data.packet.tid,
      seoj: eoj,
      deoj: data.packet.seoj,
      esv: 'SETGET_RES',
      props: [],
      props2: []
    };

    // Get
    let res_get = this._getEdts(eoj, data.packet.props);
    rpacket.props2 = res_get.props;

    // Set
    this._saveEdts(eoj, data.packet.props).then((res_set) => {
      if (res_set.fail === 0) {
        rpacket.props = res_set.props_ok;
      } else {
        rpacket.props = res_set.props_ng;
      }

      // 失敗の評価
      if (res_get.fail > 0 || res_set.fail > 0) {
        rpacket.esv = 'SETGET_SNA';
      }

      // レスポンスを送信
      this._net.send(data.address, rpacket).then(() => {
        // Do nothing
      }).catch((error) => {
        console.error(error);
      });
    }).catch((error) => {
      console.error(error);
    });
  }

  // ECHONET パケットを受信したときの処理 (INFC 通知：応答要)
  _recvElPacketInfC(eoj, data) {
    let rpacket = {
      tid: data.packet.tid,
      seoj: eoj,
      deoj: data.packet.seoj,
      esv: 'INFC_RES',
      props: []
    };

    data.packet.props.forEach((prop) => {
      rpacket.props.push({
        epc: prop.epc,
        edt: null
      });
    });

    // レスポンスを送信
    this._net.send(data.address, rpacket).then(() => {
      // Do nothing
    }).catch((error) => {
      console.error(error);
    });
  }

  // 新リモートデバイスの調査
  _investigateNewRemoteDevice(data) {
    let address = data.address;
    // 調査中の IP アドレスなら終了
    if (this._investigating_remote_devices[address]) {
      return;
    }
    // 既知の IP アドレスなら timestamp を更新して終了
    let known_address = false;
    for (let [id, dev] of Object.entries(this._remote_devices)) {
      if (dev.address === address) {
        known_address = true;
        dev.timestamp = Date.now();
        break;
      }
    }
    if (known_address) {
      return;
    }
    // ESV をチェック
    if (!/^(GET_RES|GET_SNA|INF)$/.test(data.packet.esv)) {
      return;
    }
    // EPC をチェック
    // - インスタンスリスト通知 (0xD5) または 自ノードインスタンスリスト S (0xD6)
    // - ノードプロファイルの EOJ は含まれない
    let instance_list = null;
    data.packet.props.forEach((prop) => {
      if (prop.epc === 'D5' || prop.epc === 'D6') {
        if (prop.edt && prop.edt.data && prop.edt.data.list) {
          instance_list = prop.edt.data.list;
        }
      }
    });
    if (!instance_list) {
      return;
    }

    // ノードプロファイルの EOJ をリストに追加
    let node_profile_eoj = data.packet.seoj; // "0EF001" のはず
    instance_list.unshift(node_profile_eoj);

    let instances = {};
    instance_list.forEach((eoj) => {
      instances[eoj] = {
        eoj: eoj
      };
    });

    let dinfo = {
      address: address,
      id: '',
      timestamp: 0,
      fail: 0,
      instances: instances
    };
    this._investigating_remote_devices[address] = true;

    // ノードプロファイルから識別番号を取得
    this._requestRemoteDeviceEpcData(address, node_profile_eoj, '83').then((res) => {
      if (!res || !res.id) {
        throw new Error('');
      }
      let id = res.id;
      // 既知のデバイスの中に同じ識別番号を持ったものがないかをチェック
      if (this._remote_devices[id]) {
        // 存在したら IP アドレスが変わったということ。
        // IP アドレスを付け替えて終了する
        this.ondisappear(JSON.parse(JSON.stringify(this._remote_devices[id])));
        this._remote_devices[id].address = address;
        delete this._investigating_remote_devices[address];
        this.ondisappear(JSON.parse(JSON.stringify(this._remote_devices[id])));
        this.ondiscover(JSON.parse(JSON.stringify(this._remote_devices[id])));
        throw new Error('');
      }
      dinfo.id = id;
      // リモートデバイスの各種情報を収集
      return this._requestRemoteDeviceInfo(address, instance_list);
    }).then((res) => {
      Object.keys(instances).forEach((eoj) => {
        if (res[eoj]) {
          for (let [name, val] of Object.entries(res[eoj])) {
            instances[eoj][name] = val;
          }
        }
      });
      delete this._investigating_remote_devices[address];
      dinfo.timestamp = Date.now();
      this._remote_devices[dinfo.id] = dinfo;
      this.ondiscover(JSON.parse(JSON.stringify(dinfo)));
    }).catch((error) => {
      if (error.message) {
        console.error(error);
      }
      delete this._investigating_remote_devices[address];
    });
  }

  // リモートデバイスの EPC データ (EDT) を取得
  _requestRemoteDeviceEpcData(address, eoj, epc) {
    return new Promise((resolve, reject) => {
      let packet = {
        seoj: '05FF01', // コントローラー
        deoj: eoj,
        esv: 'GET',
        props: [{ epc: epc, edt: null }]
      }
      this._net.request(address, packet).then((res) => {
        let edt_data = null;
        if (res.packet.esv === 'GET_RES') {
          res.packet.props.forEach((prop) => {
            if (prop.epc === epc) {
              if (prop.edt && prop.edt.data) {
                edt_data = prop.edt.data;
              }
            }
          });
        }
        // 同じデバイスに連続してリクエストすると応答がない場合がある
        // ため、少しだけウェイトを入れる
        setTimeout(() => {
          resolve(edt_data);
        }, 300);
      }).catch((error) => {
        setTimeout(() => {
          reject(error);
        }, 300);
      });
    });
  }

  // リモートデバイスの各種情報を収集 (ノードプロファイルの識別番号を除く)
  _requestRemoteDeviceInfo(address, instance_list) {
    return new Promise((resolve, reject) => {
      let ilist = JSON.parse(JSON.stringify(instance_list));
      let rdata = {};
      let getInstanceEpcs = (callback) => {
        let eoj = ilist.shift();
        if (!eoj) {
          callback();
          return;
        }
        rdata[eoj] = {
          version: '',
          manufacturer_code: '',
          product_code: '',
          production_number: '',
          inf_property_map: [],
          set_property_map: [],
          get_property_map: []
        };
        // 規格Version情報 (ノードプロファイルの場合は Version情報)
        this._requestRemoteDeviceEpcData(address, eoj, '82').then((res) => {
          if (res && res.version) {
            rdata[eoj].version = res.version;
          } else {
            throw new Error('Failed to get the standard version information (EPC: 0x82) from ' + address);
          }
          // メーカコード
          return this._requestRemoteDeviceEpcData(address, eoj, '8A');
        }).then((res) => {
          if (res && res.code) {
            rdata[eoj].manufacturer_code = res.code;
          } else {
            throw new Error('Failed to get the manufacturer code (EPC: 0x8A) from ' + address);
          }
          // 商品コード
          return this._requestRemoteDeviceEpcData(address, eoj, '8C');
        }).then((res) => {
          if (res && res.code) {
            rdata[eoj].product_code = res.code;
          }
          // 製造番号
          return this._requestRemoteDeviceEpcData(address, eoj, '8D');
        }).then((res) => {
          if (res && res.number) {
            rdata[eoj].production_number = res.number;
          }
          // 状変アナウンス (Inf) プロパティマップ
          return this._requestRemoteDeviceEpcData(address, eoj, '9D');
        }).then((res) => {
          if (res && res.list) {
            rdata[eoj].inf_property_map = res.list;
          } else {
            throw new Error('Failed to get the Status change announcement property map (EPC: 0x9D) from ' + address);
          }
          // Set プロパティマップ
          return this._requestRemoteDeviceEpcData(address, eoj, '9E');
        }).then((res) => {
          if (res && res.list) {
            rdata[eoj].set_property_map = res.list;
          } else {
            throw new Error('Failed to get the Set property map (EPC: 0x9E) from ' + address);
          }
          // Get プロパティマップ
          return this._requestRemoteDeviceEpcData(address, eoj, '9F');
        }).then((res) => {
          if (res && res.list) {
            rdata[eoj].get_property_map = res.list;
          } else {
            throw new Error('Failed to get the Get property map (EPC: 0x9F) from ' + address);
          }
          getInstanceEpcs(callback);
        }).catch((error) => {
          callback(error);
        });
      };

      getInstanceEpcs((error) => {
        if (error) {
          reject(error);
        } else {
          resolve(rdata);
        }
      });
    });
  }

  /* ------------------------------------------------------------------
  * getDevices()
  * - 発見済みデバイスを返す
  * 
  * [引数]
  * - なし
  * 
  * [戻値]
  * - this._remote_devices の内容をそのまま返す
  * ---------------------------------------------------------------- */
  getDevices() {
    return JSON.parse(JSON.stringify(this._remote_devices));
  }

  /* ------------------------------------------------------------------
  * reqest(address, packet)
  * - 指定の IP アドレスに向けてリクエストパケットを送信してレスポンスを受ける
  * 
  * [引数]
  * - address  | String  | Required | 宛先の IPv4 アドレス
  *            |         |          | null を指定したらマルチキャスト
  * - packet   | Object  | Required |
  *   - tid    | Integer | Optional | 指定がなけれは自動採番
  *   - seoj   | String  | Required | 16進数文字列 (例: "013001")
  *   - deoj   | String  | Required | 16進数文字列 (例: "05FF01")
  *   - esv    | String  | Required | ESV キーワード (例: "GET_RES")
  *   - props  | Array   | Required | プロパティのリスト
  *     - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  *     - edt  | Buffer  | Optional | EDT を表す Buffer オブジェクト
  *            | String  |          | または16進数文字
  *   - props2 | Array   | Required | プロパティのリスト
  *     - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  *     - edt  | Buffer  | Optional | EDT を表す Buffer オブジェクト
  *            | String  |          | または16進数文字
  * 
  * - props2 は ESV が SETGET または SETGET_RES の場合のみ有効
  * 
  * [戻値]
  * - Promise オブジェクト
  * - resolve() にはレスポンスを表すパケット情報を格納したオブジェクトが
  *   引き渡される
  * ---------------------------------------------------------------- */
  request(address, packet) {
    return new Promise((resolve, reject) => {
      this._net.request(address, packet).then((res) => {
        resolve(res);
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * send(address, packet)
  * - ECHONET Lite パケットを指定の IP アドレスに向けて送信
  * 
  * [引数]
  * - address  | String  | Required | 宛先の IPv4 アドレス
  *            |         |          | null を指定したらマルチキャスト
  * - packet   | Object  | Required |
  *   - tid    | Integer | Optional | 指定がなけれは自動採番
  *   - seoj   | String  | Required | 16進数文字列 (例: "013001")
  *   - deoj   | String  | Required | 16進数文字列 (例: "05FF01")
  *   - esv    | String  | Required | ESV キーワード (例: "GET_RES")
  *   - props  | Array   | Required | プロパティのリスト
  *     - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  *     - edt  | Buffer  | Optional | EDT を表す Buffer オブジェクト
  *            | String  |          | または16進数文字列
  *   - props2 | Array   | Required | プロパティのリスト
  *     - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  *     - edt  | Buffer  | Optional | EDT を表す Buffer オブジェクト
  *            | String  |          | または16進数文字
  * 
  * - props2 は ESV が SETGET または SETGET_RES の場合のみ有効
  * 
  * [戻値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない
  * ---------------------------------------------------------------- */
  send(address, packet) {
    return new Promise((resolve, reject) => {
      this._net.send(address, packet).then(() => {
        resolve();
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * getPropertyData(id, eoj, epc)
  * - 指定の EPC のデータを取得する
  * 
  * [引数]
  * - id   | String  | Required | 機器識別番号
  * - eoj  | String  | Required | 宛先の EOJ の16進数文字列 (例: "013001")
  * - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  * 
  * [戻値]
  * - Promise オブジェクト
  * - 通信失敗、Get_Res 以外の応答の場合は reject() が呼び出される
  * - resolve() には該当の EDT の16進数文字列と Buffer オブジェクトなどを
  *   含んだオブジェクトが引き渡される
  *     { hex: '43', buffer: [Object], name: '', data: null }
  * - 本コントローラーモジュールがパース可能な EDT の場合は、name と data
  *   がセットされる
  *     { hex: '30', buffer: [Object], name: '動作状態', data: { status: true } }
  * ---------------------------------------------------------------- */
  getPropertyData(id, eoj, epc) {
    return new Promise((resolve, reject) => {
      // id をチェック
      if (!id || typeof (id) !== 'string') {
        reject(new Error('The `id` is invalid.'));
        return;
      }
      // 該当のリモートデバイスが存在するのかをチェック
      let dev = this._remote_devices[id];
      if (!dev) {
        reject(new Error('The `id` is unknown.'));
        return;
      }

      // eoj をチェック
      if (!eoj || typeof (eoj) !== 'string' || !/^[a-fA-F0-9]{6}$/.test(eoj)) {
        reject(new Error('The `eoj` is invalid.'));
        return;
      }
      eoj = eoj.toUpperCase();
      // 該当のリモートデバイスに指定のインスタンス (EOJ) が存在するのかをチェック
      let instance = dev.instances[eoj];
      if (!instance) {
        reject(new Error('The `eoj` is invalid.'));
        return;
      }

      // epc をチェック
      if (!epc || typeof (epc) !== 'string' || !/^[a-fA-F0-9]{2}$/.test(epc)) {
        reject(new Error('The `epc` is invalid.'));
        return;
      }
      epc = epc.toUpperCase();
      // EPC が該当のインスタンスの Get プロパティマップに含まれているかをチェック
      if (instance.get_property_map.indexOf(epc) < 0) {
        reject(new Error('The `epc` is not allowed to fetch the data.'));
        return;
      }

      // リクエストパケット生成
      let packet = {
        seoj: '05FF01', // コントローラー
        deoj: eoj,
        esv: 'GET',
        props: [{ epc: epc, edt: null }]
      };

      // リクエストパケット送信
      this._net.request(dev.address, packet).then((res) => {
        if (!res || !res.packet) {
          reject(new Error('The response was invalid.'));
          return;
        }
        let packet = res.packet;
        if (packet.esv !== 'GET_RES') {
          reject(new Error('The remote device returned an unexpected ESV: ' + packet.esv));
          return;
        }
        let edt = null;
        packet.props.forEach((prop) => {
          if (prop.epc === epc) {
            if (prop.edt) {
              edt = prop.edt;
            }
          }
        });
        if (edt) {
          edt.buffer = mControllerUtils.convHexToBuffer(edt.hex);
          resolve(edt);
        } else {
          reject(new Error('The property data was not found in the response.'));
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * setPropertyData(id, eoj, epc, edt)
  * - 指定の EPC のデータをセットする
  * 
  * [引数]
  * - id   | String  | Required | 機器識別番号
  * - eoj  | String  | Required | 宛先の EOJ の16進数文字列 (例: "013001")
  * - epc  | String  | Required | EPC の16進数文字列 (例: "80")
  * - edt  | Buffer  | Required | EDT を表す Buffer オブジェクト
  *        | String  |          | または16進数文字列
  * 
  * [戻値]
  * - Promise オブジェクト
  * - 通信失敗、Set_Res 以外の応答の場合は reject() が呼び出される
  * - resolve() には何も引き渡されない
  * - 通信エラー、タイムアウトの場合は reject() が呼び出される
  * ---------------------------------------------------------------- */
  setPropertyData(id, eoj, epc, edt) {
    return new Promise((resolve, reject) => {
      // id をチェック
      if (!id || typeof (id) !== 'string') {
        reject(new Error('The `id` is invalid.'));
        return;
      }
      // 該当のリモートデバイスが存在するのかをチェック
      let dev = this._remote_devices[id];
      if (!dev) {
        reject(new Error('The `id` is unknown.'));
        return;
      }

      // eoj をチェック
      if (!eoj || typeof (eoj) !== 'string' || !/^[a-fA-F0-9]{6}$/.test(eoj)) {
        reject(new Error('The `eoj` is invalid.'));
        return;
      }
      eoj = eoj.toUpperCase();
      // 該当のリモートデバイスに指定のインスタンス (EOJ) が存在するのかをチェック
      let instance = dev.instances[eoj];
      if (!instance) {
        reject(new Error('The `eoj` is invalid.'));
        return;
      }

      // epc をチェック
      if (!epc || typeof (epc) !== 'string' || !/^[a-fA-F0-9]{2}$/.test(epc)) {
        reject(new Error('The `epc` is invalid.'));
        return;
      }
      epc = epc.toUpperCase();
      // EPC が該当のインスタンスの Set プロパティマップに含まれているかをチェック
      if (instance.set_property_map.indexOf(epc) < 0) {
        reject(new Error('The `epc` is not allowed to set the data.'));
        return;
      }

      // edt をチェック
      if (edt) {
        if (typeof (edt) === 'string') {
          if (!/^[a-fA-F0-9]+$/.test(edt) || edt.length % 2 !== 0) {
            reject(new Error('The `edt` is invalid.'));
            return;
          }
        } else if (!Buffer.isBuffer(edt)) {
          reject(new Error('The `edt` is invalid.'));
          return;
        }
      } else {
        reject(new Error('The `edt` is required.'));
        return;
      }

      // リクエストパケット生成
      let packet = {
        seoj: '05FF01', // コントローラー
        deoj: eoj,
        esv: 'SETC',
        props: [{ epc: epc, edt: edt }]
      };

      // リクエストパケット送信
      this._net.request(dev.address, packet).then((res) => {
        let packet = res.packet;
        if (packet.esv === 'SET_RES') {
          resolve();
        } else {
          reject(new Error('The remote device returned an unexpected ESV: ' + packet.esv));
        }
      }).catch((error) => {
        reject(error);
      });
    });
  }

  /* ------------------------------------------------------------------
  * setPropertyDataMulti(id, eoj, props)
  * - 指定の EPC のデータをセットする
  * 
  * [引数]
  * - id      | String  | Required | 機器識別番号
  * - eoj     | String  | Required | 宛先の EOJ の16進数文字列 (例: "013001")
  * - props   | Array   | Required | epc と edt を格納したオブジェクトのリスト
  *   - epc   | String  | Required | EPC の16進数文字列 (例: "80")
  *   - edt   | Buffer  | Required | EDT を表す Buffer オブジェクト
  *           | String  |          | または16進数文字列
  * 
  * - props の例:
  *   [{ epc: 'B0', edt: '41'}, { epc: '8F', edt: '41'}]
  * 
  * [戻値]
  * - Promise オブジェクト
  * - setPropertyData() とは異なり、レスポンスの ESV が SET_RES でなくても
  *   エラーにならず、リモートデバイスから応答があれば resolve() が呼び出される
  * - resolve() には次のような Array が引き渡される
  *   [{ epc: 'B0', edt: null}, { epc: '8F', edt: '41'}]
  * - 成功した EPC の edt は null になり、失敗した EPC の edt はセット時の
  *   値のままとなる
  * ---------------------------------------------------------------- */
  setPropertyDataMulti(id, eoj, props) {
    return new Promise((resolve, reject) => {
      // id をチェック
      if (!id || typeof (id) !== 'string') {
        reject(new Error('The `id` is invalid.'));
        return;
      }
      // 該当のリモートデバイスが存在するのかをチェック
      let dev = this._remote_devices[id];
      if (!dev) {
        reject(new Error('The `id` is unknown.'));
        return;
      }

      // eoj をチェック
      if (!eoj || typeof (eoj) !== 'string' || !/^[a-fA-F0-9]{6}$/.test(eoj)) {
        reject(new Error('The `eoj` is invalid.'));
        return;
      }
      eoj = eoj.toUpperCase();
      // 該当のリモートデバイスに指定のインスタンス (EOJ) が存在するのかをチェック
      let instance = dev.instances[eoj];
      if (!instance) {
        reject(new Error('The `eoj` is invalid.'));
        return;
      }

      // props をチェック
      if (!props || !Array.isArray(props)) {
        reject(new Error('The `props` must be an Array object.'));
        return;
      }
      if (props.length === 0) {
        reject(new Error('The `props` must have at least one element.'));
        return;
      }
      let e = null;
      let rprops = {};
      for (let i = 0; i < props.length; i++) {
        let prop = props[i];
        if (typeof (prop) !== 'object') {
          e = new Error('The `props` have an invalid element.');
          break;
        }
        let epc = prop.epc;
        let edt = prop.edt;

        // epc をチェック
        if (!epc || typeof (epc) !== 'string' || !/^[a-fA-F0-9]{2}$/.test(epc)) {
          e = new Error('The `epc` is invalid.');
          break;
        }
        epc = epc.toUpperCase();
        // EPC が該当のインスタンスの Set プロパティマップに含まれているかをチェック
        if (instance.set_property_map.indexOf(epc) < 0) {
          e = new Error('The `epc` is not allowed to set the data.');
          break;
        }

        // edt をチェック
        if (edt) {
          if (typeof (edt) === 'string') {
            if (!/^[a-fA-F0-9]+$/.test(edt) || edt.length % 2 !== 0) {
              e = new Error('The `edt` is invalid.');
              break;
            }
          } else if (!Buffer.isBuffer(edt)) {
            e = new Error('The `edt` is invalid.');
            break;
          }
        } else {
          e = new Error('The `edt` is required.');
          break;
        }

        rprops[epc] = edt;
      }
      if (e) {
        reject(e);
        return;
      }

      // リクエストパケット生成
      let packet = {
        seoj: '05FF01', // コントローラー
        deoj: eoj,
        esv: 'SETC',
        props: props
      };

      // リクエストパケット送信
      this._net.request(dev.address, packet).then((res) => {
        let list = [];
        res.packet.props.forEach((prop) => {
          if (prop.edt) {
            list.push({ epc: prop.epc, edt: rprops[epc] });
          } else {
            list.push({ epc: prop.epc, edt: null });
          }
        });
        resolve(list);
      }).catch((error) => {
        reject(error);
      });
    });
  }
};

module.exports = Controller;
