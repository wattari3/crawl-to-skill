# crawl-to-skill

`crawl-to-skill` は、指定したWebページ（またはWebサイト全体）をクロールし、本文コンテンツと画像を抽出・最適化してMarkdown形式に変換し、AIエージェントのスキルとしてそのまま利用可能な**Skillフォルダ**を生成するCLIツールです。

出力されたSkillフォルダは、他のプロジェクトの `.agents/skills/` などの下にコピーするだけで、AIエージェント用のナレッジソース（RAG用のインデックスを含む）として動作します。

---

## 主な機能

- **Playwrightベースの高度なクロール**: JavaScript実行が必要なモダンなSPAや動的Webサイトのクロールに対応。
- **メインコンテンツ自動抽出**: `@mozilla/readability` を使用して、ナビゲーション、フッター、広告、Cookie同意バナーなどのノイズを排除した純粋な本文テキストを抽出。
- **GFM対応Markdown変換**: `turndown` とそのプラグインを使用して、表（Table）やコードブロックのシンタックスハイライト、リンク構造などを保持したMarkdownに変換。
- **画像ダウンロードと最適化**: ページ内の画像を自動取得し、重複を排除（URLハッシュによる管理）した上で、アスペクト比を維持しつつ指定最大幅に自動リサイズ（`sharp` を使用）。
- **WASM OCR処理**: `tesseract.js` を使用し、ダウンロードした画像内のテキストを自動抽出（日本語・英語に対応）。システム側にTesseractバイナリのインストールは不要です。
- **RAGインデックス自動生成**: 抽出したMarkdownテキストおよび画像のOCR結果を、見出しや段落でインデックスフレンドリーに自動チャンク分割。大規模サイトでもメモリを圧迫しないJSONLines（`.jsonl`）形式でストリーミング出力します。
- **認証ログイン対応**: クロール前にログインフロー（`fill`, `click`, `waitForNavigation` など）を自動実行し、セッション（Cookie等の状態）を有効期限（TTL）付きで安全にキャッシュして再利用。

---

## プロジェクト構成

```
crawl-to-skill/
├── package.json         - 依存ライブラリ、起動スクリプト、CLIバイナリ設定
├── tsconfig.json        - TypeScript コンパイル設定
├── .gitignore           - Git除外設定（認証キャッシュファイルや一時フォルダを除外）
├── README.md            - 本ドキュメント
├── src/
│   ├── index.ts         - CLIエントリポイント。パイプライン全体のフロー制御
│   ├── types.ts         - 共通の型定義（CrawlResult, RagChunk, CrawlReport等）
│   ├── config/          - 設定ローダー、Zodバリデーション、環境変数展開ユーティリティ
│   │   ├── defaults.ts  - 設定パラメータのデフォルト値一元管理
│   │   ├── schema.ts    - Zodによる厳格な設定ファイルスキーマ定義
│   │   ├── loader.ts    - CLIオプションとJSON設定ファイルのディープマージ
│   │   └── env-expander.ts - 設定ファイル内の `${ENV_VAR}` プレースホルダーを展開
│   ├── crawler/         - クローラー制御
│   │   ├── crawler.ts   - PlaywrightCrawlerを使用したページ巡回と情報収集
│   │   ├── auth-handler.ts - Playwrightブラウザによる事前ログイン・セッションキャッシュ管理
│   │   └── url-filter.ts  - 許可/除外URLのGlobマッチングルール構築
│   ├── processor/       - コンテンツ加工・変換処理
│   │   ├── content-extractor.ts - メインコンテンツの抽出およびノイズ要素の除去
│   │   ├── html-to-markdown.ts  - HTMLのMarkdown（GFM）への変換とリンク解決
│   │   ├── image-handler.ts     - 画像ダウンロード、重複排除、アスペクト比維持リサイズ
│   │   └── image-ocr.ts         - tesseract.jsを使用した画像内文字起こし
│   ├── rag/             - RAGインデックス生成
│   │   └── indexer.ts   - テキスト/OCRテキストのチャンク分割とjsonl追記書き込み
│   ├── skill-builder/   - フォルダ構築
│   │   └── skill-folder.ts - Skillフォルダのクリーンアップ、作成、SKILL.mdおよびレポートの生成
│   └── utils/           - 共通ユーティリティ（ログ・スピナー、ハッシュ、スラッグ変換）
├── examples/            - 設定ファイルのサンプルテンプレート
│   ├── config-simple.json - 最小限のクロール設定例
│   └── config-full.json   - 認証、OCR、詳細な除外条件等を含むフル設定例
└── output/              - デフォルトの出力先（クロール実行後に生成されるSkillフォルダが配置されます）
```

---

## 開発と実行方法

### 動作環境
- Node.js 20 以上
- Playwright Chromium ブラウザ

### 1. セットアップ
プロジェクトディレクトリで依存関係をインストールし、Playwrightに必要なブラウザをセットアップします。

```bash
# 依存パッケージのインストール
npm install

# Playwright 用ブラウザ（Chromium）のインストール
npx playwright install chromium
```

### 2. ビルド
TypeScriptソースをJavaScriptにコンパイルします。

```bash
npm run build
```

### 3. コマンドラインからの実行方法

ビルドされたJSを実行するか、開発用ツール（`tsx`）を使用して直接実行できます。

#### CLIフラグで簡易実行（設定ファイルなし）
```bash
# ビルド済みコードで実行
node dist/index.js crawl https://example.com --name my-skill --depth 2

# tsxで直接実行（開発時）
npx tsx src/index.ts crawl https://example.com --name my-skill --depth 2 --max-requests 50
```

#### 設定ファイルを指定して実行（推奨）
```bash
# シンプルな設定ファイルを使用
npx tsx src/index.ts crawl -c examples/config-simple.json

# フル設定ファイルを使用（詳細ログ有効化）
npx tsx src/index.ts crawl -c examples/config-full.json --verbose
```

### CLIオプション一覧

`crawl` コマンドで指定可能なフラグは以下の通りです。これらは設定ファイル（JSON）で定義された値よりも優先されます。

| オプション / フラグ | 短縮形 | 説明 | デフォルト値 |
|---|---|---|---|
| `-c, --config <path>` | `-c` | 実行用JSON設定ファイルのパスを指定します。 | — |
| `--name <skill-name>` | — | 生成するSkillの名称（フォルダ名）を指定します。 | 起点URLのホスト名 |
| `--depth <n>` | — | クロールの深さ（ホスト制限内）。`0` を指定した場合は無制限。 | `3` |
| `--max-requests <n>` | — | クロールでリクエストする最大ページ数（暴走防止）。 | `100` |
| `--output <dir>` | — | 生成されるSkillフォルダのルート出力先。 | `./output` |
| `--no-images` | — | 画像のダウンロードをスキップし、Markdownからの画像リンク書き換えも行いません。 | `false`（画像をダウンロードする） |
| `--no-ocr` | — | 画像のダウンロードは行いますが、OCR（文字起こし）処理をスキップします。 | `false`（OCRを実行する） |
| `--verbose` | — | 詳細なデバッグログ（クロール対象URLや処理時間など）をコンソールに出力します。 | `false` |

---

## 設定ファイル（Config）パラメータ詳細

設定ファイルは JSON 形式で記述します。環境変数（例：`${LOGIN_PASSWORD}`）を文字列内に埋め込むことができ、ロード時に自動展開されます。

### ルートパラメータ

| キー | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `name` | `string` | （任意） | 生成されるSkillフォルダの名称。CLI引数 `--name` が未指定の場合に適用されます。 |
| `startUrls` | `string[]` | （必須） | クロールを開始する1つ以上のURLのリスト。 |
| `output` | `string` | `"./output"` | 出力先フォルダのルートパス。 |
| `crawl` | `object` | `{}` | クロールの動作・制限に関する詳細設定（以下参照）。 |
| `content` | `object` | `{}` | ページからのテキスト抽出に関する詳細設定（以下参照）。 |
| `images` | `object` | `{}` | 画像取得・リサイズ・OCRに関する詳細設定（以下参照）。 |
| `auth` | `object` | — | クロール前の自動ログインに関する詳細設定（任意。以下参照）。 |

---

### `crawl` パラメータ（クロール詳細設定）

| キー | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `depth` | `number` | `3` | 起点URLからリンクをたどる階層数。`0` の場合は無制限。 |
| `maxRequests` | `number` | `100` | クロールでリクエストする最大URL数。 |
| `globs` | `string[]` | （任意） | クロールの対象を制限するGlobパターンのリスト。指定した場合、これにマッチしないURLは巡回されません。 |
| `exclude` | `string[]` | （任意） | クロールから完全に除外するURLのGlobパターンのリスト。PDFファイルなどのダウンロードを防ぐ目的にも利用されます。 |
| `maxRetries` | `number` | `3` | リクエスト失敗（タイムアウトやエラー）時に再試行する最大回数。 |
| `navigationTimeoutSecs`| `number` | `60` | ページへのナビゲーション（ロード完了）を待機する最大秒数。 |
| `requestHandlerTimeoutSecs`| `number` | `120` | 各ページに対するコンテンツ抽出・画像処理・Markdown変換のタイムアウト秒数。 |

---

### `content` パラメータ（テキスト抽出設定）

| キー | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `useReadability` | `boolean` | `true` | `true` の場合、Mozilla Readability を用いて本文を自動抽出します。`false` の場合はページ全体（body）を対象にします。 |
| `contentSelector` | `string \| null` | `null` | 本文が配置されている特定のコンテナ（例：`"main#content"`）のCSSセレクタ。指定した場合、Readability による自動抽出は行われず、このセレクタの内容を直接抽出します。 |
| `removeSelectors` | `string[]` | `['nav', 'header', 'footer', 'aside', ...]` | コンテンツ抽出の前に、DOMから削除する不要な要素のCSSセレクタのリスト（広告、メニュー、スクリプト等）。 |

---

### `images` パラメータ（画像・OCR設定）

| キー | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `download` | `boolean` | `true` | 画像ファイルをローカルにダウンロードして保存するかどうか。 |
| `maxWidthPx` | `number` | `2048` | ダウンロードした画像の最大幅。これより大きい画像は、縦横比を維持しながらリサイズされます。 |
| `ocr` | `boolean` | `true` | ダウンロードした画像に対してOCR（文字起こし）を実行するかどうか。 |
| `ocrLanguages` | `string[]` | `['jpn', 'eng']` | OCRに用いる Tesseract 言語データコード（日本語: `jpn`, 英語: `eng`）。複数指定すると同時に認識します。 |
| `excludePatterns` | `string[]` | `['**/tracking/**', '**/pixel/**', '**/beacon/**']` | ダウンロードおよびOCRの対象から除外する画像URLのGlobパターンリスト。 |

---

### `auth` パラメータ（認証ログイン設定）

ログインが必要な会員制サイトなどをクロールする場合に指定します。

| キー | 型 | デフォルト値 | 説明 |
|---|---|---|---|
| `loginUrl` | `string` | （必須） | ログイン処理を開始するページのURL。 |
| `steps` | `array` | （必須） | ログイン画面で実行するステップ操作のリスト（以下参照）。 |
| `successCheck` | `object` | （任意） | ログインが成功したかを画面内の要素で確認するための設定（以下参照）。 |
| `storageStateTTLMinutes`| `number` | `60` | 認証トークンやCookie（storageState）をキャッシュする時間（分）。この期間内は再ログイン処理を行わずにセッションが再利用されます。 |

#### `auth.steps` のアクション型一覧
ステップ配列の各オブジェクトは `action` キーを持ち、その値に応じて追加のパラメータが必要です。

- **`fill`**: 入力欄に値を設定
  ```json
  { "action": "fill", "selector": "#username", "value": "${MY_USER_ENV}" }
  ```
- **`click`**: ボタンやリンクをクリック
  ```json
  { "action": "click", "selector": "button.submit-btn" }
  ```
- **`check`**: チェックボックスをONにする
  ```json
  { "action": "check", "selector": "#agree-terms" }
  ```
- **`select`**: セレクトボックスから値を選択
  ```json
  { "action": "select", "selector": "select#role", "value": "developer" }
  ```
- **`waitForNavigation`**: ページ遷移が完了するまで待機
  ```json
  { "action": "waitForNavigation" }
  ```
- **`waitForSelector`**: 指定したCSSセレクタの要素が出現するまで待機
  ```json
  { "action": "waitForSelector", "selector": ".dashboard-container" }
  ```
- **`wait`**: 指定した時間（ミリ秒）だけ待機
  ```json
  { "action": "wait", "milliseconds": 2000 }
  ```

#### `auth.successCheck` パラメータ
- `selector` (`string`, 必須): ログインが成功したことを識別するために、ログイン後のページに存在すべき要素のCSSセレクタ（例：`".logout-button"`）。
- `expectedText` (`string`, 任意): 上記セレクタの要素が含んでいるべきテキスト文字列。

---

### 内部 RAG パラメータ（デフォルト値）

設定ファイルでは現在変更できませんが、RAGインデックス（`rag/index.jsonl`）の生成時に以下の定数（`defaults.ts`）が内部で適用されます。

- **`rag.chunkSize`** (`1000`): テキストおよびOCR結果をRAGチャンクに分割する際の目安となる文字数。
- **`rag.chunkOverlap`** (`200`): 分割されたチャンク間の重複文字数。
- **`rag.minOcrConfidence`** (`30`): 画像OCRのテキストをインデックスに含めるかどうかの最低信頼度スコア（パーセント）。これ未満のOCR結果は「不鮮明な画像」としてインデックスから除外され、検索時のノイズを防ぎます。
- **`rag.maxOcrWorkers`** (`4`): WASM OCRの同時実行数上限。CPU負荷とメモリ消費のバランスを取るために `4` に制限されています（実際のタスク数とこの上限値のうち小さい方が並列実行スレッド数になります）。

---

## 設定ファイル記述例

### 最小構成設定例 (`config-simple.json`)
最もシンプルな設定例です。特定のドメインをデフォルト設定（深さ3、上限100リクエスト、画像・OCR取得有効）でクロールします。

```json
{
  "name": "example-docs",
  "startUrls": ["https://example.com"],
  "output": "./output"
}
```

### 全機能構成設定例 (`config-full.json`)
認証フロー、詳細なURLフィルタリング、リサイズとOCRの言語設定、除外URLなど、全機能を指定した詳細な設定例です。

```json
{
  "name": "crawlee-docs",
  "startUrls": [
    "https://crawlee.dev/docs/introduction",
    "https://crawlee.dev/docs/guides"
  ],
  "output": "./output",
  "crawl": {
    "depth": 2,
    "maxRequests": 100,
    "globs": ["https://crawlee.dev/docs/**"],
    "exclude": [
      "https://crawlee.dev/blog/**",
      "https://crawlee.dev/api/legacy/**",
      "**/*.pdf"
    ],
    "maxRetries": 3,
    "navigationTimeoutSecs": 60,
    "requestHandlerTimeoutSecs": 120
  },
  "content": {
    "useReadability": true,
    "contentSelector": null,
    "removeSelectors": ["nav", "footer", "aside", ".cookie-banner", ".ad"]
  },
  "images": {
    "download": true,
    "maxWidthPx": 2048,
    "ocr": true,
    "ocrLanguages": ["eng", "jpn"],
    "excludePatterns": ["**/tracking/**", "**/pixel/**"]
  },
  "auth": {
    "loginUrl": "https://example.com/login",
    "steps": [
      { "action": "fill", "selector": "#email", "value": "${LOGIN_EMAIL}" },
      { "action": "fill", "selector": "#password", "value": "${LOGIN_PASSWORD}" },
      { "action": "click", "selector": "button[type=submit]" },
      { "action": "waitForNavigation" }
    ],
    "successCheck": {
      "selector": ".dashboard",
      "expectedText": "ようこそ"
    },
    "storageStateTTLMinutes": 60
  }
}
```

---

## 生成されるSkillフォルダの構造

クロール完了後、指定された出力ディレクトリ内に以下の構造で成果物が生成されます：

```
output/<skill-name>/
├── SKILL.md                 - AIエージェントがスキルとして最初に入力するインデックスファイル。
│                              クロール情報や収録ページ、RAGファイルへのパスなどが含まれます。
├── references/              - クロールされた各WebページのMarkdownファイル群。
│   ├── index.md             - 起点ページのMarkdown
│   ├── docs--intro.md       - 各下層ページのMarkdown（URL階層を "--" で連結した平坦なファイル名）
│   └── ...
├── images/                  - 抽出・保存された画像ファイル群。
│   ├── logo-b5f7e1a3.png    - ファイル名には重複を防ぐためコンテンツハッシュが付加されます。
│   └── ...
├── rag/
│   └── index.jsonl          - 抽出された全テキストおよび画像OCR結果を、RAGに適した単位に分割し、
│                              元の参照ファイル名やURLを付与して統合した JSONLines インデックスファイル。
└── crawl-report.json        - 処理時間、成功/失敗したURLリスト、画像数、OCR処理数などの実行概要レポート。
```
