# keiba-note アーキテクチャ・コスト・技術選定

[design.md](./design.md) が「何を作るか」なのに対し、こちらは「どう動き、いくらかかり、なぜその技術か」をまとめたもの。

- 作成日: 2026-09-20
- 更新日: 2026-09-21 — 招待制をやめて登録を開き、メモを既定非公開にした変更を反映（→ 3-6 / 第6章）
- 料金・制限の出典: Cloudflare 公式ドキュメント（2026-09-20 時点で確認）
  - [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
  - [D1 Limits](https://developers.cloudflare.com/d1/platform/limits/)

---

## 1. 全体像

サーバーは存在しない。**Worker が1つあるだけ**で、静的アセットも SSR も API も同じ Worker が受ける。

```mermaid
flowchart TB
    U["ブラウザ<br/>ログインした本人 ＋ 共有 URL の閲覧者"]

    subgraph CF["Cloudflare Edge — ユーザーに最も近い拠点で実行"]
        A["Static Assets<br/>JS / CSS / フォント<br/>課金対象外・無制限"]
        W["Worker<br/>SvelteKit SSR + form actions<br/>hooks.server.ts で認証"]
    end

    subgraph APAC["D1 プライマリ — apac に固定"]
        D[("D1 / SQLite<br/>user, session<br/>horse, race, race_entry, note")]
    end

    G["Google<br/>OAuth 2.0 / OIDC"]

    U -->|"静的ファイル"| A
    U -->|"ページ・フォーム"| W
    U -->|"/notes/[id] 共有ページ<br/>ログイン不要"| W
    W -->|"SQL / 1リクエスト10クエリ以内"| D
    W -->|"認可リダイレクト・トークン交換"| G
    W -->|"HTML"| U
```

外部依存は **Google OAuth だけ**。それ以外は Cloudflare の中で完結する。
バックエンドサーバー、コンテナ、VPC、ロードバランサ、Redis — どれも要らない。

### なぜこの形になるか

数人が週末に使う規模に対して、常時起動のサーバーは過剰。
Workers はリクエストが来たときだけ実行され、来なければ何も動かない（＝何も課金されない）。
一方で「ゼロから起動する」コールドスタートの待ち時間が実質ないため、
月に数回しか触らないアプリでも初回アクセスが遅くならない。

**このアプリの使われ方（週末に集中し、平日はほぼ無風）と課金モデルが噛み合っている。**

---

## 2. レイヤ構成

Worker の中身は6層に分ける。**依存は上から下への一方向のみ**とし、逆流させない。

```mermaid
flowchart TB
    subgraph L1["① UI 層 — ブラウザで動く"]
        C["+page.svelte / lib/components<br/>表示とフォーム。業務ロジックを持たない"]
    end

    subgraph L2["② ルート層 — HTTP の境界"]
        H["hooks.server.ts<br/>セッション検証・locals.user・未ログインの遮断"]
        R["+page.server.ts / +server.ts<br/>FormData の受け取り・リダイレクト・ステータスコード"]
    end

    subgraph L3["③ 検証層"]
        V["lib/schemas/*.ts — Valibot<br/>外から来た unknown を型の付いた値に変える"]
    end

    subgraph L4["④ サービス層 — 業務ロジック"]
        S["lib/server/services/*.ts<br/>ルール・author_id での絞り込み・batch の組み立て"]
        AU["lib/server/auth/*.ts<br/>セッション / OAuth"]
    end

    subgraph L5["⑤ データアクセス層"]
        Q["lib/server/db/*.ts — Drizzle<br/>スキーマ定義とクエリ。SQL はここにしか無い"]
    end

    subgraph L6["⑥ ストレージ"]
        D[("D1 / SQLite")]
    end

    C -->|"GET / POST"| H
    H --> R
    R --> V
    V --> S
    R --> S
    S --> Q
    AU --> Q
    H --> AU
    Q --> D
```

### 各層の責務

| 層 | 置き場所 | やること | **やらないこと** |
| --- | --- | --- | --- |
| ① UI | `+page.svelte`, `lib/components/` | 表示、フォームの組み立て | DB アクセス、認可判断 |
| ② ルート | `+page.server.ts`, `+server.ts`, `hooks.server.ts` | HTTP の入出力、Cookie、リダイレクト | 業務ルール、SQL |
| ③ 検証 | `lib/schemas/` | `FormData` / クエリ文字列を型付きの入力に変換 | DB アクセス |
| ④ サービス | `lib/server/services/`, `lib/server/auth/` | 業務ルール、`author_id` での絞り込み、`batch()` の構成 | HTTP を知ること |
| ⑤ データアクセス | `lib/server/db/` | Drizzle でのクエリ組み立て、型定義 | 業務ルール |
| ⑥ ストレージ | D1 | 永続化、制約（FK・CHECK・UNIQUE） | — |

### 層を分ける実利 — サービス層は SvelteKit を知らない

**`lib/server/services/` は SvelteKit の型（`RequestEvent`, `Cookies`, `error()` など）を
一切 import しない。** 引数で `db` と `userId` を受け取り、値を返すだけの純粋な関数群にする。

```ts
// ✓ 良い — HTTP を知らない。テストで直接呼べる
export async function getHorseTimeline(
  db: Db, horseId: string, viewerId: string
): Promise<TimelineItem[]> { ... }

// ✗ 悪い — SvelteKit に縛られ、将来 API から再利用できない
export async function getHorseTimeline(event: RequestEvent) { ... }
```

これが効いてくる場面は3つ。

1. **テスト** — Vitest から D1 のローカルインスタンスを渡して直接呼べる。HTTP のモックが要らない
2. **将来の API 追加** — [design.md](./design.md) のとおり当面 REST API は作らないが、
   必要になったとき `+server.ts` から同じサービス関数を呼ぶだけで済む
3. **移植性** — 万一 Cloudflare から離れることになっても、business logic は素の TypeScript のまま残る

### モジュール依存図

実際のファイル間の依存。**矢印が逆向きになったらレイヤ違反。**

```mermaid
flowchart LR
    subgraph routes["src/routes/"]
        RH["races/[id]/+page.server.ts"]
        HH["horses/[id]/+page.server.ts"]
        AC["auth/google/callback/+server.ts"]
    end

    HK["src/hooks.server.ts"]

    subgraph schemas["src/lib/schemas/"]
        SC["note.ts / race.ts / horse.ts"]
    end

    subgraph services["src/lib/server/services/"]
        SN["notes.ts"]
        SR["races.ts"]
        SHO["horses.ts"]
    end

    subgraph auth["src/lib/server/auth/"]
        AS["session.ts"]
        AG["google.ts"]
    end

    subgraph db["src/lib/server/db/"]
        DS["schema.ts"]
        DI["index.ts"]
    end

    D1[("D1 binding<br/>platform.env.DB")]

    HK --> AS
    RH --> SC
    HH --> SC
    RH --> SN
    RH --> SR
    HH --> SHO
    HH --> SN
    AC --> AG
    AC --> AS
    SN --> DS
    SR --> DS
    SHO --> DS
    AS --> DS
    DS --> DI
    DI --> D1
```

---

## 3. データアクセスの経路

### 3-1. D1 クライアントの生成とライフサイクル

D1 への入口は `event.platform.env.DB` というバインディング1つ。
**Worker にはグローバル状態を置かず、リクエストごとに Drizzle クライアントを作る。**

```ts
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export function createDb(env: App.Platform['env']) {
  return drizzle(env.DB, { schema });
}
export type Db = ReturnType<typeof createDb>;
```

Workers の実行環境は複数リクエストで再利用されうるため、
**モジュールスコープに DB 接続やユーザー情報を保持するとリクエスト間で漏れる。**
Drizzle クライアントの生成自体はほぼコストゼロなので、毎回作って問題ない。

接続プールは存在しない。D1 はバインディング経由の RPC であり、
TCP コネクションの管理という概念がそもそもない。

### 3-2. 読み取りの経路 — `GET /horses/[id]`

```mermaid
sequenceDiagram
    autonumber
    participant B as ブラウザ
    participant H as hooks.server.ts
    participant L as load / +page.server.ts
    participant S as services/horses.ts
    participant Q as db / Drizzle
    participant D as D1

    B->>H: GET /horses/01J8X...
    Note over H: Cookie の session トークンを<br/>SHA-256 でハッシュ化
    H->>Q: validateSession
    Q->>D: SELECT ... FROM session JOIN user 【クエリ1】
    D-->>Q: 1行
    Q-->>H: user もしくは null
    Note over H: null なら /login へ 302<br/>残り15日を切っていれば期限を延長
    H->>L: locals.user を載せて resolve
    L->>S: getHorseDetail db, horseId, user.id
    S->>Q: 馬のプロフィール
    Q->>D: SELECT ... FROM horse WHERE id = ? 【クエリ2】
    S->>Q: タイムライン
    Q->>D: SELECT ... FROM note WHERE horse_id = ? 【クエリ3】
    D-->>S: 行の集合
    Note over S: WHERE author_id = viewer は SQL 側で適用済み
    S-->>L: HorseDetail
    L-->>B: SSR した HTML
```

**1ページ＝3クエリ。** タイムラインが1クエリで済むのは、
[design.md](./design.md) のとおり `note` に `horse_id` を非正規化しているため。
レース紐付きメモと近況メモをマージする処理が要らない。

使うインデックスは `note_author_horse (author_id, horse_id, occurred_at DESC)`。
**先頭が `author_id`** なのは、読みが必ず viewer で絞られるため（→ 3-6）。
D1 は**スキャンした行数**で課金されるので、インデックスが効いているかどうかが
そのままコストに直結する。

### 3-3. 書き込みの経路 — `POST /races/[id]?/saveReview`

ふりかえり画面の一括保存。**このアプリで最もクエリ数が増える経路。**

```mermaid
sequenceDiagram
    autonumber
    participant B as ブラウザ
    participant A as action / +page.server.ts
    participant V as Valibot
    participant S as services/notes.ts
    participant Q as db / Drizzle
    participant D as D1

    B->>A: POST 出走馬18頭分のメモ
    Note over A: Origin ヘッダ検証<br/>SvelteKit 標準の CSRF 対策
    A->>V: FormData を検証
    V-->>A: 型付きの入力
    A->>S: saveRaceReview db, input, user.id
    Note over S: 空欄の馬はスキップ<br/>race_entry から race_id と horse_id をコピー
    S->>Q: upsert 文を最大19本 組み立て
    Q->>D: batch で1往復 【クエリ19】
    Note over D: 全文が1トランザクションで適用される
    D-->>S: 結果
    S-->>A: 保存件数
    A-->>B: 303 See Other
    B->>A: GET で再表示
```

**`batch()` を使う理由は速度だけではない。**
個別に `INSERT` を19回投げると、往復19回に加えて後述の
「1リクエストあたりのクエリ数上限」を消費する。
`batch()` は1トランザクションとしてまとめて適用されるため、
途中で失敗したときに半分だけ保存される事故も防げる。

### 3-4. 認証の経路

```mermaid
sequenceDiagram
    autonumber
    participant B as ブラウザ
    participant W as Worker
    participant G as Google
    participant D as D1

    B->>W: GET /auth/google
    Note over W: state と PKCE code_verifier を生成<br/>HttpOnly Cookie に10分だけ保存
    W-->>B: 302 → Google 認可画面
    B->>G: ユーザーが許可
    G-->>B: 302 /auth/google/callback
    B->>W: GET /auth/google/callback
    Note over W: Cookie の state と照合<br/>不一致なら 400
    W->>G: code + code_verifier をトークン交換
    G-->>W: id_token から sub / email / name
    W->>D: google_sub で user を検索

    alt 既存ユーザー
        W->>D: session を INSERT
    else 未登録ユーザー
        Note over W: 登録に条件はない<br/>email が ADMIN_EMAIL なら role=admin
        W->>D: user を INSERT + session を INSERT
    end

    W-->>B: Set-Cookie session → 302 /
```

Google への通信は Worker からの**サブリクエスト**で、Cloudflare は課金しない
（"Cloudflare does not bill for subrequests you make from your Worker"）。

### 3-5. 静的アセットは Worker を通らない

```mermaid
flowchart LR
    B["ブラウザ"] -->|"GET /_app/immutable/chunks/xxx.js"| A["Static Assets"]
    A -->|"そのまま返す"| B
    A -.->|"Worker は起動しない<br/>課金なし・リクエスト無制限"| W["Worker"]
```

SvelteKit がビルドした JS/CSS はここに乗る。**この分は一切コストにならない。**

### 3-6. 認可はどの層でかけるか

**「誰のメモか」の絞り込みはサービス層の SQL に埋める。** UI では絞らない。

```ts
// services/notes.ts — WHERE 句に必ず viewer の条件を入れる
where(and(
  eq(note.horseId, horseId),
  eq(note.authorId, viewerId),
))
```

UI 側でフィルタすると、見えてはいけない行が
SSR の HTML やデータペイロードに乗ってしまう。
**DB から出さない**のが唯一確実な方法。

`visibility`（`private` / `unlisted`）を見るのは**共有ページ1本だけ**。
ログイン中の読みはすべて `author_id = :viewer` で閉じているので、
公開範囲の判定がそもそも要らない（→ [design.md 第2章 2-2](./design.md)）。

```ts
// routes/notes/[id]/+page.server.ts — ここだけが visibility を見る
where(and(eq(note.id, id), eq(note.visibility, 'unlisted')))
```

**この形の弱点は「絞り忘れ＝全員に見える」になること。**
`shared` を混ぜていた頃は、絞り忘れても他人の private までは出なかった。
いまは `author_id` の条件が1本抜けるだけで全ユーザーのメモが出る。
だから**サービス層の読み取り関数は `viewerId` を必須引数で受け取る**形を崩さない。
省略可能にしたり既定値を与えたりした時点で、この防波堤は消える。

一方「admin だけがマスタを編集できる」といった**操作の可否**はルート層で弾く。
データの絞り込みはサービス層、操作の可否はルート層、と役割を分ける。

### 3-7. 共有ページはこの経路の例外

`/notes/[id]` は `hooks.server.ts` の公開パスに入るため、`locals.user` が null のまま
load に到達する。**前提が他の全ルートと違う唯一の場所**なので、独立して覚えておく。

| | 通常のルート | `/notes/[id]` |
| --- | --- | --- |
| `locals.user` | 必ず非 null | null でも通る |
| WHERE 句 | `author_id = :viewer` | `id = :id AND visibility = 'unlisted'` |
| 該当なし | — | **404**（403 にすると「その ID は在る」と漏れる） |
| ヘッダ | 既定 | `X-Robots-Tag: noindex, nofollow` / `Referrer-Policy: no-referrer` / `Cache-Control: private, no-store` |

未ログインの閲覧者はセッション Cookie を持たないので検証クエリが走らず、
**主キー1件引きの1クエリだけ**で返る。通常ページより軽い。

---

## 4. デプロイ構成

```mermaid
flowchart TB
    P["git push → main"] --> CI

    subgraph CI["GitHub Actions"]
        direction TB
        I["pnpm install"] --> T["svelte-check / vitest"]
        T --> M["wrangler d1 migrations apply --remote"]
        M --> DP["wrangler deploy"]
    end

    DP --> W["keiba-note.xxxxx.workers.dev"]
    W --> D[("D1 / apac")]
```

| 環境 | Worker | D1 | 用途 |
| --- | --- | --- | --- |
| local | `vite dev`（Miniflare 経由） | ローカル SQLite（`.wrangler/state`） | 開発 |
| production | `keiba-note` | `keiba-note` | 本番 |

プレビュー環境は当面作らない。この規模のアプリに2系統は要らない。
必要になったら `wrangler versions upload` によるプレビュー URL を使う。

### D1 の配置

```bash
wrangler d1 create keiba-note --location apac
```

**`--location apac` を必ず付ける。** D1 は「プライマリが1箇所にある SQLite」であり、
Worker 自体はユーザーの近くで動いても、SQL は毎回プライマリまで往復する。

```mermaid
flowchart LR
    subgraph ok["apac を指定した場合"]
        U1["日本のユーザー"] --> W1["Worker<br/>東京"] -->|"数ms"| D1A[("D1<br/>apac")]
    end
    subgraph ng["指定を忘れた場合"]
        U2["日本のユーザー"] --> W2["Worker<br/>東京"] -->|"100ms 以上"| D2A[("D1<br/>米国")]
    end
```

3クエリで 300ms を捨てることになるので、ここは最初に必ず指定する。
利用者が日本だけなので apac 固定が最適。読み取りレプリカは要らない。

---

## 5. 採用技術

### 5-1. 一覧

| 領域 | 採用 | バージョン想定 |
| --- | --- | --- |
| フレームワーク | SvelteKit（Svelte 5 runes） | 2.x / 5.x |
| アダプタ | `@sveltejs/adapter-cloudflare` | 最新 |
| ランタイム | Cloudflare Workers | `compatibility_date` は作成時の日付で固定 |
| DB | Cloudflare D1（SQLite） | — |
| ORM | Drizzle ORM + drizzle-kit | 0.4x |
| 認証 | Arctic（OAuth）+ Oslo（暗号・エンコード） | Arctic 3.x |
| 検証 | Valibot | 1.x |
| スタイル | Tailwind CSS v4 | 4.x |
| テスト | Vitest / Playwright | — |
| パッケージ管理 | pnpm | — |
| CI/CD | GitHub Actions + Wrangler | — |

### 5-2. なぜこれを選んだか

**SvelteKit** — 決定済みだが、この用途には実際よく合う。
本アプリはフォームの塊（レース登録、出走馬入力、メモ）であり、
SvelteKit の form actions は JS が無効でも動く HTML フォームがそのまま基盤になる。
クライアント側の状態管理ライブラリが要らず、バンドルも小さいまま済む。
Workers は CPU 時間で課金・制限されるため、SSR が軽いことはそのままコストに効く。

**D1** — メモをレース軸と馬軸の両方から引く、つまり関係を辿る読み方が中心。
KV（結果整合・キー参照のみ）や Durable Objects（単一エンティティの強整合）では
横断クエリが書けない。SQL が必要で、規模は小さい。D1 の適合範囲のど真ん中。

**Drizzle** — D1 ドライバが公式にあり、生成されるマイグレーションが読める SQL。
Prisma は Workers 対応こそ進んだがバンドルが重く、CPU 時間で課金される環境では不利。
生 SQL は型が付かず、`note` のような条件付きカラム（kind ごとに埋まる列が変わる）を
手で扱うと事故る。Drizzle はその中間として妥当。

**Arctic + Oslo** — Lucia はライブラリとしての提供をやめ実装ガイドに移行したため、
その構成要素である Arctic（OAuth クライアント）と Oslo（暗号・エンコード）を直接使う。
どちらも Web Crypto ベースで Node 固有 API に依存せず、Workers でそのまま動く。
セッション管理は自分で書くが、[design.md の第4章](./design.md)のとおり150行程度で収まる範囲。

**Valibot** — Zod と同等の書き味でバンドルが小さい。
ここも CPU 時間と起動コストに直結するため軽い方を採る。

### 5-3. 検討して採らなかったもの

| 候補 | 不採用の理由 |
| --- | --- |
| Cloudflare Access | 独自ドメインが必要。`*.workers.dev` は保護できない |
| Neon / Supabase + Hyperdrive | 本物の Postgres は魅力だが構成要素が増える。D1 で足りる規模 |
| Workers KV をメインストアに | 結果整合でクエリが書けない。メモの横断参照に致命的 |
| Durable Objects | 単一エンティティの強整合が要件ではない。オーバースペック |
| Prisma | バンドルサイズと CPU コスト |
| REST API + SPA | 画面遷移ごとに API を叩く分リクエストが増え、実装も二重になる |

### 5-4. ランタイム上の注意

- **`nodejs_compat` は極力付けない。** 付けると起動時のコストとバンドルが増える。
  Arctic / Oslo / Drizzle-D1 はいずれも Web 標準 API だけで動くため、原則不要
- `compatibility_date` は初期化時の日付で固定し、上げるときは意図的に上げる
- Worker のバンドルサイズ上限は圧縮後 3MB（Free）。SvelteKit の SSR コードなら
  まず当たらないが、重い依存を足すときは意識する

---

## 6. コスト

### 結論

**月額 ¥0。Cloudflare の無料枠に完全に収まり、当面それを出る見込みもない。**

かかるお金は今のところ存在しない。
独自ドメインを取らず `*.workers.dev` を使い、Google OAuth も無料。

### 6-1. 無料枠と、このアプリの想定使用量

前提: 実利用者5人、開催日（土日）中心、1開催日あたり12レースをふりかえる。

招待制をやめたので**人数の上限は仕組みとしては無くなった**が、
検索にも一覧にも出ない以上、外から見つけて登録してくる人はいない。
実質の利用者数は招待制だった頃と変わらない見込みで、試算もそれを前提に置く。
外れたときに何が起きるかは 6-2 の表のとおりで、$5/月の Paid が天井になる。

| 項目 | Free の上限 | 本アプリの想定 | 消費率 |
| --- | --- | --- | --- |
| Worker リクエスト | 100,000 / 日 | 約 350 / 開催日 | **0.4%** |
| 静的アセット配信 | 無制限・課金対象外 | — | — |
| D1 rows read | 5,000,000 / 日 | 約 35,000 / 開催日 | **0.7%** |
| D1 rows written | 100,000 / 日 | 約 1,500 / 開催日 | **1.5%** |
| D1 ストレージ | 500 MB / DB | 年間 約 20 MB | **年4%** |

**試算の根拠**

- リクエスト: 5人 × 60ページ遷移 + フォーム送信50回 ≒ 350。平日はほぼゼロ
- rows read: 1リクエストあたり平均100行（セッション1 + レース詳細で entries 18・notes 20 など）
- rows written: 1レースのふりかえり＝レースメモ1 + 出走馬メモ18。
  インデックス3本への書き込みも rows written に計上されるため約4倍で見て 76行。
  12レースで912行、出走馬登録などを足して 1,500行
- ストレージ: 年間1,200レース × (entry 14 + note 15) 行 ≒ 35,000行、インデックス込みで約20 MB

D1 の Free は**1データベースあたり 500 MB**（アカウント合計5 GB とは別の制限）。
年20 MB なら **25年分**入る。

### 6-2. 有料化が必要になる条件

$5/月の Workers Paid に上げる判断材料は4つ。いずれも今は該当しない。

| # | トリガ | 現状 | 起きたときの対処 |
| --- | --- | --- | --- |
| 1 | **1リクエストの D1 クエリが 50 を超える**（Free の上限。Paid は1000） | 1ページ3クエリ | `batch()` と JOIN で抑える。**要注意（→ 7章）** |
| 2 | **CPU 時間が 10ms / 呼び出しを超える**（Free の上限） | SSR で数ms の想定 | 重い処理を削るか Paid（最大30秒）へ |
| 3 | DB が 500 MB を超える | 年20 MB | Paid（10 GB）へ |
| 4 | Time Travel で7日より前に戻したい | 7日で足りる | Paid（30日）へ |

Paid に上げた場合も、含まれる枠（リクエスト1,000万/月、D1 読み250億行/月、書き5,000万行/月）に対して
本アプリの使用量は誤差なので、**$5 ちょうど**で頭打ちになる。従量課金に届く余地がない。

### 6-3. 将来コストが増える可能性のある拡張

| 拡張 | コスト影響 |
| --- | --- |
| 独自ドメイン | ドメイン代のみ（年1,000〜2,000円程度）。Cloudflare 側は無料 |
| 外部データの自動取り込み（Phase 5） | Cron Trigger は Free でも動く。書き込み行数が増えるが桁が違う |
| 全文検索（FTS5） | D1 内で完結。インデックス分のストレージのみ |
| Web Push 通知 | Cron + fetch。追加費用なし |
| 画像アップロード（レース写真など） | R2 が必要。10 GB まで無料、以降 $0.015/GB-月 |

---

## 7. 制約とスケール限界

コストより先に効いてくるのは**技術的な上限**のほう。順に。

### 7-1. 1リクエストあたりの D1 クエリ数 — Free で 50

**これが本アプリで最も現実的なリスク。**

ふりかえり画面は18頭分のメモを扱う。ここで N+1 を書くと即座に上限へ近づく。

```mermaid
flowchart TB
    subgraph bad["✗ N+1 — 上限 50 に迫る"]
        B1["セッション検証 1"] --> B2["出走馬を1頭ずつ SELECT<br/>18クエリ"]
        B2 --> B3["各馬のメモを1件ずつ SELECT<br/>18クエリ"]
        B3 --> B4["合計 37クエリ<br/>残り13"]
    end

    subgraph good["✓ JOIN と batch — 合計4クエリ"]
        G1["セッション検証 1"] --> G2["race + entry + horse + note を<br/>JOIN して 1クエリ"]
        G2 --> G3["保存は batch で 1往復"]
        G3 --> G4["合計 3〜4クエリ<br/>上限まで余裕"]
    end
```

**設計ルール: 1リクエストあたりの D1 クエリは10以内に収める。**
超えそうなら JOIN か `batch()` にまとめる。これを守っていれば Free の50は遠い。

### 7-2. CPU 時間 — Free で 10ms / 呼び出し

SvelteKit の SSR は通常数ms で収まるが、18行のテーブルに Markdown レンダリングを
全行かけるような処理を足すと近づく。メモ本文の Markdown → HTML 変換は
**サーバーではなくクライアントで行う**か、軽量なパーサを使う。

超えた場合の症状は「エラーで落ちる」であり、静かな劣化ではないので気付ける。

### 7-3. D1 は単一スレッド

D1 は1データベースにつき1スレッドで、クエリを1つずつ処理する。
平均1ms のクエリなら毎秒1,000件が上限。5人の同時利用では問題にならない。

### 7-4. その他の上限（いずれも遠い）

| 項目 | 上限 | 備考 |
| --- | --- | --- |
| 1テーブルの列数 | 100 | `race_entry` が最多でも20列程度 |
| 1行 / BLOB の最大サイズ | 2 MB | メモ本文がこれを超えることはない |
| バインドパラメータ数 | 1クエリ100個 | 18頭の一括 INSERT は `batch()` で分割されるので該当しない |
| SQL 文の長さ | 100 KB | — |
| Worker からの同時 D1 接続数 | 6 | 逐次処理なので該当しない |

---

## 8. 運用

| 項目 | どうするか |
| --- | --- |
| **バックアップ** | D1 の Time Travel で過去7日間（Free）の任意の時点に復元できる。**別途バックアップの仕組みは作らない。** 節目で `wrangler d1 export` を手動実行して手元に置けば十分 |
| **ログ** | Workers Logs が Free で 200,000 イベント/日・3日保持。設定不要で使える |
| **メトリクス** | Cloudflare ダッシュボードの Worker / D1 メトリクス。rows read/written はここで実測を確認できる |
| **シークレット** | `wrangler secret put`（本番）/ `.dev.vars`（ローカル、`.gitignore` 済み） |
| **マイグレーション** | `wrangler d1 migrations apply` を GitHub Actions のデプロイ前に実行 |
| **暴走課金の防止** | Free plan にいる限り、上限を超えるとエラーになるだけで課金はされない。Paid に上げた場合は Worker の CPU Limits を設定する |

---

## 9. この構成の要約

- **サーバーもコンテナもない。** Worker 1つと D1 1つ、外部依存は Google OAuth だけ
- **層は6つ、依存は一方向。** 要は「サービス層が SvelteKit を知らない」の1点。
  これだけでテストが書け、将来の API 追加にも耐える
- **データアクセスは必ず ④→⑤→⑥ を通る。** ルートから直接 SQL を書かない。
  `author_id = :viewer` を SQL の WHERE 句に埋めるのも、この経路を1本に保てているから成立する
- **公開範囲を見るのは共有ページ1本だけ。** ログイン中の読みは全部
  「自分のメモ」に閉じているので、`visibility` の判定が散らばらない
- **月額 ¥0。** 無料枠の消費率は最も高い項目でも 1.5%。25年分のストレージ余裕がある
- **コストより先に「1リクエスト50クエリ」の制限に当たる。** JOIN と `batch()` で
  クエリ数を10以内に保つことが、性能・制限・コストのすべてに同時に効く
- **有料化してもその先がない。** $5/月を超える従量課金には、この規模では到達しようがない
