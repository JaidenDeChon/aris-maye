<script lang="ts">
    import { Download, Hand, Link, Maximize2, Minimize2, Palette, RotateCcw, Search, Shirt } from 'lucide-svelte';
    import { onMount, untrack } from 'svelte';
    import { toast } from 'svelte-sonner';
    import { replaceState } from '$app/navigation';
    import { page } from '$app/state';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import ColourMatch from '$lib/components/transmog/colour-match.svelte';
    import WithTooltip from '$lib/components/transmog/with-tooltip.svelte';
    import EquipmentSlots from '$lib/components/transmog/equipment-slots.svelte';
    import GenderIcon from '$lib/components/transmog/gender-icon.svelte';
    import ItemPicker from '$lib/components/transmog/item-picker.svelte';
    import OutfitCost from '$lib/components/transmog/outfit-cost.svelte';
    import SavedOutfits from '$lib/components/transmog/saved-outfits.svelte';
    import TransmogViewer from '$lib/components/transmog/transmog-viewer.svelte';
    import { Button } from '$lib/components/ui/button';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import type { Mesh } from '$lib/osrs-model/compose';
    import type { Texture } from '$lib/osrs-model/rasterizer';
    import type { Gender, WearableItem } from '$lib/osrs-model/types';
    import { canonicalUrl } from '$lib/seo/page-seo';
    import { transmogSeo } from '$lib/seo/static-page-seo';
    import { buildOutfitMesh, emoteIcon, loadTransmogData, slotSprite, type TransmogData } from '$lib/transmog/data';
    import {
        EMOTES,
        EMPTY_OUTFIT,
        equip,
        idleFor,
        isEmptyOutfit,
        outfitParams,
        unequip,
        validateOutfit,
        type Outfit,
    } from '$lib/transmog/outfit';

    const { data } = $props();

    let outfit = $state<Outfit>(untrack(() => data.outfit));
    // Loaded once and never changed in place, so no deep reactivity (5,000 items would be slow to proxy).
    let transmog = $state.raw<TransmogData | null>(null);
    let loadError = $state(false);
    let mesh = $state.raw<Mesh | null>(null);
    let textures = $state.raw<Map<number, Texture>>(new Map());
    let selectedSlot = $state<number | null>(null);
    let viewer: TransmogViewer | undefined = $state();

    onMount(() => {
        loadTransmogData()
            .then((loaded) => {
                transmog = loaded;
                outfit = validateOutfit(outfit, loaded.items);
            })
            .catch((error) => {
                console.warn('Transmog data failed to load', error);
                loadError = true;
            });
        return () => clearTimeout(urlTimer);
    });

    // Rebuild the model whenever the outfit changes. Only the newest request wins.
    let build = 0;
    $effect(() => {
        const loaded = transmog;
        const current = outfit;
        if (!loaded) return;
        const token = ++build;
        buildOutfitMesh(loaded, current)
            .then((result) => {
                if (token !== build) return;
                textures = result.textures;
                mesh = result.mesh;
            })
            .catch((error) => {
                console.warn('Outfit failed to build', error);
                if (token === build) toast.error("That outfit couldn't be loaded. Try again in a moment.");
            });
    });

    // Keep the address bar in step with the outfit, so the link always shares what's on screen.
    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    $effect(() => {
        const query = outfitParams(outfit).toString();
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            const path = location.pathname + (query ? `?${query}` : '');
            if (path === location.pathname + location.search) return;
            try {
                // The path is the address bar's own, so it's already resolved.
                // eslint-disable-next-line svelte/no-navigation-without-resolve
                replaceState(path, { ...page.state });
            } catch {
                // The router isn't ready yet; the next change writes it.
            }
        }, 250);
    });

    function pick(item: WearableItem): void {
        if (!transmog) return;
        outfit = equip(outfit, item, transmog.items);
    }

    function setGender(gender: Gender): void {
        outfit = { ...outfit, gender };
    }

    async function copyLink(): Promise<void> {
        const query = outfitParams(outfit).toString();
        const link = `${location.origin}${location.pathname}${query ? `?${query}` : ''}`;
        try {
            await navigator.clipboard.writeText(link);
            toast.success('Link copied');
        } catch {
            toast.error("Couldn't copy. Copy the address bar instead.");
        }
    }

    async function download(): Promise<void> {
        const blob = await viewer?.snapshot();
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'osrs-outfit.png';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /** Tells search engines what the page is, under the names people search for. `<` is escaped so the JSON can't close the script tag. */
    const structuredData = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'OSRS Transmog Dressing Room',
        alternateName: ['OSRS transmog', 'OSRS dressing room', 'OSRS fashionscape planner'],
        description: transmogSeo.description,
        url: canonicalUrl(transmogSeo.canonicalPath),
        applicationCategory: 'GameApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    }).replaceAll('<', '\\u003c');
    // The closing tag is split so it doesn't end this component's own <script> block.
    const structuredDataTag = `<script type="application/ld+json">${structuredData}</` + 'script>';

    const viewerActions = [
        { label: 'Reset view', icon: RotateCcw, run: () => viewer?.resetView() },
        { label: 'Download image', icon: Download, run: download },
        { label: 'Copy link', icon: Link, run: copyLink },
    ];

    const finders = [
        { value: 'search', label: 'Search', icon: Search },
        { value: 'match', label: 'Match colours', icon: Palette },
    ] as const;
    let finderMode = $state<(typeof finders)[number]['value']>('search');

    const characterTabs = [
        { value: 'equipment', label: 'Equipment', icon: Shirt },
        { value: 'emotes', label: 'Emotes', icon: Hand },
    ] as const;
    let characterTab = $state<(typeof characterTabs)[number]['value']>('equipment');

    /** The viewer is blown up to fill the window. */
    let expanded = $state(false);
    $effect(() => {
        if (!expanded) return;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => (document.body.style.overflow = overflow);
    });

    /** Height of the side-by-side row on wide screens: fills the window below the header, within reason. */
    const TALL = 'xl:h-[clamp(30rem,calc(100dvh-13rem),38rem)]';

    const genders: { value: Gender; label: string }[] = [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
    ];
</script>

{#snippet removeAll(className = '')}
    <Button
        variant="outline"
        size="sm"
        class="h-9 gap-1.5 px-2.5 {className}"
        disabled={isEmptyOutfit(outfit)}
        onclick={() => (outfit = { ...EMPTY_OUTFIT, gender: outfit.gender })}
    >
        <img src={slotSprite('removeAll')} alt="" class="h-[22px] w-[29px] [image-rendering:pixelated]" />
        Remove all
    </Button>
{/snippet}

<svelte:window onkeydown={(event) => expanded && event.key === 'Escape' && (expanded = false)} />

<SeoHead seo={transmogSeo} />
<svelte:head>
    <!-- Built from constants above, with `<` escaped, so it's safe to inline. -->
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html structuredDataTag}
</svelte:head>

<div class="content-sizing flex flex-col gap-6 pt-6 pb-10">
    <GuideHeader title="Transmog Dressing Room" answer="Try on anything in OSRS" />

    {#if loadError}
        <div class="rounded-md border bg-muted/20 p-6 text-sm text-muted-foreground">
            The outfit data isn't available right now. Please try again later.
        </div>
    {:else if !transmog}
        <div
            class="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem_16rem] xl:gap-6"
            aria-busy="true"
        >
            <Skeleton class="h-80 md:h-[26rem] {TALL}" />
            <Skeleton class="hidden md:block md:h-[26rem] {TALL}" />
            <Skeleton class="h-[32rem] md:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1 {TALL}" />
        </div>
    {:else}
        <!--
            Wide screens (xl, where the content column reaches full width): items, character and slots
            side by side at one height. Medium: character and slots over the items. Phones: one column,
            character first.
        -->
        <div
            class="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem] xl:grid-cols-[minmax(0,1fr)_18rem_16rem] xl:grid-rows-1 xl:gap-6 {TALL}"
        >
            <div
                class="relative h-80 md:col-start-1 md:row-start-1 md:h-auto md:min-h-[26rem] xl:col-start-2 xl:h-full"
            >
                {#if expanded}
                    <button
                        type="button"
                        class="fixed inset-0 z-40 cursor-default bg-black/60"
                        aria-label="Shrink the character view"
                        onclick={() => (expanded = false)}
                    ></button>
                {/if}
                <div
                    class={expanded
                        ? 'fixed inset-4 z-50 overflow-hidden rounded-lg border bg-background shadow-2xl md:inset-10'
                        : 'absolute inset-0'}
                >
                    <TransmogViewer
                        bind:this={viewer}
                        manifest={transmog.manifest}
                        {mesh}
                        {textures}
                        idle={idleFor(outfit, transmog.manifest.stances)}
                        scale={expanded ? 1 : 0.8}
                        class="h-full rounded-md border bg-[radial-gradient(ellipse_at_center,hsl(var(--primary)/0.10),transparent_70%)] {expanded
                            ? 'border-0'
                            : ''}"
                    />
                    <div
                        class="absolute top-2 left-2 flex h-8 rounded-md border bg-background/80 p-0.5 backdrop-blur"
                        role="radiogroup"
                        aria-label="Body"
                    >
                        {#each genders as option (option.value)}
                            <WithTooltip label={option.label} side="bottom">
                                {#snippet children(props)}
                                    <button
                                        {...props}
                                        type="button"
                                        role="radio"
                                        aria-checked={outfit.gender === option.value}
                                        aria-label={option.label}
                                        class="flex h-full w-7 items-center justify-center rounded-sm transition-colors {outfit.gender ===
                                        option.value
                                            ? 'bg-primary text-primary-foreground'
                                            : 'text-muted-foreground hover:text-foreground'}"
                                        onclick={() => setGender(option.value)}
                                    >
                                        <GenderIcon gender={option.value} class="size-4" />
                                    </button>
                                {/snippet}
                            </WithTooltip>
                        {/each}
                    </div>
                    <div class="absolute top-2 right-2 flex gap-1" role="toolbar" aria-label="Outfit actions">
                        {#each viewerActions as action (action.label)}
                            <WithTooltip label={action.label} side="bottom">
                                {#snippet children(props)}
                                    <Button
                                        {...props}
                                        variant="outline"
                                        class="size-8 bg-background/80 p-0 backdrop-blur"
                                        aria-label={action.label}
                                        onclick={action.run}
                                    >
                                        <action.icon class="size-4" />
                                    </Button>
                                {/snippet}
                            </WithTooltip>
                        {/each}
                        <WithTooltip label={expanded ? 'Shrink' : 'Enlarge'} side="bottom">
                            {#snippet children(props)}
                                <Button
                                    {...props}
                                    variant="outline"
                                    class="size-8 bg-background/80 p-0 backdrop-blur"
                                    aria-label={expanded ? 'Shrink the character view' : 'Enlarge the character view'}
                                    aria-pressed={expanded}
                                    onclick={() => (expanded = !expanded)}
                                >
                                    {#if expanded}
                                        <Minimize2 class="size-4" />
                                    {:else}
                                        <Maximize2 class="size-4" />
                                    {/if}
                                </Button>
                            {/snippet}
                        </WithTooltip>
                    </div>
                </div>
            </div>

            <!--
                From medium up the equipment slots and emotes share a tabbed card, like the item finder;
                on phones they're an emote menu and a strip of slots.
            -->
            <div
                class="flex min-w-0 flex-col gap-3 md:col-start-2 md:row-start-1 md:gap-0 md:overflow-hidden md:rounded-md md:border xl:col-start-3"
            >
                <div class="hidden grid-cols-2 border-b bg-muted/40 md:grid" role="tablist" aria-label="Character">
                    {#each characterTabs as tab (tab.value)}
                        <button
                            type="button"
                            role="tab"
                            aria-selected={characterTab === tab.value}
                            aria-controls="character-panel"
                            class="flex h-10 items-center justify-center gap-1.5 text-sm transition-colors {characterTab ===
                            tab.value
                                ? 'bg-background font-medium text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                                : 'text-muted-foreground hover:text-foreground'}"
                            onclick={() => (characterTab = tab.value)}
                        >
                            <tab.icon class="size-4" />
                            {tab.label}
                        </button>
                    {/each}
                </div>
                <div id="character-panel" role="tabpanel" class="hidden flex-1 flex-col gap-3 p-3 md:flex">
                    {#if characterTab === 'equipment'}
                        <div class="flex flex-1 items-center justify-center">
                            <EquipmentSlots
                                {outfit}
                                items={transmog.items}
                                selected={selectedSlot}
                                layout="grid"
                                onselect={(slot) => (selectedSlot = slot)}
                            />
                        </div>
                        {@render removeAll('w-full')}
                    {:else}
                        <div class="grid grid-cols-4 gap-1">
                            {#each EMOTES as emote (emote.key)}
                                <WithTooltip label={emote.label}>
                                    {#snippet children(props)}
                                        <button
                                            {...props}
                                            type="button"
                                            class="flex aspect-square items-center justify-center rounded-sm border bg-muted/30 hover:border-primary/60 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                                            aria-label={emote.label}
                                            onclick={() => viewer?.playEmote(emote.key)}
                                        >
                                            <img
                                                src={emoteIcon(emote.key)}
                                                alt=""
                                                width="48"
                                                height="48"
                                                class="size-9 [image-rendering:pixelated]"
                                            />
                                        </button>
                                    {/snippet}
                                </WithTooltip>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="flex gap-2 md:hidden">
                    <select
                        class="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
                        aria-label="Play an emote"
                        onchange={(event) => {
                            const key = event.currentTarget.value;
                            if (key) viewer?.playEmote(key);
                            event.currentTarget.value = '';
                        }}
                    >
                        <option value="">Play an emote…</option>
                        {#each EMOTES as emote (emote.key)}
                            <option value={emote.key}>{emote.label}</option>
                        {/each}
                    </select>
                    {@render removeAll()}
                </div>
                <div class="md:hidden">
                    <EquipmentSlots
                        {outfit}
                        items={transmog.items}
                        selected={selectedSlot}
                        layout="strip"
                        onselect={(slot) => (selectedSlot = slot)}
                    />
                </div>
            </div>

            <!-- The tabs sit on top of the panel they switch, so it's clear what they change. -->
            <div
                class="flex h-[32rem] min-w-0 flex-col overflow-hidden rounded-md border md:col-span-2 xl:col-span-1 xl:col-start-1 xl:row-start-1 xl:h-full"
            >
                <div class="grid grid-cols-2 border-b bg-muted/40" role="tablist" aria-label="Find items">
                    {#each finders as finder (finder.value)}
                        <button
                            type="button"
                            role="tab"
                            aria-selected={finderMode === finder.value}
                            aria-controls="finder-panel"
                            class="flex h-10 items-center justify-center gap-1.5 text-sm transition-colors {finderMode ===
                            finder.value
                                ? 'bg-background font-medium text-foreground shadow-[inset_0_-2px_0_hsl(var(--primary))]'
                                : 'text-muted-foreground hover:text-foreground'}"
                            onclick={() => (finderMode = finder.value)}
                        >
                            <finder.icon class="size-4" />
                            {finder.label}
                        </button>
                    {/each}
                </div>
                <div id="finder-panel" role="tabpanel" class="min-h-0 flex-1 p-3">
                    {#if finderMode === 'search'}
                        <ItemPicker
                            itemList={transmog.itemList}
                            {outfit}
                            slot={selectedSlot}
                            onpick={pick}
                            onremove={(slot) => (outfit = unequip(outfit, slot))}
                            onclearslot={() => (selectedSlot = null)}
                        />
                    {:else}
                        <ColourMatch
                            itemList={transmog.itemList}
                            items={transmog.items}
                            {outfit}
                            slot={selectedSlot}
                            onpick={pick}
                            onremove={(slot) => (outfit = unequip(outfit, slot))}
                            onclearslot={() => (selectedSlot = null)}
                        />
                    {/if}
                </div>
            </div>
        </div>

        <div class="grid gap-6 md:grid-cols-2">
            <OutfitCost {outfit} items={transmog.items} />
            <SavedOutfits
                {outfit}
                items={transmog.items}
                onload={(saved) => transmog && (outfit = validateOutfit(saved, transmog.items))}
            />
        </div>
    {/if}

    <section
        class="flex max-w-prose flex-col gap-2 text-sm text-muted-foreground"
        aria-labelledby="about-dressing-room"
    >
        <h2 id="about-dressing-room" class="font-semibold text-foreground">About the dressing room</h2>
        <p>
            This OSRS transmog dressing room lets you try on any wearable item in the game. Mix pieces from every slot
            to plan your outfit and check GE prices for your selections. Weapons are held in the standard stance for
            now.
        </p>
    </section>

    <footer class="flex max-w-prose flex-col gap-1.5 border-t pt-4 text-xs text-muted-foreground">
        <p>
            Models, textures and emotes come from the game's own files{transmog?.manifest.source.build
                ? ` (build ${transmog.manifest.source.build})`
                : ''}, via the
            <a
                href="https://archive.openrs2.org"
                class="underline underline-offset-2 hover:text-foreground"
                rel="noopener noreferrer"
                target="_blank">OpenRS2 Archive</a
            >. Colour matches come from
            <a
                href="https://scape.fashion"
                class="underline underline-offset-2 hover:text-foreground"
                rel="noopener noreferrer"
                target="_blank">scape.fashion</a
            >'s API. Weapon stances come from
            <a
                href="https://github.com/geheur/weapon-animation-replacer"
                class="underline underline-offset-2 hover:text-foreground"
                rel="noopener noreferrer"
                target="_blank">Weapon Animation Replacer</a
            >
            and
            <a
                href="https://github.com/AlterRSPS/Alter"
                class="underline underline-offset-2 hover:text-foreground"
                rel="noopener noreferrer"
                target="_blank">Alter</a
            >.
        </p>
        <p>
            Old School RuneScape and its content belong to Jagex Ltd. This site isn't made or endorsed by Jagex, OpenRS2
            or scape.fashion.
        </p>
    </footer>
</div>
