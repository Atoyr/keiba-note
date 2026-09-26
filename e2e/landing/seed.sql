-- 紹介ページ（未ログインの `/`）に載せるキャプチャの見本データ。
--
-- `pnpm run landing:shots` が、E2E とは別の D1（.wrangler/landing）を空にしてから流す（e2e/seed.ts）。
-- **E2E の seed（e2e/seed.sql）とは混ぜない。** あちらの馬名は「E2E〜」で紹介には向かず、
-- こちらの行を足すと E2E の画面（ダッシュボード・一覧）の前提が変わる。
--
-- 馬・レース・人名はすべて架空。実在の馬やレースと同じ名前にしない（本番のデータを写さない → docs/testing.md 5-4）。
-- 騎手は入れない（架空の騎手名が実在の騎手と重なりやすいため）。
--
-- 日付は流した日から決める（SQLite の `now` は UTC なので +9 時間して JST にする）。
-- ダッシュボードの「今週のレース」「ふりかえり待ち」が埋まった状態で撮るため。
-- 起点は**今日以降で最初の日曜**（`weekday 0`。今日が日曜なら今日）。週は月〜日なので必ず今週に入り、
-- どのレースも土日に落ちる（平日の重賞が写ると、競馬を見る人には不自然に見える）。
-- 開催場は9月下旬に撮る前提で、その時期に開いている場にしてある（9月の中山、7月の福島）。
--
--   うまメモ記念     起点の日曜        中山 芝2000 G2  予想中（印・出走前メモ・展開・オッズ）
--   さざなみカップ   8日前（土曜）     中山 芝1600 G3  見立てと印だけ（ふりかえり待ち）
--   みなもステークス 14日前（日曜）    中山 芝2000 G3  予想もふりかえりも書いた（答え合わせ）
--   初夏特別         70日前（日曜）    福島 芝2000 3勝クラス

-- 公開用の名前は予想まとめの「〇〇 の予想」に出る（無いと「匿名」）。
INSERT INTO user (id, google_sub, email, display_name, public_name, role)
VALUES ('01JLPUSER00000000000000000', 'landing-google-sub', 'landing@example.invalid', 'うまメモ', '週末うまメモ', 'user');

-- トークンは e2e/landing/shoot.ts の LANDING_SESSION_TOKEN。id はその SHA-256。期限は 2100-01-01。
INSERT INTO session (id, user_id, expires_at)
VALUES ('0599289db8538145d7d5017df6963ab47dc3d79f7089373c66d35328243ba70a', '01JLPUSER00000000000000000', 4102444800);

-- 馬。番号の末尾は今日のレース（うまメモ記念）の馬番。
INSERT INTO horse (id, name, sex, birth_year, sire, dam) VALUES
	('01JLPHORSE0000000000000001', 'ミヤビノカゼ', '牡', 2022, 'ソラノカケハシ', 'ミヤビノウタ'),
	('01JLPHORSE0000000000000002', 'シロガネビート', '牡', 2021, NULL, NULL),
	('01JLPHORSE0000000000000003', 'トキノハヤテ', '牡', 2021, NULL, NULL),
	('01JLPHORSE0000000000000004', 'アカネグモ', '牝', 2022, NULL, NULL),
	('01JLPHORSE0000000000000005', 'ホシノシズク', '牝', 2022, NULL, NULL),
	('01JLPHORSE0000000000000006', 'ナギサノウタ', '牡', 2022, NULL, NULL),
	('01JLPHORSE0000000000000007', 'ヨアケノツバサ', 'セ', 2020, NULL, NULL),
	('01JLPHORSE0000000000000008', 'カザミドリ', '牡', 2021, NULL, NULL);

-- ---------------------------------------------------------------------------
-- 起点の日曜: うまメモ記念（予想画面・予想まとめ・展開の予想）
-- ---------------------------------------------------------------------------

INSERT INTO race (id, date, course, race_number, name, grade, surface, distance, direction)
VALUES ('01JLPRACETODAY000000000000', date('now', '+9 hours', 'weekday 0'), '中山', 11, 'うまメモ記念', 'G2', '芝', 2000, '右');

INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number) VALUES
	('01JLPENTRYTODAY00000000001', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000001', 1, 1),
	('01JLPENTRYTODAY00000000002', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000002', 2, 2),
	('01JLPENTRYTODAY00000000003', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000003', 3, 3),
	('01JLPENTRYTODAY00000000004', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000004', 4, 4),
	('01JLPENTRYTODAY00000000005', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000005', 5, 5),
	('01JLPENTRYTODAY00000000006', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000006', 6, 6),
	('01JLPENTRYTODAY00000000007', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000007', 7, 7),
	('01JLPENTRYTODAY00000000008', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000008', 8, 8);

-- オッズ。時点はレース当日の 9:30 JST（= 0:30 UTC）。まず値だけ入れ、時点はあとからそろえる
-- （D1 は UNION を長く連ねた SELECT を受け付けない）。
INSERT INTO race_odds (race_id, horse_number, win_odds, place_odds_min, place_odds_max, as_of, fetched_at) VALUES
	('01JLPRACETODAY000000000000', 1, 3.8, 1.6, 2.1, 0, 0),
	('01JLPRACETODAY000000000000', 2, 9.5, 2.6, 3.8, 0, 0),
	('01JLPRACETODAY000000000000', 3, 11.2, 2.9, 4.3, 0, 0),
	('01JLPRACETODAY000000000000', 4, 18.6, 4.1, 6.5, 0, 0),
	('01JLPRACETODAY000000000000', 5, 6.4, 2.0, 2.9, 0, 0),
	('01JLPRACETODAY000000000000', 6, 2.9, 1.3, 1.7, 0, 0),
	('01JLPRACETODAY000000000000', 7, 42.1, 8.0, 13.2, 0, 0),
	('01JLPRACETODAY000000000000', 8, 21.7, 4.5, 7.1, 0, 0);
UPDATE race_odds SET
	as_of = unixepoch(date('now', '+9 hours', 'weekday 0') || ' 00:30:00'),
	fetched_at = unixepoch(date('now', '+9 hours', 'weekday 0') || ' 00:31:00')
WHERE race_id = '01JLPRACETODAY000000000000';

-- レースの見立てと展開の予想。
INSERT INTO note (id, author_id, kind, race_id, body, flow, occurred_at)
VALUES (
	'01JLPNOTETODAYOUTLOOK00000', '01JLPUSER00000000000000000', 'race_preview', '01JLPRACETODAY000000000000',
	'開幕3週目でも内の馬場が良い。スローからの瞬発力勝負とみて、好位の内で脚をためられる馬から。',
	'{"pace":"スロー","start":{"spots":[{"entryId":"01JLPENTRYTODAY00000000003","x":0,"y":0},{"entryId":"01JLPENTRYTODAY00000000001","x":1,"y":0},{"entryId":"01JLPENTRYTODAY00000000006","x":1,"y":1},{"entryId":"01JLPENTRYTODAY00000000004","x":2,"y":1},{"entryId":"01JLPENTRYTODAY00000000002","x":3,"y":0},{"entryId":"01JLPENTRYTODAY00000000005","x":4,"y":1},{"entryId":"01JLPENTRYTODAY00000000008","x":5,"y":2},{"entryId":"01JLPENTRYTODAY00000000007","x":6,"y":1}],"memo":"③が楽にハナ。①は好位の内"},"corner4":{"spots":[{"entryId":"01JLPENTRYTODAY00000000003","x":0,"y":0},{"entryId":"01JLPENTRYTODAY00000000001","x":1,"y":0},{"entryId":"01JLPENTRYTODAY00000000006","x":1,"y":1},{"entryId":"01JLPENTRYTODAY00000000004","x":2,"y":2},{"entryId":"01JLPENTRYTODAY00000000002","x":3,"y":0},{"entryId":"01JLPENTRYTODAY00000000007","x":3,"y":3},{"entryId":"01JLPENTRYTODAY00000000005","x":4,"y":1},{"entryId":"01JLPENTRYTODAY00000000008","x":5,"y":2}],"memo":"⑦が外から押し上げる"},"finish":{"spots":[{"entryId":"01JLPENTRYTODAY00000000001","x":0,"y":0},{"entryId":"01JLPENTRYTODAY00000000006","x":0,"y":1},{"entryId":"01JLPENTRYTODAY00000000007","x":1,"y":3},{"entryId":"01JLPENTRYTODAY00000000003","x":2,"y":0},{"entryId":"01JLPENTRYTODAY00000000004","x":2,"y":2},{"entryId":"01JLPENTRYTODAY00000000005","x":3,"y":1},{"entryId":"01JLPENTRYTODAY00000000002","x":4,"y":0},{"entryId":"01JLPENTRYTODAY00000000008","x":5,"y":2}],"memo":"①と⑥の叩き合い"}}',
	date('now', '+9 hours', 'weekday 0')
);

-- 出走前メモと印。
INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at) VALUES
	('01JLPNOTETODAYPREVIEW00001', '01JLPUSER00000000000000000', 'preview', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000001', '01JLPENTRYTODAY00000000001',
		'前走は直線で詰まって2着。スムーズなら突き抜ける。内枠も歓迎。', '[]', '◎', date('now', '+9 hours', 'weekday 0')),
	('01JLPNOTETODAYPREVIEW00002', '01JLPUSER00000000000000000', 'preview', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000002', '01JLPENTRYTODAY00000000002',
		'2000mは長い。', '[]', '×', date('now', '+9 hours', 'weekday 0')),
	('01JLPNOTETODAYPREVIEW00003', '01JLPUSER00000000000000000', 'preview', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000003', '01JLPENTRYTODAY00000000003',
		'単騎で逃げられそう。スローなら残る。', '[]', '▲', date('now', '+9 hours', 'weekday 0')),
	('01JLPNOTETODAYPREVIEW00004', '01JLPUSER00000000000000000', 'preview', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000004', '01JLPENTRYTODAY00000000004',
		'', '[]', '△', date('now', '+9 hours', 'weekday 0')),
	('01JLPNOTETODAYPREVIEW00006', '01JLPUSER00000000000000000', 'preview', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000006', '01JLPENTRYTODAY00000000006',
		'前走の勝ち方は強かった。今回は外枠がどうか。', '[]', '○', date('now', '+9 hours', 'weekday 0')),
	('01JLPNOTETODAYPREVIEW00007', '01JLPUSER00000000000000000', 'preview', '01JLPRACETODAY000000000000', '01JLPHORSE0000000000000007', '01JLPENTRYTODAY00000000007',
		'前走は出遅れ。立ち直っていれば。', '[]', '☆', date('now', '+9 hours', 'weekday 0'));

-- ---------------------------------------------------------------------------
-- 8日前（土曜）: さざなみカップ（見立てと印だけ書いて、ふりかえりはまだ → ダッシュボードの「ふりかえり待ち」）
-- ---------------------------------------------------------------------------

INSERT INTO race (id, date, course, race_number, name, grade, surface, distance, direction, track_condition, field_size, winner_name, runner_up_name)
VALUES ('01JLPRACELASTWEEK000000000', date('now', '+9 hours', 'weekday 0', '-8 days'), '中山', 11, 'さざなみカップ', 'G3', '芝', 1600, '右', '良', 16, 'ホシノシズク', 'シロガネビート');

INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number, finish_position, popularity, finish_time, passing, last_3f, time_diff) VALUES
	('01JLPENTRYLASTWEEK00000005', '01JLPRACELASTWEEK000000000', '01JLPHORSE0000000000000005', 2, 3, 1, 4, '1:33.5', '2-2-2', 34.3, -0.2),
	('01JLPENTRYLASTWEEK00000008', '01JLPRACELASTWEEK000000000', '01JLPHORSE0000000000000008', 7, 14, 5, 2, '1:33.9', '9-9-8', 34.0, 0.4),
	('01JLPENTRYLASTWEEK00000007', '01JLPRACELASTWEEK000000000', '01JLPHORSE0000000000000007', 5, 10, 9, 11, '1:34.3', '14-14-15', 34.1, 0.8);

INSERT INTO note (id, author_id, kind, race_id, body, occurred_at)
VALUES ('01JLPNOTELASTWEEKOUTLOOK00', '01JLPUSER00000000000000000', 'race_preview', '01JLPRACELASTWEEK000000000',
	'内の先行馬が有利な馬場。', date('now', '+9 hours', 'weekday 0', '-8 days'));

INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at)
VALUES ('01JLPNOTELASTWEEKPREVIEW08', '01JLPUSER00000000000000000', 'preview', '01JLPRACELASTWEEK000000000', '01JLPHORSE0000000000000008', '01JLPENTRYLASTWEEK00000008',
	'', '[]', '◎', date('now', '+9 hours', 'weekday 0', '-8 days'));

-- ---------------------------------------------------------------------------
-- 14日前: みなもステークス（予想もふりかえりも書いた → ふりかえり画面・答え合わせ）
-- ---------------------------------------------------------------------------

INSERT INTO race (id, date, course, race_number, name, grade, surface, distance, direction, track_condition, field_size, winner_name, runner_up_name)
VALUES ('01JLPRACEREVIEW00000000000', date('now', '+9 hours', 'weekday 0', '-14 days'), '中山', 11, 'みなもステークス', 'G3', '芝', 2000, '右', '良', 12, 'ナギサノウタ', 'ミヤビノカゼ');

INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number, finish_position, popularity, finish_time, passing, last_3f, time_diff) VALUES
	('01JLPENTRYREVIEW0000000003', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000003', 1, 1, 3, 5, '1:59.2', '1-1-1-1', 34.6, 0.3),
	('01JLPENTRYREVIEW0000000001', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000001', 2, 2, 2, 2, '1:59.0', '4-4-5-5', 33.4, 0.1),
	('01JLPENTRYREVIEW0000000006', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000006', 6, 7, 1, 1, '1:58.9', '3-3-3-2', 33.6, -0.1),
	('01JLPENTRYREVIEW0000000002', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000002', 7, 9, 4, 3, '1:59.3', '6-6-6-7', 33.9, 0.4),
	('01JLPENTRYREVIEW0000000004', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000004', 8, 11, 6, 6, '1:59.6', '8-8-8-8', 34.1, 0.7);

-- 開催前の見立てと印。created_at を前日にしておく（メモの並びは occurred_at → created_at の新しい順。
-- 同じ日付のふりかえりより後ろに並べ、予想画面の「過去のメモ」の先頭2件にふりかえりが入るように）。
INSERT INTO note (id, author_id, kind, race_id, body, occurred_at)
VALUES ('01JLPNOTEREVIEWOUTLOOK0000', '01JLPUSER00000000000000000', 'race_preview', '01JLPRACEREVIEW00000000000',
	'開幕週。内の先行馬を中心に。', date('now', '+9 hours', 'weekday 0', '-14 days'));

INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, mark, occurred_at) VALUES
	('01JLPNOTEREVIEWPREVIEW0001', '01JLPUSER00000000000000000', 'preview', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000001', '01JLPENTRYREVIEW0000000001',
		'内枠で好位が取れそう。', '[]', '◎', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWPREVIEW0006', '01JLPUSER00000000000000000', 'preview', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000006', '01JLPENTRYREVIEW0000000006',
		'', '[]', '○', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWPREVIEW0003', '01JLPUSER00000000000000000', 'preview', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000003', '01JLPENTRYREVIEW0000000003',
		'', '[]', '▲', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWPREVIEW0004', '01JLPUSER00000000000000000', 'preview', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000004', '01JLPENTRYREVIEW0000000004',
		'', '[]', '△', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWPREVIEW0002', '01JLPUSER00000000000000000', 'preview', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000002', '01JLPENTRYREVIEW0000000002',
		'', '[]', '×', date('now', '+9 hours', 'weekday 0', '-14 days'));
UPDATE note SET created_at = unixepoch(date('now', '+9 hours', 'weekday 0', '-15 days'))
WHERE race_id = '01JLPRACEREVIEW00000000000' AND kind IN ('preview', 'race_preview');

-- ふりかえり（レースのメモと、各馬の観戦メモ）。
INSERT INTO note (id, author_id, kind, race_id, body, occurred_at)
VALUES ('01JLPNOTEREVIEWRACE0000000', '01JLPUSER00000000000000000', 'race', '01JLPRACEREVIEW00000000000',
	'前半1000m 61.2秒のスロー。内の先行勢が残る展開で、外から差した馬には厳しかった。上がりの速い決着。',
	date('now', '+9 hours', 'weekday 0', '-14 days'));

INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, occurred_at) VALUES
	('01JLPNOTEREVIEWENTRY00001', '01JLPUSER00000000000000000', 'entry', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000001', '01JLPENTRYREVIEW0000000001',
		'直線で前が壁になり、追い出しが遅れた。脚は一番使っていた。', '["次走買い","不利"]', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWENTRY00006', '01JLPUSER00000000000000000', 'entry', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000006', '01JLPENTRYREVIEW0000000006',
		'好位から早めに抜け出す完勝。相手なりに走れる。', '["ハイレベル戦","好上がり"]', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWENTRY00003', '01JLPUSER00000000000000000', 'entry', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000003', '01JLPENTRYREVIEW0000000003',
		'単騎で逃げて粘った。自分の形なら崩れない。', '[]', date('now', '+9 hours', 'weekday 0', '-14 days')),
	('01JLPNOTEREVIEWENTRY00002', '01JLPUSER00000000000000000', 'entry', '01JLPRACEREVIEW00000000000', '01JLPHORSE0000000000000002', '01JLPENTRYREVIEW0000000002',
		'3角から手応えが怪しかった。2000mは長い。', '["次走消し"]', date('now', '+9 hours', 'weekday 0', '-14 days'));

-- ---------------------------------------------------------------------------
-- 70日前: 初夏特別（ミヤビノカゼのタイムラインを厚くする）
-- ---------------------------------------------------------------------------

INSERT INTO race (id, date, course, race_number, name, class_name, surface, distance, direction, track_condition, field_size, winner_name, runner_up_name)
VALUES ('01JLPRACEEARLY00000000000', date('now', '+9 hours', 'weekday 0', '-70 days'), '福島', 10, '初夏特別', '3勝クラス', '芝', 2000, '右', '稍重', 14, 'ミヤビノカゼ', 'トキノハヤテ');

INSERT INTO race_entry (id, race_id, horse_id, bracket, horse_number, finish_position, popularity, finish_time, passing, last_3f, time_diff) VALUES
	('01JLPENTRYEARLY0000000001', '01JLPRACEEARLY00000000000', '01JLPHORSE0000000000000001', 4, 4, 1, 3, '2:00.8', '7-7-5-3', 34.8, -0.3),
	('01JLPENTRYEARLY0000000003', '01JLPRACEEARLY00000000000', '01JLPHORSE0000000000000003', 5, 8, 2, 1, '2:01.1', '1-1-1-1', 35.9, 0.3),
	('01JLPENTRYEARLY0000000005', '01JLPRACEEARLY00000000000', '01JLPHORSE0000000000000005', 7, 12, 3, 7, '2:01.2', '10-10-9-8', 35.2, 0.4);

INSERT INTO note (id, author_id, kind, race_id, horse_id, race_entry_id, body, tags, occurred_at)
VALUES ('01JLPNOTEEARLYENTRY000001', '01JLPUSER00000000000000000', 'entry', '01JLPRACEEARLY00000000000', '01JLPHORSE0000000000000001', '01JLPENTRYEARLY0000000001',
	'4角で外に出してから一気。上がり最速で完勝。重賞でも通用する。', '["次走買い","好上がり"]', date('now', '+9 hours', 'weekday 0', '-70 days'));

-- 近況メモ（レースに紐づかない、馬へのメモ）。
INSERT INTO note (id, author_id, kind, horse_id, body, tags, occurred_at)
VALUES ('01JLPNOTEHORSE00000000001', '01JLPUSER00000000000000000', 'horse', '01JLPHORSE0000000000000001',
	'1週前追い切りは併せ馬で先着。状態は良さそう。', '[]', date('now', '+9 hours', 'weekday 0', '-6 days'));
