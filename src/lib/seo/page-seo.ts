import { SITE_URL } from './site-url';

export type RobotsDirective = 'index' | 'noindex';

/** Everything a page says about itself to search engines and link previews. */
export type PageSeo = {
    title: string;
    description: string;
    canonicalPath: string;
    robots: RobotsDirective;
    image?: string;
    imageAlt?: string;
};

export const DEFAULT_SHARE_IMAGE = '/other-images/share-thumb.png';
export const DEFAULT_SHARE_IMAGE_ALT =
    'Aris Maye, an Old School RuneScape fortune-teller. Find the best things to make using your skill levels. Powered by real-time GE prices.';

/**
 * The path a page should be known by. Query strings carry filters and fragments carry scroll
 * position, so neither makes a different page.
 */
export function canonicalPath(path: string): string {
    const bare = path.split(/[?#]/)[0] ?? '';
    const rooted = bare.startsWith('/') ? bare : `/${bare}`;
    const trimmed = rooted.replace(/\/+$/, '');
    return trimmed || '/';
}

export function canonicalUrl(path: string, base: string = SITE_URL): string {
    const normalized = canonicalPath(path);
    return normalized === '/' ? `${base}/` : `${base}${normalized}`;
}

export function robotsContent(robots: RobotsDirective): string {
    return robots === 'index' ? 'index, follow' : 'noindex, follow';
}
