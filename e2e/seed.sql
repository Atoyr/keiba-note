-- E2E が読む行。`e2e/seed.ts` が E2E 専用のローカル D1（.wrangler/e2e）を空にしてから流す。
--
-- 共有ページ `/notes/[id]` は**未ログインで到達できる唯一のルート**なので、
-- ここだけは本番ビルドのまま中身を確かめられる。札（tags）が実際に
-- JSON から読み戻されて画面に出るかを見るために、1件だけ置いておく。
--
-- 何度流しても同じ状態になるように INSERT OR REPLACE で書く。

INSERT OR REPLACE INTO user (id, google_sub, email, display_name, role)
VALUES ('01JE2EUSER0000000000000000', 'e2e-google-sub', 'e2e@example.invalid', 'E2E ユーザー', 'user');

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSE000000000000000', 'E2Eテストホース', 2020);

-- 共有中（unlisted）。札を2つ、別々の系統から付ける。
INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, visibility, occurred_at)
VALUES (
	'01JE2ESHAREDNOTE0000000000',
	'01JE2EUSER0000000000000000',
	'horse',
	'01JE2EHORSE000000000000000',
	'直線で外に出してから一完歩が速い。',
	'["次走買い","不利"]',
	'unlisted',
	'2026-09-20'
);

-- 非公開。共有ページからは 404 になること（存在を漏らさないこと）の確認用。
INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, visibility, occurred_at)
VALUES (
	'01JE2EPRIVATENOTE000000000',
	'01JE2EUSER0000000000000000',
	'horse',
	'01JE2EHORSE000000000000000',
	'これは共有していないメモ。',
	'["次走消し"]',
	'private',
	'2026-09-20'
);

-- 馬タイムライン用。**メモが無くても出走は並ぶ**ことを見るための行。
--
-- 出走は全ユーザー共通のマスタ（race / race_entry）なので、メモと違って
-- author_id を持たない。ここに置いた3走のうちメモが付くのは1走だけで、
-- 残り2走は「走ったが何も書かなかった」レースになる。

-- 終わったレース（メモを書いた）。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEPAST0000000000000', '2026-06-14', '中山', 11, 'E2Eステークス', 'G3', '芝', 2000);

-- 終わったレース（何も書かなかった）。格が無いのでクラスが識別子になる。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, class_name, surface, distance)
VALUES ('01JE2ERACEQUIET000000000000', '2026-08-16', '新潟', 10, 'E2E特別', '3勝クラス', '芝', 1800);

-- これから走るレース。**タイムラインの先頭に出るのが正**（未来 → 過去）。
-- 日付が固定でも未来であり続けるように 2099 年に置く。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEFUTURE00000000000', '2099-04-04', '東京', 11, 'E2E未来賞', 'G1', '芝', 2400);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey, finish_position)
VALUES (
	'01JE2EENTRYPAST00000000000',
	'01JE2ERACEPAST0000000000000',
	'01JE2EHORSE000000000000000',
	5, 'E2E騎手', 3
);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey, finish_position)
VALUES (
	'01JE2EENTRYQUIET0000000000',
	'01JE2ERACEQUIET000000000000',
	'01JE2EHORSE000000000000000',
	8, 'E2E騎手', 5
);

-- 着順は未入力（まだ走っていない）。
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey)
VALUES (
	'01JE2EENTRYFUTURE000000000',
	'01JE2ERACEFUTURE00000000000',
	'01JE2EHORSE000000000000000',
	3, 'E2E騎手'
);

-- 1走目のふりかえりメモ。**この出走は出走行を出さない**（同じレースが2行にならない）。
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, occurred_at)
VALUES (
	'01JE2EENTRYNOTE00000000000',
	'01JE2EUSER0000000000000000',
	'entry',
	'01JE2ERACEPAST0000000000000',
	'01JE2EHORSE000000000000000',
	'01JE2EENTRYPAST00000000000',
	'直線だけの競馬になった。',
	'["不利"]',
	'2026-06-14'
);

-- ログイン済みで開く画面を本番ビルドのまま確かめるためのセッション。
-- id は Cookie に入るトークンの SHA-256（`hashSessionToken`）。生トークンは DB に無い。
-- 期限は 2100-01-01（unixepoch 4102444800）。
INSERT OR REPLACE INTO session (id, user_id, expires_at)
VALUES (
	'6237e10ca456454f7a9abd828ab21a219991af55ed12ad2cac1d564e5637aa0c',
	'01JE2EUSER0000000000000000',
	4102444800
);

-- サイト管理者（role='admin'）と、そのセッション。管理画面（/settings/admin など）を開くためだけに使う。
-- **メモは書かない。** admin でも他人のメモは読めないので、ここにメモがあると「見えてはいけない」側の行になり、
-- どの画面に出るかの前提が増える。トークンは e2e/seed.ts の ADMIN_SESSION_TOKEN。
INSERT OR REPLACE INTO user (id, google_sub, email, display_name, role)
VALUES ('01JE2EADMIN000000000000000', 'e2e-admin-google-sub', 'admin@example.invalid', 'E2E 管理者', 'admin');

INSERT OR REPLACE INTO session (id, user_id, expires_at)
VALUES (
	'c4fd50eca6e61581874d143ee5d9f2130661080d75349c83be2687710a8cd5fb',
	'01JE2EADMIN000000000000000',
	4102444800
);

-- 予想画面（/races/[id]/preview）専用の1レース。
--
-- **馬タイムライン用の行とは別に立てる。** あちらの「E2E未来賞」は
-- 「メモを書かなかった出走」として出ることに意味があるので、そこに
-- 出走前メモを足すと役目が入れ替わってしまう。
INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSEB00000000000000', 'E2Eプレビューホース', 2021);

INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEPREVIEW000000000', '2099-05-05', '京都', 11, 'E2E予想賞', 'G2', '芝', 2200);

-- 着順は未入力（まだ走っていない）。
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey)
VALUES (
	'01JE2EENTRYPREVIEW00000000',
	'01JE2ERACEPREVIEW000000000',
	'01JE2EHORSEB00000000000000',
	2, 3, 'E2E騎手'
);

-- その出走に書いた出走前メモ。予想画面が**畳まずに本文と付けた札を出す**ことを
-- 見るための行。札は1つだけにして、選んでいない札まで出ていないかも同時に確かめる。
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at)
VALUES (
	'01JE2EPREVIEWNOTE000000000',
	'01JE2EUSER0000000000000000',
	'preview',
	'01JE2ERACEPREVIEW000000000',
	'01JE2EHORSEB00000000000000',
	'01JE2EENTRYPREVIEW00000000',
	'今回は内枠が向きそう。',
	'["次走買い"]',
	'◎',
	'2099-05-05'
);

-- 予想画面のオッズ。Cron が取ってきた形（race_odds）をそのまま置く。
-- 時点は 2099-05-05 14:30 JST。画面が「5/5 14:30時点」と添えることを見る。
INSERT OR REPLACE INTO race_odds (race_id, horse_number, win_odds, place_odds_min, place_odds_max, as_of, fetched_at)
VALUES ('01JE2ERACEPREVIEW000000000', 3, 3.4, 1.4, 1.8, 4081642200, 4081642260);

-- **出走馬がまだ1頭も登録されていない未来のレース。**
--
-- これから組まれる重賞は、出馬表が出る前に日付と格だけ先に登録する運用がある。
-- この状態でも「レースの見立て」は書けること、そしてふりかえりは開けずに
-- 予想画面へ戻されることをここで見る。**出走馬を足さないこと。**
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEEMPTY00000000000', '2099-06-06', '阪神', 11, 'E2E出馬表前賞', 'G3', '芝', 1800);

-- 中山の芝1200m（スプリンターズSと同じ外回り）。コース図と高低断面を撮るためだけのレース。
-- 出走馬を入れず、コースが全幅で出る形にしておく。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, surface, distance, direction)
VALUES ('01JE2ERACESPRINT0000000000', '2099-10-04', '中山', 11, 'E2E短距離特別', '芝', 1200, '右');

-- **出走馬がまだ1頭も登録されていない開催済みのレース。**
--
-- 結果の投入が済んでいない開催はこうなる。ふりかえりは開けるが入力欄は
-- 「レースのメモ」1つだけなので、保存ボタンが「まとめて保存」と
-- 名乗らないことをここで見る。**出走馬を足さないこと。**
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEPASTEMPTY0000000', '2026-07-05', '福島', 11, 'E2E結果待ち賞', 'G3', '芝', 1200);

-- ダッシュボードの「今週のレース」「過去のレース」用。**日付は流した日から決める。**
--
-- 固定日付にすると、いつか今週からも直近3週からも外れて、緑のまま何も見ていない
-- テストになる。SQLite の `now` は UTC なので +9 時間して JST の日付にする。
--
-- 今週（今日）。週は月曜〜日曜なので、どの曜日に流しても必ず今週に入る。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACETHISWEEK00000000', date('now', '+9 hours'), '中京', 11, 'E2E今週賞', 'G3', '芝', 1600);

-- 今週（今日）で、**着順まで入った**重賞。今週の重賞から開くとふりかえりへ行くことを見る。
--
-- 同じ今日の E2E今週賞は着順が無いので予想画面のまま。**当日かどうかではなく結果の有無で**
-- 行き先が分かれることを、この2つを並べて確かめる。馬は他のテストと共有しない。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACESETTLED000000000', date('now', '+9 hours'), '中山', 11, 'E2E結果確定賞', 'G2', '芝', 2200);

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSESETTLED00000000', 'E2Eケッカアリ', 2022);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYSETTLED00000000', '01JE2ERACESETTLED000000000', '01JE2EHORSESETTLED00000000', 5, 'E2E騎手', 1);

-- 10日前。今週の頭より前で、かつ3週の窓の中（最短でも今週頭の4日前、最長で10日前）。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACELASTWEEK00000000', date('now', '+9 hours', '-10 days'), '福島', 10, 'E2E先週賞', 'G3', '芝', 2000);

-- E2E先週賞の結果。**着順が入っていないと「ふりかえり待ち」に出ない**（結果が出たかで分ける → isSettled）。
-- 馬は他のテストと共有しない。
INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSELASTWEEK0000000', 'E2Eセンシュウ', 2022);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYLASTWEEK0000000', '01JE2ERACELASTWEEK00000000', '01JE2EHORSELASTWEEK0000000', 4, 'E2E騎手', 3);

-- 40日前。**窓の外**（窓の下端は最も古くて今日の27日前）。ここに出ないことを見る。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEOLD000000000000', date('now', '+9 hours', '-40 days'), '小倉', 9, 'E2E昔賞', 'G3', '芝', 1800);

-- ふりかえり画面（/races/[id]）で**枠の色**を見るための1レース。
--
-- **馬タイムライン用の馬とは別の馬を立てる。** あちらは「3走ぶんが日付順に並ぶ」
-- ことを見ているので、出走を足すと並びの端が変わってしまう。
--
-- 枠は白（1枠）と桃（8枠）の両端を置く。白は面が背景と同じで、
-- 輪郭が無いと消えるため、色づけが壊れたときに最初に出るのがここ。
INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSEC00000000000000', 'E2Eウチワク', 2021);

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSED00000000000000', 'E2Eソトワク', 2021);

INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEBRACKET000000000', '2026-06-21', '阪神', 11, 'E2E枠色賞', 'G3', '芝', 1600);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES (
	'01JE2EENTRYINNER0000000000',
	'01JE2ERACEBRACKET000000000',
	'01JE2EHORSEC00000000000000',
	1, 1, 'E2E騎手', 1
);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES (
	'01JE2EENTRYOUTER0000000000',
	'01JE2ERACEBRACKET000000000',
	'01JE2EHORSED00000000000000',
	8, 16, 'E2E騎手', 2
);

-- ふりかえり画面の**答え合わせ**用。枠色を見るレース（E2E枠色賞）に出走前メモを足す。
--
-- 予想で付けた印と、走ったあとの着順を並べて見られることを確かめる。
-- ◎を2着の馬（ソトワク）、○を1着の馬（ウチワク）に置いて、「本命が負けて対抗が勝った」
-- 形にする。どちらも当たった形だと、印と着順の対応が入れ替わっていても気づけない。
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at)
VALUES (
	'01JE2EPREVIEWOUTER00000000',
	'01JE2EUSER0000000000000000',
	'preview',
	'01JE2ERACEBRACKET000000000',
	'01JE2EHORSED00000000000000',
	'01JE2EENTRYOUTER0000000000',
	'外枠でも先行できれば。',
	'["次走買い"]',
	'◎',
	'2026-06-21'
);

INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at)
VALUES (
	'01JE2EPREVIEWINNER00000000',
	'01JE2EUSER0000000000000000',
	'preview',
	'01JE2ERACEBRACKET000000000',
	'01JE2EHORSEC00000000000000',
	'01JE2EENTRYINNER0000000000',
	'',
	'[]',
	'○',
	'2026-06-21'
);

-- 上りは入っているが、出走馬は気にしている2頭だけ（実際は16頭立て）。
-- 入っている馬の中だけで上りの順位を数えると嘘になるので、タイムだけが出る。
UPDATE race SET field_size = 16 WHERE id = '01JE2ERACEBRACKET000000000';
-- ラップ（1600m なので8区間）。出走馬がそろっていないので実際の展開は出ないが、ラップはレース全体の値なので出る。
UPDATE race SET laps = '[12.3,10.9,11.3,11.6,11.8,11.5,11.2,11.9]' WHERE id = '01JE2ERACEBRACKET000000000';
UPDATE race_entry SET last_3f = 33.8 WHERE id = '01JE2EENTRYINNER0000000000';
UPDATE race_entry SET last_3f = 34.1 WHERE id = '01JE2EENTRYOUTER0000000000';

-- **別のユーザー**が同じレースに付けた出走前メモ。どの画面にも出てはいけない。
-- 答え合わせは自分の印だけで組むので、他人の◎が混ざると「自分の予想」が嘘になる。
INSERT OR REPLACE INTO user (id, google_sub, email, display_name, role)
VALUES ('01JE2EOTHERUSER00000000000', 'e2e-other-google-sub', 'other@example.invalid', 'E2E 別ユーザー', 'user');

INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at)
VALUES (
	'01JE2EOTHERPREVIEW00000000',
	'01JE2EOTHERUSER00000000000',
	'preview',
	'01JE2ERACEBRACKET000000000',
	'01JE2EHORSEC00000000000000',
	'01JE2EENTRYINNER0000000000',
	'他人の見立て。見えてはいけない。',
	'[]',
	'×',
	'2026-06-21'
);

-- **共有の切り替え**を E2E で押すための非公開メモ。ダッシュボードの「最近のメモ」に出る。
--
-- `PRIVATE_NOTE_ID` を使わないのは、あちらは「非公開なら 404」を見るテストが読むため。
-- 並列に走ると、共有した瞬間に向こうが 200 を見て落ちる。
INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, visibility, occurred_at)
VALUES (
	'01JE2ETOGGLESHARENOTE00000',
	'01JE2EUSER0000000000000000',
	'horse',
	'01JE2EHORSEC00000000000000',
	'共有を切り替えて確かめるメモ。',
	'[]',
	'private',
	'2026-06-01'
);

-- ダッシュボードの**今週出走する注目馬**用。今週のレース（E2E今週賞）に3頭を足す。
--
-- 日付は流した日から決める（今週のレースが今日なので、メモはそれより前に置く）。
-- 注目馬は「その馬に付けた一番新しい結論の札」で決まるので、
-- 買い → 消しと書き換えた馬を1頭混ぜて、古い札を拾っていないかを見る。
INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSEWATCH0000000000', 'E2Eチュウモク', 2022);

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSEDROP00000000000', 'E2Eミカギリ', 2022);

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EHORSEOTHERS000000000', 'E2Eタニンノウマ', 2022);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey)
VALUES ('01JE2EENTRYWATCH0000000000', '01JE2ERACETHISWEEK00000000', '01JE2EHORSEWATCH0000000000', 3, 'E2E騎手');

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey)
VALUES ('01JE2EENTRYDROP00000000000', '01JE2ERACETHISWEEK00000000', '01JE2EHORSEDROP00000000000', 7, 'E2E騎手');

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey)
VALUES ('01JE2EENTRYOTHERS000000000', '01JE2ERACETHISWEEK00000000', '01JE2EHORSEOTHERS000000000', 9, 'E2Eワカテ騎手');

-- 買い。理由の札（不利）も添わること。
INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, occurred_at)
VALUES (
	'01JE2EWATCHBUYNOTE00000000',
	'01JE2EUSER0000000000000000',
	'horse',
	'01JE2EHORSEWATCH0000000000',
	'前走は直線で詰まった。次は買い。',
	'["次走買い","不利"]',
	date('now', '+9 hours', '-20 days')
);

-- 買い → 消し。**新しい消しが正**で、古い買いの本文は注目馬に出てはいけない。
INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, occurred_at)
VALUES (
	'01JE2EDROPOLDBUYNOTE000000',
	'01JE2EUSER0000000000000000',
	'horse',
	'01JE2EHORSEDROP00000000000',
	'昔は買いだと思っていた。',
	'["次走買い"]',
	date('now', '+9 hours', '-60 days')
);

INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, occurred_at)
VALUES (
	'01JE2EDROPNEWNOTE000000000',
	'01JE2EUSER0000000000000000',
	'horse',
	'01JE2EHORSEDROP00000000000',
	'距離が合わない。見限る。',
	'["次走消し"]',
	date('now', '+9 hours', '-15 days')
);

-- **別のユーザー**が付けた買い。自分の注目馬には出てはいけない。
INSERT OR REPLACE INTO note (id, author_id, kind, horse_id, body, tags, occurred_at)
VALUES (
	'01JE2EOTHERSWATCHNOTE00000',
	'01JE2EOTHERUSER00000000000',
	'horse',
	'01JE2EHORSEOTHERS000000000',
	'他人の注目馬。見えてはいけない。',
	'["次走買い"]',
	date('now', '+9 hours', '-20 days')
);

-- **ふりかえり待ち**用。10日前のレース（E2E先週賞）に見立てだけ書いて、ふりかえりは書かない。
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, body, tags, occurred_at)
VALUES (
	'01JE2ELASTWEEKOUTLOOK00000',
	'01JE2EUSER0000000000000000',
	'race_preview',
	'01JE2ERACELASTWEEK00000000',
	'前残りの馬場とみる。',
	'[]',
	date('now', '+9 hours', '-10 days')
);

-- 予想画面（E2E予想賞・京都 芝2200m）で**同じ条件の過去のレースのメモ**を見るための行。
--
-- 同じ条件（京都・芝・2200m）のレースに自分のふりかえりを1本、他人のふりかえりを1本。
-- 距離だけ違うレース（京都 芝1800m）にも自分のふりかえりを1本置き、条件で絞れているかを見る。
-- 頭数（field_size）と勝ち馬は馬柱の2行目「16頭 3枠5番 … E2E勝ち馬（0.4）」に出る。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance, field_size, winner_name, runner_up_name)
VALUES ('01JE2ERACESAMECOND0000000', '2026-04-26', '京都', 11, 'E2E同条件賞', 'G2', '芝', 2200, 16, 'E2E勝ち馬', 'E2E2着馬');

INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEOTHERDIST000000', '2026-05-03', '京都', 11, 'E2E別距離賞', 'G2', '芝', 1800);

INSERT OR REPLACE INTO note (id, author_id, kind, race_id, body, tags, occurred_at)
VALUES (
	'01JE2ESAMECONDNOTE0000000',
	'01JE2EUSER0000000000000000',
	'race',
	'01JE2ERACESAMECOND0000000',
	'内が止まらない馬場だった。外差しは届かない。',
	'[]',
	'2026-04-26'
);

INSERT OR REPLACE INTO note (id, author_id, kind, race_id, body, tags, occurred_at)
VALUES (
	'01JE2EOTHERSAMECOND000000',
	'01JE2EOTHERUSER00000000000',
	'race',
	'01JE2ERACESAMECOND0000000',
	'他人のレースメモ。見えてはいけない。',
	'[]',
	'2026-04-26'
);

INSERT OR REPLACE INTO note (id, author_id, kind, race_id, body, tags, occurred_at)
VALUES (
	'01JE2EOTHERDISTNOTE000000',
	'01JE2EUSER0000000000000000',
	'race',
	'01JE2ERACEOTHERDIST000000',
	'距離が違うので出てはいけない。',
	'[]',
	'2026-05-03'
);

-- 予想画面の馬（E2Eプレビューホース）の**前走の結論**。同条件のレースを4着で走り、
-- ふりかえりで「次走買い」「不利」を付けた。予想画面の行の見出しにこの札が出る。
-- タイムと通過順は、馬柱の2行目に出ることを見るために入れてある。
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position, finish_time, passing, time_diff)
VALUES (
	'01JE2EENTRYSAMECOND000000',
	'01JE2ERACESAMECOND0000000',
	'01JE2EHORSEB00000000000000',
	3, 5, 'E2E騎手', 4, '2:12.8', '8-8-7-6', 0.4
);

-- 同じ馬の、それより前の2走。馬柱に3走が縦に並んだときの見え方（着順を縦に追えるか、
-- 2行目がまとまりの右端の下に揃うか）を画面カタログで見るための行。
-- 1走は頭数・枠・人気・上がり・タイム・通過順まで入っていて勝ち馬が無い。もう1走は勝った走で、
-- 頭数・枠・タイム・通過順が無い（2行目は馬番・騎手と、2着馬とのタイム差になる）。
-- 条件戦・2025年に置いて、レース一覧の既定（今年の重賞）とダッシュボードには出ないようにする。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, class_name, surface, distance, track_condition, field_size)
VALUES ('01JE2ERACEPASTRUN100000000', '2025-12-28', '中山', 10, 'E2E師走特別', '3勝クラス', '芝', 2000, '稍重', 14);

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position, popularity, last_3f, finish_time, passing)
VALUES (
	'01JE2EENTRYPASTRUN10000000',
	'01JE2ERACEPASTRUN100000000',
	'01JE2EHORSEB00000000000000',
	5, 7, 'E2E騎手', 2, 3, 34.9, '2:01.3', '3-3-3-2'
);

INSERT OR REPLACE INTO race (id, date, course, race_number, name, class_name, surface, distance, track_condition, runner_up_name)
VALUES ('01JE2ERACEPASTRUN200000000', '2025-11-09', '東京', 10, 'E2E霜月特別', '2勝クラス', '芝', 2400, '良', 'E2E霜月2着馬');

INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, horse_number, jockey, finish_position, popularity, last_3f, time_diff)
VALUES (
	'01JE2EENTRYPASTRUN20000000',
	'01JE2ERACEPASTRUN200000000',
	'01JE2EHORSEB00000000000000',
	2, 'E2E騎手', 1, 1, 33.8, -0.2
);

INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, occurred_at)
VALUES (
	'01JE2ESAMECONDENTRY000000',
	'01JE2EUSER0000000000000000',
	'entry',
	'01JE2ERACESAMECOND0000000',
	'01JE2EHORSEB00000000000000',
	'01JE2EENTRYSAMECOND000000',
	'直線で前が壁。脚は余していた。',
	'["次走買い","不利"]',
	'2026-04-26'
);

-- 予想印の**見本**。6つの印（◎ ○ ▲ △ ☆ ×）を1頭ずつに付け、着順も入れてある。
--
-- 印の色を変えたときに、全部の印を並べて見比べるためのレース（画面カタログの race-review-marks /
-- race-preview-marks）。ほかのテストはこのレースを見ないので、印を増やす・変えるときもここだけ直せばよい。
-- ☆ は2着（穴が来た）、× は着外（消しが当たった）にして、答え合わせの色の出方も一度に見られるようにする。
-- 条件戦にしてあるので、レース一覧の既定（今年の重賞）には出ない。
-- メモの created_at は古い日付に固定する。ダッシュボードの「最近のメモ」は作った順の新しい20件なので、
-- 既定（seed を流した時刻）のままだとこの6件が先頭に来て、共有中のメモなどほかのテストが見るメモを押し出す。
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEMARKS00000000000', '2026-06-07', '東京', 10, 'E2E印見本特別', '3勝クラス', '芝', 1800);

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE10000000000', 'E2Eホンメイ', 2022);
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYMARK10000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE10000000000', 1, 1, 'E2E騎手', 1);
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, created_at)
VALUES ('01JE2EPREVIEWMARK100000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE10000000000', '01JE2EENTRYMARK10000000000', '', '[]', '◎', '2026-06-07', unixepoch('2026-06-07'));

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE20000000000', 'E2Eタイコウ', 2022);
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYMARK20000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE20000000000', 2, 2, 'E2E騎手', 5);
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, created_at)
VALUES ('01JE2EPREVIEWMARK200000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE20000000000', '01JE2EENTRYMARK20000000000', '', '[]', '○', '2026-06-07', unixepoch('2026-06-07'));

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE30000000000', 'E2Eタンアナ', 2022);
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYMARK30000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE30000000000', 3, 3, 'E2E騎手', 3);
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, created_at)
VALUES ('01JE2EPREVIEWMARK300000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE30000000000', '01JE2EENTRYMARK30000000000', '', '[]', '▲', '2026-06-07', unixepoch('2026-06-07'));

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE40000000000', 'E2Eレンシタ', 2022);
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYMARK40000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE40000000000', 4, 4, 'E2E騎手', 6);
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, created_at)
VALUES ('01JE2EPREVIEWMARK400000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE40000000000', '01JE2EENTRYMARK40000000000', '', '[]', '△', '2026-06-07', unixepoch('2026-06-07'));

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE50000000000', 'E2Eアナウマ', 2022);
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYMARK50000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE50000000000', 5, 5, 'E2E騎手', 2);
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, created_at)
VALUES ('01JE2EPREVIEWMARK500000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE50000000000', '01JE2EENTRYMARK50000000000', '', '[]', '☆', '2026-06-07', unixepoch('2026-06-07'));

INSERT OR REPLACE INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE60000000000', 'E2Eケシウマ', 2022);
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES ('01JE2EENTRYMARK60000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE60000000000', 6, 6, 'E2E騎手', 4);
INSERT OR REPLACE INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at, created_at)
VALUES ('01JE2EPREVIEWMARK600000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE60000000000', '01JE2EENTRYMARK60000000000', '', '[]', '×', '2026-06-07', unixepoch('2026-06-07'));

-- 印を付けず本文だけ保存した馬も、まとめで欠けないことを確認する。
INSERT INTO horse (id, name, birth_year)
VALUES ('01JE2EMARKHORSE70000000000', 'E2Eメモノミ', 2022);
INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number)
VALUES ('01JE2EENTRYMARK70000000000', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE70000000000', 7, 7);
INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, mark, occurred_at)
VALUES ('01JE2EPREVIEWMARK700000000', '01JE2EUSER0000000000000000', 'preview', '01JE2ERACEMARKS00000000000', '01JE2EMARKHORSE70000000000', '01JE2EENTRYMARK70000000000', '印は保留。距離延長での走りに注目。', NULL, '2026-06-07');

-- ふりかえり画面の「4角 → 着順」・上りの順位・確定の人気用（人気は予想画面の単勝オッズの並びにそろえた）。上り1〜3位が別々の馬に付き、
-- 4角の位置と着順が入れ替わる（⑤アナウマは4角5番手から2着）ようにしてある。
-- メモノミ（着順なし）は通過順も上りも無いまま＝2行目を出さない形（取消なので頭数は6）。
-- 上りの順位は、上りの入った頭数が頭数（field_size）と同じときだけ出る。
UPDATE race SET field_size = 6 WHERE id = '01JE2ERACEMARKS00000000000';
-- ラップ（1800m なので9区間）。前半3F 36.0・後半3F 34.6（後半が1.4秒速い）。予想のペースはスロー。
UPDATE race SET laps = '[12.6,11.4,12.0,12.5,12.4,12.2,11.6,11.2,11.8]' WHERE id = '01JE2ERACEMARKS00000000000';
UPDATE race_entry SET passing = '2-2-2-2', last_3f = 34.0, popularity = 1 WHERE id = '01JE2EENTRYMARK10000000000';
UPDATE race_entry SET passing = '5-5-6-6', last_3f = 34.8, popularity = 2 WHERE id = '01JE2EENTRYMARK20000000000';
UPDATE race_entry SET passing = '1-1-1-1', last_3f = 34.6, popularity = 3 WHERE id = '01JE2EENTRYMARK30000000000';
UPDATE race_entry SET passing = '4-4-4-4', last_3f = 35.3, popularity = 5 WHERE id = '01JE2EENTRYMARK40000000000';
UPDATE race_entry SET passing = '6-6-5-5', last_3f = 33.7, popularity = 6 WHERE id = '01JE2EENTRYMARK50000000000';
UPDATE race_entry SET passing = '3-3-3-3', last_3f = 34.4, popularity = 4 WHERE id = '01JE2EENTRYMARK60000000000';

-- 展開の予想の見本。印見本のレースの見立てに、3局面の隊列を置いてある。
-- 予想画面（畳んだ1行・盤面）・予想まとめ・ふりかえり（開催前の見立て）のキャプチャで使う。
-- created_at は過去にする。今にするとダッシュボードの「最近のメモ」の先頭を取り、ほかのテストが見るメモを押し出す。
INSERT INTO note (id, author_id, kind, race_id, body, flow, occurred_at, created_at)
VALUES ('01JE2EMARKSFLOW00000000000', '01JE2EUSER0000000000000000', 'race_preview', '01JE2ERACEMARKS00000000000', '', '{"pace":"スロー","start":{"spots":[{"entryId":"01JE2EENTRYMARK30000000000","x":0,"y":0},{"entryId":"01JE2EENTRYMARK10000000000","x":1,"y":0},{"entryId":"01JE2EENTRYMARK50000000000","x":1,"y":1},{"entryId":"01JE2EENTRYMARK20000000000","x":3,"y":0},{"entryId":"01JE2EENTRYMARK40000000000","x":4,"y":1},{"entryId":"01JE2EENTRYMARK60000000000","x":6,"y":0},{"entryId":"01JE2EENTRYMARK70000000000","x":7,"y":2}],"memo":"③が楽にハナ。①は好位の内"},"corner4":{"spots":[{"entryId":"01JE2EENTRYMARK30000000000","x":0,"y":0},{"entryId":"01JE2EENTRYMARK10000000000","x":1,"y":0},{"entryId":"01JE2EENTRYMARK50000000000","x":1,"y":1},{"entryId":"01JE2EENTRYMARK20000000000","x":2,"y":2},{"entryId":"01JE2EENTRYMARK40000000000","x":4,"y":1},{"entryId":"01JE2EENTRYMARK60000000000","x":5,"y":0},{"entryId":"01JE2EENTRYMARK70000000000","x":6,"y":3}],"memo":"②が外から押し上げる"},"finish":{"spots":[{"entryId":"01JE2EENTRYMARK10000000000","x":0,"y":0},{"entryId":"01JE2EENTRYMARK20000000000","x":0,"y":2},{"entryId":"01JE2EENTRYMARK30000000000","x":1,"y":0},{"entryId":"01JE2EENTRYMARK50000000000","x":2,"y":1},{"entryId":"01JE2EENTRYMARK70000000000","x":3,"y":3},{"entryId":"01JE2EENTRYMARK40000000000","x":4,"y":1},{"entryId":"01JE2EENTRYMARK60000000000","x":6,"y":0}],"memo":""}}', '2026-06-07', unixepoch('2026-06-07'));

-- 印見本のレースのオッズ。人気と人気順の並べ替えを見る（予想画面のキャプチャ race-preview-marks も）。
-- 馬番2と3は同じオッズで、どちらも2人気（次は4人気に飛ぶ）。馬番7は取消で単勝が無く、人気も付かない。
-- 馬番5は3桁のオッズ（単勝・複勝とも欄の幅いっぱいになる値）で、隣の欄とくっつかないかを見る。
-- 人気順: ① → ②③ → ⑥ → ④ → ⑤ → ⑦。時点は 2026-06-07 14:30 JST。
INSERT OR REPLACE INTO race_odds (race_id, horse_number, win_odds, place_odds_min, place_odds_max, as_of, fetched_at)
VALUES
	('01JE2ERACEMARKS00000000000', 1, 2.8, 1.2, 1.5, 1780810200, 1780810260),
	('01JE2ERACEMARKS00000000000', 2, 5.1, 1.6, 2.4, 1780810200, 1780810260),
	('01JE2ERACEMARKS00000000000', 3, 5.1, 1.7, 2.6, 1780810200, 1780810260),
	('01JE2ERACEMARKS00000000000', 4, 12.4, 2.9, 4.8, 1780810200, 1780810260),
	('01JE2ERACEMARKS00000000000', 5, 123.4, 18.2, 30.5, 1780810200, 1780810260),
	('01JE2ERACEMARKS00000000000', 6, 8.9, 2.2, 3.6, 1780810200, 1780810260),
	('01JE2ERACEMARKS00000000000', 7, NULL, NULL, NULL, 1780810200, 1780810260);

-- 展開の予想を保存するテスト専用。ほかの予想の保存テストとデータを共有しない。
INSERT INTO race (id, date, course, race_number, name, surface, distance, direction)
VALUES ('01JE2ERACEFLOW000000000000', '2099-05-06', '中山', 11, 'E2E展開賞', '芝', 2000, '右');
INSERT INTO horse (id, name) VALUES ('01JE2EFLOWHORSE10000000000', 'E2Eニゲウマ'), ('01JE2EFLOWHORSE20000000000', 'E2Eオイコミ');
INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number)
VALUES ('01JE2EFLOWENTRY10000000000', '01JE2ERACEFLOW000000000000', '01JE2EFLOWHORSE10000000000', 1, 1),
       ('01JE2EFLOWENTRY20000000000', '01JE2ERACEFLOW000000000000', '01JE2EFLOWHORSE20000000000', 2, 2);

-- 18頭・枠順前（馬番も枠も無い）で3局面すべてに展開を置いたレース。畳んだ行の折り返しと高さ、頭2文字のコマを撮る。
INSERT INTO race (id, date, course, race_number, name, surface, distance)
VALUES ('01JE2ERACEFLOW180000000000', '2099-05-07', '阪神', 11, 'E2E多頭数賞', '芝', 2400);
INSERT INTO horse (id, name) VALUES ('01JE2EFLOW18H0000000000001', 'アカツキ'), ('01JE2EFLOW18H0000000000002', 'イナズマ'), ('01JE2EFLOW18H0000000000003', 'ウミカゼ'), ('01JE2EFLOW18H0000000000004', 'エンブレム'), ('01JE2EFLOW18H0000000000005', 'オーロラ'), ('01JE2EFLOW18H0000000000006', 'カゲロウ'), ('01JE2EFLOW18H0000000000007', 'キセキ'), ('01JE2EFLOW18H0000000000008', 'クモマ'), ('01JE2EFLOW18H0000000000009', 'ケヤキ'), ('01JE2EFLOW18H0000000000010', 'コハク'), ('01JE2EFLOW18H0000000000011', 'サクラ'), ('01JE2EFLOW18H0000000000012', 'シグレ'), ('01JE2EFLOW18H0000000000013', 'スバル'), ('01JE2EFLOW18H0000000000014', 'セイラン'), ('01JE2EFLOW18H0000000000015', 'ソヨカゼ'), ('01JE2EFLOW18H0000000000016', 'タイガ'), ('01JE2EFLOW18H0000000000017', 'チドリ'), ('01JE2EFLOW18H0000000000018', 'ツバサ');
INSERT INTO race_entry (id, race_id, horse_id) VALUES ('01JE2EFLOW18E0000000000001', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000001'), ('01JE2EFLOW18E0000000000002', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000002'), ('01JE2EFLOW18E0000000000003', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000003'), ('01JE2EFLOW18E0000000000004', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000004'), ('01JE2EFLOW18E0000000000005', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000005'), ('01JE2EFLOW18E0000000000006', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000006'), ('01JE2EFLOW18E0000000000007', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000007'), ('01JE2EFLOW18E0000000000008', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000008'), ('01JE2EFLOW18E0000000000009', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000009'), ('01JE2EFLOW18E0000000000010', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000010'), ('01JE2EFLOW18E0000000000011', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000011'), ('01JE2EFLOW18E0000000000012', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000012'), ('01JE2EFLOW18E0000000000013', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000013'), ('01JE2EFLOW18E0000000000014', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000014'), ('01JE2EFLOW18E0000000000015', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000015'), ('01JE2EFLOW18E0000000000016', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000016'), ('01JE2EFLOW18E0000000000017', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000017'), ('01JE2EFLOW18E0000000000018', '01JE2ERACEFLOW180000000000', '01JE2EFLOW18H0000000000018');
INSERT INTO note (id, author_id, kind, race_id, body, flow, occurred_at, created_at)
VALUES ('01JE2EFLOW18NOTE0000000000', '01JE2EUSER0000000000000000', 'race_preview', '01JE2ERACEFLOW180000000000', '', '{"pace":"ハイ","start":{"spots":[{"entryId":"01JE2EFLOW18E0000000000001","x":0,"y":0},{"entryId":"01JE2EFLOW18E0000000000002","x":0,"y":1},{"entryId":"01JE2EFLOW18E0000000000003","x":1,"y":0},{"entryId":"01JE2EFLOW18E0000000000004","x":1,"y":1},{"entryId":"01JE2EFLOW18E0000000000005","x":2,"y":0},{"entryId":"01JE2EFLOW18E0000000000006","x":2,"y":1},{"entryId":"01JE2EFLOW18E0000000000007","x":3,"y":0},{"entryId":"01JE2EFLOW18E0000000000008","x":3,"y":1},{"entryId":"01JE2EFLOW18E0000000000009","x":4,"y":0},{"entryId":"01JE2EFLOW18E0000000000010","x":4,"y":1},{"entryId":"01JE2EFLOW18E0000000000011","x":5,"y":0},{"entryId":"01JE2EFLOW18E0000000000012","x":5,"y":1},{"entryId":"01JE2EFLOW18E0000000000013","x":6,"y":0},{"entryId":"01JE2EFLOW18E0000000000014","x":6,"y":1},{"entryId":"01JE2EFLOW18E0000000000015","x":7,"y":0},{"entryId":"01JE2EFLOW18E0000000000016","x":7,"y":1},{"entryId":"01JE2EFLOW18E0000000000017","x":8,"y":0},{"entryId":"01JE2EFLOW18E0000000000018","x":8,"y":1}],"memo":"内の先行勢が競り合う"},"corner4":{"spots":[{"entryId":"01JE2EFLOW18E0000000000001","x":0,"y":0},{"entryId":"01JE2EFLOW18E0000000000002","x":0,"y":1},{"entryId":"01JE2EFLOW18E0000000000003","x":0,"y":2},{"entryId":"01JE2EFLOW18E0000000000004","x":1,"y":0},{"entryId":"01JE2EFLOW18E0000000000005","x":1,"y":1},{"entryId":"01JE2EFLOW18E0000000000006","x":1,"y":2},{"entryId":"01JE2EFLOW18E0000000000007","x":2,"y":0},{"entryId":"01JE2EFLOW18E0000000000008","x":2,"y":1},{"entryId":"01JE2EFLOW18E0000000000009","x":2,"y":2},{"entryId":"01JE2EFLOW18E0000000000010","x":3,"y":0},{"entryId":"01JE2EFLOW18E0000000000011","x":3,"y":1},{"entryId":"01JE2EFLOW18E0000000000012","x":3,"y":2},{"entryId":"01JE2EFLOW18E0000000000013","x":4,"y":0},{"entryId":"01JE2EFLOW18E0000000000014","x":4,"y":1},{"entryId":"01JE2EFLOW18E0000000000015","x":4,"y":2},{"entryId":"01JE2EFLOW18E0000000000016","x":5,"y":0},{"entryId":"01JE2EFLOW18E0000000000017","x":5,"y":1},{"entryId":"01JE2EFLOW18E0000000000018","x":5,"y":2}],"memo":""},"finish":{"spots":[{"entryId":"01JE2EFLOW18E0000000000001","x":0,"y":0},{"entryId":"01JE2EFLOW18E0000000000002","x":7,"y":2},{"entryId":"01JE2EFLOW18E0000000000003","x":4,"y":0},{"entryId":"01JE2EFLOW18E0000000000004","x":1,"y":2},{"entryId":"01JE2EFLOW18E0000000000005","x":8,"y":0},{"entryId":"01JE2EFLOW18E0000000000006","x":5,"y":2},{"entryId":"01JE2EFLOW18E0000000000007","x":2,"y":0},{"entryId":"01JE2EFLOW18E0000000000008","x":9,"y":2},{"entryId":"01JE2EFLOW18E0000000000009","x":6,"y":0},{"entryId":"01JE2EFLOW18E0000000000010","x":3,"y":2},{"entryId":"01JE2EFLOW18E0000000000011","x":0,"y":1},{"entryId":"01JE2EFLOW18E0000000000012","x":7,"y":3},{"entryId":"01JE2EFLOW18E0000000000013","x":4,"y":1},{"entryId":"01JE2EFLOW18E0000000000014","x":1,"y":3},{"entryId":"01JE2EFLOW18E0000000000015","x":8,"y":1},{"entryId":"01JE2EFLOW18E0000000000016","x":5,"y":3},{"entryId":"01JE2EFLOW18E0000000000017","x":2,"y":1},{"entryId":"01JE2EFLOW18E0000000000018","x":9,"y":3}],"memo":"外から差し込む"}}', '2099-05-07', unixepoch('2020-01-01'));

-- 予想まとめの操作テスト専用。他の予想の保存テストとデータを共有しない。
INSERT INTO horse (id,name) VALUES ('01JE2EHORSESUMMARY0000000','E2Eまとめホース');
INSERT INTO race (id,date,course,race_number,name,surface,distance)
VALUES ('01JE2ERACESUMMARY000000000','2099-05-04','東京',10,'E2Eまとめ賞','芝',1600);
INSERT INTO race_entry (id,race_id,horse_id,bracket,horse_number)
VALUES ('01JE2EENTRYSUMMARY0000000','01JE2ERACESUMMARY000000000','01JE2EHORSESUMMARY0000000',1,1);
INSERT INTO note (id,author_id,kind,race_id,body,occurred_at)
VALUES ('01JE2ESUMMARYOUTLOOK00000','01JE2EUSER0000000000000000','race_preview','01JE2ERACESUMMARY000000000','まとめ用の見立て。前半はゆっくり。','2099-05-04');
INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,mark,occurred_at)
VALUES ('01JE2ESUMMARYPREVIEW00000','01JE2EUSER0000000000000000','preview','01JE2ERACESUMMARY000000000','01JE2EHORSESUMMARY0000000','01JE2EENTRYSUMMARY0000000','まとめ用のメモ。内枠を評価。','◎','2099-05-04');

-- 端末共有の操作テスト用。既存のまとめ操作テストと書き込み先を分ける。
INSERT INTO race (id,date,course,race_number,name,surface,distance)
VALUES ('01JE2ERACENATIVESHARE00000','2099-05-05','東京',11,'E2E端末共有賞','芝',1600);
INSERT INTO note (id,author_id,kind,race_id,body,occurred_at)
VALUES ('01JE2ENATIVESHARENOTE0000','01JE2EUSER0000000000000000','race_preview','01JE2ERACENATIVESHARE00000','端末共有用の見立て。','2099-05-05');

-- 公開ページのキャプチャ用。共有コピーなので元のメモは変えない。
INSERT INTO race_share (id,author_id,race_id,content)
VALUES ('01JE2ESHAREDRACE0000000000','01JE2EUSER0000000000000000','01JE2ERACEMARKS00000000000',
'{"race":{"name":"E2E印見本賞","meeting":"東京11R","spec":"2026-06-07 · 芝1600m / 左","grade":"G1"},"body":"前半は落ち着いた流れを想定。直線の末脚を重視したい。","flow":{"pace":"スロー","leadsRight":true,"start":{"memo":"③が楽にハナ。①は好位の内","spots":[{"horseNumber":3,"bracket":3,"horseName":"E2Eタンアナ","x":0,"y":0},{"horseNumber":1,"bracket":1,"horseName":"E2Eホンメイ","x":1,"y":0},{"horseNumber":5,"bracket":5,"horseName":"E2Eアナウマ","x":1,"y":1},{"horseNumber":2,"bracket":2,"horseName":"E2Eタイコウ","x":3,"y":0},{"horseNumber":4,"bracket":4,"horseName":"E2Eレンシタ","x":4,"y":1},{"horseNumber":6,"bracket":6,"horseName":"E2Eケシウマ","x":6,"y":0},{"horseNumber":7,"bracket":7,"horseName":"E2Eメモノミ","x":7,"y":2}]},"corner4":{"memo":"②が外から押し上げる","spots":[{"horseNumber":3,"bracket":3,"horseName":"E2Eタンアナ","x":0,"y":0},{"horseNumber":1,"bracket":1,"horseName":"E2Eホンメイ","x":1,"y":0},{"horseNumber":5,"bracket":5,"horseName":"E2Eアナウマ","x":1,"y":1},{"horseNumber":2,"bracket":2,"horseName":"E2Eタイコウ","x":2,"y":2},{"horseNumber":4,"bracket":4,"horseName":"E2Eレンシタ","x":4,"y":1},{"horseNumber":6,"bracket":6,"horseName":"E2Eケシウマ","x":5,"y":0},{"horseNumber":7,"bracket":7,"horseName":"E2Eメモノミ","x":6,"y":3}]},"finish":{"memo":"","spots":[{"horseNumber":1,"bracket":1,"horseName":"E2Eホンメイ","x":0,"y":0},{"horseNumber":2,"bracket":2,"horseName":"E2Eタイコウ","x":0,"y":2},{"horseNumber":3,"bracket":3,"horseName":"E2Eタンアナ","x":1,"y":0},{"horseNumber":5,"bracket":5,"horseName":"E2Eアナウマ","x":2,"y":1},{"horseNumber":7,"bracket":7,"horseName":"E2Eメモノミ","x":3,"y":3},{"horseNumber":4,"bracket":4,"horseName":"E2Eレンシタ","x":4,"y":1},{"horseNumber":6,"bracket":6,"horseName":"E2Eケシウマ","x":6,"y":0}]}},"rows":[{"horseName":"E2Eモウイットウ","horseNumber":9,"bracket":5,"body":"同じ本命印の中では馬番順。","mark":"◎","tags":[]},{"horseName":"E2Eホンメイ","horseNumber":1,"bracket":1,"body":"好位で脚をためられれば。前走の末脚に期待。","mark":"◎","tags":[]},{"horseName":"E2Eタイコウ","horseNumber":2,"bracket":2,"body":"展開が向きそう。長く脚を使える点を評価。","mark":"○","tags":[]},{"horseName":"E2Eタンアナ","horseNumber":3,"bracket":3,"body":"","mark":"▲","tags":[]},{"horseName":"E2Eレンシタ","horseNumber":4,"bracket":4,"body":"","mark":"△","tags":[]},{"horseName":"E2Eアナウマ","horseNumber":5,"bracket":5,"body":"","mark":"☆","tags":[]},{"horseName":"E2Eケシウマ","horseNumber":6,"bracket":6,"body":"","mark":"×","tags":[]},{"horseName":"E2Eメモノミ","horseNumber":7,"bracket":7,"body":"印は保留。距離延長での走りに注目。","mark":null,"tags":[]}]}');

-- 未保存の件数と、保存したときの件数がそろうことを見る専用のレース（save-count.e2e.ts）。
-- 出走2頭のうち1頭には出走前メモが保存済み。もう1頭に本文・札・印を付けて保存したとき、
-- 未保存も保存も「1件」になること（欄の数でも、保存済みのメモの総数でもない）を見る。
-- **開催済み**にして、予想とふりかえりの両方を開けるようにする。日付を古くするのは、
-- ダッシュボード（直近3週）やほかのテストのレースの馬柱に出てこないようにするため。
INSERT INTO race (id,date,course,race_number,name,surface,distance)
VALUES ('01JE2ERACECOUNT0000000000','2019-05-03','東京',9,'E2E件数賞','芝',1600);
INSERT INTO horse (id,name) VALUES ('01JE2EHORSECOUNTA00000000','E2Eカキズミ');
INSERT INTO horse (id,name) VALUES ('01JE2EHORSECOUNTB00000000','E2Eコレカラ');
INSERT INTO race_entry (id,race_id,horse_id,bracket,horse_number)
VALUES ('01JE2EENTRYCOUNTA00000000','01JE2ERACECOUNT0000000000','01JE2EHORSECOUNTA00000000',1,1);
INSERT INTO race_entry (id,race_id,horse_id,bracket,horse_number)
VALUES ('01JE2EENTRYCOUNTB00000000','01JE2ERACECOUNT0000000000','01JE2EHORSECOUNTB00000000',2,2);
-- created_at を古くするのは、ダッシュボードの「最近のメモ」（作った順の新しい20件）を押し出さないため。
INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,mark,occurred_at,created_at)
VALUES ('01JE2ECOUNTPREVIEW0000000','01JE2EUSER0000000000000000','preview','01JE2ERACECOUNT0000000000','01JE2EHORSECOUNTA00000000','01JE2EENTRYCOUNTA00000000','保存済みのメモ。','○','2019-05-03',unixepoch('2026-01-01'));

-- 推しの馬（favorite_horse）。ダッシュボードの「推しの出走予定」と、馬の画面の「推しにする／推しから外す」を見る。
-- - E2Eテストホース — 出走予定（2099-04-04 E2E未来賞）がある推し
-- - E2Eソトワク — 走り終えたレースしか無い推し（「出走予定の無い推し」に名前だけ出る）
-- - E2Eタニンノウマ — **別のユーザー**の推し。今週出走するが、自分のダッシュボードには出てはいけない
-- E2Eミカギリ（今週出走）は誰の推しでもない。E2E が推しにして、外して確かめる。
INSERT OR REPLACE INTO favorite_horse (user_id, horse_id)
VALUES
	('01JE2EUSER0000000000000000', '01JE2EHORSE000000000000000'),
	('01JE2EUSER0000000000000000', '01JE2EHORSED00000000000000'),
	('01JE2EOTHERUSER00000000000', '01JE2EHORSEOTHERS000000000');

-- 騎手（/jockeys）。騎手はマスタを持たず、出走馬の騎手名で束ねる。
-- 「E2E騎手」は上の出走のほとんどに乗っている（メモの付いた騎乗・付いていない騎乗・出走予定がそろう）。
-- 「E2Eワカテ騎手」は今週のレースの1騎乗だけ（一覧に2人並べ、札で絞ると1人になるのを見る）。
-- まとめは自分のものと、**別のユーザー**のもの（どの画面にも出てはいけない）。
INSERT OR REPLACE INTO jockey_note (user_id, jockey, body, tags)
VALUES (
	'01JE2EUSER0000000000000000',
	'E2E騎手',
	'中山の内回りは前に行く。人気薄でも粘り込む。',
	'["中山巧者","先行が多い","穴で怖い"]'
);

INSERT OR REPLACE INTO jockey_note (user_id, jockey, body, tags)
VALUES ('01JE2EOTHERUSER00000000000', 'E2E騎手', '他人の騎手のまとめ。見えてはいけない。', '["東京巧者"]');

-- ふりかえり画面の「実際の展開」用。**展開の予想もメモも置いていない**レース
-- （予想していなくても、4角とゴール前の隊列が結果から出ることを見る）。
-- 6頭立てで全頭入れ、頭数（field_size）もある。4角は①と③が同じ2番手（同じ列に並ぶ）。
-- ⑥は4コーナーの手前で競走中止（通過順が `4-4-5` と3つで切れる）。最後の数字は4角ではないので、
-- 4角の隊列にも「4角N番手」の行にも出さない。
INSERT INTO race (id, date, course, race_number, name, class_name, surface, distance, direction, field_size)
VALUES ('01JE2ERACEACTUALFLOW000000', '2026-06-28', '福島', 11, 'E2E実際展開賞', '3勝クラス', '芝', 1800, '右', 6);
INSERT INTO horse (id, name, birth_year) VALUES
	('01JE2EACTUALHORSE100000000', 'E2Eサンバンテ', 2022),
	('01JE2EACTUALHORSE200000000', 'E2Eハナキリ', 2022),
	('01JE2EACTUALHORSE300000000', 'E2Eマクリ', 2022),
	('01JE2EACTUALHORSE400000000', 'E2Eバテル', 2022),
	('01JE2EACTUALHORSE500000000', 'E2Eオイコミ', 2022),
	('01JE2EACTUALHORSE600000000', 'E2Eチュウシ', 2022);
INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number, finish_position, passing, last_3f, popularity) VALUES
	('01JE2EACTUALENTRY100000000', '01JE2ERACEACTUALFLOW000000', '01JE2EACTUALHORSE100000000', 1, 1, 1, '3-3-3-2', 34.5, 1),
	('01JE2EACTUALENTRY200000000', '01JE2ERACEACTUALFLOW000000', '01JE2EACTUALHORSE200000000', 2, 2, 2, '1-1-1-1', 35.0, 3),
	('01JE2EACTUALENTRY300000000', '01JE2ERACEACTUALFLOW000000', '01JE2EACTUALHORSE300000000', 3, 3, 3, '5-5-4-2', 34.2, 2),
	('01JE2EACTUALENTRY400000000', '01JE2ERACEACTUALFLOW000000', '01JE2EACTUALHORSE400000000', 4, 4, 4, '2-2-2-4', 35.3, 5),
	('01JE2EACTUALENTRY500000000', '01JE2ERACEACTUALFLOW000000', '01JE2EACTUALHORSE500000000', 5, 5, 5, '6-6-6-6', 34.8, 6),
	('01JE2EACTUALENTRY600000000', '01JE2ERACEACTUALFLOW000000', '01JE2EACTUALHORSE600000000', 6, 6, NULL, '4-4-5', NULL, 4);

-- ふりかえり画面の「実際の展開」を18頭立てで見る（キャプチャ用。予想もメモも無い）。
-- 10マスに収まらないので、盤面は1マスに順位2つぶんをまとめて2段に積む。
INSERT INTO race (id, date, course, race_number, name, class_name, surface, distance, direction, field_size)
VALUES ('01JE2ERACEACTUALFLOW180000', '2026-05-24', '東京', 11, 'E2E十八頭賞', '3勝クラス', '芝', 2400, '左', 18);
INSERT INTO horse (id, name, birth_year) VALUES
	('01JE2EACT18HORSE0100000000', 'E2E十八頭01', 2022),
	('01JE2EACT18HORSE0200000000', 'E2E十八頭02', 2022),
	('01JE2EACT18HORSE0300000000', 'E2E十八頭03', 2022),
	('01JE2EACT18HORSE0400000000', 'E2E十八頭04', 2022),
	('01JE2EACT18HORSE0500000000', 'E2E十八頭05', 2022),
	('01JE2EACT18HORSE0600000000', 'E2E十八頭06', 2022),
	('01JE2EACT18HORSE0700000000', 'E2E十八頭07', 2022),
	('01JE2EACT18HORSE0800000000', 'E2E十八頭08', 2022),
	('01JE2EACT18HORSE0900000000', 'E2E十八頭09', 2022),
	('01JE2EACT18HORSE1000000000', 'E2E十八頭10', 2022),
	('01JE2EACT18HORSE1100000000', 'E2E十八頭11', 2022),
	('01JE2EACT18HORSE1200000000', 'E2E十八頭12', 2022),
	('01JE2EACT18HORSE1300000000', 'E2E十八頭13', 2022),
	('01JE2EACT18HORSE1400000000', 'E2E十八頭14', 2022),
	('01JE2EACT18HORSE1500000000', 'E2E十八頭15', 2022),
	('01JE2EACT18HORSE1600000000', 'E2E十八頭16', 2022),
	('01JE2EACT18HORSE1700000000', 'E2E十八頭17', 2022),
	('01JE2EACT18HORSE1800000000', 'E2E十八頭18', 2022);
INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number, finish_position, passing) VALUES
	('01JE2EACT18ENTRY0100000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0100000000', 1, 1, 1, '3-3-3-3'),
	('01JE2EACT18ENTRY0200000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0200000000', 1, 2, 6, '1-1-1-1'),
	('01JE2EACT18ENTRY0300000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0300000000', 2, 3, 2, '2-2-2-2'),
	('01JE2EACT18ENTRY0400000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0400000000', 2, 4, 9, '5-5-5-5'),
	('01JE2EACT18ENTRY0500000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0500000000', 3, 5, 3, '4-4-4-4'),
	('01JE2EACT18ENTRY0600000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0600000000', 3, 6, 11, '7-7-7-7'),
	('01JE2EACT18ENTRY0700000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0700000000', 4, 7, 4, '6-6-6-6'),
	('01JE2EACT18ENTRY0800000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0800000000', 4, 8, 13, '9-9-9-9'),
	('01JE2EACT18ENTRY0900000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE0900000000', 5, 9, 5, '8-8-8-8'),
	('01JE2EACT18ENTRY1000000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1000000000', 5, 10, 15, '11-11-11-11'),
	('01JE2EACT18ENTRY1100000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1100000000', 6, 11, 7, '10-10-10-10'),
	('01JE2EACT18ENTRY1200000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1200000000', 6, 12, 17, '13-13-13-13'),
	('01JE2EACT18ENTRY1300000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1300000000', 7, 13, 8, '12-12-12-12'),
	('01JE2EACT18ENTRY1400000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1400000000', 7, 14, 18, '15-15-15-15'),
	('01JE2EACT18ENTRY1500000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1500000000', 7, 15, 10, '14-14-14-14'),
	('01JE2EACT18ENTRY1600000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1600000000', 8, 16, 16, '17-17-17-17'),
	('01JE2EACT18ENTRY1700000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1700000000', 8, 17, 12, '16-16-16-16'),
	('01JE2EACT18ENTRY1800000000', '01JE2ERACEACTUALFLOW180000', '01JE2EACT18HORSE1800000000', 8, 18, 14, '18-18-18-18');

-- 一覧を100件ずつ読むところ（下端で続きを読む）。1ページ（100件）を超えるレースと馬。
-- レースは 2001 年の条件戦に置く。既定の一覧（今年の重賞）・ダッシュボード・今週の重賞には出ず、
-- `?year=2001` と全件（`?year=`）の末尾にだけ並ぶ。出走馬は付けない（馬のタイムライン・騎手に出さない）。
WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM s WHERE i < 105)
INSERT INTO race (id, date, course, race_number, name, class_name, surface, distance)
SELECT printf('01JE2EPAGERACE%012d', i), date('2001-01-01', '+' || i || ' days'), '中山', 1,
	printf('E2E一覧レース%03d', i), '未勝利', 'ダート', 1200
FROM s;
-- 馬は「E2E一覧ウマ」で始まる 105 頭。名前の順で `/horses` の1ページ目の大半を占める。
WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM s WHERE i < 105)
INSERT INTO horse (id, name)
SELECT printf('01JE2EPAGEHORSE%011d', i), printf('E2E一覧ウマ%03d', i) FROM s;
