/**
 * shadcn-svelte が要求するヘルパー。
 *
 * `shadcn-svelte add` が生成するコンポーネントは `$lib/utils.js` から
 * `cn` と型ヘルパーを import するので、このパスに置く必要がある。
 *
 * **アプリ固有のヘルパーはここではなく `$lib/utils/` 配下**（date.ts / note.ts /
 * redirect.ts）に置く。ファイルとディレクトリが同名で紛らわしいが、
 * こうしておくと今後 `shadcn-svelte add` を実行しても手直しが要らない。
 */
export { cn } from 'cn';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
