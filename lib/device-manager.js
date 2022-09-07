/* ------------------------------------------------------------------
* cloud-gateway - device-manager.js
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');
const mFs = require('fs');
const mFsPromises = require('fs/promises');

class DeviceManager {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * ---------------------------------------------------------------- */
  constructor(params) {
    this._controller = params.controller;

    this._fpath = mPath.resolve(__dirname, '../data/devices.json');
    this._devices = {};
    this._manufacturer_names = {};
    this._device_class_names = {};

    this._onupdated = () => { };
  }

  set onupdated(fn) {
    if (typeof (fn) !== 'function') {
      throw new Error('The `fn` must be a function.');
    }
    this._onupdated = fn;
  }

  /* ------------------------------------------------------------------
  * init()
  * - 初期化
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() には何も渡されない
  * ---------------------------------------------------------------- */
  async init() {
    this._devices = {};
    this._manufacturer_names = {};
    this._device_class_names = {};

    if (mFs.existsSync(this._fpath)) {
      this._devices = await this._read();
      this._initDeviceInfo(this._devices);
    } else {
      try {
        await mFsPromises.writeFile(this._fpath, '{}');
      } catch (error) {
        throw new Error(this._fpath + ' の生成に失敗しました: ' + error.message);
      }
    }

    this._manufacturer_names = this._readManufacturerNames();
    this._device_class_names = this._readDeviceClassNames();
  };

  _initDeviceInfo(devices) {
    for (const dev of Object.values(devices)) {
      dev.address = '';
    }
  }

  _readManufacturerNames() {
    const manu = require(mPath.join(__dirname, '..', 'etc', 'manufacturerCode.json'));
    const names = {};
    for (const [mcode, data] of Object.entries(manu.data)) {
      const code = mcode.replace(/^0x/, '');
      names[code] = data;
    }
    return names;
  }

  _readDeviceClassNames() {
    const dpath = mPath.join(__dirname, '..', 'etc', 'mraData', 'devices');
    const flist = mFs.readdirSync(dpath);
    const names = {};
    for (const fname of flist) {
      if (!fname.startsWith('0x')) {
        continue;
      }
      const data = require(mPath.join(dpath, fname));
      const eoj = data.eoj.replace(/^0x/, '');
      names[eoj] = data.className;
    }
    names['0EF0'] = {
      ja: 'ノードプロファイル',
      en: 'Node Profile'
    };
    return names;
  }

  async _read() {
    let devices = null;
    try {
      const json = await mFsPromises.readFile(this._fpath, 'utf8');
      devices = JSON.parse(json);
    } catch (error) {
      throw new Error(this._fpath + ' の読み取りに失敗しました: ' + error.message);
    }
    return devices;
  }

  async _write(devices) {
    try {
      const json = JSON.stringify(devices, null, '  ');
      await mFsPromises.writeFile(this._fpath, json, 'utf8');
      this._onupdated(JSON.parse(JSON.stringify(this._devices)));
    } catch (error) {
      throw new Error(this._fpath + ' の書き込みに失敗しました: ' + error.message);
    }
  }

  /* ------------------------------------------------------------------
  * deleteAll()
  * - 登録デバイスをすべて削除する
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * ---------------------------------------------------------------- */
  async deleteAll() {
    try {
      await this._write({});
      this._devices = {};
    } catch (error) {
      throw new Error(this._fpath + ' の書き込みに失敗しました: ' + error.message);
    }
  }

  /* ------------------------------------------------------------------
  * getAll()
  * - すべての登録済みデバイスを取得する
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() にはすべてのデバイス情報を格納した Object オブジェクトが渡される。
  * {
  *   "FE000008E84F25C878A000000000000000": {
  *     "id": "FE000008E84F25C878A000000000000000",
  *     "address": "192.168.11.6",
  *     "permission": { "get": true, "set": true },
  *     "instances": {
  *       "0EF001": {
  *         ...
  *       },
  *       "013001": {
  *         "eoj": "013001",
  *         "version": "J",
  *         "manufacturer": {
  *           "code": "000008",
  *           "name": { "ja": "ダイキン工業株式会社", "en": "DAIKIN INDUSTRIES" }
  *         },
  *         "deviceclass": {
  *           "code": "0130",
  *           "name": { "ja": "家庭用エアコン", "en": "Home air conditioner" }
  *         }
  *       }
  *     }
  *   },
  *   ...
  * }
  * ---------------------------------------------------------------- */
  async getAll() {
    // 保存済みのデバイス情報の address をリセット
    for (const dev of Object.values(this._devices)) {
      dev.address = '';
    }

    // HEMS コントローラーが発見したデバイスを取得
    const active_devices = this._controller.getDevices();

    // 保存済みデバイス情報をアップデート
    for (const [id, device] of Object.entries(active_devices)) {
      if (!this._devices[id]) {
        continue;
      }

      const instances = {};
      for (const [eoj, instance] of Object.entries(device.instances)) {
        const mcode = instance.manufacturer_code;
        const ccode = instance.eoj.substring(0, 4);

        const ins = {
          eoj: eoj,
          version: instance.version,
          manufacturer: {
            code: mcode,
            name: this._manufacturer_names[mcode] || { ja: '', en: '' }
          },
          deviceclass: {
            code: ccode,
            name: this._device_class_names[ccode] || { ja: '', en: '' }
          }
        };
        instances[eoj] = ins;
      }
      this._devices[id].address = device.address;
      this._devices[id].instances = instances;
    }

    // 保存済みだったデバイス情報を改めて保存
    await this._write(this._devices);

    // コピーを返す
    return JSON.parse(JSON.stringify(this._devices));
  }

  /* ------------------------------------------------------------------
  * getList()
  * - 登録済みデバイス一覧を取得する (管理メニュー表示用)
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() にはデバイス一覧の Array オブジェクトが渡される。
  * [
  *   {
  *     "id": "FE000008E84F25C878A000000000000000",
  *     "address": "192.168.11.6",
  *     "permission": { "get": true, "set": true },
  *     "instances": [
  *       {
  *         "eoj": "0EF001",
  *         ...
  *       },
  *       {
  *         "eoj": "013001",
  *         "version": "J",
  *         "manufacturer": {
  *           "code": "000008",
  *           "name": { "ja": "ダイキン工業株式会社", "en": "DAIKIN INDUSTRIES" }
  *         },
  *         "deviceclass": {
  *           "code": "0130",
  *           "name": { "ja": "家庭用エアコン", "en": "Home air conditioner" }
  *         }
  *       }
  *     ]
  *   },
  *   ...
  * ]
  * ---------------------------------------------------------------- */
  async getList() {
    // 登録済みのデバイス情報を取得
    const devices = await this.getAll();

    // Array に変換
    const device_list = this._convDevicesToList(devices);
    return device_list;
  }

  _convDevicesToList(devices) {
    const id_list = Object.keys(devices);
    id_list.sort();
    const device_list = [];
    for (const id of id_list) {
      const ins_list = [];
      for (const ins of Object.values(devices[id].instances)) {
        ins_list.push(ins);
      }
      devices[id].instances = ins_list;
      device_list.push(devices[id]);
    }
    return device_list;
  }

  /* ------------------------------------------------------------------
  * getCandidateList()
  * - 未登録のデバイス一覧を取得する (管理メニュー表示用)
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() にはデバイス一覧の Array オブジェクトが渡される。
  * [
  *   {
  *     "id": "FE000008E84F25C878A000000000000000",
  *     "address": "192.168.11.6",
  *     "permission": { "get": true, "set": true },
  *     "instances": [
  *       {
  *         "eoj": "0EF001",
  *         ...
  *       },
  *       {
  *         "eoj": "013001",
  *         "version": "J",
  *         "manufacturer": {
  *           "code": "000008",
  *           "name": { "ja": "ダイキン工業株式会社", "en": "DAIKIN INDUSTRIES" }
  *         },
  *         "deviceclass": {
  *           "code": "0130",
  *           "name": { "ja": "家庭用エアコン", "en": "Home air conditioner" }
  *         }
  *       }
  *     ]
  *   },
  *   ...
  * ]
  * ---------------------------------------------------------------- */
  async getCandidateList() {
    // HEMS コントローラーが発見したデバイスを取得
    const active_devices = this._controller.getDevices();

    // 未登録デバイスを抽出
    const candidates = {};
    for (const [id, device] of Object.entries(active_devices)) {
      if (this._devices[id]) {
        continue;
      }

      const instances = {};
      for (const [eoj, instance] of Object.entries(device.instances)) {
        const mcode = instance.manufacturer_code;
        const ccode = instance.eoj.substring(0, 4);

        const ins = {
          eoj: eoj,
          version: instance.version,
          manufacturer: {
            code: mcode,
            name: this._manufacturer_names[mcode] || { ja: '', en: '' }
          },
          deviceclass: {
            code: ccode,
            name: this._device_class_names[ccode] || { ja: '', en: '' }
          }
        };
        instances[eoj] = ins;
      }

      candidates[id] = {
        id: device.id,
        address: device.address,
        permission: {
          get: false,
          set: false
        },
        instances: instances
      };
    }

    // Array に変換
    const candidate_list = this._convDevicesToList(candidates);
    return candidate_list;
  }

  /* ------------------------------------------------------------------
  * add(id_list)
  * - デバイスを登録
  *
  * [引数]
  * - id_list | Array | 必須 | 登録したいデバイス ID の配列
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない。
  * ---------------------------------------------------------------- */
  async add(id_list) {
    const candidate_list = await this.getCandidateList();
    const candidates = {};
    for (const dev of candidate_list) {
      candidates[dev.id] = dev;
    }

    try {
      // HEMS コントローラーが発見したデバイスを取得
      for (const id of id_list) {
        const dev = candidates[id];
        if (!dev) {
          throw new Error('指定の ID `' + id + '` が見つかりませんでした。');
        }
        dev.permission.get = true;
        dev.permission.set = true;
        this._devices[id] = dev;
      }

      // デバイス情報を保存
      await this._write(this._devices);

    } catch (error) {
      throw new Error(this._fpath + ' の書き込みに失敗しました: ' + error.message);
    }
  }

  /* ------------------------------------------------------------------
  * del(id_list)
  * - デバイスを削除
  *
  * [引数]
  * - id_list | Array | 必須 | 削除したいデバイス ID の配列
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない。
  * ---------------------------------------------------------------- */
  async del(id_list) {
    try {
      // HEMS コントローラーが発見したデバイスを取得
      for (const id of id_list) {
        const dev = this._devices[id];
        if (!dev) {
          throw new Error('指定の ID `' + id + '` が見つかりませんでした。');
        }
        delete this._devices[id];
      }

      // デバイス情報を保存
      await this._write(this._devices);

    } catch (error) {
      throw new Error(this._fpath + ' の書き込みに失敗しました: ' + error.message);
    }
  }

  /* ------------------------------------------------------------------
  * updateermissionSet(id, state)
  * - 指定のデバイスの Set 権限を更新する
  *
  * [引数]
  * - id    | String  | 必須 | デバイス ID
  * - state | Boolean | 必須 | true または false
  *
  * [返値]
  * - Promise オブジェクト
  * - resolve() には何も引き渡されない。
  * ---------------------------------------------------------------- */
  async updatePermissionSet(id, state) {
    try {
      if (!id || typeof (id) !== 'string') {
        throw new Error('パラメーター `id` の値が不適切です。');
      }
      if (typeof (state) !== 'boolean') {
        throw new Error('パラメーター `state` の値が不適切です。');
      }

      // 保存済みのデバイス一覧を取得
      const dev = this._devices[id];
      if (!dev) {
        throw new Error('指定の ID `' + id + '` が見つかりませんでした。');
      }

      // Set 権限を更新
      dev.permission.set = state;

      // デバイス情報を保存
      await this._write(this._devices);

    } catch (error) {
      throw new Error(this._fpath + ' の書き込みに失敗しました: ' + error.message);
    }
  }

}

module.exports = DeviceManager;
