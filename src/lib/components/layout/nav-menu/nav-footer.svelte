<script lang="ts">
    import { SiGithub } from '@icons-pack/svelte-simple-icons';
    import * as Sidebar from '$lib/components/ui/sidebar';
    import * as Tooltip from '$lib/components/ui/tooltip';
    import OsrsboxItemUploadDialog from '$lib/components/dialogs/osrsbox-item-upload-dialog.svelte';
    import { Button, buttonVariants } from '$lib/components/ui/button';
    import { Info } from 'lucide-svelte';
    import { resolve } from '$app/paths';
    import FeedbackDialog from './feedback-dialog.svelte';
    import KofiTipDialog from './kofi-tip-dialog.svelte';

    const sidebar = Sidebar.useSidebar();
    const { showDevControls = false } = $props<{ showDevControls?: boolean }>();
</script>

<Sidebar.Menu class="mb-3">
    <Sidebar.MenuItem>
        <!-- Todo - Add authentication and stuff -->
        <!-- <NavUser /> -->
    </Sidebar.MenuItem>
</Sidebar.Menu>

{#if showDevControls}
    <OsrsboxItemUploadDialog
        triggerClass={buttonVariants({
            variant: 'outline',
            class:
                sidebar.open || sidebar.isMobile
                    ? 'w-full justify-center gap-2 text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors'
                    : 'h-9 w-9 p-0 text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors',
        })}
    >
        {#snippet trigger({ openDialog, triggerClass })}
            {#if sidebar.open || sidebar.isMobile}
                <Button class={triggerClass} onclick={openDialog}>
                    <img src="/other-images/inventory-backpack.png" alt="" class="size-4" />
                    <span>Add or update item</span>
                </Button>
            {:else}
                <Tooltip.Provider>
                    <Tooltip.Root>
                        <Tooltip.Trigger class={triggerClass} onclick={openDialog}>
                            <img src="/other-images/inventory-backpack.png" alt="Add or update item" class="size-4" />
                            <span class="sr-only">Add or update item</span>
                        </Tooltip.Trigger>
                        <Tooltip.Content side="right">Add or update item</Tooltip.Content>
                    </Tooltip.Root>
                </Tooltip.Provider>
            {/if}
        {/snippet}
    </OsrsboxItemUploadDialog>
{/if}

{#if sidebar.open || sidebar.isMobile}
    <div class="flex flex-col gap-2 mt-2">
        <div class="grid grid-cols-2 gap-2">
            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger
                        class={[
                            'w-full min-h-10 min-w-10 max-h-10',
                            buttonVariants({
                                class: 'p-0 text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors',
                            }),
                        ]}
                    >
                        <a href={resolve('/about')} class="h-full w-full flex items-center justify-center">
                            <Info />
                            <span class="sr-only">About</span>
                        </a>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        <p>About Aris Maye</p>
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>

            <Tooltip.Provider>
                <Tooltip.Root>
                    <Tooltip.Trigger
                        class={[
                            'w-full min-h-10 min-w-10 max-h-10',
                            buttonVariants({
                                class: 'p-0 text-foreground border border-input rounded-md bg-background/70 hover:bg-muted/55 transition-colors',
                            }),
                        ]}
                    >
                        <a
                            class="h-full w-full flex items-center justify-center"
                            href="https://github.com/JaidenDeChon/aris-maye"
                            target="_blank"
                        >
                            <SiGithub />
                            <span class="sr-only">View source on Github</span>
                        </a>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        <p>View source on GitHub</p>
                    </Tooltip.Content>
                </Tooltip.Root>
            </Tooltip.Provider>
        </div>

        <FeedbackDialog expanded />

        <KofiTipDialog expanded />
    </div>
{:else if !sidebar.open}
    <div class="flex flex-col items-center gap-2">
        <FeedbackDialog expanded={false} />

        <KofiTipDialog expanded={false} />
    </div>
{/if}
