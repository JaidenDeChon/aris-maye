<script lang="ts">
    import { SiKofi } from '@icons-pack/svelte-simple-icons';
    import * as Dialog from '$lib/components/ui/dialog';
    import * as Tooltip from '$lib/components/ui/tooltip';
    import { buttonVariants } from '$lib/components/ui/button';

    /**
     * A "Leave a tip" button for the bottom of the sidenav that opens Ko-fi's tip form in a dialog.
     *
     * The form is Ko-fi's donation panel embed, inside our own dialog rather than Ko-fi's floating
     * popup, which pins its own button over the sidenav footer and loads a script on every page.
     * The panel only loads once the dialog opens.
     */
    const { expanded }: { expanded: boolean } = $props();

    const KOFI_PAGE = 'jaidendechon';
    const panelUrl = `https://ko-fi.com/${KOFI_PAGE}/?hidefeed=true&widget=true&embed=true&preview=true`;

    const buttonClass =
        'text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors';
</script>

<Dialog.Root>
    {#if expanded}
        <Dialog.Trigger
            class={buttonVariants({ class: `w-full min-h-10 max-h-10 justify-center gap-2 ${buttonClass}` })}
        >
            <SiKofi size={16} color="#72a4f2" />
            <span class="text-sm">Leave a tip</span>
        </Dialog.Trigger>
    {:else}
        <Tooltip.Provider>
            <Tooltip.Root>
                <Tooltip.Trigger>
                    {#snippet child({ props })}
                        <Dialog.Trigger {...props} class={buttonVariants({ class: `h-9 w-9 p-0 ${buttonClass}` })}>
                            <SiKofi size={16} color="#72a4f2" />
                            <span class="sr-only">Leave a tip</span>
                        </Dialog.Trigger>
                    {/snippet}
                </Tooltip.Trigger>
                <Tooltip.Content side="right">Leave a tip</Tooltip.Content>
            </Tooltip.Root>
        </Tooltip.Provider>
    {/if}

    <!-- The close button sits over Ko-fi's panel, whose colours come from the Ko-fi profile rather
         than our theme, so it's a white chip with a dark X in both themes: it stands out on a dark
         panel, and its border and shadow mark it out on a light one. -->
    <Dialog.Content
        class="max-w-[420px] gap-0 overflow-hidden p-0"
        closeClass="right-3 top-3 rounded-full border border-neutral-300 bg-white p-1.5 text-neutral-900 opacity-95 shadow-md"
    >
        <Dialog.Title class="sr-only">Leave a tip</Dialog.Title>
        <Dialog.Description class="sr-only">Ko-fi's tip form, for supporting Aris Maye.</Dialog.Description>
        <!-- Ko-fi's panel embed, 4px padding on its own background. 584px fits the form with a little
             room under it (Ko-fi suggests 712px, which leaves a blank strip), capped to the screen. -->
        <iframe
            id="kofiframe"
            src={panelUrl}
            title="Leave a tip on Ko-fi"
            class="block h-[min(584px,85vh)] w-full border-0 bg-[#f9f9f9] p-1"
        ></iframe>
    </Dialog.Content>
</Dialog.Root>
