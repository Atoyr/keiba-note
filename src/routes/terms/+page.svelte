<script lang="ts">
	import { resolve } from '$app/paths';
	import LegalDocument from '$lib/components/LegalDocument.svelte';
	import { LEGAL } from '$lib/utils/legal';
</script>

<LegalDocument title="利用規約" enactedOn="2026年9月23日" updatedOn="2026年9月23日">
	<p class="mt-3">
		この規約は、{LEGAL.operator}（以下「運営者」）が提供する競馬の観戦メモのサービス「uma-memo」（以下「本サービス」）の利用条件を定めるものです。本サービスにログインした時点で、この規約に同意したものとします。
	</p>

	<h2 class="mt-8 text-base font-bold">1. 本サービスの内容</h2>
	<p class="mt-3">
		本サービスは、競馬のレースや馬について観戦メモを書き、ふりかえるための無料のサービスです。ログインには
		Google アカウントを使います。
	</p>

	<h2 class="mt-8 text-base font-bold">2. メモの扱い</h2>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>利用者が書いたメモの権利は、利用者に残ります</li>
		<li>運営者は、メモを保存し表示するために必要な範囲でだけ扱います</li>
		<li>
			共有リンクを発行したメモは、リンクを知っている人が誰でも読めます。共有するかどうかは、利用者が自分で判断してください
		</li>
	</ul>

	<h2 class="mt-8 text-base font-bold">3. 禁止すること</h2>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>法令や公序良俗に反すること</li>
		<li>他人の権利（著作権・プライバシー・名誉など）を侵害すること</li>
		<li>他人になりすますこと、他人のアカウントを使うこと</li>
		<li>本サービスへの不正なアクセス、過度な負荷をかけること、動作を妨げること</li>
		<li>本サービスを営利目的で利用すること</li>
		<li>そのほか、運営者が不適切と判断すること</li>
	</ul>

	<h2 class="mt-8 text-base font-bold">4. 利用の停止</h2>
	<p class="mt-3">
		利用者が前の章に当たることをしたとき、運営者は事前に知らせずに、そのアカウントの利用を止めたり、共有を取り消したりできるものとします。
	</p>

	<h2 class="mt-8 text-base font-bold">5. レースと馬の情報</h2>
	<p class="mt-3">
		本サービスに載せているレース・出走馬・結果などの情報は、正確であるよう努めていますが、正しさや新しさを保証しません。公式の情報は主催者の発表でお確かめください。本サービスは勝馬投票券の購入を勧めるものではなく、馬券の購入は利用者ご自身の判断と責任で行ってください。
	</p>

	<h2 class="mt-8 text-base font-bold">6. 変更・中断・終了</h2>
	<p class="mt-3">
		運営者は、事前に知らせずに本サービスの内容を変えたり、中断・終了したりできるものとします。終了するときは、できるだけ前もってこのサービス上で知らせます。
	</p>

	<h2 class="mt-8 text-base font-bold">7. 免責</h2>
	<p class="mt-3">
		本サービスは現状のまま提供します。運営者は、本サービスに不具合がないこと、メモが失われないこと、特定の目的に合うことを保証しません。本サービスの利用によって利用者に生じた損害について、運営者の故意または重大な過失による場合を除き、責任を負いません。
	</p>

	<h2 class="mt-8 text-base font-bold">8. 個人情報</h2>
	<p class="mt-3">
		利用者の情報は<a href={resolve('/privacy')} class="underline hover:no-underline"
			>プライバシーポリシー</a
		>に従って扱います。
	</p>

	<h2 class="mt-8 text-base font-bold">9. 規約の変更</h2>
	<p class="mt-3">
		運営者は、必要に応じてこの規約を変更できるものとします。変更したときはこのページで知らせ、上の最終改定日を更新します。変更後に本サービスを使った時点で、変更後の規約に同意したものとします。
	</p>

	<h2 class="mt-8 text-base font-bold">10. 準拠法と管轄</h2>
	<p class="mt-3">
		この規約は日本法に従って解釈します。本サービスに関して争いが生じたときは、運営者の住所地を管轄する地方裁判所を第一審の専属的合意管轄裁判所とします。
	</p>

	<h2 class="mt-8 text-base font-bold">11. お問い合わせ</h2>
	<p class="mt-3">
		<a
			href="https://github.com/Atoyr/keiba-note/issues"
			class="underline hover:no-underline"
			rel="noopener noreferrer">GitHub の Issues</a
		>からご連絡ください。
	</p>
</LegalDocument>
