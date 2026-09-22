import { listRaceYears, listRaces } from '$lib/server/services/races';
import { todayJst } from '$lib/utils/date';
import { ctx } from '$lib/server/util';
import { parseRaceFilter } from '$lib/utils/race-filter';
import type { PageServerLoad } from './$types';

/**
 * レース一覧。`?year=` `?grade=`（複数・OR）`?q=` で絞る。
 *
 * 絞り込みの解釈は `parseRaceFilter` に寄せてある。URL を手で書き換えられても、
 * 選択肢の外の値は落ちて「絞らない」に倒れるだけで、他人のメモには届かない
 * （件数は listRaces 側で viewer のぶんだけ数えている）。
 *
 * 並びは次のレースが先頭（`listRaces`）。ダッシュボードと同じ順で見えるようにする。
 */
export const load: PageServerLoad = async ({ locals, platform, url }) => {
	const { db, user } = ctx(locals, platform);
	const filter = parseRaceFilter(url.searchParams);

	const [races, years] = await Promise.all([
		listRaces(db, user.id, todayJst(), filter),
		listRaceYears(db)
	]);

	return { races, years, filter };
};
