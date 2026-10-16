<script lang="ts">
    import { page } from '$app/state';
    import {
        DEFAULT_SHARE_IMAGE,
        DEFAULT_SHARE_IMAGE_ALT,
        canonicalUrl,
        robotsContent,
        type PageSeo,
    } from '$lib/seo/page-seo';
    import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '$lib/seo/share-image';

    /**
     * The tags a page uses to describe itself to search engines and link previews. Each page
     * renders exactly one; the layout keeps only the tags that are the same everywhere.
     */
    const { seo }: { seo: PageSeo } = $props();

    const url = $derived(canonicalUrl(seo.canonicalPath));
    // The image comes from whichever host served the page, unlike the canonical URL. A deploy
    // preview's item images don't exist on aris-maye.com until they're merged.
    const image = $derived(`${page.url.origin}${seo.image ?? DEFAULT_SHARE_IMAGE}`);
    const imageAlt = $derived(seo.imageAlt ?? DEFAULT_SHARE_IMAGE_ALT);
</script>

<svelte:head>
    <title>{seo.title}</title>
    <meta name="description" content={seo.description} />
    <link rel="canonical" href={url} />
    <meta name="robots" content={robotsContent(seo.robots)} />

    <meta property="og:title" content={seo.title} />
    <meta property="og:description" content={seo.description} />
    <meta property="og:url" content={url} />
    <meta property="og:image" content={image} />
    <meta property="og:image:alt" content={imageAlt} />
    <!-- The default image and every generated one are this size. Stating it lets Discord and
         Facebook lay out the embed before the image has downloaded. -->
    <meta property="og:image:width" content={String(SHARE_CARD_WIDTH)} />
    <meta property="og:image:height" content={String(SHARE_CARD_HEIGHT)} />

    <meta name="twitter:title" content={seo.title} />
    <meta name="twitter:description" content={seo.description} />
    <meta name="twitter:image" content={image} />
    <meta name="twitter:image:alt" content={imageAlt} />
</svelte:head>
