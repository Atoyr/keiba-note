/**
 * data/races/<開催日>.yaml を、**人が書いたコメントと並びを崩さずに**書き換える。
 *
 * 丸ごと stringify し直すとコメントが消え、差分がファイル全体に広がってレビューできなくなる。
 * yaml の Document API でノードを直接いじり、触った行だけが差分に出るようにする。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Document, isMap, isScalar, isSeq, parseDocument, Scalar, YAMLMap, YAMLSeq } from 'yaml';

/** 出走馬行のキーの並び。既存のファイルに合わせる。 */
export const ENTRY_KEYS = [
	'horseNumber',
	'bracket',
	'name',
	'jockey',
	'sex',
	'age',
	'birthYear',
	'ref',
	'trainer',
	'sire',
	'dam',
	'finish',
	'popularity',
	'time',
	'margin',
	'timeDiff',
	'passing',
	'last3f',
	'weight',
	'horseWeight',
	'horseWeightDiff',
	'odds'
] as const;

export const RACE_KEYS = [
	'course',
	'raceNumber',
	'name',
	'grade',
	'className',
	'surface',
	'distance',
	'direction',
	'trackCondition',
	'weather',
	'fieldSize',
	'winner',
	'runnerUp',
	'ref',
	'startTime',
	'entries',
	'withdrawn'
] as const;

/** コロンや記号を含むので、既存のファイルと同じく必ずダブルクォートで書く。 */
const QUOTED = new Set(['time', 'margin', 'passing', 'startTime']);

export type Value = string | number | undefined;
export type Fields = Partial<Record<(typeof ENTRY_KEYS)[number], Value>>;
export type RaceFields = Partial<Record<(typeof RACE_KEYS)[number], Value>>;

/**
 * - `overwrite` — 書く値があれば上書きする（出馬表・結果・基本情報。netkeiba が正）
 * - `fill` — 空いている項目だけ埋める（過去走。人が直した値を戻さない）
 */
export type Mode = 'overwrite' | 'fill';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function dateHeading(date: string): string {
	const [y, m, d] = date.split('-').map(Number);
	const w = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
	return `${y}年${m}月${d}日（${w}）`;
}

export class RaceFile {
	readonly path: string;
	readonly doc: Document;
	readonly created: boolean;
	private dirty = false;

	private constructor(path: string, doc: Document, created: boolean) {
		this.path = path;
		this.doc = doc;
		this.created = created;
	}

	/** ファイルが無ければ空のドキュメントを作る（保存するまで書き出さない）。 */
	static async load(dir: string, date: string, heading?: string): Promise<RaceFile> {
		const path = join(dir, `${date}.yaml`);
		try {
			return RaceFile.parse(path, await readFile(path, 'utf8'));
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
		}
		// 既存のファイルと同じ形（見出しのコメント → date → 空行 → races）で始める。
		const title = `${dateHeading(date)}${heading ? ` ${heading}` : ''}`;
		const doc = parseDocument(`# ${title}\ndate: ${date}\n\nraces: []\n`);
		return new RaceFile(path, doc, true);
	}

	static parse(path: string, raw: string): RaceFile {
		const doc = parseDocument(raw);
		if (doc.errors.length > 0) throw new Error(`${path}: ${doc.errors[0].message}`);
		return new RaceFile(path, doc, false);
	}

	get races(): YAMLSeq<YAMLMap> {
		const races = this.doc.get('races');
		if (!isSeq(races)) throw new Error(`${this.path}: races がありません`);
		return races as YAMLSeq<YAMLMap>;
	}

	findRace(course: string, raceNumber: number): YAMLMap | undefined {
		return this.races.items.find(
			(r) => isMap(r) && r.get('course') === course && r.get('raceNumber') === raceNumber
		);
	}

	/** 無ければ末尾に足す。既にあるレースの属性は `fill`（名前などを書き換えない）。 */
	ensureRace(course: string, raceNumber: number, fields: RaceFields): YAMLMap {
		let race = this.findRace(course, raceNumber);
		if (!race) {
			race = this.doc.createNode({ course, raceNumber }) as YAMLMap;
			this.races.flow = false;
			// 末尾に足すだけ。既存のレースを並べ替えると、触っていない行まで差分に出る。
			this.races.items.push(race);
			this.dirty = true;
		}
		this.setRaceFields(race, fields, 'fill');
		return race;
	}

	setRaceFields(race: YAMLMap, fields: RaceFields, mode: Mode): void {
		if (setFields(race, fields, mode)) this.dirty = true;
		if (!race.has('entries')) {
			race.set('entries', this.doc.createNode([]));
			this.dirty = true;
		}
		sortKeys(race, RACE_KEYS);
	}

	entries(race: YAMLMap): YAMLSeq<YAMLMap> {
		let seq = race.get('entries');
		if (!isSeq(seq)) {
			seq = this.doc.createNode([]);
			race.set('entries', seq);
		}
		return seq as YAMLSeq<YAMLMap>;
	}

	/**
	 * ref が一致する行 → 無ければ ref の無い同名の行。
	 * 投入スクリプトの引き当てと同じ考え方で、名前だけで書いた行に ref を後から足せる。
	 */
	findEntry(race: YAMLMap, key: { ref?: string; name: string }): YAMLMap | undefined {
		const items = this.entries(race).items;
		return (
			(key.ref ? items.find((e) => e.get('ref') === key.ref) : undefined) ??
			items.find((e) => e.get('name') === key.name && (!e.get('ref') || !key.ref))
		);
	}

	/** 行を更新する。無ければ末尾に足す。足したかどうかを返す。 */
	upsertEntry(race: YAMLMap, fields: Fields, mode: Mode): { entry: YAMLMap; added: boolean } {
		const name = String(fields.name);
		const ref = fields.ref === undefined ? undefined : String(fields.ref);
		let entry = this.findEntry(race, { ref, name });
		const added = !entry;
		if (!entry) {
			entry = new YAMLMap();
			const seq = this.entries(race);
			seq.flow = false;
			seq.items.push(entry);
		}
		// 生年で書いてある行に age を足すと食い違いの元になるので、生年を優先する。
		const f = entry.has('birthYear') ? { ...fields, age: undefined } : fields;
		if (setFields(entry, f, added ? 'overwrite' : mode) || added) this.dirty = true;
		sortKeys(entry, ENTRY_KEYS);
		return { entry, added };
	}

	/** 馬番順（馬番が無い行は元の並びのまま後ろ）に並べ替える。 */
	sortEntries(race: YAMLMap, order?: (e: YAMLMap) => number): void {
		const seq = this.entries(race);
		const before = seq.items.slice();
		const key = order ?? ((e: YAMLMap) => Number(e.get('horseNumber') ?? 99));
		seq.items.sort((a, b) => key(a) - key(b) || before.indexOf(a) - before.indexOf(b));
		if (seq.items.some((e, i) => e !== before[i])) this.dirty = true;
	}

	/**
	 * 出走馬行を外し、`withdrawn` に移す。投入のときに DB の出走馬行が消える
	 * （付いていたメモは近況メモに移る → import-races.ts）。
	 */
	withdraw(race: YAMLMap, entry: YAMLMap): void {
		const seq = this.entries(race);
		seq.items = seq.items.filter((e) => e !== entry);

		const item: Record<string, Value> = { name: entry.get('name') as string };
		const ref = entry.get('ref') as string | undefined;
		if (ref) item.ref = ref;

		let withdrawn = race.get('withdrawn');
		if (!isSeq(withdrawn)) {
			withdrawn = this.doc.createNode([]);
			race.set('withdrawn', withdrawn);
		}
		const w = withdrawn as YAMLSeq<YAMLMap>;
		const exists = w.items.some(
			(x) => (ref && x.get('ref') === ref) || (!ref && x.get('name') === item.name)
		);
		if (!exists) w.items.push(this.doc.createNode(item) as YAMLMap);
		sortKeys(race, RACE_KEYS);
		this.dirty = true;
	}

	/** 取り下げた馬が出馬表に戻ってきたら、取り下げの一覧から外す。 */
	unwithdraw(race: YAMLMap, key: { ref?: string; name: string }): boolean {
		const w = race.get('withdrawn');
		if (!isSeq(w)) return false;
		const items = (w as YAMLSeq<YAMLMap>).items;
		const kept = items.filter(
			(x) => !((key.ref && x.get('ref') === key.ref) || x.get('name') === key.name)
		);
		if (kept.length === items.length) return false;
		if (kept.length === 0) race.delete('withdrawn');
		else (w as YAMLSeq<YAMLMap>).items = kept;
		this.dirty = true;
		return true;
	}

	get changed(): boolean {
		return this.dirty;
	}

	toString(): string {
		return this.doc.toString({ lineWidth: 0 });
	}

	async save(): Promise<boolean> {
		if (!this.dirty) return false;
		await mkdir(dirname(this.path), { recursive: true });
		await writeFile(this.path, this.toString(), 'utf8');
		this.dirty = false;
		return true;
	}
}

/** 値を書く。変わったかどうかを返す。undefined は「書かない」（既存を消さない）。 */
function setFields(map: YAMLMap, fields: Record<string, Value>, mode: Mode): boolean {
	let changed = false;
	for (const [key, value] of Object.entries(fields)) {
		if (value === undefined || value === '') continue;
		const current = map.get(key);
		if (current !== undefined && current !== null && mode === 'fill') continue;
		if (current === value) continue;
		if (QUOTED.has(key) && typeof value === 'string') {
			const s = new Scalar(value);
			s.type = Scalar.QUOTE_DOUBLE;
			map.set(key, s);
		} else {
			map.set(key, value);
		}
		changed = true;
	}
	return changed;
}

function sortKeys(map: YAMLMap, order: readonly string[]): void {
	const rank = (k: unknown) => {
		const i = order.indexOf(String(isScalar(k) ? k.value : k));
		return i < 0 ? order.length : i;
	};
	const before = map.items.slice();
	map.items.sort((a, b) => rank(a.key) - rank(b.key) || before.indexOf(a) - before.indexOf(b));
}
