/* ------------------------------------------------------------------
* cloud-gateway - http-admin.js
* ---------------------------------------------------------------- */
'use strict';
const mFs = require('fs');
const mHttp = require('http');
const mCsrf = require('csrf');

class HttpAdmin {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * ---------------------------------------------------------------- */
  constructor(params) {
    this._conf = params.conf;
    this._app = params.app;
    this._logger = params.logger;
    this._debug = params.debug;
    this._uconf_manager = params.uconf_manager;
    this._device_manager = params.device_manager;
    this._online_state = params.online_state;

    this._csrf = new mCsrf();

    this._log_monitor_sse_idx = 0;
    this._log_monitor_sse_map = {};

    this._ws_connected = false;
    this._ws_message = '';

    this._onuconfupdated = () => { };
    this._ononlinestatechanged = () => { };
    this._oninitdevicesrequested = () => { };
  }

  set onuconfupdated(fn) {
    if (typeof (fn) !== 'function') {
      throw new Error('The `onuconfupdated` must be a function.');
    }
    this._onuconfupdated = fn;
  }

  set ononlinestatechanged(fn) {
    if (typeof (fn) !== 'function') {
      throw new Error('The `ononlinestatechanged` must be a function.');
    }
    this._ononlinestatechanged = fn;
  }

  set oninitdevicesrequested(fn) {
    if (typeof (fn) !== 'function') {
      throw new Error('The `oninitdevicesrequested` must be a function.');
    }
    this._oninitdevicesrequested = fn;
  }


  onWsStatusChange(connected, message) {
    this._ws_connected = connected;
    this._ws_message = message || '';
  }

  async init() {
    this._debug.onlog = (message) => {
      let data = {
        type: 'log',
        message: message
      };
      let json = JSON.stringify(data);

      const sse_idx_list = Object.keys(this._log_monitor_sse_map);
      for (const idx of sse_idx_list) {
        const sse = this._log_monitor_sse_map[idx];
        const res = sse.res;
        if (!res || !res.socket || res.writable === false || res.destroyed === true) {
          res.end();
          delete this._log_monitor_sse_map[idx];
          continue;
        }
        res.write(`data: ${json}\n\n`);
      }

    };

    this._debug.onerror = (message) => {
      let data = {
        type: 'error',
        message: message
      };
      let json = JSON.stringify(data);

      const sse_idx_list = Object.keys(this._log_monitor_sse_map);
      for (const idx of sse_idx_list) {
        const sse = this._log_monitor_sse_map[idx];
        const res = sse.res;
        if (!res || !res.socket || res.writable === false || res.destroyed === true) {
          res.end();
          delete this._log_monitor_sse_map[idx];
          continue;
        }
        res.write(`data: ${json}\n\n`);
      }
    };

  }

  /* ------------------------------------------------------------------
  * request(req, res)
  * - HTTP リクエスト受信時の処理
  *
  * [引数]
  * - req | Object | 必須 | Express HTTP リクエストオブジェクト
  * - res | Object | 必須 | Express HTTP レスポンスオブジェクト
  *
  * [返値]
  * - なし
  * ---------------------------------------------------------------- */
  request(req, res) {
    let path = req.path;
    let method = req.method.toLowerCase();
    let k = path + ' ' + method;
    let path_part_list = path.split('/');

    if (/^\/admin\/index\/? get$/.test(k)) {
      // ホームを表示
      this._showIndex(req, res);


    } else if (/^\/admin\/apitoken\/? get$/.test(k)) {
      // API トークン登録フォーム表示
      this._showApiTokenForm(req, res);
    } else if (/^\/admin\/apitoken\/? post$/.test(k)) {
      // API トークン登録
      this._setApiTokenForm(req, res);


    } else if (/^\/admin\/devicelist\/? get$/.test(k)) {
      // 登録済みデバイス一覧を表示
      this._showDeviceList(req, res);

    } else if (/^\/admin\/deviceadd\/? get$/.test(k)) {
      // デバイス追加画面を表示
      this._showDeviceAdd(req, res);

    } else if (/^\/admin\/deviceadd\/? post$/.test(k)) {
      // デバイス追加処理
      this._postDeviceadd(req, res);

    } else if (/^\/admin\/devicedelset\/? get$/.test(k)) {
      // デバイス削除処理
      this._getDevicedelset(req, res);


    } else if (/^\/admin\/accesscode\/? get$/.test(k)) {
      // アクセスコード登録フォーム表示
      this._showAccessCodeForm(req, res);
    } else if (/^\/admin\/accesscode\/? post$/.test(k)) {
      // アクセスコード登録
      this._setAccessCodeForm(req, res);



    } else if (/^\/admin\/systemlogs\/? get$/.test(k)) {
      // システムログファイル一覧表示
      this._showSystemLogFileList(req, res);
    } else if (/^\/admin\/systemlogs\/detail\/\d{4}\-\d{2}\-\d{2}\.log get$/.test(k)) {
      // システムログ表示
      let fname = path_part_list[4];
      this._showSystemLogFile(req, res, fname);
    } else if (/^\/admin\/systemlogs\/download\/\d{4}\-\d{2}\-\d{2}\.log get$/.test(k)) {
      // システムログファイルダウンロード
      let fname = path_part_list[4];
      this._downloadSystemLogFile(req, res, fname);


    } else if (/^\/admin\/systemlogs\/monitor\/? get$/.test(k)) {
      // システムログモニター表示
      this._showSystemLogMonitor(req, res);
    } else if (/^\/admin\/systemlogs\/monitor\/stream\/? get$/.test(k)) {
      // システムログストリーム (Server-Sent Event)
      this._streamSystemLog(req, res);


    } else if (/^\/admin\/api\/ws_status\/? get$/.test(k)) {
      // WebSocket 接続状態を表示
      this._apiGetWsStatus(req, res);
    } else if (/\/admin\/api\/device\/permission\/set\/? put$/.test(k)) {
      // デバイスの Set 権限の変更処理
      this._apiPutDevicePermissionSet(req, res);
    } else if (/\/admin\/api\/onlinestate\/? put$/.test(k)) {
      // オンライン状態をオンラインに変更
      this._apiPutOnlinestate(req, res);
    } else if (/\/admin\/api\/onlinestate\/? delete$/.test(k)) {
      // オンライン状態をオフラインに変更
      this._apiDeleteOnlinestate(req, res);


    } else {
      this._render(req, res, 'error', null, 404);
    }
  }

  _createTemplateErrorVals(message, name_list, stack) {
    if (!message) {
      message = '';
    }
    if (!name_list || !Array.isArray(name_list)) {
      name_list = [];
    }
    let names = {};
    name_list.forEach((name) => {
      names[name] = true;
    });
    let o = {
      message: message,
      names: names,
      stack: stack || ''
    };
    return o;
  }

  _render(req, res, tmpl_name, data, status, error_obj, callback) {
    // 共通の値
    let locals = {
      system_name: this._conf['system_name'],
      admin: null,
      error: this._createTemplateErrorVals(),
      form: {},
      req: {
        method: req.method,
        path: req.path
      },
      res: {
        code: 200,
        text: 'OK'
      },
      online_state: this._online_state
    };
    // 値をマージ
    if (req.session && req.session.locals) {
      for (let k in req.session.locals) {
        locals[k] = req.session.locals[k];
      }
    }
    if (data && typeof (data) === 'object') {
      for (let k in data) {
        locals[k] = data[k];
      }
    }
    if (error_obj && typeof (error_obj) === 'object') {
      locals.error = this._createTemplateErrorVals(error_obj.message, null, error_obj.stack);
    }
    // レンダリング
    if (!status) {
      status = 200;
    }
    locals['res'] = {
      code: status,
      text: mHttp.STATUS_CODES[status]
    };

    res.status(status);
    res.render(tmpl_name, locals, (error, html) => {
      if (callback && typeof (callback) === 'function') {
        callback(error, html)
      }
      res.send(html);
    });
  }

  _saveSession(req) {
    return new Promise((resolve, reject) => {
      req.session.save((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  // ----------------------------------------------------------------------
  // ホームを表示
  // - GET /admin/index
  // ----------------------------------------------------------------------
  _showIndex(req, res) {
    this._render(req, res, 'index', {
      api_token: this._conf.api_token,
      access_code: this._conf.access_code
    });
  }

  // ----------------------------------------------------------------------
  // 登録済みデバイス一覧を表示
  // - GET /admin/devicelist
  // ----------------------------------------------------------------------
  async _showDeviceList(req, res) {
    if (req.query && req.query.init === '1') {
      this._oninitdevicesrequested();
      res.redirect('/admin/devicelist');
    } else {
      const device_list = await this._device_manager.getList();
      this._render(req, res, 'device_list', {
        list: device_list
      });
    }
  }

  // ----------------------------------------------------------------------
  // デバイス追加画面を表示
  // - GET /admin/deviceadd
  // ----------------------------------------------------------------------
  async _showDeviceAdd(req, res) {
    const device_list = await this._device_manager.getCandidateList();
    this._render(req, res, 'device_add', {
      list: device_list
    });
  }

  // ----------------------------------------------------------------------
  // デバイス追加処理
  // - POST /admin/deviceadd
  // ----------------------------------------------------------------------
  async _postDeviceadd(req, res) {
    // ポストデータを取得
    const id_list = req.body.id;
    if (!id_list) {
      const error = new Error('デバイス ID を選択してください。');
      this._render(req, res, 'error', null, 400, error);
      return;
    }

    // デバイスを登録
    try {
      let param = id_list;
      if (typeof (param) === 'string') {
        param = [param];
      }
      await this._device_manager.add(param);
    } catch (error) {
      this._render(req, res, 'error', null, 500, error);
      return;
    }

    // デバイス一覧画面へリダイレクト
    res.redirect('/admin/devicelist');
  }

  // ----------------------------------------------------------------------
  // デバイス削除処理
  // - GET /admin/devicedelset
  // ----------------------------------------------------------------------
  async _getDevicedelset(req, res) {
    const id = req.query.id;

    // デバイスを削除
    try {
      await this._device_manager.del([id]);
    } catch (error) {
      this._render(req, res, 'error', null, 500, error);
      return;
    }

    // デバイス一覧画面へリダイレクト
    res.redirect('/admin/devicelist');
  }


  // ----------------------------------------------------------------------
  // システムログファイル一覧表示
  // - GET /admin/systemlogs
  // ----------------------------------------------------------------------
  _showSystemLogFileList(req, res) {
    // アクセスログファイルの一覧を取得
    this._debug.getLogFileList().then((list) => {
      // ページを表示
      this._render(req, res, 'systemlog_list', {
        list: list
      });
    }).catch((error) => {
      this._render(req, res, 'error', null, 500, error);
    });
  }


  // ----------------------------------------------------------------------
  // システムログ表示
  // - GET /admin/systemlogs/detail/2018-11-05.log
  // ----------------------------------------------------------------------
  _showSystemLogFile(req, res, fname) {
    let fpath = this._debug.getLogFilePath(fname);
    if (!fpath) {
      this._render(req, res, 'error', null, 404);
    }
    mFs.readFile(fpath, 'utf8', (error, data) => {
      if (error) {
        this._render(req, res, 'error', null, 500, error);
      } else {
        this._render(req, res, 'systemlog_detail', {
          fname: fname,
          content: data
        });
      }
    });
  }

  // ----------------------------------------------------------------------
  // システムログファイルダウンロード
  // - GET /admin/systemlogs/download/2018-11-05.log
  // ----------------------------------------------------------------------
  _downloadSystemLogFile(req, res, fname) {
    let fpath = this._debug.getLogFilePath(fname);
    if (!fpath) {
      this._render(req, res, 'error', null, 404);
    }
    mFs.readFile(fpath, 'utf8', (error, data) => {
      if (error) {
        this._render(req, res, 'error', null, 500, error);
      } else {
        res.set({
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        });
        res.status(200);
        res.send(data);
      }
    });
  }

  // ----------------------------------------------------------------------
  // システムログモニター表示
  // - GET /admin/systemlogs/monitor
  // ----------------------------------------------------------------------
  _showSystemLogMonitor(req, res) {
    this._render(req, res, 'systemlog_monitor', {});
  }

  // ----------------------------------------------------------------------
  // システムログストリーム (Server-Sent Events)
  // - GET /admin/systemlogs/monitor/stream
  // ----------------------------------------------------------------------
  _streamSystemLog(req, res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    });
    res.flushHeaders();

    this._log_monitor_sse_idx++;
    const idx = this._log_monitor_sse_idx;
    this._log_monitor_sse_map[idx] = { req: req, res: res };
  }

  // ----------------------------------------------------------------------
  // アクセスコード登録フォーム表示
  // - GET /admin/accesscode
  // ----------------------------------------------------------------------
  async _showAccessCodeForm(req, res) {
    const csrf_name = 'accesscode';
    if (csrf_name !== req.session._csrf_name) {
      req.session.locals = {
        form: {
          access_code: this._conf.access_code,
        },
        error: this._createTemplateErrorVals()
      };
    }

    // CSRF のシークレットとトークンを生成
    const csrf_secret = this._csrf.secretSync();
    const csrf_token = this._csrf.create(csrf_secret);
    req.session._csrf_name = csrf_name;
    req.session._csrf = csrf_secret;

    // セッションを保存
    await this._saveSession(req);

    // Cookie にトークンをセット
    res.cookie('_csrf', csrf_token, { httpOnly: true });

    // ページを表示
    this._render(req, res, csrf_name, req.session.locals.form);
  }

  // ----------------------------------------------------------------------
  // アクセスコード登録
  // - POST /admin/accesscode
  // ----------------------------------------------------------------------
  async _setAccessCodeForm(req, res) {
    // CSRF をチェック
    const csrf_secret = req.session._csrf;
    const csrf_token = req.cookies._csrf;
    if (this._csrf.verify(csrf_secret, csrf_token) === false) {
      this._render(req, res, 'error', null, 403, new Error('CSRF violation was detected.'));
      return;
    }

    // ポストデータを取得
    let access_code = req.body.access_code;

    // セッションにデータを保存
    req.session.locals.form = {
      access_code: access_code
    };

    const respondError = async (message, name_list) => {
      req.session.locals.error = this._createTemplateErrorVals(message, name_list);
      await this._saveSession(req);
      res.redirect('/admin/accesscode');
    };

    // ポストデータをチェック
    if (access_code) {
      if (!/^\d{4}$/.test(access_code)) {
        respondError('アクセスコードは数字 4 桁で入力してください。', ['access_code']);
        return;
      }
    } else {
      access_code = '';
    }

    // アクセスコード登録処理
    try {
      const udata = { access_code: access_code };
      await this._uconf_manager.update(udata);
      this._onuconfupdated(udata);

      // セッションから CSRF のシークレットとトークンを削除
      delete req.session._csrf;
      res.clearCookie('_csrf');

      // セッションからエラーデータを削除
      req.session.locals.error = this._createTemplateErrorVals();

      // セッションを保存
      await this._saveSession(req);

      // ホームへリダイレクト
      res.redirect('/admin/index');

    } catch (error) {
      this._render(req, res, 'error', null, 500, error);
    }
  }

  // ----------------------------------------------------------------------
  // API トークン登録フォーム表示
  // - GET /admin/apitoken
  // ----------------------------------------------------------------------
  async _showApiTokenForm(req, res) {
    const csrf_name = 'apitoken';
    if (csrf_name !== req.session._csrf_name) {
      req.session.locals = {
        form: {
          api_token: this._conf.api_token,
        },
        error: this._createTemplateErrorVals()
      };
    }

    // CSRF のシークレットとトークンを生成
    const csrf_secret = this._csrf.secretSync();
    const csrf_token = this._csrf.create(csrf_secret);
    req.session._csrf_name = csrf_name;
    req.session._csrf = csrf_secret;

    // セッションを保存
    await this._saveSession(req);

    // Cookie にトークンをセット
    res.cookie('_csrf', csrf_token, { httpOnly: true });

    // ページを表示
    this._render(req, res, csrf_name, req.session.locals.form);
  }

  // ----------------------------------------------------------------------
  // API トークン登録
  // - POST /admin/apitoken
  // ----------------------------------------------------------------------
  async _setApiTokenForm(req, res) {
    // CSRF をチェック
    const csrf_secret = req.session._csrf;
    const csrf_token = req.cookies._csrf;
    if (this._csrf.verify(csrf_secret, csrf_token) === false) {
      this._render(req, res, 'error', null, 403, new Error('CSRF violation was detected.'));
      return;
    }

    // ポストデータを取得
    const api_token = req.body.api_token;

    // セッションにデータを保存
    req.session.locals.form = {
      api_token: api_token
    };

    const respondError = async (message, name_list) => {
      req.session.locals.error = this._createTemplateErrorVals(message, name_list);
      await this._saveSession(req);
      res.redirect('/admin/apitoken');
    };

    // ポストデータをチェック
    if (!api_token) {
      respondError('API トークンを入力してください。', ['api_token']);
      return;
    }

    // API トークン登録処理
    try {
      const udata = { api_token: api_token }
      await this._uconf_manager.update(udata);
      this._onuconfupdated(udata);

      // セッションから CSRF のシークレットとトークンを削除
      delete req.session._csrf;
      res.clearCookie('_csrf');

      // セッションからエラーデータを削除
      req.session.locals.error = this._createTemplateErrorVals();

      // セッションを保存
      await this._saveSession(req);

      // ホームへリダイレクト
      res.redirect('/admin/index');

    } catch (error) {
      this._render(req, res, 'error', null, 500, error);
    }
  }

  // ----------------------------------------------------------------------
  // WebSocket 接続状態を表示
  // - GET /admin/api/ws_status
  // ----------------------------------------------------------------------
  _apiGetWsStatus(req, res) {
    const data = {
      connected: this._ws_connected,
      message: this._ws_message
    };
    res.status(200);
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(data));
  }

  // ----------------------------------------------------------------------
  // デバイスの Set 権限の変更処理
  // - PUT /admin/api/device/permission/set
  // ----------------------------------------------------------------------
  async _apiPutDevicePermissionSet(req, res) {
    // ポストデータを取得
    const id = req.body.id;
    const state = req.body.state;

    let rdata = null;
    try {
      await this._device_manager.updatePermissionSet(id, state);
      rdata = {
        result: 0
      };
      res.status(200);
    } catch (error) {
      rdata = {
        result: 1,
        message: error.message
      };
      res.status(500);
    }
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(rdata));
  }

  // ----------------------------------------------------------------------
  // オンライン状態をオンラインに変更
  // - PUT /admin/api/onlinestate
  // ----------------------------------------------------------------------
  async _apiPutOnlinestate(req, res) {
    this._online_state = true;
    this._ononlinestatechanged(true);

    res.status(200);
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify({ result: 0 }));
  }

  // ----------------------------------------------------------------------
  // オンライン状態をオフラインに変更
  // - DELETE /admin/api/onlinestate
  // ----------------------------------------------------------------------
  async _apiDeleteOnlinestate(req, res) {
    this._online_state = false;
    this._ononlinestatechanged(false);

    res.status(200);
    res.header('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify({ result: 0 }));
  }

}

module.exports = HttpAdmin;
