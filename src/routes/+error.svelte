<script lang="ts">
    import PageTitle from '$lib/components/global/page-title.svelte';
    import { page } from '$app/state';
    import { resolve } from '$app/paths';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import type { PageSeo } from '$lib/seo/page-seo';

    // The layout no longer sets a title, so without this a 404 would show the bare URL in the tab.
    const seo: PageSeo = $derived({
        title: page.status === 404 ? 'Page not found · Aris Maye' : 'Something went wrong · Aris Maye',
        description:
            'Browse OSRS items on Aris Maye to see live GE prices, recipes and profit for everything you can make.',
        canonicalPath: page.url.pathname,
        robots: 'noindex',
    });
</script>

<SeoHead {seo} />

<div class="content-sizing py-16 text-center">
    <PageTitle class="mb-2">{page.status}</PageTitle>
    <p class="text-muted-foreground mb-6">
        {page.status === 404 ? "We couldn't find that page." : (page.error?.message ?? 'Something went wrong.')}
    </p>
    <a href={resolve('/items')} class="text-primary underline underline-offset-4">Browse items</a>
</div>
