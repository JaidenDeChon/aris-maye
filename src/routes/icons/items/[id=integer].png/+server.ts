import type { RequestHandler } from '@sveltejs/kit';
import { decodeIcon } from '$lib/helpers/icon-to-data-uri';
import { OsrsboxItemModel } from '$lib/models/mongo-schemas/osrsbox-db-item-schema';

/**
 * An item's icon as an image file, for lists too long to inline every icon as a data URI (the
 * calculators list up to 241 items). Icons almost never change, so the CDN keeps each one for a
 * year, shared across regions (`durable`). A deploy clears it, and the `?v=` the pages link with
 * (`ITEM_ICON_VERSION`) can force a refresh.
 */
export const GET: RequestHandler = async ({ params }) => {
    const item = await OsrsboxItemModel.findOne({ id: Number(params.id) }, { _id: 0, icon: 1 })
        .lean<{ icon?: string | null }>()
        .exec();
    const icon = decodeIcon(item?.icon);
    if (!icon) return new Response('Icon not found.', { status: 404 });

    return new Response(icon.bytes as Uint8Array<ArrayBuffer>, {
        headers: {
            'Content-Type': icon.contentType,
            'Cache-Control': 'public, max-age=86400',
            'Netlify-CDN-Cache-Control': 'public, max-age=31536000, durable',
        },
    });
};
