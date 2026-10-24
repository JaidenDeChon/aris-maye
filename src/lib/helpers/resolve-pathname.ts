import { resolve } from '$app/paths';
import type { Pathname, ResolvedPathname } from '$app/types';

/**
 * `resolve` for a path held in a variable. SvelteKit types `resolve` one route at a time, so a value
 * typed as the whole `Pathname` union (a nav entry, a button's `href`) won't type-check against it.
 * Every `Pathname` is a plain path with no params to fill, so passing it straight through is safe.
 */
export const resolvePathname = resolve as (path: Pathname) => ResolvedPathname;
