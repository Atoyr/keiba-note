<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { getModelContext } from '$lib/webmcp/support';

	let supported = $state<boolean | null>(null);
	onMount(() => {
		supported = getModelContext() !== null;
	});
</script>

<svelte:head><title>WebMCPの使い方 — uma-memo</title></svelte:head>

<main class="mx-auto max-w-3xl px-6 py-8">
	<p class="text-sm text-muted-foreground">AIと予想を考える</p>
	<h1 class="mt-1 text-2xl font-bold">WebMCPの使い方</h1>
	<p class="mt-3 leading-relaxed">
		予想画面を開いたまま、AIにレースの材料を読んでもらい、予想を下書きに反映できます。
		内容を確認し、いつもの保存ボタンで保存してください。
	</p>

	<Card.Root class="mt-6 gap-3 py-4">
		<Card.Header>
			<h2 class="font-semibold">このブラウザで使えるか</h2>
		</Card.Header>
		<Card.Content class="space-y-2 text-sm leading-relaxed" aria-live="polite">
			{#if supported === true}
				<p>このブラウザには、uma-memoが使うWebMCPの対応APIがあります。</p>
				<p class="text-muted-foreground">
					AIとの接続やツールの登録までを保証する表示ではありません。予想画面で、下の手順を確認してください。
				</p>
			{:else if supported === false}
				<p>このブラウザでは、uma-memoが使うWebMCPの対応APIが見つかりません。</p>
				<p class="text-muted-foreground">
					下の準備を確認してください。WebMCPを使わずに、通常どおり入力・保存することもできます。
				</p>
			{:else}
				<p>WebMCPの対応状況は、JavaScriptが有効なブラウザで確認できます。</p>
			{/if}
		</Card.Content>
	</Card.Root>

	<section class="mt-8" aria-labelledby="prepare">
		<h2 id="prepare" class="text-lg font-bold">1. ブラウザとAIを準備する</h2>
		<p class="mt-3 text-sm leading-relaxed">
			WebMCPに対応したブラウザと、ページのツールを使えるAI Browser Agentが必要です。
			WebMCPは試験中のため、対応状況はブラウザやバージョンによって異なります。
		</p>
		<p class="mt-3 text-sm leading-relaxed">
			Chromeで試す場合は、次の設定を確認してください。
			<a
				href="https://developer.chrome.com/docs/ai/webmcp/"
				class="text-primary underline underline-offset-4"
				referrerpolicy="no-referrer">Chrome公式の案内</a
			>をもとにしています（2026年10月2日確認）。
		</p>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
			<li>Chromeを更新し、アドレスバーに次のURLを入力します。</li>
		</ol>
		<p class="mt-2 rounded-md bg-muted p-3 font-mono text-xs break-all">
			chrome://flags/#enable-webmcp-testing
		</p>
		<ol start="2" class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
			<li>「WebMCP for testing」を「Enabled」にし、Chromeを再起動します。</li>
			<li>
				利用するAI Browser Agentの案内に従って、今開いているタブのツールを使えるようにします。
				動作を試すなら、Chrome公式の案内で紹介されている
				<a
					href="https://chromewebstore.google.com/detail/webmcp-model-context-tool/gbpdfapgefenggkahomfgkhfehlcenpd"
					class="text-primary underline underline-offset-4"
					referrerpolicy="no-referrer">Model Context Tool Inspector</a
				>でも、ツール一覧と呼び出しを確認できます。
			</li>
		</ol>
		<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
			試験設定が見つからない場合や、対応APIが検出されない場合は、この環境では利用できません。
			設定を有効にするだけで、AIとの接続が完了するわけではありません。
		</p>
		<p class="mt-3 text-sm leading-relaxed">
			AIに渡る材料には自分の過去メモや未保存の入力も含まれます。利用するAIサービスのデータの扱いを確認してください。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="open-preview">
		<h2 id="open-preview" class="text-lg font-bold">2. 対象レースの予想画面を開く</h2>
		<p class="mt-3 text-sm leading-relaxed">
			uma-memoにログインし、予想したいレースの予想画面を開きます。
			AIやInspectorのツール一覧に、次の2つがあるか確認してください。
			この使い方ページやレース一覧では、予想用のツールは表示されません。
		</p>
		<p class="mt-3 text-sm leading-relaxed">
			Inspectorを使う場合は、その予想画面で拡張機能アイコンを押してサイドパネルを開きます。
			AIとの会話に必要な設定は、利用する拡張機能の案内に従ってください。
		</p>
		<dl class="mt-3 space-y-3 rounded-md border p-4 text-sm">
			<div>
				<dt class="font-mono font-medium break-all">get_prediction_context</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					レース・出走馬・オッズとその時点、自分のメモ・過去走・現在の入力を読み取ります。
				</dd>
			</div>
			<div>
				<dt class="font-mono font-medium break-all">apply_prediction_draft</dt>
				<dd class="mt-1 leading-relaxed text-muted-foreground">
					レース本文・ペース・各馬の本文・印・札・展開を、未保存の下書きとして反映します。
				</dd>
			</div>
		</dl>
	</section>

	<section class="mt-8" aria-labelledby="ask-ai">
		<h2 id="ask-ai" class="text-lg font-bold">3. AIに予想を頼む</h2>
		<p class="mt-3 text-sm leading-relaxed">
			AIへの依頼例です。必要な部分だけ変えて使ってください。
		</p>
		<blockquote class="mt-3 rounded-md border bg-muted/50 p-4 text-sm leading-relaxed">
			このレースの予想材料を get_prediction_context で読んでください。
			自分の過去メモと過去走、オッズの取得時点を踏まえて、印と理由、想定ペースを考えてください。
			馬は取得した entryId で識別し、apply_prediction_draft で下書きに反映してください。
			指定しない欄は残し、保存はせず、私が確認できる状態にしてください。
		</blockquote>
		<p class="mt-3 text-sm leading-relaxed">
			指定されなかった馬や欄はそのまま残ります。同じ欄をAIが指定すると、手入力も書き換わります。
			空の本文・空の札・印やペースの解除は、その欄を消す指定として扱います。
			展開を指定すると3局面全体が置き換わるため、盤面も確認してください。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="save">
		<h2 id="save" class="text-lg font-bold">4. 下書きを確認して保存する</h2>
		<ol class="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
			<li>
				「AIの予想を下書きに反映しました」という通知が出たら、本文・印・札・ペース・展開を確認します。
			</li>
			<li>変更があれば「未保存の変更」の件数が表示されます。気になる部分は手で書き直せます。</li>
			<li>
				内容がよければ「出走前メモを保存」を押します。出馬表がない場合は「レースの見立てを保存」です。
			</li>
		</ol>
		<p class="mt-3 text-sm leading-relaxed">
			AIの反映だけでは保存されません。下書きは今のブラウザに残りますが、ほかの端末では読めません。
			読み込み直したときに復元の案内が出たら、「復元する」で戻せます。
		</p>
	</section>

	<section class="mt-8" aria-labelledby="trouble">
		<h2 id="trouble" class="text-lg font-bold">うまくいかないとき</h2>
		<dl class="mt-3 space-y-4 text-sm leading-relaxed">
			<div>
				<dt class="font-semibold">ツールが見つからない</dt>
				<dd class="mt-1">
					対象レースの予想画面を開き、読み込みが終わってからツール一覧を更新してください。
					ブラウザの試験設定・再起動と、AI側のタブへの接続も確認してください。
					ブラウザとAIの仕様が合わない場合は利用できません。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">AIの下書きが拒否された</dt>
				<dd class="mt-1">
					入力の形式や、現在のレースにない出走馬が指定された場合は、全体の反映を止めます。
					予想材料を取り直し、そのレースの出走馬で作り直すようAIに頼んでください。
					出馬表がないレースには、本文だけを反映できます。
				</dd>
			</div>
			<div>
				<dt class="font-semibold">別のレースへ移動した</dt>
				<dd class="mt-1">
					前のレースのツールは解除されます。新しい予想画面で材料を取り直してから依頼してください。
				</dd>
			</div>
		</dl>
	</section>

	<div class="mt-8 border-t pt-6">
		<Button href={resolve('/races')} variant="outline">レースを選ぶ</Button>
	</div>
</main>
