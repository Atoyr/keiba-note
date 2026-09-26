<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import RaceFlowBoard, { type BoardSpot } from '$lib/components/RaceFlowBoard.svelte';
	import { BRACKET_CLASS } from '$lib/components/BracketBadge.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import {
		FLOW_MEMO_MAX,
		FLOW_PHASES,
		FLOW_PHASE_LABEL,
		FLOW_PHASE_SHORT,
		PACES,
		sortSpots,
		type FlowPhase,
		type FlowSpot,
		type Pace,
		type RaceFlow
	} from '$lib/schemas/race-flow';
	import { flowOrder, horseToken, type FlowHorse } from '$lib/utils/race-flow';
	import { cn } from '$lib/utils';

	/**
	 * 展開の予想の入力欄。予想画面の「レースの見立て」の下に畳んで置く。
	 *
	 * **畳んでおくのが既定。** 見続けるものではなく、書くときに開けばよい。
	 * 畳んでいる間はペースと隊列の1行（`⑤-③⑦-⑪`）だけを出し、開かなくても何を置いたかは読める。
	 *
	 * 送るのは素のフォームの欄で、保存は画面の「まとめて保存」に乗る。
	 * - ペース: ラジオ `racePace`
	 * - 一言メモ: `flowMemo.<局面>`
	 * - 隊列: hidden の `flowSpots.<局面>`（JSON）。**押して置くたびに `input` を投げる**
	 *   （プログラムで値を変えても `input` は起きず、`DraftKeeper` が未保存に数えられない）
	 *
	 * 下書きの復元（`DraftKeeper`）が hidden の値を書き換えたときは、その欄に `change` が来るので、
	 * そこから盤面を読み直す。
	 */
	let {
		horses,
		value,
		leadsRight
	}: {
		/** このレースの出走馬。並びは馬番順。 */
		horses: (FlowHorse & { entryId: string })[];
		/** 保存済みの展開。書いていなければ null。 */
		value: RaceFlow | null;
		leadsRight: boolean;
	} = $props();

	type Spots = Record<FlowPhase, FlowSpot[]>;
	const fromValue = (v: RaceFlow | null): Spots => ({
		start: v?.start.spots ?? [],
		corner4: v?.corner4.spots ?? [],
		finish: v?.finish.spots ?? []
	});

	// 保存し直して value が変わったら盤面もそれに戻す（上書きできる $derived）。
	let spots = $derived<Spots>(fromValue(value));
	let pace = $derived<Pace | null>(value?.pace ?? null);

	let phase = $state<FlowPhase>('start');
	/** 選んでいる馬（出走馬の id）。次に押したマスへ置く。 */
	let selected = $state<string | null>(null);

	const byId = $derived(new Map(horses.map((h) => [h.entryId, h])));
	const inputs: Partial<Record<FlowPhase, HTMLInputElement>> = {};

	const MEMO_PLACEHOLDER: Record<FlowPhase, string> = {
		start: '⑤が押してハナ。③は控える',
		corner4: '⑦が外から並びかける',
		finish: '内の③が伸びて⑦と叩き合い'
	};

	/*
	 * 下書きの書き戻し（DraftKeeper）が投げる**泡立たない `change`** を、欄に直に付けて聞く。
	 * Svelte の `onchange` はルートへの委譲なので、泡立たないイベントは届かない。
	 */
	const watchSpots =
		(p: FlowPhase): Attachment<HTMLInputElement> =>
		(el) => {
			inputs[p] = el;
			const reread = () => (spots = { ...spots, [p]: sortSpots(parse(el.value)) });
			el.addEventListener('change', reread);
			return () => el.removeEventListener('change', reread);
		};

	const watchPace =
		(p: Pace | null): Attachment<HTMLInputElement> =>
		(el) => {
			// 書き戻しは選ばれていないラジオにも change を投げるので、選ばれたものだけを拾う。
			const pick = () => {
				if (el.checked) pace = p;
			};
			el.addEventListener('change', pick);
			return () => el.removeEventListener('change', pick);
		};

	const serialize = (xs: FlowSpot[]) =>
		JSON.stringify(sortSpots(xs).map(({ entryId, x, y }) => ({ entryId, x, y })));

	function parse(raw: string): FlowSpot[] {
		try {
			const xs = JSON.parse(raw) as unknown;
			if (!Array.isArray(xs)) return [];
			return xs.filter(
				(s): s is FlowSpot =>
					!!s &&
					typeof s.entryId === 'string' &&
					Number.isInteger(s.x) &&
					Number.isInteger(s.y) &&
					byId.has(s.entryId)
			);
		} catch {
			return [];
		}
	}

	const boardSpots = (xs: FlowSpot[]): BoardSpot[] =>
		xs.flatMap((s) => {
			const h = byId.get(s.entryId);
			return h ? [{ ...h, x: s.x, y: s.y, key: s.entryId }] : [];
		});

	async function set(p: FlowPhase, next: FlowSpot[]) {
		spots = { ...spots, [p]: sortSpots(next) };
		await tick();
		inputs[p]?.dispatchEvent(new Event('input', { bubbles: true }));
	}

	function onCell(x: number, y: number) {
		const current = spots[phase];
		const occupant = current.find((s) => s.x === x && s.y === y) ?? null;

		if (!selected) {
			// 何も選んでいなければ、押したコマを選ぶ。
			if (occupant) selected = occupant.entryId;
			return;
		}
		if (occupant?.entryId === selected) {
			selected = null;
			return;
		}
		// 選んだ馬を押したマスへ。そこに別の馬がいれば、選んだ馬が元いたマスと入れ替える
		// （盤面にいなかった馬なら、いた馬は未配置に戻す）。
		const from = current.find((s) => s.entryId === selected) ?? null;
		const next = current.filter((s) => s.entryId !== selected && s !== occupant);
		next.push({ entryId: selected, x, y });
		if (occupant && from) next.push({ entryId: occupant.entryId, x: from.x, y: from.y });
		selected = null;
		void set(phase, next);
	}

	function remove() {
		if (!selected) return;
		const id = selected;
		selected = null;
		void set(
			phase,
			spots[phase].filter((s) => s.entryId !== id)
		);
	}

	const prev = $derived(FLOW_PHASES[FLOW_PHASES.indexOf(phase) - 1] ?? null);

	function copyPrev() {
		if (!prev) return;
		selected = null;
		void set(phase, spots[prev]);
	}

	function clearPhase() {
		selected = null;
		void set(phase, []);
	}

	function choose(p: FlowPhase) {
		phase = p;
		selected = null;
	}

	/** タブの左右キー。選ぶと同時にフォーカスも移す（WAI-ARIA のタブの作法）。 */
	function onTabKey(e: KeyboardEvent) {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		e.preventDefault();
		const i = FLOW_PHASES.indexOf(phase);
		const next = FLOW_PHASES[(i + step + FLOW_PHASES.length) % FLOW_PHASES.length];
		choose(next);
		document.getElementById(`flow-tab-${next}`)?.focus();
	}

	const placed = $derived(new Set(spots[phase].map((s) => s.entryId)));
	const pool = $derived(horses.filter((h) => !placed.has(h.entryId)));
	const selectedHorse = $derived(selected ? (byId.get(selected) ?? null) : null);

	const digest = $derived(
		FLOW_PHASES.filter((p) => spots[p].length > 0).map((p) => ({
			phase: p,
			label: FLOW_PHASE_SHORT[p],
			order: flowOrder(boardSpots(spots[p]))
		}))
	);
	const written = $derived(pace !== null || digest.length > 0);

	const name = (h: FlowHorse) => `${h.horseNumber ? `${h.horseNumber}番 ` : ''}${h.horseName}`;
</script>

<details class="group rounded-lg border px-3 py-2">
	<summary
		class="flex min-h-6 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"
	>
		<span class="shrink-0 text-sm font-semibold text-muted-foreground">展開の予想</span>
		<!-- 畳んでいる間だけ中身を1行で出す。開けば下の盤面が正なので、同じものを二重に見せない。
		     開いたら高さごと外す（3局面ぶん折り返すと、見出しの行が空いたまま縦に伸びる）。 -->
		<span
			class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 text-xs text-muted-foreground group-open:hidden"
		>
			{#if written}
				{#if pace}
					<span class="rounded border px-1 font-medium text-foreground">{pace}</span>
				{/if}
				{#each digest as d, i (d.phase)}
					<span class="whitespace-nowrap"
						>{i > 0 ? '→ ' : ''}{d.label}
						<span class="text-sm text-foreground">{d.order}</span></span
					>
				{/each}
			{:else}
				<span>＋ 書く</span>
			{/if}
		</span>
		<ChevronDown
			class="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
			aria-hidden="true"
		/>
	</summary>

	<div class="mt-2 grid gap-3">
		<!-- ペース。MarkPicker と同じく、素のラジオを札の見た目にしたもの（JS 無効でも送れる）。 -->
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-xs text-muted-foreground" id="flow-pace-label">ペース</span>
			<div class="flex items-center gap-1" role="radiogroup" aria-labelledby="flow-pace-label">
				{#each [...PACES, null] as p (p ?? 'none')}
					<label class="relative">
						<input
							type="radio"
							name="racePace"
							value={p ?? ''}
							checked={(value?.pace ?? null) === p}
							{@attach watchPace(p)}
							class="peer sr-only"
						/>
						<span
							class="flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-xs text-muted-foreground peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-not-checked:hover:bg-accent"
						>
							{p ?? 'なし'}
						</span>
					</label>
				{/each}
			</div>
		</div>

		<div>
			<div
				class="flex gap-1 rounded-md bg-muted p-0.5"
				role="tablist"
				aria-label="局面"
				tabindex="-1"
				onkeydown={onTabKey}
			>
				{#each FLOW_PHASES as p (p)}
					<Button
						type="button"
						role="tab"
						id="flow-tab-{p}"
						aria-selected={phase === p}
						aria-controls="flow-panel"
						tabindex={phase === p ? 0 : -1}
						variant="ghost"
						size="sm"
						class={cn(
							'h-8 flex-1 gap-1 px-1 text-xs',
							phase === p
								? 'bg-background font-semibold text-foreground shadow-xs hover:bg-background'
								: 'text-muted-foreground'
						)}
						onclick={() => choose(p)}
					>
						{FLOW_PHASE_LABEL[p]}
						{#if spots[p].length > 0}
							<span class="font-mono text-muted-foreground">{spots[p].length}</span>
						{/if}
					</Button>
				{/each}
			</div>

			<!-- 盤面と操作は、選んでいる局面の1つだけを描く。送る欄（隊列の hidden と一言メモ）は
			     3局面ぶん置いたままにして、選んでいない局面のメモは隠すだけにする。 -->
			<div
				id="flow-panel"
				role="tabpanel"
				aria-labelledby="flow-tab-{phase}"
				class="mt-2 grid gap-2"
			>
				<RaceFlowBoard
					spots={boardSpots(spots[phase])}
					{leadsRight}
					label="{FLOW_PHASE_LABEL[phase]}の隊列"
					{selected}
					{onCell}
				/>

				<p class="text-xs text-muted-foreground" aria-live="polite">
					{#if selectedHorse}
						<span class="font-medium text-foreground">{name(selectedHorse)}</span> を選んでいます。置くマスを押してください
					{:else if pool.length > 0}
						馬を選んでから、置くマスを押します
					{:else}
						全頭を置きました。コマを押すと動かせます
					{/if}
				</p>

				{#if pool.length > 0}
					<div class="flex flex-wrap gap-1" role="group" aria-label="まだ置いていない馬">
						{#each pool as h (h.entryId)}
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								class="p-0"
								aria-label={name(h)}
								aria-pressed={selected === h.entryId}
								title={h.horseName}
								onclick={() => (selected = selected === h.entryId ? null : h.entryId)}
							>
								<span
									class={cn(
										'flex size-7 items-center justify-center rounded-full border text-xs font-medium',
										(h.bracket && BRACKET_CLASS[h.bracket]) ||
											'border-muted-foreground bg-background text-foreground',
										selected === h.entryId &&
											'ring-2 ring-ring ring-offset-1 ring-offset-background'
									)}
								>
									{h.horseNumber ?? horseToken(h)}
								</span>
							</Button>
						{/each}
					</div>
				{/if}

				{#if (selected && placed.has(selected)) || (prev && spots[prev].length > 0) || spots[phase].length > 0}
					<div class="flex flex-wrap gap-2">
						{#if selected && placed.has(selected)}
							<Button type="button" variant="outline" size="sm" onclick={remove}
								>盤面から外す</Button
							>
						{/if}
						{#if prev && spots[prev].length > 0}
							<Button type="button" variant="outline" size="sm" onclick={copyPrev}>
								{FLOW_PHASE_LABEL[prev]}の並びを写す
							</Button>
						{/if}
						{#if spots[phase].length > 0}
							<Button type="button" variant="ghost" size="sm" onclick={clearPhase}
								>並びを消す</Button
							>
						{/if}
					</div>
				{/if}

				{#each FLOW_PHASES as p (p)}
					<input
						type="hidden"
						name="flowSpots.{p}"
						value={serialize(spots[p])}
						{@attach watchSpots(p)}
					/>
					<Input
						name="flowMemo.{p}"
						value={value?.[p].memo ?? ''}
						hidden={phase !== p}
						maxlength={FLOW_MEMO_MAX}
						aria-label="{FLOW_PHASE_LABEL[p]}のメモ"
						placeholder={MEMO_PLACEHOLDER[p]}
						class="text-sm"
					/>
				{/each}
			</div>
		</div>
	</div>
</details>
