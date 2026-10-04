import { fail } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import * as v from 'valibot';
import { note, oauthGrant, session, user } from '$lib/server/db/schema';
import { describeError } from '$lib/server/monitoring/log';
import {
	DispatchError,
	dispatchEntriesFetch,
	isDispatchConfigured
} from '$lib/server/race-data/dispatch';
import { entriesFetchBlocker, listUpcomingRaces } from '$lib/server/services/entries-fetch';
import { listWeeklyMcpUsage, resetMcpUsage } from '$lib/server/services/mcp-usage';
import { getRace } from '$lib/server/services/races';
import { ctxAdmin } from '$lib/server/util';
import { addDays, currentWeek, todayJst } from '$lib/utils/date';
import type { Actions, PageServerLoad } from './$types';

/**
 * サイト管理者の画面。メンテ作業のための区分で、**メンバー管理ではない**。
 *
 * **他人のメモはここからも読めない。** admin にできるのはマスタの修正と
 * ユーザーの凍結だけで、メモを覗くことではない（product.md 第4章）。
 */
const freezeSchema = v.object({ userId: v.pipe(v.string(), v.minLength(1)) });
const resetMcpUsageSchema = v.object({ userId: v.pipe(v.string(), v.minLength(1)) });
const fetchEntriesSchema = v.object({ raceId: v.pipe(v.string(), v.minLength(1)) });

/** 出走馬を取りに行かせるレースを並べる期間（今日から）。登録は開催の約2週間前から出る。 */
const UPCOMING_DAYS = 14;

const dispatchConfig = (platform: App.Platform | undefined) => ({
	token: platform?.env.GITHUB_DISPATCH_TOKEN,
	repository: platform?.env.GITHUB_REPOSITORY
});

export const load: PageServerLoad = async ({ locals, platform }) => {
	const { db } = ctxAdmin(locals, platform);
	const today = todayJst();

	// 出すのはアカウントの素性と、AI の連携（MCP）の今週の利用量（%）だけ。メモの件数すら出さない
	// （本文を見せなくても「何か書いている」ことは漏れる）。利用量はリセットの要否を決めるために出す。
	const usersQuery = db
		.select({
			id: user.id,
			email: user.email,
			displayName: user.displayName,
			role: user.role,
			deletedAt: user.deletedAt,
			createdAt: user.createdAt
		})
		.from(user)
		.orderBy(desc(user.createdAt))
		.limit(200);

	const [users, races, mcpWeekly] = await Promise.all([
		usersQuery,
		listUpcomingRaces(db, { from: today, to: addDays(today, UPCOMING_DAYS - 1) }),
		listWeeklyMcpUsage(db)
	]);

	const weekEnd = currentWeek(
		new Date(),
		races.map((r) => r.date)
	).end;
	return {
		users: users.map((u) => {
			// 今週の行があるユーザーだけ出す（1回でも使っていれば、% が 0 でもリセットできるように）。
			const w = mcpWeekly.get(u.id);
			return { ...u, mcpUsage: w ? { read: w.read.percent, write: w.write.percent } : null };
		}),
		races: races.map(({ externalRef, ...r }) => ({
			...r,
			/** 押せない理由。null なら押せる。 */
			blocker: entriesFetchBlocker({ ...r, externalRef }, weekEnd)
		})),
		entriesFetch: { configured: isDispatchConfigured(dispatchConfig(platform)) }
	};
};

export const actions: Actions = {
	/**
	 * 1人分の AI の利用量（今週の読み取り・書き込み）を 0 に戻す。行を消すだけなので、対象が無くても成功（冪等）。
	 * 自分自身も戻せる。他人のメモには触れない。
	 */
	resetMcpUsage: async ({ request, locals, platform }) => {
		const { db } = ctxAdmin(locals, platform);

		const form = await request.formData();
		const parsed = v.safeParse(resetMcpUsageSchema, {
			userId: form.get('userId')?.toString() ?? ''
		});
		if (!parsed.success) return fail(400, { message: '操作を受け付けられませんでした' });

		await resetMcpUsage(db, parsed.output.userId);
		return { mcpReset: parsed.output.userId };
	},

	/**
	 * 出走馬の取得を GitHub Actions に頼む。**ここでは netkeiba へ行かず、D1 にも書かない**
	 * （lib/server/race-data/dispatch.ts）。Actions が出馬表を YAML に書いて PR を作り、
	 * 人がマージしたら本番に入る。枠順の前なら候補を、後なら枠順を書く。
	 */
	fetchEntries: async ({ request, locals, platform }) => {
		const { db } = ctxAdmin(locals, platform);

		const form = await request.formData();
		const parsed = v.safeParse(fetchEntriesSchema, {
			raceId: form.get('raceId')?.toString() ?? ''
		});
		if (!parsed.success) return fail(400, { message: '操作を受け付けられませんでした' });

		// 何を取りに行くか（日付・場・R・race_id）はフォームではなく DB から引く。
		const raceId = parsed.output.raceId;
		const race = await getRace(db, raceId);
		if (!race) return fail(404, { raceId, message: 'レースが見つかりません' });
		const blocker = entriesFetchBlocker(race, currentWeek(new Date(), [race.date]).end);
		if (blocker !== null || race.raceNumber === null) {
			return fail(400, { raceId, message: blocker ?? '' });
		}
		const label = `${race.date} ${race.course}${race.raceNumber}R ${race.name ?? ''}`.trim();

		try {
			await dispatchEntriesFetch(dispatchConfig(platform), {
				date: race.date,
				course: race.course,
				raceNumber: race.raceNumber,
				externalRef: race.externalRef,
				requireConfirmed: false,
				trigger: 'admin'
			});
		} catch (e) {
			const kind = e instanceof DispatchError ? e.kind : 'unknown';
			if (kind === 'not-configured') {
				return fail(503, {
					raceId,
					message: '出走馬の取得が設定されていません（GITHUB_DISPATCH_TOKEN）'
				});
			}
			locals.monitor.log({
				level: kind === 'network' ? 'warn' : 'error',
				event: 'entries.dispatch.failed',
				message: '管理画面から出走馬の取得を頼めなかった',
				raceId: race.id,
				errorType: kind,
				error: describeError(e)
			});
			return fail(502, {
				raceId,
				message: `${label} の取得を頼めませんでした。時間をおいてもう一度押してください`
			});
		}

		return { raceId, requested: label };
	},

	/**
	 * 凍結＝論理削除。行は消さない（note.author_id が NOT NULL のため）。
	 *
	 * セッションを全削除してログイン不能にし、**同時に共有中のメモを private に倒す。**
	 * 退会した人の共有リンクがいつまでも開けるのは筋が悪い（product.md 第9章 #8）。
	 * 触るのは可視性だけで、本文は読みも書きもしない。
	 */
	freeze: async ({ request, locals, platform }) => {
		const { db, user: admin } = ctxAdmin(locals, platform);

		const form = await request.formData();
		const parsed = v.safeParse(freezeSchema, { userId: form.get('userId')?.toString() ?? '' });
		if (!parsed.success) return fail(400, { message: '操作を受け付けられませんでした' });

		const targetId = parsed.output.userId;
		if (targetId === admin.id) return fail(400, { message: '自分自身は凍結できません' });

		const now = Math.floor(Date.now() / 1000);

		await db.batch([
			db.update(user).set({ deletedAt: now, updatedAt: now }).where(eq(user.id, targetId)),
			db.delete(session).where(eq(session.userId, targetId)),
			// AI との連携（MCP）も切る。トークンは退会で止まるが、凍結を戻したときに生き返らせない。
			db.delete(oauthGrant).where(eq(oauthGrant.userId, targetId)),
			db
				.update(note)
				.set({ visibility: 'private', updatedAt: now })
				.where(and(eq(note.authorId, targetId), eq(note.visibility, 'unlisted')))
		]);

		return { frozen: true };
	}
};
