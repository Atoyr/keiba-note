<script lang="ts" module>
	import type { ResolvedSpot } from '$lib/utils/race-flow';

	/** 盤面のコマ。`key` は操作するときに馬を指す値（予想画面では出走馬の id）。 */
	export type BoardSpot = ResolvedSpot & { key: string };
</script>

<script lang="ts">
	import { BRACKET_CLASS } from '$lib/components/BracketBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { FLOW_COLS, FLOW_LANES } from '$lib/schemas/race-flow';
	import { horseToken } from '$lib/utils/race-flow';
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
	 * コマの字。馬番が無いうちは馬名の頭2文字（まだ置いていない馬の一覧と同じ字にする）。
	 * 1文字だと、頭文字が同じ馬どうしが盤面で見分けられない。
	 */
	const glyph = (s: BoardSpot) => (s.horseNumber ? String(s.horseNumber) : horseToken(s));

	/*
	 * マスの内側の余白は 1px。頭2文字（全角2字＝約 24px）が 390px 幅のマス（約 29px）に欠けずに入る幅を残す。
	 *
	 * キーボードでは盤面を1つの止まり場所にし、矢印キーでマスを動く（40マスを Tab で辿らせない）。
	 * `active` は描いた順（行ごと・左から右）の位置。
	 */
	let active = $state(0);
	let grid = $state<HTMLElement | null>(null);

	const focusCell = (i: number) =>
		grid?.querySelectorAll<HTMLButtonElement>('button[data-cell]')[i]?.focus();

	/** いま止まっているマスへフォーカスを戻す。押したボタンが消えたとき（盤面から外す）に使う。 */
	export function focus() {
		focusCell(active);
	}

	function onKey(e: KeyboardEvent) {
		const col = active % FLOW_COLS;
		const row = Math.floor(active / FLOW_COLS);
		const last = FLOW_LANES.length - 1;
		const next =
			e.key === 'ArrowRight' && col < FLOW_COLS - 1
				? active + 1
				: e.key === 'ArrowLeft' && col > 0
					? active - 1
					: e.key === 'ArrowDown' && row < last
						? active + FLOW_COLS
						: e.key === 'ArrowUp' && row > 0
							? active - FLOW_COLS
							: e.key === 'Home'
								? row * FLOW_COLS
								: e.key === 'End'
									? row * FLOW_COLS + FLOW_COLS - 1
									: null;
		if (next === null) return;
		e.preventDefault();
		active = next;
		focusCell(next);
	}

	const where = (x: number, lane: string) => `${x === 0 ? '先頭' : `前から${x + 1}列目`}・${lane}`;

	const describe = (c: (typeof cells)[number]) =>
		c.spot
			? `${c.spot.horseNumber ? `${c.spot.horseNumber}番 ` : ''}${c.spot.horseName}（${where(c.x, c.lane)}）`
			: `${where(c.x, c.lane)}（空き）`;

	const chipClass = (s: BoardSpot) =>
		cn(
			// 馬番は丸いコマ（帽子）。馬番が無いうちの頭2文字は、円だと縁で濁点が欠けるので角丸の四角にする。
			'flex size-full items-center justify-center overflow-hidden border text-xs leading-none font-medium',
			s.horseNumber ? 'rounded-full' : 'rounded-sm tracking-tighter',
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

<div
	role="group"
	aria-label={onCell ? `${label}（矢印キーでマスを移動）` : label}
	class="w-full max-w-xs"
>
	<div class="flex justify-between text-xs text-muted-foreground" aria-hidden="true">
		<span>内ラチ</span>
		<span>{leadsRight ? '進行方向 →' : '← 進行方向'}</span>
	</div>
	<!-- 上の太い線が内ラチ。段の区切りは線を引かず、面の濃さだけで盤面と分かるようにする。 -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={grid}
		class="mt-0.5 grid grid-cols-10 gap-0.5 rounded-b-md border-t-2 border-muted-foreground bg-muted p-0.5"
		onkeydown={onCell ? onKey : undefined}
	>
		{#each cells as c, i (`${c.x}:${c.y}`)}
			{#if onCell}
				<Button
					type="button"
					variant="ghost"
					data-cell
					tabindex={i === active ? 0 : -1}
					onfocus={() => (active = i)}
					class="aspect-square h-auto w-full min-w-0 rounded-sm p-px hover:bg-background"
					aria-label={describe(c)}
					aria-pressed={c.spot ? selected === c.spot.key : undefined}
					onclick={() => onCell(c.x, c.y)}
				>
					{#if c.spot}{@render chip(c.spot)}{:else}{@render dot()}{/if}
				</Button>
			{:else}
				<div class="flex aspect-square items-center justify-center p-px">
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
