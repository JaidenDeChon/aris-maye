<script lang="ts">
    import { onMount } from 'svelte';
    import * as Tabs from '$lib/components/ui/tabs';
    import HomeStatStrip from './home-stat-strip.svelte';
    import ForYouSection from './for-you-section.svelte';
    import MakeNowSection from './make-now-section.svelte';
    import SkillEarnersSection from './skill-earners-section.svelte';
    import AlchXpSection from './alch-xp-section.svelte';
    import HomeSectionsSkeleton from './home-sections-skeleton.svelte';
    import { activeIsIronman } from '$lib/stores/character-store.svelte';
    import { timeSince } from '$lib/helpers/time-since';
    import type { HomepageSnapshot } from '$lib/models/homepage';

    /**
     * Everything between the hero and the FAQ.
     *
     * On wide screens each section is its own band. On phones the same sections fold into one
     * tabbed card so the page doesn't scroll forever.
     *
     * The server sends the sections valued for a main when it has them quickly. When it doesn't,
     * the page arrives with a skeleton and the browser fetches them. An Ironman profile always
     * fetches its own values, with the skeleton up until they land, so a main's numbers never
     * flash past.
     */
    const { snapshot: serverSnapshot }: { snapshot: HomepageSnapshot | null } = $props();

    let fetchedMain = $state<HomepageSnapshot | null>(null);
    let ironmanSnapshot = $state<HomepageSnapshot | null>(null);
    let failed = $state(false);
    let mounted = $state(false);
    onMount(() => (mounted = true));

    // Before mount the profile isn't readable yet, so the server's render (a main's view) stands.
    const ironman = $derived(mounted && activeIsIronman());
    const mainSnapshot = $derived(serverSnapshot ?? fetchedMain);
    const snapshot = $derived(ironman ? ironmanSnapshot : mainSnapshot);

    $effect(() => {
        if (!mounted || snapshot || failed) return;
        const wantIronman = ironman;
        const controller = new AbortController();
        fetch(wantIronman ? '/api/homepage?ironman=1' : '/api/homepage', { signal: controller.signal })
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<HomepageSnapshot>;
            })
            .then((data) => {
                if (wantIronman) ironmanSnapshot = data;
                else fetchedMain = data;
            })
            .catch((error) => {
                if (error?.name === 'AbortError') return;
                console.error('Failed to load homepage data', error);
                failed = true;
            });
        return () => controller.abort();
    });

    const tabs = $derived([
        { value: 'make', label: 'Make' },
        { value: 'skills', label: 'By skill' },
        { value: 'xp', label: snapshot && !snapshot.ironman && snapshot.alchPicks.length ? 'Alch & XP' : 'XP' },
    ]);
    let activeTab = $state('make');

    // Worked out in the browser so the server's clock and time zone never leak into the page.
    const updatedAgo = $derived(mounted && snapshot ? timeSince(Math.floor(snapshot.computedAt / 1000)) : null);
</script>

<!-- If the data can't be loaded at all, the sections step aside and the hero and FAQ carry on. -->
<div class="content-sizing flex flex-col gap-10 md:gap-14">
    {#if snapshot || !failed}
        <div class="flex flex-col gap-2 pt-8 md:gap-3 md:pt-0">
            {#if snapshot}
                <HomeStatStrip {snapshot} />
                <!-- Kept in the layout before the time is known so the page doesn't shift when it appears. -->
                <p class="min-h-4 text-xs text-muted-foreground">{updatedAgo ?? ''}</p>
            {:else}
                <HomeSectionsSkeleton part="strip" />
            {/if}
        </div>
    {/if}

    <ForYouSection />

    {#if snapshot}
        <!-- Wide screens: one band per section. -->
        <div class="hidden flex-col gap-14 md:flex">
            <MakeNowSection {snapshot} />
            <SkillEarnersSection {snapshot} />
            <AlchXpSection {snapshot} />
        </div>

        <!-- Phones: the same sections as tabs. -->
        <div class="md:hidden">
            <Tabs.Root bind:value={activeTab} class="flex flex-col gap-4">
                <Tabs.List class="grid w-full grid-cols-3">
                    {#each tabs as tab (tab.value)}
                        <Tabs.Trigger value={tab.value}>{tab.label}</Tabs.Trigger>
                    {/each}
                </Tabs.List>
                <Tabs.Content value="make"><MakeNowSection {snapshot} compact /></Tabs.Content>
                <Tabs.Content value="skills"><SkillEarnersSection {snapshot} compact /></Tabs.Content>
                <Tabs.Content value="xp"><AlchXpSection {snapshot} compact /></Tabs.Content>
            </Tabs.Root>
        </div>
    {:else if !failed}
        <HomeSectionsSkeleton part="bands" />
    {/if}
</div>
