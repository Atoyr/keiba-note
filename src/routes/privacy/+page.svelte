<script lang="ts">
	import { resolve } from '$app/paths';
	import LegalDocument from '$lib/components/LegalDocument.svelte';
	import { LEGAL } from '$lib/utils/legal';

	/*
	 * 書いてあることは実装と一致させる。取る情報・Cookie・外部サービスを足したり変えたりしたら、
	 * ここも直して最終改定日を上げる（src/lib/server/auth/google.ts・schema.ts・wrangler.toml）。
	 */
</script>

<LegalDocument title="プライバシーポリシー" enactedOn="2026年9月23日" updatedOn="2026年9月26日">
	<p class="mt-3">
		{LEGAL.operator}（以下「運営者」）は、競馬の観戦メモのサービス「uma-memo」（以下「本サービス」）での利用者の情報の取り扱いを、次のとおり定めます。
	</p>

	<h2 class="mt-8 text-base font-bold">1. 取得する情報</h2>
	<p class="mt-3">Google アカウントでのログイン時に、Google から次の情報を受け取ります。</p>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>Google アカウントの識別子</li>
		<li>メールアドレス（Google で確認済みのもの）</li>
		<li>氏名（Google アカウントの表示名）</li>
		<li>プロフィール画像の URL</li>
	</ul>
	<p class="mt-3">
		要求する権限は、ログインと本人確認に要るもの（openid・email・profile）だけです。Gmail・連絡先・カレンダー・ドライブなど、ほかの
		Google のデータには触れません。
	</p>
	<p class="mt-3">本サービスを使うなかで、次の情報を保存します。</p>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>利用者が書いたメモ（本文・札・予想印・日付）と、共有するかどうかの設定</li>
		<li>利用者が設定した公開用の名前と、共有時点の予想まとめ</li>
		<li>ログイン状態を保つためのセッション情報（有効期限など）</li>
	</ul>
	<p class="mt-3">
		このほか、本サービスを動かしている Cloudflare の仕組みにより、アクセスの記録（IP
		アドレス、ブラウザの種類、開いた URL、日時など）が一定期間残ります。
	</p>

	<h2 class="mt-8 text-base font-bold">2. 利用目的</h2>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>ログインと本人確認のため</li>
		<li>書いたメモを保存し、本人に表示するため</li>
		<li>画面に表示名とプロフィール画像を出すため</li>
		<li>利用者が共有したメモや予想まとめに、公開用の名前を添えるため</li>
		<li>管理者かどうかを判定するため（メールアドレスを使います）</li>
		<li>
			アカウントを管理するため（運営者は利用者の一覧で表示名とメールアドレスを見て、利用の停止などを行います）
		</li>
		<li>不正な利用の防止、障害の調査と対応のため</li>
	</ul>
	<p class="mt-3">
		広告の配信、利用者の行動の分析、機械学習の学習データへの利用はしません。本サービスは広告や解析のためのツールを組み込んでいません。
	</p>

	<h2 class="mt-8 text-base font-bold">3. Google から受け取った情報の扱い</h2>
	<p class="mt-3">
		Google API から受け取った情報の利用と、ほかのアプリへの転送は、<a
			href="https://developers.google.com/terms/api-services-user-data-policy"
			class="underline hover:no-underline"
			rel="noopener noreferrer"
			target="_blank">Google API サービスのユーザーデータに関するポリシー</a
		>（「限定使用」の要件を含む）に従います。受け取った情報は第2章の目的だけに使い、売ったり、広告に使ったりはしません。運営者が目を通すのは、第2章のアカウントの管理、不正利用や障害の調査、利用者の同意があるとき、法令に基づくときに限ります。
	</p>

	<h2 class="mt-8 text-base font-bold">4. メモの公開範囲</h2>
	<p class="mt-3">
		メモは既定で非公開で、書いた本人だけが読めます。利用者が共有リンクを発行すると、そのリンクを知っている人は誰でも、ログインせずに対象のメモ1件、または1レースの予想まとめを読めます。予想まとめは共有時点の見立て・各馬のメモ・札・印を保存し、利用者が共有内容を更新するまで変わりません。
	</p>
	<p class="mt-3">
		共有ページに表示するのは、利用者が設定した公開用の名前です。未設定なら「匿名」と表示し、Google
		の名前・メールアドレス・プロフィール画像は表示しません。公開用の名前の変更は、すでに共有したページにも反映されます。共有は「共有中」の画面からいつでもやめられます。
	</p>

	<h2 class="mt-8 text-base font-bold">5. 第三者への提供</h2>
	<p class="mt-3">
		利用者の同意がある場合、法令に基づく場合、人の生命・身体・財産を守るために必要で本人の同意を得にくい場合を除き、個人情報を第三者に提供しません。
	</p>

	<h2 class="mt-8 text-base font-bold">6. 外部のサービス</h2>
	<p class="mt-3">本サービスは次の外部サービスを使っています。</p>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>
			<strong>Cloudflare, Inc.（米国）</strong>: 本サービスの実行とデータの保存（第1章の情報はすべて
			Cloudflare のデータベースに保存します）。取り扱いは<a
				href="https://www.cloudflare.com/privacypolicy/"
				class="underline hover:no-underline"
				rel="noopener noreferrer"
				target="_blank">Cloudflare のプライバシーポリシー</a
			>に従います
		</li>
		<li>
			<strong>Google LLC（米国）</strong>: ログイン。プロフィール画像は Google
			のサーバーから表示します。取り扱いは<a
				href="https://policies.google.com/privacy"
				class="underline hover:no-underline"
				rel="noopener noreferrer"
				target="_blank">Google のプライバシーポリシー</a
			>に従います
		</li>
	</ul>

	<h2 class="mt-8 text-base font-bold">7. Cookie とブラウザへの保存</h2>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>
			ログイン状態を保つための Cookie と、ログインの手続き中だけ使う
			Cookie（10分で消えます）を使います。広告や追跡のための Cookie は使いません
		</li>
		<li>
			書きかけのメモを失わないよう、下書きをブラウザ（localStorage）に保存します。この下書きはお使いの端末の中だけにあり、保存を押すまで運営者には送られません
		</li>
	</ul>

	<h2 class="mt-8 text-base font-bold">8. 保存する期間と削除</h2>
	<p class="mt-3">
		第1章の情報は、アカウントがある間保存します。アカウントとメモの削除を希望する場合は、第11章の窓口からご連絡ください。本人であることを確かめたうえで、アカウントの情報と、書いたメモをすべて削除します。アクセスの記録は
		Cloudflare の設定した期間が過ぎると消えます。
	</p>
	<p class="mt-3">
		本サービスが Google アカウントの情報を受け取れないようにするには、<a
			href="https://myaccount.google.com/permissions"
			class="underline hover:no-underline"
			rel="noopener noreferrer"
			target="_blank">Google アカウントの「サードパーティ製のアプリとサービス」</a
		>から本サービスへのアクセスを削除してください。
	</p>

	<h2 class="mt-8 text-base font-bold">9. 安全のための措置</h2>
	<ul class="mt-3 list-disc space-y-1 pl-6">
		<li>通信はすべて HTTPS で暗号化します</li>
		<li>
			ログイン状態を表すトークンは、そのままでは保存せず、元に戻せない形（ハッシュ）にして保存します
		</li>
		<li>メモは、書いた本人か、共有リンクを知っている人しか読めないように絞り込んで取り出します</li>
	</ul>

	<h2 class="mt-8 text-base font-bold">10. 開示・訂正・削除などのご請求</h2>
	<p class="mt-3">
		ご自身の情報の開示・訂正・利用停止・削除を求める場合は、第11章の窓口からご連絡ください。法令に従って対応します。
	</p>

	<h2 class="mt-8 text-base font-bold">11. お問い合わせ窓口</h2>
	<p class="mt-3">
		運営者: {LEGAL.operator}<br />窓口:
		<a
			href="https://github.com/Atoyr/keiba-note/issues"
			class="underline hover:no-underline"
			rel="noopener noreferrer">GitHub の Issues</a
		>
	</p>
	<p class="mt-3">
		Issues
		は誰でも読める場所です。メールアドレスなどの個人情報は書かずに、ご用件だけをお書きください。本人確認が要るときは、その方法を運営者からご案内します。
	</p>

	<h2 class="mt-8 text-base font-bold">12. 改定</h2>
	<p class="mt-3">
		このポリシーは必要に応じて改定します。改定したときはこのページで知らせ、上の最終改定日を更新します。あわせて<a
			href={resolve('/terms')}
			class="underline hover:no-underline">利用規約</a
		>もご確認ください。
	</p>
</LegalDocument>
