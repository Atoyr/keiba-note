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

-- **出走馬がまだ1頭も登録されていない未来のレース。**
--
-- これから組まれる重賞は、出馬表が出る前に日付と格だけ先に登録する運用がある。
-- この状態でも「レースの見立て」は書けること、そしてふりかえりは開けずに
-- 予想画面へ戻されることをここで見る。**出走馬を足さないこと。**
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACEEMPTY00000000000', '2099-06-06', '阪神', 11, 'E2E出馬表前賞', 'G3', '芝', 1800);

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
VALUES ('01JE2EENTRYOTHERS000000000', '01JE2ERACETHISWEEK00000000', '01JE2EHORSEOTHERS000000000', 9, 'E2E騎手');

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
INSERT OR REPLACE INTO race (id, date, course, race_number, name, grade, surface, distance)
VALUES ('01JE2ERACESAMECOND0000000', '2026-04-26', '京都', 11, 'E2E同条件賞', 'G2', '芝', 2200);

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
INSERT OR REPLACE INTO race_entry (id, race_id, horse_id, bracket, horse_number, jockey, finish_position)
VALUES (
	'01JE2EENTRYSAMECOND000000',
	'01JE2ERACESAMECOND0000000',
	'01JE2EHORSEB00000000000000',
	3, 5, 'E2E騎手', 4
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
