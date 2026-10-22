<script lang="ts">
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import { aboutSeo } from '$lib/seo/static-page-seo';

    const credits = [
        { name: 'OSRS Wiki', href: 'https://oldschool.runescape.wiki', purpose: 'item, recipe and shop data' },
        {
            name: 'OSRS Wiki Real-time Prices',
            href: 'https://prices.runescape.wiki/osrs',
            purpose: 'Grand Exchange prices',
        },
        {
            name: 'osrsreboxed-db',
            href: 'https://github.com/0xNeffarion/osrsreboxed-db',
            purpose: 'the original item database, a fork of OSRSBox',
        },
        { name: 'Wise Old Man', href: 'https://wiseoldman.net', purpose: 'skill level imports' },
        { name: 'OpenRS2 Archive', href: 'https://archive.openrs2.org', purpose: '3D models for the dressing room' },
        { name: 'scape.fashion', href: 'https://scape.fashion', purpose: 'colour matching in the dressing room' },
    ];
</script>

<SeoHead seo={aboutSeo} />

<GuideHeader title="About Aris Maye" />

<section class="flex max-w-prose flex-col gap-4 text-base">
    <p>
        Hey, thanks for stopping in! This website, originally called GE Skiller, has been a passion project of mine
        since late 2023. The original idea was to figure out how my OSRS character could make a little more money, as it
        seemed I was always too broke to skill efficiently.
    </p>
    <p>
        The site has grown a lot since those early days, now featuring more detailed analyses of beneficial items, skill
        calculators, and (what I believe is) the only 3D model-based OSRS dressing room in existence.
    </p>
    <p>
        The site is still a work in progress and I plan to keep it free forever. If you appreciate my work and feel like
        supporting development, then thank you! There is a tip button in the website’s sidebar. Please let me know if
        you have any feedback or issues (also in the sidebar) and enjoy the site.
    </p>
    <p class="rs-font text-lg">Jaiden</p>
</section>

<GuideSection
    title="Credits"
    blurb="This site couldn’t have been possible without the continued use of some really amazing tooling:"
>
    <ul class="flex max-w-prose list-disc flex-col gap-2 pl-6 text-base">
        {#each credits as credit (credit.name)}
            <li>
                <!-- External links, which resolve() doesn't apply to. -->
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
                <a href={credit.href} target="_blank" rel="noopener" class="underline hover:text-primary"
                    >{credit.name}</a
                >: {credit.purpose}
            </li>
        {/each}
    </ul>
</GuideSection>
