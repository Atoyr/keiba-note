<script lang="ts">
	import { resolve } from '$app/paths';
	import McpUrl from '$lib/components/McpUrl.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { SCOPE_LABELS } from '$lib/schemas/oauth';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const link = 'text-primary underline underline-offset-4';
</script>

<svelte:head><title>AIとの連携の始め方 — uma-memo</title></svelte:head>

<!--
	Claude の画面の名前と手順は、Claude 公式の案内（2026年10月3日確認）に合わせている。
	ChatGPT の手順は、日本語表示の実際の画面（2026年10月4日確認）に合わせている。
	画面が変わったら、確認日と一緒に直す。
-->
<main class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
	<p class="text-sm text-muted-foreground">AIとレースを考える</p>
	<h1 class="mt-1 text-2xl font-bold">AIとの連携の始め方</h1>
	<p class="mt-3 leading-relaxed">
		Claude や ChatGPT に uma-memo をつなぐと、AI
		がレース・出走馬・オッズ・馬の情報と、あなたのメモを読んで予想の相談に乗れるようになります（MCP）。許可すれば、AI
		と決めた予想（見立て・印・札・出走前メモ）を AI に書き込ませることもできます。AI
		が書き換えられるのはその予想だけで（空にすれば消えます）、ふりかえり・近況メモの書き込みと、メモの共有はできません。
	</p>

	<Card.Root class="mt-6 gap-3 py-4">
		<Card.Header>
			<h2 class="font-semibold">接続先の URL</h2>
		</Card.Header>
		<Card.Content class="space-y-2 text-sm leading-relaxed">
			<McpUrl url={data.mcpUrl} />
			<p class="text-muted-foreground">
				AI のアプリに uma-memo を追加するときに、この URL を入れます。
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
						<td class="py-2 pr-3">Web 版</td>
						<td class="py-2">使える（Web 版で追加したあと）</td>
					</tr>
				</tbody>
			</table>
		</div>
		<p class="mt-3 text-sm leading-relaxed">
			競馬場でスマホから使うときも、先にパソコンなどの Web 版で uma-memo
			を追加しておけば、スマホのアプリでそのまま使えます。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="claude">
		<h2 id="claude" class="text-lg font-bold">Claude に追加する</h2>
		<p class="mt-3 text-sm leading-relaxed">
			Free・Pro・Max の各プランで追加できます（Free は独自のプラグイン1つまで。Claude
			の画面では「Connectors」と呼びます）。Team・Enterprise
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
				認証の設定が出たら、「Authentication」は「Sign in now」を選びます。「OAuth client」は推奨の<strong
					>「Use Claude's published identity」</strong
				>のままで構いません。<span class="text-muted-foreground"
					>「Register automatically」でもつながります。</span
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
			追加したプラグインは、次に Claude の iOS・Android
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
			Plus・Pro・Business・Enterprise・Education の各プランで使えます。追加は<strong
				>Web 版で</strong
			>行います。Web 版で追加したあとは、スマホの ChatGPT
			アプリでも使えます。画面の名前は日本語表示のものです。
		</p>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
			<li>
				chatgpt.com
				のサイドバーの「プラグイン」を開き、「カスタムプラグインを追加」を押します。「カスタム MCP
				サーバーを作成」の画面が開きます。
			</li>
			<li>
				名前に「uma-memo」を入れます。「接続タイプ」は「サーバーURL」のまま、URL に上の接続先の URL
				を入れ、「認証」は「OAuth」を選びます。「OAuthの詳細設定」は変えなくて構いません。
			</li>
			<li>
				注意書きを読んで「理解したうえで続けます」にチェックを入れ、「プラグインとして作成」を押します。
			</li>
			<li>
				「uma-memo を接続する」の画面で「uma-memo に進む」を押すと、uma-memo
				の許可画面が開きます（下の「許可画面で選ぶこと」）。ログインしていなければ、先に Google
				でログインします。
			</li>
			<li>
				<strong>会話ごとに</strong>、uma-memo を使うよう頼むか、プラグインから uma-memo
				を選びます。使う tool の名前もはっきり書くと、AI が迷いません（下の「頼み方の例」）。
			</li>
		</ol>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			ChatGPT も、カスタムの MCP
			サーバーの利用にはリスクが伴うと注意しています。信頼できるサーバーだけをつないでください。
		</p>
		<p class="mt-2 text-xs text-muted-foreground">
			日本語表示の ChatGPT の画面をもとにしています（2026年10月4日確認）。
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
				Claude で推奨の「Use Claude's published identity」を選んだときは「提供元:
				claude.ai」のように出ます。提供元は、アプリの情報が置かれているアドレスで uma-memo
				が確かめたものです。
			</li>
			<li>
				「{SCOPE_LABELS['races:read']}」は連携に必要で外せません。
			</li>
			<li>
				「{SCOPE_LABELS['notes:read']}」はチェックを外せます。外すと、AI
				はあなたのメモを読めません。
			</li>
			<li>
				「{SCOPE_LABELS['notes:write']}」もチェックを外せます。外すと、AI
				は読むだけになります。残すと、AI
				はレースの見立てと各馬の印・札・出走前メモを書き換えられます。uma-memo
				は頼まれたときだけ書くよう AI に伝えていますが、AI
				が誤って書くこともあります。展開の予想・ふりかえり・近況メモには触れません。
			</li>
			<li>「許可しない」を押せば、何も許可せずに終わります。</li>
		</ul>
		<p class="mt-3 text-sm leading-relaxed">
			メモを読ませると、メモの内容は AI
			のサービスに送られます。各サービスのデータの扱いを確かめてから許可してください。予想を書かせるときは、AI
			が書き換えたあとで予想画面を見て確かめてください。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="tools">
		<h2 id="tools" class="text-lg font-bold">AI が使える tool</h2>
		<p class="mt-3 text-sm leading-relaxed">
			AI は次の tool で uma-memo を読みます。頼むときに名前を書くと、AI が迷いません。
		</p>
		<dl class="mt-3 space-y-3 rounded-md border p-4 text-sm">
			{#each data.tools as t (t.name)}
				<div>
					<dt class="font-mono font-medium break-all">{t.name}</dt>
					<dd class="mt-1 leading-relaxed text-muted-foreground">
						{t.title}{#if t.scope === 'notes:read'}（メモを読むのを許可したときだけ）{:else if t.scope === 'notes:write'}（予想を書くのを許可したときだけ）{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</section>

	<section class="mt-8" aria-labelledby="ask">
		<h2 id="ask" class="text-lg font-bold">頼み方の例</h2>
		<blockquote class="mt-3 rounded-md border bg-muted/50 p-4 text-sm leading-relaxed">
			uma-memo の search_races で今年の天皇賞（秋）を探し、get_race
			で出走馬とオッズを読んでください。 get_my_race_notes
			で私の見立てと印も読み、過去のメモと食い違う点があれば教えてください。
		</blockquote>
		<p class="mt-3 text-sm leading-relaxed">AI と決めた予想を残したいときは、こう頼みます。</p>
		<blockquote class="mt-3 rounded-md border bg-muted/50 p-4 text-sm leading-relaxed">
			いまの話で決めた印と、各馬の短いメモを save_my_race_preview
			で天皇賞（秋）の予想に書いてください。私が書いてある本文は消さないでください。
		</blockquote>
		<p class="mt-3 text-sm leading-relaxed">
			uma-memo が書き換えるのは、AI が渡した馬の渡した項目だけです。ただ、何を渡すかは AI
			次第で、誤って書くこともあります。書いたあとは予想画面で確かめ、直したければそこで直してください。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="trouble">
		<h2 id="trouble" class="text-lg font-bold">うまくいかないとき</h2>
		<dl class="mt-3 space-y-4 text-sm leading-relaxed">
			<div>
				<dt class="font-semibold">許可画面に「連携を始められません」と出る</dt>
				<dd class="mt-1">
					「アプリの情報を取得できませんでした」「混み合っています」と出たときは、アプリ側の一時的な不調か
					uma-memo
					側の混雑です。しばらくしてから、アプリ側でもう一度つないでください。それ以外のときは、アプリ側の設定が
					uma-memo と合っていません。アプリ側で uma-memo
					を削除して、上の手順で追加し直してください。Claude の「OAuth client」で「Use your own
					OAuth client」を選んでいたら、推奨の「Use Claude's published identity」か「Register
					automatically」にしてください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">AI がメモを読めない</dt>
				<dd class="mt-1">
					許可画面でメモのチェックを外した可能性があります。「AIとの連携」でその連携を解除し、アプリ側で
					uma-memo を接続し直して、メモにチェックを入れたまま許可してください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">AI が予想を書けないと言う</dt>
				<dd class="mt-1">
					予想の書き込みを許可していません。書き込みが加わる前につないだ連携も同じです。「AIとの連携」でその連携を解除し、アプリ側で
					uma-memo を接続し直して、予想を書くのにチェックを入れたまま許可してください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">「今週の読み取り（書き込み）の上限に達しました」と言われた</dt>
				<dd class="mt-1">
					AI
					が読み書きできる回数には、1週間ごとの上限があります（読み取りと書き込みで別です）。毎週水曜
					12:00 に戻るので、それまで待ってください。今の利用量は
					<a
						href={resolve('/settings/connections')}
						class="text-primary underline underline-offset-4">AIとの連携</a
					>の画面で見られます。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">急につながらなくなった</dt>
				<dd class="mt-1">
					<p>アプリ側で uma-memo を接続し直してください。どの原因でも、接続し直せば戻ります。</p>
					<ul class="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
						<li>
							30日ほど使わずにいて、接続の期限が切れた（「AIとの連携」の一覧には残ったままです）
						</li>
						<li>「AIとの連携」で連携を解除した</li>
						<li>
							同じ連携の古い鍵が使われ、盗まれた可能性があると uma-memo が判断して連携を止めた
						</li>
					</ul>
				</dd>
			</div>
			<div>
				<dt class="font-semibold">競馬場で電波が弱く、途中で失敗した</dt>
				<dd class="mt-1">
					電波の戻る所で、もう一度 AI
					に頼んでください。途中で途切れても、多くの場合は頼み直すだけで戻ります。戻らなければ、上の「急につながらなくなった」のとおり接続し直してください。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">ChatGPT が uma-memo を使わない</dt>
				<dd class="mt-1">
					ChatGPT では会話ごとに選ぶ必要があります。「uma-memo で〜」と頼むか、プラグインから
					uma-memo を選んでください。スマホのアプリで出てこないときは、先に Web
					版で追加してください。
				</dd>
			</div>
		</dl>
	</section>

	<p class="mt-8 text-sm leading-relaxed text-muted-foreground">
		ブラウザの中で AI に予想の下書きを書かせる試験的な機能もあります（<a
			href={resolve('/help/webmcp')}
			class="inline-flex min-h-6 items-center {link}">WebMCPの使い方</a
		>）。
	</p>

	<div class="mt-6 border-t pt-6">
		<Button href={resolve('/settings/connections')} variant="outline">AIとの連携を開く</Button>
	</div>
</main>
