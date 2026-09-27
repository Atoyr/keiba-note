<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { JOCKEY_TAG_GROUPS, type JockeyTag } from '$lib/schemas/jockey';

	/**
	 * 騎手に付ける札を選ぶ。チェックボックスを札の見た目にしたもの（`TagPicker` と同じ作り）。
	 * 素のチェックボックスなので JS 無効でも動く。1つも選ばなければ name はフォームに乗らない。
	 *
	 * 札が20近くあるので、系統（得意な場・条件・乗り方・狙いどころ）ごとに見出しを付けて段に分ける。
	 * **選んだ札は色だけでなく ✓ でも示す。** メモの札と違って系統ごとの色の意味が無いので、
	 * 塗りは1色（テーマカラーを薄くしたもの）にしている。
	 */
	let { name, values = [] }: { name: string; values?: JockeyTag[] } = $props();
</script>

<div class="grid gap-2">
	{#each JOCKEY_TAG_GROUPS as group (group.label)}
		<div
			class="flex flex-wrap items-center gap-1"
			role="group"
			aria-labelledby="jockey-tag-{group.label}"
		>
			<span id="jockey-tag-{group.label}" class="w-full text-xs text-muted-foreground sm:w-20">
				{group.label}
			</span>
			{#each group.tags as t (t)}
				<label class="relative">
					<input
						type="checkbox"
						{name}
						value={t}
						checked={values.includes(t)}
						class="peer sr-only"
					/>
					<span
						class="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border px-2 text-xs text-muted-foreground peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:font-medium peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-not-checked:hover:bg-accent peer-checked:[&>svg]:inline"
					>
						<Check class="hidden size-3" aria-hidden="true" />
						{t}
					</span>
				</label>
			{/each}
		</div>
	{/each}
</div>
