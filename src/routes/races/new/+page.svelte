<script lang="ts">
	import { COURSES, DIRECTIONS, GRADES, SURFACES, TRACK_CONDITIONS } from '$lib/schemas/race';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const prev = (k: string) => (form?.raw?.[k] as string | undefined) ?? '';
</script>

<svelte:head><title>レース登録 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-2xl px-6 py-8">
	<h1 class="text-2xl font-bold tracking-tight">レースを登録</h1>
	<p class="mt-1 text-sm text-gray-600">
		日付と競馬場だけ必須。あとは分かる範囲で。あとから編集できます。
	</p>

	{#if form?.message}
		<p
			class="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
			role="alert"
		>
			{form.message}
		</p>
	{/if}

	<form method="POST" class="mt-6 grid grid-cols-2 gap-4">
		<label class="col-span-1 text-sm">
			<span class="font-medium">日付 *</span>
			<input
				type="date"
				name="date"
				required
				value={prev('date') || data.today}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">競馬場 *</span>
			<select
				name="course"
				required
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			>
				<option value="">—</option>
				{#each COURSES as c (c)}
					<option value={c} selected={prev('course') === c}>{c}</option>
				{/each}
			</select>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">R</span>
			<input
				type="number"
				name="raceNumber"
				min="1"
				max="12"
				value={prev('raceNumber')}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">格付け</span>
			<select name="grade" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
				<option value="">—</option>
				{#each GRADES as g (g)}
					<option value={g} selected={prev('grade') === g}>{g}</option>
				{/each}
			</select>
		</label>

		<label class="col-span-2 text-sm">
			<span class="font-medium">レース名</span>
			<input
				name="name"
				placeholder="オールカマー"
				value={prev('name')}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>

		<label class="col-span-2 text-sm">
			<span class="font-medium">条件</span>
			<input
				name="className"
				placeholder="3勝クラス"
				value={prev('className')}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">馬場</span>
			<select name="surface" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
				<option value="">—</option>
				{#each SURFACES as s (s)}
					<option value={s} selected={prev('surface') === s}>{s}</option>
				{/each}
			</select>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">距離 (m)</span>
			<input
				type="number"
				name="distance"
				min="800"
				max="5000"
				step="100"
				value={prev('distance')}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">回り</span>
			<select name="direction" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
				<option value="">—</option>
				{#each DIRECTIONS as d (d)}
					<option value={d} selected={prev('direction') === d}>{d}</option>
				{/each}
			</select>
		</label>

		<label class="col-span-1 text-sm">
			<span class="font-medium">馬場状態</span>
			<select name="trackCondition" class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2">
				<option value="">—</option>
				{#each TRACK_CONDITIONS as t (t)}
					<option value={t} selected={prev('trackCondition') === t}>{t}</option>
				{/each}
			</select>
		</label>

		<label class="col-span-2 text-sm">
			<span class="font-medium">天候</span>
			<input
				name="weather"
				placeholder="晴"
				value={prev('weather')}
				class="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
			/>
		</label>

		<div class="col-span-2">
			<button
				type="submit"
				class="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:bg-primary/80"
			>
				登録して出走馬の入力へ
			</button>
		</div>
	</form>
</main>
