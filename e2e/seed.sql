-- E2E が読む行。`e2e/seed.ts` がローカル D1（.wrangler/state）に流す。
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
