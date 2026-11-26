import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadData } from '$app/navigation';
import { toPage, type Page } from '#lib/utils/paging.ts';
import { PagedList } from './paged-list.svelte.ts';
import { mutableSource } from './paged-list.test-source.svelte.ts';

vi.mock('$app/navigation', () => ({ preloadData: vi.fn(), goto: vi.fn() }));

type Row = { id: string };
type Loaded = Awaited<ReturnType<typeof preloadData>>;

/**
 * 推し馬のみの一覧（350頭。最後のページの手前で読み違えると抜けが表に出る）。`db` はサーバーの今の行で、解除すると詰まる。
 * 見たいのは、続きを読んでいる途中で行を除いても（解除の応答が先に返っても）、1行も抜けず重ならないこと。
 */
let db: Row[];
const url = {
	pathname: '/horses',
	search: '?favorite=1',
	searchParams: [['favorite', '1']] as [string, string][]
};
const serve = (offset: number): Page<Row> => toPage(db.slice(offset, offset + 101), offset);
const offsetOf = (href: string) =>
	Number(new URL(href, 'http://x').searchParams.get('offset') ?? 0);
const loaded = (page: Page<Row>) =>
	({ type: 'loaded', status: 200, data: { horses: page } }) as unknown as Loaded;

/** 次の読み込みだけを止めておき、解除前の行で答えを組んで返せるようにする。ほかは今の行で答える。 */
function holdNextLoad() {
	let release!: () => void;
	vi.mocked(preloadData).mockImplementationOnce(async (href) => {
		const stale = serve(offsetOf(href)); // 解除前に DB が返した答え
		await new Promise<void>((r) => (release = r));
		return loaded(stale);
	});
	return () => release();
}

function setup() {
	const first = mutableSource(serve(0));
	const list = new PagedList<Row>(
		() => ({ url, page: first.get() }),
		(data) => data.horses as Page<Row>
	);
	/** 解除が通った: サーバーの行が詰まり、行を一覧から除いて、1ページ目を読み直す（`update()`）。 */
	const unfavorite = (id: string) => {
		db = db.filter((h) => h.id !== id);
		list.remove(id);
		first.set(serve(0));
	};
	const readAll = async () => {
		while (list.next !== null) await list.loadNext();
	};
	return { list, unfavorite, readAll };
}

beforeEach(() => {
	db = Array.from({ length: 350 }, (_, i) => ({ id: `h${String(i).padStart(3, '0')}` }));
	vi.mocked(preloadData).mockReset();
	vi.mocked(preloadData).mockImplementation(async (href) => loaded(serve(offsetOf(href))));
});

describe('PagedList.remove', () => {
	it('1ページ目の行を外しても、続きを読むと1行も抜けず重ならない', async () => {
		const { list, unfavorite, readAll } = setup();
		await list.loadNext();
		unfavorite('h000');
		await readAll();
		expect(list.items.map((h) => h.id)).toEqual(db.map((h) => h.id));
	});

	it('続きを読み始めたあとに1ページ目の行を外し、解除前の答えが後から届いても抜けない', async () => {
		const { list, unfavorite, readAll } = setup();
		const release = holdNextLoad();
		const loading = list.loadNext();
		await vi.waitFor(() => expect(preloadData).toHaveBeenCalledTimes(1));

		unfavorite('h000');
		release();
		await loading;
		await readAll();

		const ids = list.items.map((h) => h.id);
		expect(ids).toEqual(db.map((h) => h.id));
		expect(ids).toContain('h200');
		expect(ids).not.toContain('h000');
	});

	it('続きを足したあと、次を読んでいる途中で足した分の行を外しても抜けない', async () => {
		const { list, unfavorite, readAll } = setup();
		await list.loadNext();
		const release = holdNextLoad();
		const loading = list.loadNext();
		await vi.waitFor(() => expect(preloadData).toHaveBeenCalledTimes(2));

		unfavorite('h150');
		release();
		await loading;
		await readAll();

		expect(list.items.map((h) => h.id)).toEqual(db.map((h) => h.id));
	});
});
