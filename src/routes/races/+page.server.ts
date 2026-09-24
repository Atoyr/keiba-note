import { listRaceYears, listRaces } from '$lib/server/services/races';
import { ctx } from '$lib/server/util';
import { todayJst } from '$lib/utils/date';
import { parseRaceFilter, yearOptions } from '$lib/utils/race-filter';
import type { PageServerLoad } from './$types';

/**
 * レース一覧。`?year=` `?grade=`（複数・OR）`?q=` で絞る。
 * どれも付いていなければ今年の重賞に絞る（→ `defaultRaceFilter`）。
 *
 * 絞り込みの解釈は `parseRaceFilter` に寄せてある。URL を手で書き換えられても、
 * 選択肢の外の値は落ちて「絞らない」に倒れるだけで、他人のメモには届かない
 * （件数は listRaces 側で viewer のぶんだけ数えている）。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);
	// today はレースの行き先を決めるのにも要る（結果が出るまでは予想画面 → `isSettled`）。
	const today = todayJst();
	const filter = parseRaceFilter(url.searchParams, today);

	const [races, years] = await Promise.all([listRaces(db, user.id, filter), listRaceYears(db)]);

	return { races, years: yearOptions(years, today), filter, today };
};
