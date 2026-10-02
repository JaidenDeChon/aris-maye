<script lang="ts">
    import { SiKofi } from '@icons-pack/svelte-simple-icons';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Tooltip from '$lib/components/ui/tooltip';
    import { buttonVariants } from '$lib/components/ui/button';

    /**
     * A "Tip me" button for the bottom of the sidenav that opens Ko-fi's tip form in a dialog.
     *
     * This is the same page Ko-fi's floating-chat overlay script shows in its popup, without the
     * script itself: that pins its own button to the bottom-left of the screen, right over the
     * sidenav footer, and loads a third-party script on every page. The form only loads once the
     * dialog opens.
     */
    const { expanded }: { expanded: boolean } = $props();

    const KOFI_PAGE = 'jaidendechon';
    const formUrl = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true`;

    const buttonClass =
        'text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors';
</script>

<Dialog.Root>
    {#if expanded}
        <Dialog.Trigger
            class={buttonVariants({ class: `w-full min-h-10 max-h-10 justify-center gap-2 ${buttonClass}` })}
        >
            <SiKofi size={16} color="#72a4f2" />
            <span class="text-sm">Tip me on Ko-fi</span>
        </Dialog.Trigger>
    {:else}
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Dialog.Trigger {...props} class={buttonVariants({ class: `h-9 w-9 p-0 ${buttonClass}` })}>
                            <SiKofi size={16} color="#72a4f2" />
                            <span class="sr-only">Tip me on Ko-fi</span>
                        </Dialog.Trigger>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Tip me on Ko-fi</Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    {/if}

    <Dialog.Content class="max-w-[420px] gap-0 overflow-hidden p-0">
        <Dialog.Title class="sr-only">Tip me on Ko-fi</Dialog.Title>
        <Dialog.Description class="sr-only">Ko-fi's tip form, for supporting Aris Maye.</Dialog.Description>
        <iframe src={formUrl} title="Tip me on Ko-fi" class="block h-[min(630px,85vh)] w-full border-0 bg-[#f9f9f9]"
        ></iframe>
    </Dialog.Content>
</Dialog.Root>
