<script lang="ts">
    import { buttonVariants } from '$lib/components/ui/button';
    import CharacterStatsDialogButton from '../dialogs/character-stats-dialog.svelte';
    import { resolve } from '$app/paths';
    const { bgUrl } = $props();

    // The NPC fades in once it has loaded rather than popping in, so a slow image never leaves a
    // blank gap that snaps to a picture.
    let npcLoaded = $state(false);

    /** Marks the image loaded, including one that finished before the page hydrated. */
    function fadeInWhenLoaded(image: HTMLImageElement) {
        const done = () => (npcLoaded = true);
        if (image.complete && image.naturalWidth > 0) done();
        else image.addEventListener('load', done, { once: true });
        return () => image.removeEventListener('load', done);
    }
</script>

<div class="py-32 relative overflow-hidden">
    <div class="content-sizing relative flex flex-col justify-center items-start gap-6 z-20">
        <!-- Background effect with image and glow -->
        <div
            class="h-96 w-96 rounded-full bg-primary absolute top-full right-1/4 translate-x-1/2 -translate-y-1/2 z-0 blur-3xl scale-150 opacity-5 xl:opacity-15"
        ></div>
        {#if bgUrl}
            <img
                src={bgUrl}
                data-hero-npc
                alt="randomly-selected background"
                {@attach fadeInWhenLoaded}
                class="w-64 absolute top-1/3 right-1/4 translate-x-1/2 -translate-y-1/4 z-10 transition-opacity duration-500 {npcLoaded
                    ? 'opacity-15 xl:opacity-100'
                    : 'opacity-0'}"
            />
        {/if}

        <h1 class="rs-font-with-shadow dark:rs-font text-5xl md:text-6xl text-primary">Aris Maye</h1>

        <div class="text-lg flex flex-col gap-1 z-20">
            <span>
                Find the most profitable items to
                <span
                    class="text-primary font-extrabold inline-flex flex-col h-[calc(theme(fontSize.base)*theme(lineHeight.tight))] md:h-[calc(theme(fontSize.base)*theme(lineHeight.tight))] overflow-hidden"
                >
                    <ul class="animate-text-slide-8 block text-left leading-tight [&_li]:block">
                        <li>craft</li>
                        <li>smith</li>
                        <li>fletch</li>
                        <li>steal</li>
                        <li>mine</li>
                        <li>farm</li>
                        <li>cook</li>
                        <li>brew</li>
                        <li aria-hidden="true">craft</li>
                    </ul>
                </span>
                using your own skill levels
            </span>

            <p class="text-muted-foreground">Powered by hourly GE prices</p>
        </div>

        <div class="flex flex-col gap-3 md:flex-row z-30">
            <CharacterStatsDialogButton triggerClass={buttonVariants({ variant: 'default' })}>
                {#snippet trigger()}
                    <img src="/skill-images/skills.png" alt="OSRS skills icon" class="w-6 h-6" />
                    <span class="rs-font text-xl">Enter your skill levels</span>
                {/snippet}
            </CharacterStatsDialogButton>

            <a href={resolve('/items')} class={buttonVariants({ variant: 'outline' })}>
                <img src="/other-images/inventory-backpack.png" alt="Inventory backpack" class="w-6 h-6" />
                <span class="rs-font text-xl">Start browsing items</span>
            </a>
        </div>
    </div>
</div>
