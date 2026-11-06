<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import QuickReviewRow from '$lib/components/QuickReviewRow.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { DEFAULT_INSIGHT_WORDS } from '$lib/utils/insight-words';
	import type { Mark } from '$lib/schemas/note';
	import { cn } from '$lib/utils';

	/** 選んだ並び順を残す localStorage のキー。'number' のときだけ '1' を書く。 */
	const ORDER_KEY = 'uma-memo:quick-review-order';

	/**
	 * ふりかえり画面から切り替えて開く「クイック入力」の1画面。出走馬を1頭1行（`QuickReviewRow`）で、既定はふりかえりと同じ順（着順）に並べ、
	 * 言葉を押すとその馬のふりかえりメモの本文に入り、親が自動で保存する。保存の状態は一覧の下に貼り付く帯と、開いた馬の行に出す
	 * （クイック入力のあいだは親が保存ボタンを出さない）。
	 *
	 * - 開くのは1頭だけ（`openId`）。別の馬を押すと前の馬を閉じる。前の馬が上で閉じると押した行が上へずれるので、
	 *   切り替えの前後で押した行の位置を測り、その差だけスクロールして、押した行を画面の同じ場所に残す。
	 * - 並び順は 着順（渡された順。既定）/ 馬番。着順と馬番がどちらも出ているときだけ、帯の見出しの右に切り替えを出し、選びを localStorage に残す。
	 * - 予想で付けた印は、だれかに付いていれば行の右端に出す（読むだけ。直すのは予想画面）。
	 * - 上に貼り付く帯に「ふりかえりに戻る」と見出し。見出しは開いたときのフォーカス先（親が `focusHeading` で呼ぶ）。
	 * - 下に貼り付く帯に保存の状態（失敗 > 保存中 > 保存しました > 案内）と、塗りの「ふりかえりに戻る」。
	 *   一覧の下まで入力しても戻る導線が親指の届く位置にある。「保存しました」は保存が通ったあとにだけ出す。失敗は「再試行」で送り直す。
	 * - 言葉が0個なら、案内とおすすめをまとめて登録するボタンを出す（フォームは親が**外**に置く）。
	 */
	let {
		rows,
		bodies,
		registered,
		onchange,
		onclose,
		defaultsFormId = 'insight-defaults',
		defaultsPending = false,
		defaultsError = null,
		status = {},
		drafts = {},
		failed = 0,
		busy = false,
		onretry = () => {},
		authExpired = false,
		loginHref = ''
	}: {
		rows: {
			entryId: string;
			horseName: string;
			bracket: number | null;
			horseNumber: number | null;
			finishPosition: number | null;
			/** 予想で付けた印。 */
			mark?: Mark | null;
		}[];
		/** 出走馬の id → いまのふりかえりメモの本文。 */
		bodies: Record<string, string>;
		/** 自分が登録した言葉（登録順）。 */
		registered: string[];
		onchange: (entryId: string, body: string) => void;
		onclose: () => void;
		/** 言葉が0個のときの「おすすめの言葉をまとめて登録する」の送り先のフォームの id（親が大きいフォームの外に置く）。 */
		defaultsFormId?: string;
		defaultsPending?: boolean;
		defaultsError?: string | null;
		/** 出走馬の id → 保存の状態。まだ送っていない馬は無い。 */
		status?: Record<string, 'saving' | 'saved' | 'error'>;
		/** 出走馬の id → ふりかえりで手で書いた未保存の本文があるか。 */
		drafts?: Record<string, boolean>;
		/** 保存できなかった馬の頭数。 */
		failed?: number;
		/** どれかが送信中か。 */
		busy?: boolean;
		/** 帯と行の「もう一度保存」。馬を渡せばその馬だけ、省くと失敗した全頭。 */
		onretry?: (entryId?: string) => void;
		/** 保存の応答がログイン切れだったか。帯の文を差し替え、「もう一度保存」の代わりに「ログインし直す」を出す。 */
		authExpired?: boolean;
		/** 「ログインし直す」の行き先（ログイン後にこのレースへ戻る）。 */
		loginHref?: string;
	} = $props();

	let heading = $state<HTMLElement | null>(null);
	let bandBack = $state<HTMLElement | null>(null);
	/** この画面で1度でも保存が通ったか（成功の前に「保存しました」を出さないため）。 */
	const anySaved = $derived(Object.values(status).includes('saved'));

	function retryAll() {
		onretry();
		// 押した「もう一度保存」は消えるので、フォーカスを帯の「ふりかえりに戻る」へ移す。
		void tick().then(() => bandBack?.focus());
	}
	/** 開いたときのフォーカス先。 */
	export function focusHeading() {
		heading?.focus({ preventScroll: true });
	}

	/** 着順の列を出すかは一覧全体で1つに決める。 */
	const rankColumn = $derived(rows.some((r) => r.finishPosition !== null));
	/** 札（枠・馬番）の列も一覧全体で1つに決める。 */
	const badgeColumn = $derived(rows.some((r) => r.bracket || r.horseNumber));

	/** 印の列も一覧全体で1つに決める。 */
	const markColumn = $derived(rows.some((r) => r.mark));
	/** 並び順の切り替えは、着順と馬番のどちらもあるときだけ出す（結果前は渡された順がもう馬番順）。 */
	const orderSwitch = $derived(rankColumn && rows.some((r) => r.horseNumber !== null));
	const ORDERS = [
		{ value: 'finish', label: '着順' },
		{ value: 'number', label: '馬番' }
	] as const;
	let order = $state<'finish' | 'number'>('finish');
	const shown = $derived(
		orderSwitch && order === 'number'
			? [...rows].sort((a, b) => (a.horseNumber ?? 99) - (b.horseNumber ?? 99))
			: rows
	);

	onMount(() => {
		try {
			if (localStorage.getItem(ORDER_KEY) === '1') order = 'number';
		} catch {
			// 読めなければ既定（着順）のまま。
		}
	});

	async function setOrder(value: 'finish' | 'number') {
		if (order === value) return;
		const el = openId ? document.getElementById(`quick-${openId}`) : null;
		const before = el?.getBoundingClientRect().top;
		order = value;
		try {
			if (value === 'number') localStorage.setItem(ORDER_KEY, '1');
			else localStorage.removeItem(ORDER_KEY);
		} catch {
			// 残せなくても、この画面では切り替わる。
		}
		if (before === undefined) return;
		await tick();
		const after = el?.getBoundingClientRect().top;
		if (after !== undefined && after !== before) {
			window.scrollBy({ top: after - before, behavior: 'instant' });
		}
	}

	let openId = $state<string | null>(null);
	async function setOpen(entryId: string, value: boolean) {
		if (!value) {
			if (openId === entryId) openId = null;
			return;
		}
		const el = document.getElementById(`quick-${entryId}`);
		const before = el?.getBoundingClientRect().top;
		openId = entryId;
		if (before === undefined) return;
		await tick();
		const after = el?.getBoundingClientRect().top;
		if (after !== undefined && after !== before) {
			window.scrollBy({ top: after - before, behavior: 'instant' });
		}
		// 下のほうの馬を開いたとき、開いた中（言葉）が画面の下にはみ出すなら、はみ出た分だけ上げる。
		// ただし行の上端は画面の上（scroll-mt-4 相当の 16px）より上に出さない。
		const rect = el?.getBoundingClientRect();
		if (rect) {
			const overflow = rect.bottom - window.innerHeight;
			const room = Math.max(0, rect.top - 16);
			if (overflow > 0 && room > 0) {
				window.scrollBy({ top: Math.min(overflow, room), behavior: 'instant' });
			}
		}
	}
</script>

<section aria-labelledby="quick-review-heading" class="quick-review">
	<div class="sticky top-0 z-10 border-b bg-background pb-2">
		<Button type="button" variant="ghost" class="-ml-2 min-h-11 px-2 sm:min-h-9" onclick={onclose}>
			<ChevronLeftIcon class="size-4" aria-hidden="true" />ふりかえりに戻る
		</Button>
		<div class="flex items-center justify-between gap-2">
			<h2
				id="quick-review-heading"
				bind:this={heading}
				tabindex="-1"
				class="text-base font-bold tracking-tight outline-none"
			>
				クイック入力
			</h2>
			{#if orderSwitch}
				<div class="flex gap-1 rounded-md bg-muted p-0.5" role="group" aria-label="並び順">
					{#each ORDERS as o (o.value)}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							aria-pressed={order === o.value}
							class={cn(
								'min-h-11 px-2.5 text-xs sm:h-7 sm:min-h-7',
								order === o.value
									? 'bg-background font-semibold text-foreground shadow-xs hover:bg-background'
									: 'font-normal text-foreground'
							)}
							onclick={() => void setOrder(o.value)}
						>
							{o.label}
						</Button>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<div class="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
		{#if registered.length === 0}
			<div class="w-full space-y-2">
				<p class="text-sm text-muted-foreground">
					よく使う言葉を登録すると、押すだけでメモに入れられます。
					<a
						href={resolve('/settings/insight-words')}
						class="inline-flex min-h-6 items-center whitespace-nowrap underline underline-offset-2 hover:decoration-2"
						>言葉を登録する</a
					>
				</p>
				<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
					<Button
						type="submit"
						form={defaultsFormId}
						variant="outline"
						class="min-h-11"
						aria-disabled={defaultsPending}
						>{defaultsPending ? '登録中…' : 'おすすめの言葉をまとめて登録する'}</Button
					>
					<span class="text-xs text-muted-foreground"
						>{DEFAULT_INSIGHT_WORDS.slice(0, 3).join(
							'・'
						)}など{DEFAULT_INSIGHT_WORDS.length}個</span
					>
				</div>
				{#if defaultsError}
					<p role="alert" class="text-xs text-destructive">{defaultsError}</p>
				{/if}
			</div>
		{:else}
			<p class="text-xs text-muted-foreground">
				馬を押して言葉を選ぶと、その馬のふりかえりメモに入り、自動で保存します。
			</p>
			<a
				href={resolve('/settings/insight-words')}
				class="inline-flex min-h-6 items-center text-xs text-muted-foreground underline underline-offset-2 hover:decoration-2"
				>言葉を登録・編集する</a
			>
		{/if}
	</div>

	<div class="mt-2 overflow-hidden rounded-xl border">
		<ul class="divide-y">
			{#each shown as r (r.entryId)}
				<li id="quick-{r.entryId}" class="scroll-mt-4">
					<QuickReviewRow
						horseName={r.horseName}
						entryId={r.entryId}
						body={bodies[r.entryId] ?? ''}
						{registered}
						{onchange}
						bracket={r.bracket}
						horseNumber={r.horseNumber}
						finishPosition={r.finishPosition}
						{rankColumn}
						{badgeColumn}
						mark={r.mark ?? null}
						{markColumn}
						status={status[r.entryId] ?? null}
						draft={drafts[r.entryId] === true}
						onretry={() => onretry(r.entryId)}
						bind:open={() => openId === r.entryId, (v) => void setOpen(r.entryId, v)}
					/>
				</li>
			{/each}
		</ul>
	</div>

	<div class="sticky bottom-0 mt-6 border-t bg-background/90 py-3 backdrop-blur">
		<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
			{#if registered.length > 0}
				<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
					<p
						role="status"
						class={cn(
							'flex items-center gap-1 text-sm',
							failed > 0 ? 'text-destructive' : 'text-muted-foreground'
						)}
					>
						{#if failed > 0 && authExpired}
							ログインが切れたため保存できませんでした。
						{:else if failed > 0}
							{failed}頭を保存できませんでした
						{:else if busy}
							保存中…
						{:else if anySaved}
							<CheckIcon class="size-4 shrink-0" aria-hidden="true" />保存しました
						{:else}
							言葉を選ぶと自動で保存します
						{/if}
					</p>
					{#if failed > 0 && authExpired}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- loginHref は親が resolve() で組んだもの（frontend.md 第3章） -->
						<a
							href={loginHref}
							class="inline-flex min-h-11 items-center text-sm underline underline-offset-2 hover:decoration-2"
							>ログインし直す</a
						>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else if failed > 0}
						<Button type="button" variant="outline" class="min-h-11" onclick={retryAll}
							>もう一度保存</Button
						>
					{/if}
				</div>
			{/if}
			<Button
				bind:ref={bandBack}
				type="button"
				variant={registered.length > 0 ? 'default' : 'outline'}
				class="min-h-11"
				onclick={onclose}
			>
				<ChevronLeftIcon class="size-4" aria-hidden="true" />ふりかえりに戻る
			</Button>
		</div>
	</div>
</section>
