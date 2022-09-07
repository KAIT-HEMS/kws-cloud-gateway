# kws-cloud-gateway
 実証システム - クラウドGateway

## 更新履歴

- 2022-09-06
    - ダッシュボードのデバイス管理画面の「デバイス情報更新」の名称を「デバイス情報初期化」に変更し、これを実行したら、追加した機器情報も含めて機器情報を全て初期化 (削除) したのちに、機器探索をする。(以前のリセットという機能は廃止)

- 2022-09-04
    - ダッシュボードのデバイス管理画面に「デバイス情報更新」機能を新たに追加した。これにより、保持している発見済みデバイスの情報をリセットし、改めてデバイス発見処理を開始する。

- 2022-08-30
    - `package.json` に以下を追記し、`npm start` で `node start.js --enable-debug` を実行できるようにした。

- 2022-08-26
    - `cloud-gateway/lib/controller/controller-net.js:368` で `The send queue is full.` というエラーが出たため、ECHONET Lite パケット送信のキューの上限を 10 から 100 へ、送信間隔を 100 ms から 20 ms に変更した。

- 2022-08-22
    - ローカルネットワークで INF パケットを受信した際に、自身に未登録のデバイスからの INF も Web API クラウドに中継していた不具合を改修した。

- 2022-08-14
    - WebSocket の接続パスを `/ws/controller` から `/ws/gateway` に変更した。
    - `cloud-gateway/etc/config.default.json` を `config.json` にコピーする仕組みを廃止した。
        - ユーザー設定はダッシュボードで設定するため、コピーを生成する必要性がないため
        - 今後は `config.default.json` は廃止となり、`config.json` のみが存在する
    - ダッシュボードで設定したユーザー設定の保存先を `cloud-gateway/etc/config.user.json` から `cloud-gateway/data/config.user.json` に変更した。
        - ユーザー関連のファイルの保存は `etc/` ではなく `data/` に集約したかったため

- 2022-08-09
    - ダッシュボードにアクセスコード管理を新たに追加した。

- 2022-08-03
    - ダッシュボードにオンライン・オフライン切り替え機能を新たに追加した。
    - Mac で読み込み中のモーダルウィンドウが表示された際に、それが閉じない不具合があったため、モーダルウィンドウの表示を取りやめた。
    
- 2022-07-31
    - ダッシュボードに「デバイス管理」を新たに追加した。

- 2022-07-28
    - ディレクトリ名を `hems-controller` から `cloud-gateway` に変更
    - ダッシュボードを新設し以下の機能を実装
        - API トークン設定
        - システムログモニター
        - システムログ管理

- 2022-06-28
    - 機器発見にマルチキャストで送信するパケットの DEOJ に `0EF000` がセットされていたが、それを `0EF001` に変更した。

- 2022-01-03
    - ドキュメントをアップデート (環境構築関連)

- 2021-11-25
    - ローカル環境でスーパークラスの積算運転時間 (EPC=0x9A) の Get_RES を受信するとエラーになる不具合を改修した。

- 2021-06-03
    - WebSocket 接続をサーバーにより拒否された場合、サーバーのレスポンスヘッダー `x-websocket-reject-reason` の値をチェックし、再接続しないロジックを加えた。