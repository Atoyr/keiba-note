import { tv } from 'tailwind-variants';

/**
 * 札の色（依頼による。2026-10-06）。性別でそろえ、牡と父を青・牝と母をピンク・セ馬を緑、
 * 母父は父の系統なので父と同じ青、所属は美浦を紺・栗東を橙にする。地方・海外・調教師は無彩色。
 * 色だけに頼らず、札の中に `牡`・`父`・`母父`・`栗東` などの字を必ず出す。
 * 地を50番台・字を950番台・ラベルを700番台にして、12px の字でも 4.5:1 に届くようにしている。
 */
export const chip = tv({
	slots: {
		base: 'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs',
		label: '',
		value: 'font-medium'
	},
	variants: {
		tone: {
			none: {
				base: 'border-border bg-background text-foreground',
				label: 'text-muted-foreground'
			},
			blue: {
				base: 'border-blue-300 bg-blue-50 text-blue-950',
				label: 'text-blue-700'
			},
			pink: {
				base: 'border-pink-300 bg-pink-50 text-pink-950',
				label: 'text-pink-700'
			},
			green: {
				base: 'border-emerald-300 bg-emerald-50 text-emerald-950',
				label: 'text-emerald-700'
			},
			indigo: {
				base: 'border-indigo-300 bg-indigo-50 text-indigo-950',
				label: 'text-indigo-700'
			},
			orange: {
				base: 'border-orange-300 bg-orange-50 text-orange-950',
				label: 'text-orange-700'
			}
		}
	},
	defaultVariants: { tone: 'none' }
});

export type Tone = 'none' | 'blue' | 'pink' | 'green' | 'indigo' | 'orange';

export const SEX_TONE = { 牡: 'blue', 牝: 'pink', セ: 'green' } as const;
