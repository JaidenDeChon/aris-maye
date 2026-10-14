<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import { homeSeo } from '$lib/seo/static-page-seo';
    import SiteHero from '$lib/components/homepage/site-hero.svelte';
    import SiteFaq from '$lib/components/global/site-faq.svelte';
    import HomeSections from '$lib/components/homepage/home-sections.svelte';

    export let data;
</script>

<SeoHead seo={homeSeo} />

<SiteHero bgUrl={data.imageUrl} />

<div class="pb-16">
    <HomeSections snapshot={data.snapshot} />
</div>

<SiteFaq />
