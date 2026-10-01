<script lang="ts">
    import { onMount } from 'svelte';
    import * as Tabs from '$lib/components/ui/tabs';
    import HomeStatStrip from './home-stat-strip.svelte';
    import ForYouSection from './for-you-section.svelte';
    import MakeNowSection from './make-now-section.svelte';
    import SkillEarnersSection from './skill-earners-section.svelte';
    import AlchXpSection from './alch-xp-section.svelte';
    import { activeIsIronman } from '$lib/stores/character-store.svelte';
    import { timeSince } from '$lib/helpers/time-since';
    import type { HomepageSnapshot } from '$lib/models/homepage';

    /**
     * Everything between the hero and the FAQ.
     *
     * On wide screens each section is its own band. On phones the same sections fold into one
     * tabbed card so the page doesn't scroll forever. The server renders the sections valued for a
     * main; an Ironman profile swaps in the Ironman values once the browser knows about it.
     */
    const { snapshot: mainSnapshot }: { snapshot: HomepageSnapshot | null } = $props();

    let ironmanSnapshot = $state<HomepageSnapshot | null>(null);
    const ironman = $derived(activeIsIronman());
    const snapshot = $derived(ironman && ironmanSnapshot ? ironmanSnapshot : mainSnapshot);

    $effect(() => {
        if (!ironman || ironmanSnapshot) return;
        const controller = new AbortController();
        fetch('/api/homepage?ironman=1', { signal: controller.signal })
            .then((response) => (response.ok ? (response.json() as Promise<HomepageSnapshot>) : null))
            .then((data) => {
                if (data) ironmanSnapshot = data;
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') console.error('Failed to load Ironman homepage data', error);
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
    let mounted = $state(false);
    onMount(() => (mounted = true));
    const updatedAgo = $derived(mounted && snapshot ? timeSince(Math.floor(snapshot.computedAt / 1000)) : null);
</script>

{#if snapshot}
    <div class="content-sizing flex flex-col gap-10 md:gap-14">
        <div class="flex flex-col gap-3">
            <HomeStatStrip {snapshot} />
            <p class="text-xs text-muted-foreground">
                From hourly GE prices{updatedAgo ? `, worked out ${updatedAgo}` : ''}{snapshot.ironman
                    ? '. Valued for Ironmen'
                    : ''}.
            </p>
        </div>

        <ForYouSection />

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
    </div>
{/if}
