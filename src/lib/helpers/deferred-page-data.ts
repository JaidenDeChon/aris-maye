import { browser } from '$app/environment';

/**
 * A value a `load` hands over either finished, or still in flight.
 */
export type Deferred<T> = T | Promise<T>;

let hydrated = false;

/**
 * Called once from the root layout, at the point the first render is on screen.
 */
export function markAppHydrated(): void {
    hydrated = true;
}

/**
 * Whether a `load` may return promises instead of finished values.
 *
 * SvelteKit holds a navigation open until every `load` for it resolves, so a page whose data
 * takes a moment leaves the reader sitting on the *previous* page for that moment — nothing
 * appears to happen when they click. Handing the component a promise instead lets the
 * navigation commit straight away, and lets the destination render its own skeletons while the
 * data lands.
 *
 * Two cases still need finished values:
 *
 * - Rendering on the server, where there is no screen to put a skeleton on. The HTML is only
 *   sent once it is complete, so deferring would ship skeletons to readers and to crawlers.
 * - Hydration, where the server already rendered the finished page. Deferring there would blank
 *   that page back out to skeletons for as long as the browser's own copy of the fetch takes.
 */
export function canDeferPageData(): boolean {
    return browser && hydrated;
}

/**
 * Whether a deferred value is still in flight, narrowing it to its promise for the callers that
 * have to branch on it.
 */
export function isPending<T>(value: Deferred<T>): value is Promise<T> {
    return typeof (value as Promise<T> | null)?.then === 'function';
}
