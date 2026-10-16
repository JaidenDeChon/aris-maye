import type { RequestHandler } from '@sveltejs/kit';
import { buildRobots } from '$lib/seo/robots';

export const GET: RequestHandler = ({ url }) =>
    new Response(buildRobots(url.host), {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=0, s-maxage=3600',
        },
    });
