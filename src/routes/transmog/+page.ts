import { parseOutfitParams } from '$lib/transmog/outfit';
import type { PageLoad } from './$types';

/** The outfit from a share link. Item ids are checked once the item list has loaded. */
export const load: PageLoad = ({ url }) => ({ outfit: parseOutfitParams(url.searchParams) });
