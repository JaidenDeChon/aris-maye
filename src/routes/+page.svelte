<script lang="ts">
    import SiteHero from '$lib/components/homepage/site-hero.svelte';
    import SiteFaq from '$lib/components/global/site-faq.svelte';
    import HomeSections from '$lib/components/homepage/home-sections.svelte';

    export let data;
</script>

<SiteHero bgUrl={data.imageUrl} />

<div class="pb-16">
    <HomeSections snapshot={data.snapshot} />
</div>

<SiteFaq />
