import * as v from 'valibot';
import { horseTraitTagsSchema } from './horse.ts';
import { bodySchema } from './note.ts';

/**
 * 馬の特徴メモ（画面の言葉は「メモ」。1人・1頭につき1本）。本文も札も空なら「消す」。馬は URL から取るので、ここでは運ばない。
 *
 * **`horse.ts` に置かない。** `horse.ts` は投入のスクリプト（`scripts/import-races.ts`。Node で直に動かす）も読むので、
 * 拡張子の無い import を連ねる `note.ts` を読み込むと `data:check` が落ちる。
 */
export const horseTraitSchema = v.object({ body: bodySchema, tags: horseTraitTagsSchema });
