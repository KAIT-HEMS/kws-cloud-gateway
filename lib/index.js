/* ------------------------------------------------------------------
* cloud-gateway - index.js
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mPath = require('path');
const mCrypto = require('crypto');

const WebSocketClient = require('websocket').client;
const mHttp = require('http');
const mExpress = require('express');
const mSession = require('express-session');
const mSessionFileStore = require('session-file-store')(mSession);
const mBodyParser = require('body-parser');
const mCookieParser = require('cookie-parser');
const mHttpErrors = require('http-errors');

const mDebug = require('./debug.js');
const mController = require('./controller/controller.js');
const mHttpAdmin = require(mPath.resolve(__dirname, 'http-admin.js'));
const mLogger = require(mPath.resolve(__dirname, 'api-logger.js'));
const mUconfManager = require(mPath.resolve(__dirname, 'uconf-manager.js'));
const mDeviceManager = require('./device-manager.js');

class Index {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * 
  * [引数]
  * - params     | Object | Required |
  *   - base_dir | String | Required | ベースディレクトリパス
  *   - version  | String | Required | hemscontroller のバージョン
  * ---------------------------------------------------------------- */
  constructor(params) {
    this._base_dir = params.base_dir;
    this._version = params.version;
    this._debug = null; // HemsControllerDebug オブジェクト
    this._uconf_manager = null; // UconfManager オブジェクト

    // 設定ファイルのロード
    this._conf = require(mPath.join(this._base_dir, 'etc', 'config.js'));

    // データ保存ディレクトリパスを設定情報に追加
    this._conf.el_controler.data_dir_path = mPath.join(__dirname, '..', 'etc');

    // ECHONET コントローラー
    this._controller = null;

    // ------------------------------------------------------
    // 発見した ECHONET Lite デバイス情報
    //  this._devices = {
    //   "FE00000860F189BF5F4B00000000000000": {
    //     "address": "192.168.11.16",
    //     "id": "FE00000860F189BF5F4B00000000000000",
    //     "instances": {
    //       "0EF001": {
    //         "eoj": "0EF001",
    //         "version": "1.10",
    //         "manufacturer_code": "000008",
    //         "product_code": "",
    //         "production_number": "",
    //         "set_property_map": ["BF"],
    //         "get_property_map": ["80", "82", ..., "D7"]
    //       },
    //       "013001": {
    //         "eoj": "013001",
    //         "version": "C",
    //         "manufacturer_code": "000008",
    //         "product_code": "",
    //         "production_number": "",
    //         "set_property_map": ["80", "81", ..., "C4"],
    //         "get_property_map": ["80", "81", ..., "C4"]
    //       }
    //     }
    //   },
    //   ...
    // }
    // ------------------------------------------------------
    this._devices = {};

    // ------------------------------------------------------
    // 管理メニューで登録済みのデバイス情報
    // {
    //   "FE000008E84F25C878A000000000000000": {
    //     "id": "FE000008E84F25C878A000000000000000",
    //     "address": "192.168.11.6",
    //     "permission": { "get": true, "set": true },
    //     "instances": {
    //       "0EF001": {
    //         ...
    //       },
    //       "013001": {
    //         "eoj": "013001",
    //         "version": "J",
    //         "manufacturer": {
    //           "code": "000008",
    //           "name": { "ja": "ダイキン工業株式会社", "en": "DAIKIN INDUSTRIES" }
    //         },
    //         "deviceclass": {
    //           "code": "0130",
    //           "name": { "ja": "家庭用エアコン", "en": "Home air conditioner" }
    //         }
    //       }
    //     }
    //   },
    //   ...
    // }
    // ------------------------------------------------------
    this._registered_devices = {};

    // ------------------------------------------------------
    // クラウド Gateway のオンライン状態
    // - オフラインになると WebSocket からのリクエストに無応答になる
    // - WebSocket のコネクションの切断とは関係がない
    // ------------------------------------------------------
    this._online_state = true;


    // WebSocket クライアント
    this._ws = new WebSocketClient();
    // WebSocket コネクション
    this._ws_conn = null;

    this._on_log_elrecv = () => { };
    this._on_log_elsent = () => { };
    this._on_log_discover = () => { };
    this._on_log_disappear = () => { };
    this._on_log_alive = () => { };
    this._on_log_dead = () => { };
    this._on_log_wsrecv = () => { };
    this._on_log_wssent = () => { };

    // ESV の 16 進数と意味の対応
    this._esv_name_code_map = {
      'SETI': '60',
      'SETC': '61',
      'GET': '62',
      'INF_REQ': '63',
      'SETGET': '6E',
      'SET_RES': '71',
      'GET_RES': '72',
      'INF': '73',
      'INFC': '74',
      'INFC_RES': '7A',
      'SETGET_RES': '7E',
      'SETI_SNA': '50',
      'SETC_SNA': '51',
      'GET_SNA': '52',
      'INF_SNA': '53',
      'SETGET_SNA': '5E'
    };
    this._esv_code_name_map = {};
    for (let [k, v] of Object.entries(this._esv_name_code_map)) {
      this._esv_code_name_map[v] = k;
    }
  }

  _wait(msec) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, msec);
    });
  }

  /* ------------------------------------------------------------------
  * start(options)
  * - HEMS コントローラーを起動する
  *
  * [引数]
  * - options        | Object  | Optional | 起動オプション
  *   - enable_debug | Boolean | Optional | デバッグモード有効フラグ
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  async start(options = {}) {
    // ユーザー設定情報を取得し、システム設定情報とマージ
    this._uconf_manager = new mUconfManager();
    const user_conf = await this._uconf_manager.init();
    Object.assign(this._conf, user_conf);

    // シークレットをチェック
    this._conf.secret = this._prepareSecret();

    // HemsControllerDebug オブジェクトを生成
    this._debug = new mDebug({
      console: options.enable_debug,
      file: this._conf.debug.file_enabled,
      rotate: this._conf.debug.file_rotate,
      path: this._conf.debug.log_dir_path || mPath.join(this._base_dir, 'logs')
    });
    await this._debug.init();

    let opt_list = [
      '- ログファイル出力: ' + (this._conf.debug.file_enabled ? '有効' : '無効')
    ];
    this._debug.log('HEMS コントローラーを起動します。', opt_list.join('\n'));

    // コントローラオブジェクト生成
    this._controller = new mController(this._conf.el_controler);

    // デバッグモードの準備
    this._initElPacketLoging();

    // ECHONET Lite コントローラー起動
    await this._controller.start();
    this._debug.log('ECHONET Lite コントローラーを起動しました。');

    // コントローラオブジェクトの各種イベントハンドラをセット
    this._controller.ondiscover = this._onDiscover.bind(this); // 機器発見
    this._controller.ondisappear = this._onDisappear.bind(this); // 機器消滅
    this._controller.onrecv = this._onElRecv.bind(this); // ECHONET Lite パケット受信
    this._controller.onsent = this._onElSent.bind(this); // ECHONET Lite パケット送信
    this._controller.onalive = this._onAlive.bind(this); // 死活監視成功
    this._controller.ondead = this._onDead.bind(this); // 死活監視失敗

    // アナウンス (INF) パケット受信イベントハンドラ
    this._controller.oninf = this._recvInf.bind(this);

    // クラウドサーバーとの WebSocket コネクションを準備
    this._initWebSocket();



    // Express オブジェクト生成
    let app = mExpress();

    // ビューエンジンをセットアップ
    app.set('views', mPath.join(this._base_dir, 'views', 'admin'));
    app.set('view engine', 'ejs');

    // HTTP サーバーを生成
    let http_server = mHttp.createServer(app);

    // Logger オブジェクト生成
    let logger = new mLogger();
    logger.init();

    // DeviceManager オブジェクトを生成
    this._device_manager = new mDeviceManager({ controller: this._controller });
    await this._device_manager.init();
    this._registered_devices = await this._device_manager.getAll();
    this._device_manager.onupdated = (devices) => {
      this._registered_devices = devices;
    };

    // 管理者メニューをセットアップ
    this._http_admin = new mHttpAdmin({
      conf: this._conf,
      app: app,
      logger: logger,
      debug: this._debug,
      uconf_manager: this._uconf_manager,
      device_manager: this._device_manager,
      online_state: this._online_state
    });

    await this._http_admin.init();

    this._http_admin.onuconfupdated = (data) => {
      for (let [k, v] of Object.entries(data)) {
        this._conf[k] = v;
        if (k === 'api_token') {
          this._initWebSocket();
        }
      }
    };

    this._http_admin.ononlinestatechanged = (state) => {
      this._online_state = state;
    };

    // ダッシュボードのデバイス管理画面で「デバイス情報初期化」が押されたときの処理
    this._http_admin.oninitdevicesrequested = async () => {
      await this._device_manager.deleteAll();
      await this._controller.refresh();
    };

    // 管理者メニューの HTTP リクエストのルーティングを定義
    this._defineRouting(app);

    // HTTP サーバーを起動
    http_server.listen(this._conf.http_port, () => {
      this._debug.log('HTTP サーバーを起動しました: http://localhost:' + this._conf.http_port + '/admin/index');
    });
  }

  _initElPacketLoging() {
    let item_num = 0;
    let targets = this._conf.debug.targets;
    Object.values(targets).forEach((v) => {
      if (v) {
        item_num++;
      }
    });
    if (item_num === 0) {
      return;
    }

    // ECHONET Lite パケット受信イベントハンドラをセット
    if (targets.elrecv) {
      this._on_log_elrecv = (data) => {
        this._debug.log('パケット受信', data);
      };
    }

    // ECHONET Lite パケット送信ベントハンドラをセット
    if (targets.elsent) {
      this._on_log_elsent = (data) => {
        this._debug.log('パケット送信', data);
      };
    }

    // 機器発見イベントハンドラをセット
    if (targets.discover) {
      this._on_log_discover = (device) => {
        this._debug.log('デバイス発見', device);
      };
    }

    // 機器消滅イベントハンドラをセット
    if (targets.disappear) {
      this._on_log_disappear = (device) => {
        this._debug.log('デバイス消失', device);
      };
    }

    // 死活監視成功イベントハンドラをセット
    if (targets.alive) {
      this._on_log_alive = (device) => {
        this._debug.log('死活監視成功', device);
      }
    }

    // 死活監視失敗イベントハンドラをセット
    if (targets.dead) {
      this._on_log_dead = (device) => {
        this._debug.log('死活監視失敗', device);
      }
    }

    // WebSocket メッセージ受信イベントハンドラをセット
    if (targets.wsrecv) {
      this._on_log_wsrecv = (data) => {
        this._debug.log('WebSocket メッセージ受信', data);
      };
    }

    // WebSocket メッセージ送信ベントハンドラをセット
    if (targets.wssent) {
      this._on_log_wssent = (data) => {
        this._debug.log('WebSocket メッセージ送信', data);
      };
    }
  }

  /* ------------------------------------------------------------------
  * _onDiscover(devinfo)
  * - ECHONET Lite デバイスを追加
  * - this._controller.ondiscover イベントハンドラにより呼び出される
  * 
  * [引数]
  * - devinfo | Object | Required | 発見された ECHONET Lite デバイス情報
  * 
  *   devinfo = {
  *     "address": "192.168.11.16",
  *     "id": "FE00000860F189BF5F4B00000000000000",
  *     "instances": {
  *       "0EF001": {
  *         "eoj": "0EF001",
  *         "version": "1.10",
  *         "manufacturer_code": "000008",
  *         "product_code": "",
  *         "production_number": "",
  *         "set_property_map": ["BF"],
  *         "get_property_map": ["80", "82", ..., "D7"]
  *       },
  *       "013001": {
  *         "eoj": "013001",
  *         "version": "C",
  *         "manufacturer_code": "000008",
  *         "product_code": "",
  *         "production_number": "",
  *         "set_property_map": ["80", "81", ..., "C4"],
  *         "get_property_map": ["80", "81", ..., "C4"]
  *       }
  *     }
  *   }
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  _onDiscover(devinfo) {
    // ログ
    this._on_log_discover(devinfo);

    let id = devinfo.id;
    this._devices[id] = devinfo;
  }

  /* ------------------------------------------------------------------
  * _onDisappear(devinfo)
  * - ECHONET Lite デバイスを削除
  * - this._controller.ondisappear イベントハンドラにより呼び出される
  * 
  * [引数]
  * - devinfo  | Object | Required | 発見された ECHONET Lite デバイス情報
  * 
  *   devinfo = {
  *     "address": "192.168.11.16",
  *     "id": "FE00000860F189BF5F4B00000000000000",
  *     "instances": {
  *       "013001": {{インスタンスオブジェクト}}
  *     }
  *   }
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  _onDisappear(devinfo) {
    // ログ
    this._on_log_disappear(devinfo);

    let id = devinfo.id;
    delete this._devices[id];
  }

  /* ------------------------------------------------------------------
  * _onElRecv(data)
  * - this._controller.onrecv イベントハンドラにより呼び出される
  * ---------------------------------------------------------------- */
  _onElRecv(data) {
    // ログ
    this._on_log_elrecv(data);
  }

  /* ------------------------------------------------------------------
  * _onElSent(data)
  * - this._controller.onsent イベントハンドラにより呼び出される
  * ---------------------------------------------------------------- */
  _onElSent(data) {
    // ログ
    this._on_log_elsent(data);
  }

  /* ------------------------------------------------------------------
  * _onAlive(data)
  * - this._controller.onalive イベントハンドラにより呼び出される
  * ---------------------------------------------------------------- */
  _onAlive(data) {
    // ログ
    this._on_log_alive(data);
  }

  /* ------------------------------------------------------------------
  * _onDead(data)
  * - this._controller.ondead イベントハンドラにより呼び出される
  * ---------------------------------------------------------------- */
  _onDead(data) {
    // ログ
    this._on_log_dead(data);
  }

  /* ------------------------------------------------------------------
  * _recvInf(data)
  * - アナウンス (INF) パケット受信イベントハンドラ
  * - this._controller.oninf イベントハンドラにより呼び出される
  * 
  * [引数]
  * - data  | Object | Required | INF パケット情報
  * 
  *   data = {
  *     "address": "192.168.11.10",
  *     "hex": "108100140130010EF0017301800130",
  *     "packet": {
  *       "tid": 20,
  *       "seoj": "013001",
  *       "deoj": "0EF001",
  *       "esv": "INF",
  *       "opc": 1,
  *       "props": [
  *         {
  *           "epc": "80",
  *           "pdc": 1,
  *           "edt": {
  *             "hex": "30",
  *             "name": "動作状態",
  *             "data": {
  *               "status": true
  *             },
  *             "buffer": {
  *               "type": "Buffer",
  *               "data": [
  *                 48
  *               ]
  *             }
  *           }
  *         }
  *       ]
  *     }
  *   }
  * 
  * [戻値]
  * - なし
  * ---------------------------------------------------------------- */
  _recvInf(data) {
    // 登録済みのデバイスからの INF かどうかをチェック
    let target_device_id = '';
    for (const dev of Object.values(this._registered_devices)) {
      if (dev.address === data.address) {
        for (const eoj of Object.keys(dev.instances)) {
          if (eoj === data.packet.seoj) {
            target_device_id = dev.id;
            break;
          }
        }
        break;
      }
    }
    if (!target_device_id) {
      return;
    }

    // Web API クラウドに送信
    let operations = [];
    for (let prop of data.packet.props) {
      let edt = [];
      let buf = prop.edt.buffer;
      for (let i = 0; i < buf.length; i++) {
        let hex = buf.slice(i, i + 1).toString('hex');
        edt.push('0x' + hex);
      }
      operations.push({
        epc: '0x' + prop.epc,
        edt: edt
      });
    }

    let inf = {
      type: 'INF',
      data: {
        id: target_device_id,
        tid: data.packet.tid,
        seoj: '0x' + data.packet.seoj,
        deoj: '0x' + data.packet.deoj,
        esv: '0x' + this._esv_name_code_map[data.packet.esv], // 73 のはず
        operations: operations
      }
    };
    this._sendWebSocketMessage(inf);
  }


  // クラウドサーバーとの WebSocket コネクションを準備
  _initWebSocket() {
    if (this._ws_conn) {
      this._ws_conn.removeAllListeners();
      this._ws_conn.close();
      this._ws_conn = null;
      this._ws.removeAllListeners();
      this._http_admin.onWsStatusChange(false, '');
    }

    let establishConnection = () => {
      this._debug.log('WebSocket 接続を開始します: ' + this._conf.ws_url);
      this._ws.connect(this._conf.ws_url, 'echonetlite-protocol', null, {
        Authorization: 'Bearer ' + this._conf.api_token
      });
    };

    this._ws.on('connectFailed', async (error) => {
      const msg = 'WebSocket 接続に失敗しました (connectFailed): ' + error.toString();
      this._debug.error(msg);
      this._http_admin.onWsStatusChange(false, msg);
      if (/x\-websocket\-reject\-reason\: (PATH_INVALID|BEARER_INVALID|TARGET_NOT_FOUND|STATUS_INVALID|DATE_EXPIRED)/i.test(error.message)) {
        return;
      }

      await this._wait(5000);
      establishConnection();
    });

    this._ws.on('connect', (connection) => {
      this._debug.log('WebSocket コネクションを確立しました。');
      this._ws_conn = connection;
      this._http_admin.onWsStatusChange(true, '');

      this._ws_conn.on('error', (error) => {
        const msg = 'WebSocket コネクションが切断されました (error): ' + error.toString();
        this._debug.error(msg);
        this._http_admin.onWsStatusChange(false, msg);
      });

      this._ws_conn.on('close', async () => {
        const msg = 'WebSocket コネクションが切断されました (close)。';
        this._debug.error(msg);
        this._http_admin.onWsStatusChange(false, msg);
        await this._wait(5000);
        establishConnection();
      });

      this._ws_conn.on('message', (message) => {
        this._receivedWebSocketMessage(message);
      });

    });

    establishConnection();
  }

  // WebSocket メッセージを受信したときの処理
  _receivedWebSocketMessage(message) {
    if (message.type !== 'utf8') {
      return;
    }
    let data = JSON.parse(message.utf8Data);
    this._on_log_wsrecv(data);

    if (!this._online_state) {
      return;
    }

    if (this._conf.access_code) {
      if (this._conf.access_code !== data.access_code) {
        if (data.access_code !== '____') {
          return;
        }
      }
    }

    if (data.type === 'REQUEST') {
      this._receivedWebSocketMessageRequest(data);
    } else if (data.type === 'DISCOVERY_REQUEST') {
      this._receivedWebSocketMessageDiscoveryRequest(data);
    }
  }

  _receivedWebSocketMessageRequest(data) {
    // ---------------------------------------------
    // [例1]
    // data = {
    //   "type": "REQUEST",
    //   "req_id": 9,
    //   "access_code": "",
    //   "method": "post",
    //   "path": "/api/v1/devices/FE00000860F189BF5F4B00000000000000/echoCommands",
    //   "params": {
    //     "eoj": "0x013001",
    //     "esv": "0x61",
    //     "operations": [
    //       {"epc": "0x80", "edt":["0x30"]}
    //     ]
    //   }
    // }
    //
    // [例2]
    // data = {
    //   "type": "REQUEST",
    //   "req_id": 8,
    //   "access_code": "",
    //   "method": "post",
    //   "path": "/api/v1/devices/FE00007776453D7AB3E30EF00100000000/echoCommands",
    //   "params": {
    //     "tid": 18,
    //     "seoj": "0x05FF01",
    //     "deoj": "0x0EF000",
    //     "esv": "INF",
    //     "operations": [
    //       {
    //         "epc": "0xD6",
    //         "edt": []
    //       }
    //     ]
    //   }
    // }
    // ---------------------------------------------

    let sendResponse = (code, response_data) => {
      let res = {
        type: 'RESPONSE',
        req_id: data.req_id,
        code: code,
        data: response_data
      };
      this._sendWebSocketMessage(res);
    };

    let path_part_list = data.path.split('/');
    let device_id = path_part_list[4];
    if (!device_id) {
      sendResponse(400, { error: 'リクエストパスにデバイス ID が見つかりませんでした: path=' + data.path });
      return;
    }
    let device = this._devices[device_id];
    if (!device) {
      sendResponse(404, { error: '指定のデバイス ID に該当するデバイスが見つかりませんでした: path=' + data.path });
      return;
    }
    if (!this._registered_devices[device_id]) {
      // ここに到達することはありえない。なぜなら機器発見リクエストで登録済みのデバイス上のみを返しているから。
      // クラウド側では機器発見リクエストの応答にないデバイスへのアクセスは拒否するため、ここに到達しない。
      sendResponse(403, { error: '指定のデバイス ID に該当するデバイスにアクセスする権限がありません: path=' + data.path });
      return;
    }

    // tid をチェック
    let tid = null;
    if (data.params.tid) {
      tid = data.params.tid;
      if (typeof (tid) !== 'number' || tid % 1 !== 0 || tid < 0) {
        sendResponse(400, { error: 'tid の値が正しくありません: tid=' + tid });
        return;
      }
    }

    // seoj をチェック
    let seoj = data.params.seoj || '05FF01';
    if (typeof (seoj) !== 'string') {
      sendResponse(400, { error: 'seoj の値が正しくありません: seoj=' + seoj });
      return;
    }
    seoj = seoj.replace(/^0x/, '');
    if (!seoj) {
      sendResponse(400, { error: 'seoj の値が正しくありません: seoj=' + seoj });
      return;
    }
    seoj = seoj.toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(seoj)) {
      sendResponse(400, { error: 'seoj の値が正しくありません: seoj=' + seoj });
      return;
    }

    // deoj をチェック
    let deoj = data.params.eoj || data.params.deoj;
    if (typeof (deoj) !== 'string') {
      sendResponse(400, { error: 'deoj の値が正しくありません: deoj=' + deoj });
      return;
    }
    deoj = deoj.replace(/^0x/, '');
    if (!deoj) {
      sendResponse(400, { error: 'deoj の値が正しくありません: deoj=' + deoj });
      return;
    }
    deoj = deoj.toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(deoj)) {
      sendResponse(400, { error: 'deoj の値が正しくありません: deoj=' + deoj });
      return;
    }

    // esv をチェック
    let esv = data.params.esv;
    if (typeof (esv) !== 'string') {
      sendResponse(400, { error: 'esv の値が正しくありません: esv=' + esv });
      return;
    }
    esv = esv.replace(/^0x/, '');
    if (!esv) {
      sendResponse(400, { error: 'esv の値が正しくありません: esv=' + esv });
      return;
    }
    esv = esv.toUpperCase();
    let esv_name = this._esv_code_name_map[esv];
    if (!esv_name) {
      sendResponse(400, { error: '未知の esv が指定されました: esv=' + esv });
      return;
    }

    // Set 権限をチェック
    if (!this._registered_devices[device_id].permission.set) {
      if (/^SET(I|C|GET)$/.test(esv_name)) {
        sendResponse(403, { error: '指定のデバイスに Set 権限がありません: esv=' + esv });
        return;
      }
    }

    // operations をチェック
    let op_list = data.params.operations;
    if (!op_list || !Array.isArray(op_list) || op_list.length === 0) {
      sendResponse(400, { error: 'params.operations の値が正しくありません。' });
      return;
    }

    let props = [];
    let err = "";
    for (let op of op_list) {
      let epc = op.epc;
      if (typeof (epc) !== 'string') {
        continue;
      }
      epc = epc.replace(/^0x/, '');
      if (!epc || !/^[0-9a-f]{2}$/i.test(epc)) {
        err = 'epc の値が正しくありません: epc=' + epc;
        break;
      }

      let edt = op.edt;
      let edt_hex = "";
      if (edt) {
        if (!Array.isArray(edt)) {
          err = 'edt は Array でなければいけません。';
          break;
        }
        for (let hex of edt) {
          if (typeof (hex) !== 'string') {
            err = 'edt の値が正しくありません。';
            break;
          }
          hex = hex.replace(/^0x/, '');
          if (!hex || !/^[0-9a-f]{2}$/i.test(hex)) {
            err = 'edt の値が正しくありません: edt=' + hex;
            break;
          }
          edt_hex += hex;
        }
      }
      props.push({
        epc: epc,
        edt: edt_hex || null
      });
    }

    if (err) {
      sendResponse(400, { error: err });
      return;
    }

    let packet = {
      seoj: seoj,
      deoj: deoj,
      esv: esv_name,
      props: props
    };
    if (tid !== null) {
      packet.tid = tid;
    }

    if (/^(SETC|GET|INF_REQ|SETGET|INFC)$/.test(esv_name)) {
      this._controller.request(device.address, packet).then((res) => {
        let esv_code = this._esv_name_code_map[res.packet.esv];
        let operations = [];
        for (let prop of res.packet.props) {
          let edt_hex_list = [];
          if (prop.edt) {
            let buf = prop.edt.buffer;
            for (let i = 0; i < buf.length; i++) {
              let h = buf.slice(i, i + 1).toString('hex');
              edt_hex_list.push('0x' + h);
            }
          }
          operations.push({
            epc: '0x' + prop.epc,
            edt: edt_hex_list
          });
        }

        let response_data = {
          id: device_id,
          tid: res.packet.tid,
          seoj: '0x' + res.packet.seoj,
          deoj: '0x' + res.packet.deoj,
          esv: '0x' + esv_code,
          operations: operations
        };
        sendResponse(200, response_data);
      }).catch((error) => {
        sendResponse(500, { error: error.message });
      });
    } else {
      this._controller.send(device.address, packet).then(() => {
        sendResponse(204, null);
      }).catch((error) => {
        sendResponse(500, { error: error.message });
      });
    }
  }

  _receivedWebSocketMessageDiscoveryRequest(data) {
    this._debug.log('機器発見リクエスト受信: ', data);

    let dev_list = [];
    for (let info of Object.values(this._devices)) {
      if (!this._registered_devices[info.id]) {
        continue;
      }
      let instances = [];
      for (let ins_orig of Object.values(info.instances)) {
        let ins = JSON.parse(JSON.stringify(ins_orig));
        ins.eoj = '0x' + ins.eoj;
        ins.manufacturer_code = '0x' + ins.manufacturer_code;
        ['inf_property_map', 'set_property_map', 'get_property_map'].forEach((pmap_name) => {
          let pmap = ins[pmap_name];
          for (let i = 0; i < pmap.length; i++) {
            pmap[i] = '0x' + pmap[i];
          }
        });
        instances.push(ins);
      }

      let data = {
        address: info.address,
        id: info.id,
        instances: instances
      };
      dev_list.push(data);
    }

    let rdata = {
      type: 'DISCOVERY_RESPONSE',
      req_id: data.req_id,
      code: 200,
      data: {
        devices: dev_list
      }
    };
    this._sendWebSocketMessage(rdata);
  }

  // WebSocket メッセージを送信
  _sendWebSocketMessage(data) {
    if (this._ws_conn && this._ws_conn.connected) {
      this._ws_conn.sendUTF(JSON.stringify(data));
      this._on_log_wssent(data);
    }
  }

















  _prepareSecret() {
    let secret = '';
    let json_path = mPath.resolve(this._base_dir, './data/admin.secret.json');
    if (mFs.existsSync(json_path)) {
      try {
        let osecret = require(json_path);
        if (osecret && osecret.secret) {
          secret = osecret.secret;
        }
      } catch (error) {
        throw error;
      }
    }
    if (secret) {
      return secret;
    }
    secret = mCrypto.randomBytes(32).toString('hex');
    try {
      mFs.writeFileSync(json_path, JSON.stringify({
        secret: secret
      }));
    } catch (error) {
      throw error;
    }
    return secret;
  }

  _defineRouting(app) {
    // Body parser
    app.use(mBodyParser.urlencoded({ extended: false }));
    app.use(mBodyParser.json());

    // Cookie 管理
    app.use(mCookieParser());

    // セッション管理
    app.use(mSession({
      name: this._conf.admin_session_cookie_name,
      secret: this._conf.secret,
      proxy: false,
      resave: false,
      rolling: false,
      saveUninitialized: false,
      cookie: {
        //secure: this._conf.ssl,
        httpOnly: true,
        path: '/admin',
        maxAge: (86400 * 1000 * this._conf.admin_session_expired_days)
      },
      store: new mSessionFileStore({
        path: mPath.resolve(this._base_dir, './data/sessions/admin'),
        ttl: 86400 * this._conf.admin_session_expired_days, // セッション維持秒数
        secret: this._conf.secret
      })
    }));

    // HTTP リクエストを処理
    app.use((req, res, next) => {
      if (req.path === '/' || req.path === '/admin' || req.path === '/admin/') {
        res.redirect(301, '/admin/index')
        return;

      } else if (/^\/admin\//.test(req.path)) {
        this._http_admin.request(req, res);
        return;

      } else {
        next();
      }
    });

    // 静的ファイルコンテンツ
    app.use(mExpress.static(mPath.resolve(this._base_dir, './html')));

    // 404 Not Foudn をキャッチしてエラーハンドラにフォワード
    app.use((req, res, next) => {
      next(mHttpErrors(404));
    });

    // エラーハンドラ
    app.use((error, req, res, next) => {
      // エラーページをレンダリング
      res.status(error.status || 500);
      res.render('error', {
        system_name: this._conf.system_name,
        error: {
          message: error.message,
          stack: error.stack
        },
        req: {
          path: req.path,
          method: req.method
        },
        res: {
          code: error.status,
          text: mHttp.STATUS_CODES[error.status]
        }
      });
    });
  }

  _renderError(req, res, error) {
    // エラーページをレンダリング
    res.status(error.status || 500);
    res.render('error', {
      system_name: this._conf.system_name,
      message: error.status + ' ' + error.message,
      error: error
    });
  }
}

module.exports = Index;