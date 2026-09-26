<script lang="ts" module>
	import type { ResolvedSpot } from '$lib/utils/race-flow';

	/** 盤面のコマ。`key` は操作するときに馬を指す値（予想画面では出走馬の id）。 */
	export type BoardSpot = ResolvedSpot & { key: string };
</script>

<script lang="ts">
	import { BRACKET_CLASS } from '$lib/components/BracketBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { FLOW_COLS, FLOW_LANES } from '$lib/schemas/race-flow';
	import { cn } from '$lib/utils';

	/**
	 * 展開の盤面。前後 × 内外のマス目に、枠の色のコマ（馬番）を置く。
	 *
	 * 上が内ラチで、先頭はスタンドから見た向き（右回りは左、左回りは右 → `flowLeadsRight`）。
	 * 中継で見る画面と同じ向きにして、置いた並びを頭の中の絵と取り違えないようにする。
	 *
	 * `onCell` を渡すとマスが押せる（予想画面の入力）。渡さなければ見るだけ
	 * （予想まとめ・共有ページ・ふりかえり）。
	 */
	let {
		spots,
		leadsRight,
		label,
		selected = null,
		onCell
	}: {
		spots: BoardSpot[];
		leadsRight: boolean;
		/** 盤面の名前（「4コーナーの隊列」）。読み上げで使う。 */
		label: string;
		/** 選んでいるコマの key。枠で囲む。 */
		selected?: string | null;
		onCell?: (x: number, y: number) => void;
	} = $props();

	const at = $derived(new Map(spots.map((s) => [`${s.x}:${s.y}`, s])));

	/** 行ごと・左から右へ。描く列と、持っている列（0 が先頭）を向きで対応づける。 */
	const cells = $derived(
		FLOW_LANES.flatMap((lane, y) =>
			Array.from({ length: FLOW_COLS }, (_, col) => {
				const x = leadsRight ? FLOW_COLS - 1 - col : col;
				return { x, y, lane, spot: at.get(`${x}:${y}`) ?? null };
			})
		)
	);

	/**
	 * コマの字。馬番が無いうちは馬名の頭1文字（盤面のマスに2文字は入らない）。
	 * 誰かは読み上げの名前と `title` で分かる。
	 */
	const glyph = (s: BoardSpot) => (s.horseNumber ? String(s.horseNumber) : [...s.horseName][0]);

	const where = (x: number, lane: string) => `${x === 0 ? '先頭' : `前から${x + 1}列目`}・${lane}`;

	const describe = (c: (typeof cells)[number]) =>
		c.spot
			? `${c.spot.horseNumber ? `${c.spot.horseNumber}番 ` : ''}${c.spot.horseName}（${where(c.x, c.lane)}）`
			: `${where(c.x, c.lane)}（空き）`;

	const chipClass = (s: BoardSpot) =>
		cn(
			'flex size-full items-center justify-center rounded-full border text-xs font-medium',
			(s.bracket && BRACKET_CLASS[s.bracket]) ||
				'border-muted-foreground bg-background text-foreground',
			selected === s.key && 'ring-2 ring-ring ring-offset-1 ring-offset-background'
		);
</script>

<!-- 空きマスの目印。線を引くと盤面がうるさくなるので、点だけでマスの位置が分かるようにする。 -->
{#snippet dot()}
	<span class="size-1 rounded-full bg-muted-foreground/40" aria-hidden="true"></span>
{/snippet}

{#snippet chip(s: BoardSpot)}
	<span class={chipClass(s)} title={s.horseName}>{glyph(s)}</span>
{/snippet}

<div role="group" aria-label={label} class="w-full max-w-xs">
	<div class="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
		<span>内ラチ</span>
		<span>{leadsRight ? '進行方向 →' : '← 進行方向'}</span>
	</div>
	<!-- 上の太い線が内ラチ。段の区切りは線を引かず、面の濃さだけで盤面と分かるようにする。 -->
	<div
		class="mt-0.5 grid grid-cols-10 gap-0.5 rounded-b-md border-t-2 border-muted-foreground bg-muted p-0.5"
	>
		{#each cells as c (`${c.x}:${c.y}`)}
			{#if onCell}
				<Button
					type="button"
					variant="ghost"
					class="aspect-square h-auto w-full min-w-0 rounded-sm p-0.5 hover:bg-background"
					aria-label={describe(c)}
					aria-pressed={c.spot ? selected === c.spot.key : undefined}
					onclick={() => onCell(c.x, c.y)}
				>
					{#if c.spot}{@render chip(c.spot)}{:else}{@render dot()}{/if}
				</Button>
			{:else}
				<div class="flex aspect-square items-center justify-center p-0.5">
					{#if c.spot}
						<span class="sr-only">{describe(c)}</span>
						<span aria-hidden="true" class="block size-full">{@render chip(c.spot)}</span>
					{:else}
						{@render dot()}
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</div>
