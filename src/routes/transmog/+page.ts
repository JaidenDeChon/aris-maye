import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** The dressing room used to live here; keep links shared from that address working. */
export const load: PageLoad = ({ url }) => {
    redirect(308, `/transmog-dressing-room${url.search}`);
};
