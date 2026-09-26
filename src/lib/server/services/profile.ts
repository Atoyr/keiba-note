import { eq } from 'drizzle-orm';
import type { Db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';

export async function getPublicName(db: Db, viewerId: string): Promise<string | null> {
	const [row] = await db
		.select({ publicName: user.publicName })
		.from(user)
		.where(eq(user.id, viewerId));
	return row?.publicName ?? null;
}

export async function setPublicName(db: Db, viewerId: string, publicName: string): Promise<void> {
	await db
		.update(user)
		.set({ publicName: publicName || null, updatedAt: Math.floor(Date.now() / 1000) })
		.where(eq(user.id, viewerId));
}
