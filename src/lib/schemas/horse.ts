/**
 * 馬の所属（トレセン）。netkeiba の調教師欄の頭のラベルと同じ。
 * 美浦・栗東は JRA のトレセン、地方・海外はそれ以外。画面の選択肢と札の色の判断に使う。
 */
export const TRAINING_CENTERS = ['美浦', '栗東', '地方', '海外'] as const;

export type TrainingCenter = (typeof TRAINING_CENTERS)[number];
