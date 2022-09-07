/* ------------------------------------------------------------------
* cloud-gateway - api-logger.js
* ---------------------------------------------------------------- */
'use strict';
const mPath = require('path');
const mFs = require('fs');
const mFsPromises = require('fs/promises');

class ApiLogger {
  /* ------------------------------------------------------------------
  * コンストラクタ
  * ---------------------------------------------------------------- */
  constructor() {
    // `logs` ディレクトリのパス
    this._log_dir = mPath.resolve(__dirname, '../logs/api');

    // 現在のアクセスログファイルのパス
    this._access_log_file_path = '';
    // アクセスログファイルのストリームオブジェクト
    this._access_log_file_stream = null;

  }

  init() {
    if (!mFs.existsSync(this._log_dir)) {
      try {
        mFs.mkdirSync(this._log_dir);
      } catch (error) {
        throw new Error('ログディレクトリ生成に失敗しました (' + this._log_dir + '): ' + error.message);
      }
    }
    if (!mFs.statSync(this._log_dir).isDirectory()) {
      throw new Error('ログディレクトリパス `' + this._log_dir + ' はディレクトリではありません。');
    }
  };

  /* ------------------------------------------------------------------
  * getAccessLogFileList()
  * - アクセスログファイルの一覧を取得
  *
  * [引数]
  * - なし
  *
  * [返値]
  * - Promise オブジェクト
  *
  * resolve() には以下の配列が渡される:
  * ["access-2020-10-21.log", "access-2020-10-20.log"]
  * ---------------------------------------------------------------- */
  async getAccessLogFileList() {
    // 日別アクセス数情報を取得
    let counts_fpath = this._log_dir + '/counts.json';
    let counts = {};
    let mdate = '1970-01-01';
    if (mFs.existsSync(counts_fpath)) {
      try {
        let json = await mFsPromises.readFile(counts_fpath, 'utf8');
        counts = JSON.parse(json);

        let counts_stat = await mFsPromises.stat(counts_fpath);
        let mdt = counts_stat.mtime;
        mdate = [
          mdt.getFullYear(),
          ('0' + (mdt.getMonth() + 1)).slice(-2),
          ('0' + mdt.getDate()).slice(-2)
        ].join('-')

      } catch (error) {
        counts = {};
      }
    }

    // アクセスログのファイル名リストを取得
    let all_fname_list = await mFsPromises.readdir(this._log_dir);
    let fname_list = [];
    for (let fname of all_fname_list) {
      if (/^access\-\d{4}\-\d{2}\-\d{2}\.log$/.test(fname)) {
        fname_list.push(fname);
      }
    }
    fname_list.sort();
    fname_list = fname_list.reverse();

    // 今日のログファイル名
    let dt_now = new Date();
    let today = this._getDate(dt_now);
    let today_fname = 'access-' + today + '.log';

    // ファイルサイズを取得し、行数をカウント
    let flist = [];
    let new_counts = {};

    for (let fname of fname_list) {
      let fpath = mPath.resolve(this._log_dir, fname);
      let stat = await mFsPromises.stat(fpath);

      let count = 0;
      if (counts[fname]) {
        count = counts[fname];
        new_counts[fname] = count;
      } else {
        count = await this._countLineNum(fpath);
        if (fname !== today_fname) {
          new_counts[fname] = count;
        }
      }

      flist.push({
        name: fname,
        size: stat.size,
        count: count
      });
    }

    if (mdate !== today) {
      await mFsPromises.writeFile(counts_fpath, JSON.stringify(new_counts, null, '  '), 'utf8');
    }

    return flist;
  }

  _countLineNum(fpath) {
    return new Promise((resolve) => {
      let count = 0;
      mFs.createReadStream(fpath)
        .on('data', (chunk) => {
          for (let i = 0; i < chunk.length; i++)
            if (chunk[i] === 0x0A) count++;
        })
        .on('end', () => {
          resolve(count);
        });
    });
  }

  /* ------------------------------------------------------------------
  * getAccessLogFilePath(fname)
  * - 指定のアクセスログファイル名のパスを返す
  *
  * [引数]
  * - fname  | String | 必須 | アクセスログファイル名 (例: "access-2020-10-21.log")
  *
  * [返値]
  * - ファイルのパス (例: "/var/www/elwebapi/logs/api/access-2020-10-21.log")
  * - 指定のファイルが存在しなければ `null` が返される
  * ---------------------------------------------------------------- */
  getAccessLogFilePath(fname) {
    if (!/^access\-\d{4}\-\d{2}\-\d{2}\.log$/.test(fname)) {
      return null;
    }
    let fpath = this._log_dir + '/' + fname;
    if (mFs.existsSync(fpath)) {
      return fpath;
    } else {
      return null;
    }
  }

  /* ------------------------------------------------------------------
  * log(req_info)
  * - アクセスログ出力
  *
  * [引数]
  * - req_info  | Object  | 必須 | The request object of HttpApi.js
  *
  * [返値]
  * - なし
  * ---------------------------------------------------------------- */
  log(req_info) {
    if (!req_info) {
      return;
    }
    let dt = new Date();
    let date = this._getDate(dt);
    let time_stamp = this._getTimeStamp(dt);

    let log_cols = [
      time_stamp,
      req_info.remote.id,
      req_info.remote.name,
      req_info.remote.address,
      req_info.method,
      req_info.path,
    ];
    let log = log_cols.join(' ') + '\n';

    let fpath = this._log_dir + '/access-' + date + '.log';

    if (!this._access_log_file_stream || this._access_log_file_path !== fpath) {
      if (this._access_log_file_stream) {
        this._access_log_file_stream.end();
      }
      this._access_log_file_stream = mFs.createWriteStream(fpath, {
        flags: 'a',
        encoding: 'utf8'
      });
      this._access_log_file_path = fpath;
    }
    this._access_log_file_stream.write(log);
  }

  _getTimeStamp(dt) {
    let date = this._getDate(dt);
    let time = this._getTime(dt);
    let tz = this._getTz(dt);
    let time_stamp = date + 'T' + time + tz;
    return time_stamp;
  }

  _getDate(dt) {
    let Y = dt.getFullYear();
    let M = this._zeroPadding(dt.getMonth() + 1);
    let D = this._zeroPadding(dt.getDate());
    return [Y, M, D].join('-');
  };

  _getTime(dt) {
    let h = this._zeroPadding(dt.getHours());
    let m = this._zeroPadding(dt.getMinutes());
    let s = this._zeroPadding(dt.getSeconds());
    return [h, m, s].join(':');
  };

  _getTz(dt) {
    let tzoffset = dt.getTimezoneOffset();
    let tz = (tzoffset >= 0) ? '-' : '+';
    tzoffset = Math.abs(tzoffset);
    tz += this._zeroPadding(parseInt(tzoffset / 60, 10));
    tz += ':';
    tz += this._zeroPadding(parseInt(tzoffset % 60));
    return tz;
  };

  _zeroPadding(n) {
    return ('0' + n).slice(-2);
  };
}

module.exports = ApiLogger;
