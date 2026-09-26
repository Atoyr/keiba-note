import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '$lib/server/db/test-d1';
import { getSharedNote } from './notes';
import { getPublicName, setPublicName } from './profile';
import {
	getOwnRaceShare,
	getRaceSummary,
	getSharedRaceSummary,
	listRaceShares,
	publishRaceSummary,
	revokeRaceShare
} from './race-shares';

let state: ReturnType<typeof createTestDb>;
beforeEach(() => {
	state = createTestDb();
	state.sqlite.exec(`
		INSERT INTO user (id, google_sub, email, display_name) VALUES ('a','ga','a@example.invalid','Google本名A'), ('b','gb','b@example.invalid','Google本名B');
		INSERT INTO race (id,date,course,name) VALUES ('r','2099-01-01','東京','テスト賞'), ('empty','2099-01-02','京都','空のレース');
		INSERT INTO horse (id,name) VALUES ('h','テストホース');
		INSERT INTO race_entry (id,race_id,horse_id,horse_number) VALUES ('e','r','h',1);
		INSERT INTO note (id,author_id,kind,race_id,body,occurred_at) VALUES ('outlook','a','race_preview','r','前半はゆっくり','2099-01-01'), ('review','a','race','r','共有しないふりかえり','2099-01-01'), ('other','b','race_preview','r','他人の秘密','2099-01-01');
		INSERT INTO note (id,author_id,kind,race_id,horse_id,race_entry_id,body,mark,occurred_at) VALUES ('preview','a','preview','r','h','e','内枠を評価','◎','2099-01-01');
		INSERT INTO note (id,author_id,kind,horse_id,body,occurred_at,visibility) VALUES ('shared','a','horse','h','単体共有','2099-01-01','unlisted');
	`);
});
afterEach(() => state.sqlite.close());

describe('予想まとめの共有', () => {
	it('本人の事前メモだけをまとめ、他人・ふりかえり・識別情報を含めない', async () => {
		const summary = await getRaceSummary(state.db, 'r', 'a');
		expect(summary?.body).toBe('前半はゆっくり');
		expect(summary?.rows).toEqual([
			{
				horseName: 'テストホース',
				horseNumber: 1,
				bracket: null,
				body: '内枠を評価',
				mark: '◎',
				tags: []
			}
		]);
		expect(JSON.stringify(summary)).not.toMatch(
			/Google本名|他人の秘密|共有しないふりかえり|authorId|email/
		);
		expect((await getRaceSummary(state.db, 'r', 'b'))?.rows).toEqual([]);
		expect(await getRaceSummary(state.db, 'missing', 'a')).toBeNull();
	});
	it('空の予想は共有できず、見立てだけ・印だけでも共有できる', async () => {
		expect(await publishRaceSummary(state.db, 'empty', 'a')).toBeNull();
		expect(await publishRaceSummary(state.db, 'missing', 'a')).toBeNull();
		expect(await publishRaceSummary(state.db, 'r', 'b')).not.toBeNull();
		state.sqlite.exec(
			"DELETE FROM note WHERE id='outlook'; UPDATE note SET body='' WHERE id='preview'"
		);
		const share = await publishRaceSummary(state.db, 'r', 'a');
		expect((await getSharedRaceSummary(state.db, share!.id))?.content.rows[0].mark).toBe('◎');
	});
	it('印がなくても馬のメモがあれば、本人のまとめと共有コピーに残す', async () => {
		state.sqlite.exec(
			"DELETE FROM note WHERE id='outlook'; UPDATE note SET mark=NULL WHERE id='preview'"
		);
		const summary = await getRaceSummary(state.db, 'r', 'a');
		expect(summary?.rows).toEqual([
			expect.objectContaining({ horseName: 'テストホース', body: '内枠を評価', mark: null })
		]);
		const share = await publishRaceSummary(state.db, 'r', 'a');
		expect(share).not.toBeNull();
		expect((await getSharedRaceSummary(state.db, share!.id))?.content).toEqual(summary);
	});
	it('共有はコピー。予想の編集や削除が自動で反映されず、明示更新だけが反映される', async () => {
		const share = await publishRaceSummary(state.db, 'r', 'a');
		state.sqlite.exec(
			"UPDATE note SET body='書き直し' WHERE id='outlook'; DELETE FROM note WHERE id='preview'"
		);
		expect((await getSharedRaceSummary(state.db, share!.id))?.content.body).toBe('前半はゆっくり');
		expect((await getSharedRaceSummary(state.db, share!.id))?.content.rows).toHaveLength(1);
		expect((await publishRaceSummary(state.db, 'r', 'a'))?.id).toBe(share!.id);
		expect((await getSharedRaceSummary(state.db, share!.id))?.content.body).toBe('書き直し');
		expect((await getSharedRaceSummary(state.db, share!.id))?.content.rows).toHaveLength(0);
	});
	it('他人は共有の参照・取り消しができず、再共有は新しいURLになる', async () => {
		const share = await publishRaceSummary(state.db, 'r', 'a');
		expect(await getOwnRaceShare(state.db, 'r', 'b')).toBeNull();
		expect(await listRaceShares(state.db, 'b')).toEqual([]);
		await revokeRaceShare(state.db, 'r', 'b');
		expect(await getSharedRaceSummary(state.db, share!.id)).not.toBeNull();
		await revokeRaceShare(state.db, 'r', 'a');
		expect(await getSharedRaceSummary(state.db, share!.id)).toBeNull();
		expect((await publishRaceSummary(state.db, 'r', 'a'))?.id).not.toBe(share!.id);
		expect(await getSharedRaceSummary(state.db, share!.id)).toBeNull();
	});
	it('公開名は匿名が既定。既存のメモ共有にも変更が反映され、本名へのfallbackはない', async () => {
		const share = await publishRaceSummary(state.db, 'r', 'a');
		expect(await getPublicName(state.db, 'a')).toBeNull();
		expect((await getSharedRaceSummary(state.db, share!.id))?.authorName).toBe('匿名');
		expect((await getSharedNote(state.db, 'shared'))?.authorName).toBe('匿名');
		await setPublicName(state.db, 'a', 'うま日和');
		expect((await getSharedRaceSummary(state.db, share!.id))?.authorName).toBe('うま日和');
		expect((await getSharedNote(state.db, 'shared'))?.authorName).toBe('うま日和');
		expect(await getPublicName(state.db, 'b')).toBeNull();
		await setPublicName(state.db, 'a', '');
		expect((await getSharedNote(state.db, 'shared'))?.authorName).toBe('匿名');
	});
	it('凍結したユーザーの共有は読めない', async () => {
		const share = await publishRaceSummary(state.db, 'r', 'a');
		state.sqlite.exec("UPDATE user SET deleted_at=1 WHERE id='a'");
		expect(await getSharedRaceSummary(state.db, share!.id)).toBeNull();
		expect(await getSharedNote(state.db, 'shared')).toBeNull();
	});
});
