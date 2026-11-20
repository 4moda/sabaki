# Sabaki（サバキ）

SD カードの画像（RAW / JPEG）・動画を Exif メタデータに基づいて高速に HDD / SSD へ振り分けコピーし、取り込み完了時の属性分析＆スマート通知、GitHub 草風「撮影アクティビティ・ヒートマップ」を含む統計ダッシュボード、SNS 投稿・Web サイト連携出力を備えたタスクトレイ常駐アプリケーションです。

---

## 主な機能

- **SD カード高速取り込み & Exif 自動振り分け**
  - サブフォルダ内の RAW・JPEG・動画ファイルを再帰的に事前スキャンし、メディア種別・拡張子・合計サイズを確認できます。
  - `{YYYY}`, `{MM}`, `{DD}`, `{YYYY-MM-DD}`, `{YYYYMMDD}`, `{Ext}` トークンを組み合わせたリアルタイム保存先パスビルダーと 5 種のプリセットに対応しています。
  - DB 履歴（SHA-256）による重複スキップに加え、同名ファイル競合時の 4 つの処理モード（内容ハッシュ比較 / 常にスキップ / 常に連番リネーム / 上書き）および大容量動画向け高速ハッシュモードを備えています。
- **撮影属性アナライズレポート（Session Digest）& OS ネイティブ通知**
  - 取り込み完了直後に「撮影スタイル傾向」タグ、メインカメラ・レンズ、スイートスポット焦点距離、大口径（F2.8 以下）撮影率、ワンクリック SNS シェアテキストをまとめたレポートを生成し、OS ネイティブ通知でお知らせします。
- **52 週撮影アクティビティ・ヒートマップ & Exif 分析ダッシュボード**
  - GitHub の草表示風の 52 週ヒートマップ（総ショット数・年間稼働日数・連続記録・日別ドリルダウン）を表示します。
  - カメラ・レンズ稼働率ランキング、実焦点距離／35mm 判換算切替可能な焦点距離ヒストグラム、F 値・ISO 感度分布、月別 RAW / JPEG / VIDEO 推移チャートをインタラクティブに絞り込めます。
- **SNS Exif キャプション & Web 公開用クリーン JSON 出力**
  - 取込履歴画面から各写真のお気に入り（★）管理と SNS 投稿用 Exif クレジットのワンクリックコピーが可能です。
  - `sourcePath`・`destPath`・生 Exif データを自動除去した `stats-public.json` を出力できます。
- **タスクトレイ / メニューバー常駐（サバトラ猫アイコン）**
  - サバトラ猫モチーフのアプリアイコンおよびトレイアイコン（macOS はライト／ダーク対応テンプレートアイコン）を備え、ウィンドウを閉じてもトレイに常駐し、ワンクリックで開閉・メニューから完全終了できます。

---

## 動作要件 & 開発環境セットアップ

- **Node.js**: `24.x` 推奨（ビルトイン `node:sqlite` を使用するため `22.12.0` 以上が必要）
- **npm**: `10.x` / `11.x`

```bash
# 依存関係のインストール
npm ci

# 開発モードで起動（Main / Preload / Renderer ホットリロード）
npm run dev
```

---

## テスト・ビルドコマンド

| コマンド | 説明 |
| --- | --- |
| `npm run typecheck` | TypeScript 型チェック（`tsc --noEmit`） |
| `npm test` | Vitest ユニットテスト実行（Domain / Application / SQLite / FileSystem） |
| `npm run build` | Electron 本番バンドル生成（`out/main`, `out/preload`, `out/renderer`） |
| `npm run test:e2e` | Playwright 実 Electron E2E テスト実行・スナップショット／ARIA 診断出力 |
| `npm run build:win` | Windows インストーラ（NSIS `.exe`）・Portable 版ビルド（`release/`） |
| `npm run build:mac` | macOS パッケージ（`.dmg` / `.zip`）ビルド（`release/`） |
| `npm run icons:generate` | SVG から `.ico` / `.icns` / PNG / トレイ用 Data URL を再生成（※ `rsvg-convert` と ImageMagick が必要） |

---

## ローカル限定ビジュアルレビュー手順

GitHub Actions の `ci.yml` は Windows / macOS 実 Electron で撮影したスナップショットおよび自動レイアウト診断（`manifest.json`）を **プライベート Artifacts (`visual-review-bundle`)** として保存します（外部公開は行いません）。

手元のブラウザで `127.0.0.1` ローカル限定サーバーを起動して確認できます（要 `gh` CLI ログイン済み）。

```bash
# PR のスナップショットを main との Before/After 比較付きで閲覧
npm run review:open -- --pr <PR番号>

# main ブランチ最新 CI の結果を閲覧
npm run review:open -- --branch main

# 特定の CI Run ID を指定して閲覧
npm run review:open -- --run <RunID>

# ローカルで `npm run test:e2e` 実行後に取得したスナップショットを閲覧
npm run review:open -- --local
```

---

## アーキテクチャ & ディレクトリ構成

- **Backend / Core**: オニオンアーキテクチャ（Domain / Application / Infrastructure / Presentation）
- **Frontend / Renderer**: React 19 + TypeScript + Tailwind CSS v4 + アトミックデザイン（Atoms / Molecules / Organisms / Templates / Pages）
- **Runtime & Storage**: Electron + `electron-vite` + `electron-builder` + `node:sqlite`

```text
src/
├── core/
│   ├── domain/          # ドメインモデル・ポート定義・純粋ドメインサービス（パス構築/重複解決/ヒートマップ/SNS変換）
│   ├── application/     # IPC 契約 DTO・アプリケーションユースケース（スキャン/取込/分析/エクスポート/初期化）
│   └── __tests__/       # Vitest 単体・結合テスト
├── main/
│   ├── infrastructure/  # SQLite リポジトリ・Exif(exifr)・ファイルシステム・設定JSON・Electron Tray/Window/通知
│   ├── presentation/    # IPC ハンドラ登録
│   └── index.ts         # DI ルート & ライフサイクル管理
├── preload/             # contextBridge による型付き `window.sabaki` API
└── renderer/src/
    ├── components/      # Atomic Design (atoms / molecules / organisms / templates / pages)
    ├── hooks/           # 状態管理・IPC 連携カスタムフック
    └── styles/          # Tailwind CSS v4 エントリーポイント
e2e/                     # Playwright 実 Electron E2E テスト & スナップショット収集
scripts/                 # アイコン生成・プライベート Visual Review サイト構築/起動スクリプト
```

---

## 初回起動時のご注意（未署名ビルドをご利用の場合）

現在公開されているビルド（`.github/workflows/release.yml` で生成される開発・初期リリースアセット）は OS 向けのコード署名が未設定のため、初回起動時に OS の保護機能が警告を表示する場合があります。

### Windows（Microsoft Defender SmartScreen）

1. 「Windows によって PC が保護されました」と表示された場合は **「詳細情報」** をクリックします。
2. 発行元確認画面で **「実行」** をクリックして Sabaki を起動します。

### macOS（Gatekeeper）

1. 「"Sabaki" は開発元を検証できないため開けません」または「壊れているため開けません」と表示された場合は、**システム設定 ＞ プライバシーとセキュリティ** の下部にある **「このまま開く」** をクリックしてください。
2. `Sabaki.app` を `/Applications` にコピーした後に Quarantine 属性が原因で起動できない場合は、ターミナルから以下を実行することもできます。

```bash
xattr -cr /Applications/Sabaki.app
```

---

## ライセンス

[MIT](https://opensource.org/licenses/MIT)
