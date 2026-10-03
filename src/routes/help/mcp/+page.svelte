<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { SCOPE_LABELS } from '$lib/schemas/oauth';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const link = 'text-primary underline underline-offset-4';
</script>

<svelte:head><title>AIとの連携の始め方 — uma-memo</title></svelte:head>

<!--
	Claude・ChatGPT の画面の名前と手順は、各社の公式の案内（2026年10月3日確認）に合わせている。
	画面が変わったら、確認日と一緒に直す。
-->
<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<p class="text-sm text-muted-foreground">AIとレースを考える</p>
	<h1 class="mt-1 text-2xl font-bold">AIとの連携の始め方</h1>
	<p class="mt-3 leading-relaxed">
		Claude や ChatGPT に uma-memo をつなぐと、AI
		がレース・出走馬・オッズ・馬の情報と、あなたのメモを読んで予想の相談に乗れるようになります（MCP）。AI
		ができるのは読むことだけで、メモの書き込み・共有・削除はできません。
	</p>

	<Card.Root class="mt-6 gap-3 py-4">
		<Card.Header>
			<h2 class="font-semibold">接続先の URL</h2>
		</Card.Header>
		<Card.Content class="space-y-2 text-sm leading-relaxed">
			<p class="rounded-md bg-muted px-3 py-2 font-mono break-all">{data.mcpUrl}</p>
			<p class="text-muted-foreground">
				AI のアプリでコネクタを追加するときに、この URL を入れます。
			</p>
		</Card.Content>
	</Card.Root>

	<section class="mt-8" aria-labelledby="which">
		<h2 id="which" class="text-lg font-bold">どのアプリで使えるか</h2>
		<div class="mt-3 overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b">
						<th scope="col" class="py-2 pr-3 font-semibold">アプリ</th>
						<th scope="col" class="py-2 pr-3 font-semibold">追加する場所</th>
						<th scope="col" class="py-2 font-semibold">スマホのアプリ</th>
					</tr>
				</thead>
				<tbody>
					<tr class="border-b align-top">
						<td class="py-2 pr-3">Claude</td>
						<td class="py-2 pr-3">Web 版かデスクトップ版</td>
						<td class="py-2">使える（Web などで追加したあと）</td>
					</tr>
					<tr class="align-top">
						<td class="py-2 pr-3">ChatGPT</td>
						<td class="py-2 pr-3">Web 版（開発者モード）</td>
						<td class="py-2">使えない（Web 版だけ）</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p class="mt-3 text-sm leading-relaxed">
			競馬場でスマホから使うなら Claude です。家で Web 版の Claude
			にコネクタを追加しておくと、スマホの Claude アプリでもそのまま使えます。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="claude">
		<h2 id="claude" class="text-lg font-bold">Claude に追加する</h2>
		<p class="mt-3 text-sm leading-relaxed">
			Free・Pro・Max の各プランで追加できます（Free は独自のコネクタ1つまで）。Team・Enterprise
			では組織のオーナーが追加します。画面の名前は英語表示のものです。日本語表示では同じ場所の項目を選んでください。
		</p>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
			<li>
				パソコンのブラウザで claude.ai を開くか、デスクトップ版の Claude
				で、「Customize」→「Connectors」を開きます。
			</li>
			<li>
				「Add custom connector」を押し、名前に「uma-memo」、URL に上の接続先の URL を入れます。
			</li>
			<li>
				認証の設定が出たら、「Authentication」は「Sign in now」、「OAuth client」は
				<strong>「Register automatically」</strong>を選びます。
				<span class="text-muted-foreground"
					>推奨と書かれた「Use Claude's published identity」には uma-memo
					がまだ対応していないので、選ぶと接続できません。</span
				>
			</li>
			<li>
				「Add」を押すと、uma-memo
				の許可画面が開きます（下の「許可画面で選ぶこと」）。ログインしていなければ、先に Google
				でログインします。
			</li>
			<li>
				会話の入力欄の左下の「+」から「Connectors」を開き、uma-memo
				をオンにします。会話ごとにオン・オフを切り替えられます。
			</li>
		</ol>
		<p class="mt-3 text-sm leading-relaxed">
			追加したコネクタは、次に Claude の iOS・Android
			アプリにログインしたときから使えます。スマホのアプリからの追加は Claude
			側で試験中のため、追加は Web 版かデスクトップ版で行ってください。
		</p>
		<p class="mt-2 text-xs text-muted-foreground">
			<a
				href="https://claude.com/docs/connectors/custom/remote-mcp"
				class={link}
				referrerpolicy="no-referrer">Claude 公式の案内</a
			>をもとにしています（2026年10月3日確認）。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="chatgpt">
		<h2 id="chatgpt" class="text-lg font-bold">ChatGPT に追加する</h2>
		<p class="mt-3 text-sm leading-relaxed">
			Plus・Pro・Business・Enterprise・Education の各プランの<strong>Web 版だけ</strong
			>で使えます。スマホの ChatGPT アプリでは使えません。Business
			以上では、管理者が開発者モードを許可している必要があります。
		</p>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
			<li>chatgpt.com の「Settings」→「Security and login」で「Developer mode」をオンにします。</li>
			<li>
				サイドバーの「Plugins」で「+」を押し、MCP のアプリを作ります。名前に「uma-memo」、URL
				に上の接続先の URL を入れ、認証は「OAuth」を選びます。
			</li>
			<li>作成すると uma-memo の許可画面が開きます（下の「許可画面で選ぶこと」）。</li>
			<li>
				会話の「+」メニューから「Developer mode」を選び、uma-memo を選びます。使う tool
				の名前をはっきり書くと、AI が迷いません（下の「頼み方の例」）。
			</li>
		</ol>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			開発者モードは、ChatGPT
			では「危険度が高い」設定として扱われています。信頼できるアプリだけをつないでください。
		</p>
		<p class="mt-2 text-xs text-muted-foreground">
			<a
				href="https://developers.openai.com/api/docs/guides/developer-mode"
				class={link}
				referrerpolicy="no-referrer">OpenAI 公式の案内</a
			>をもとにしています（2026年10月3日確認）。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="consent">
		<h2 id="consent" class="text-lg font-bold">許可画面で選ぶこと</h2>
		<ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
			<li>
				アプリの名前はアプリ自身が名乗ったものです。「許可すると、〇〇に戻ります」の行き先が、Claude
				なら claude.ai、ChatGPT なら chatgpt.com であることを確かめてください。
			</li>
			<li>
				「{SCOPE_LABELS['races:read']}」は連携に必要で外せません。
			</li>
			<li>
				「{SCOPE_LABELS['notes:read']}」はチェックを外せます。外すと、AI
				はあなたのメモを読めません。
			</li>
			<li>「許可しない」を押せば、何も許可せずに終わります。</li>
		</ul>
		<p class="mt-3 text-sm leading-relaxed">
			メモを読ませると、メモの内容は AI
			のサービスに送られます。各サービスのデータの扱いを確かめてから許可してください。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="tools">
		<h2 id="tools" class="text-lg font-bold">AI が使える tool</h2>
		<dl class="mt-3 space-y-3 rounded-md border p-4 text-sm">
			<div>
				<dt class="font-mono font-medium break-all">search_races</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">レースを名前と開催年で探します。</dd>
			</div>
			<div>
				<dt class="font-mono font-medium break-all">get_race</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					レースの条件・出走馬・着順・オッズとその時点を読みます。
				</dd>
			</div>
			<div>
				<dt class="font-mono font-medium break-all">get_horse</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					馬のプロフィールと出走歴を読みます。
				</dd>
			</div>
			<div>
				<dt class="font-mono font-medium break-all">get_my_race_notes</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					そのレースのあなたの見立て・メモ・印・札・展開を読みます（メモを許可したときだけ）。
				</dd>
			</div>
			<div>
				<dt class="font-mono font-medium break-all">get_my_horse_notes</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					その馬についてのあなたのメモを読みます（メモを許可したときだけ）。
				</dd>
			</div>
			<div>
				<dt class="font-mono font-medium break-all">list_my_recent_notes</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					あなたの最近のメモを読みます（メモを許可したときだけ）。
				</dd>
			</div>
		</dl>
	</section>

	<section class="mt-8" aria-labelledby="ask">
		<h2 id="ask" class="text-lg font-bold">頼み方の例</h2>
		<blockquote class="mt-3 rounded-md border bg-muted/50 p-4 text-sm leading-relaxed">
			uma-memo の search_races で今年の天皇賞（秋）を探し、get_race
			で出走馬とオッズを読んでください。 get_my_race_notes
			で私の見立てと印も読み、過去のメモと食い違う点があれば教えてください。
		</blockquote>
		<p class="mt-3 text-sm leading-relaxed">
			AI が考えた予想を残したいときは、予想画面で自分で書いて保存してください。AI から uma-memo
			には書き込めません。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="trouble">
		<h2 id="trouble" class="text-lg font-bold">うまくいかないとき</h2>
		<dl class="mt-3 space-y-4 text-sm leading-relaxed">
			<div>
				<dt class="font-semibold">許可画面に「連携を始められません」と出る</dt>
				<dd class="mt-1">
					アプリ側の設定が uma-memo と合っていません。Claude では「OAuth client」が「Register
					automatically」になっているかを確かめ、コネクタを削除して追加し直してください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">AI がメモを読めない</dt>
				<dd class="mt-1">
					許可画面でメモのチェックを外した可能性があります。「AIとの連携」でその連携を解除し、アプリ側でコネクタを接続し直して、メモにチェックを入れたまま許可してください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">急につながらなくなった</dt>
				<dd class="mt-1">
					連携が解除されています。自分で解除したとき、同じ連携の古い鍵が使われた（盗まれた可能性がある）と
					uma-memo が判断したときに起きます。アプリ側でコネクタを接続し直してください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">競馬場で電波が弱く、途中で失敗した</dt>
				<dd class="mt-1">
					そのまま、もう一度 AI
					に頼んでください。通信が途切れても、30分以内のやり直しなら連携は切れません。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">スマホの ChatGPT に uma-memo が出てこない</dt>
				<dd class="mt-1">
					ChatGPT のスマホのアプリでは使えません。Web 版か、Claude を使ってください。
				</dd>
			</div>
		</dl>
	</section>

	<div class="mt-8 border-t pt-6">
		<Button href={resolve('/settings/connections')} variant="outline">AIとの連携を開く</Button>
	</div>
</main>
