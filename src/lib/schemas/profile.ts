import * as v from 'valibot';

export const publicNameSchema = v.object({
	publicName: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(30, '公開用の名前は30文字以内で入力してください')
	)
});
