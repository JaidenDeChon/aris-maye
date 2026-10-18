<script lang="ts">
    import type { Snippet } from 'svelte';
    import * as Table from '$lib/components/ui/table';

    /**
     * A guide's table, scrolling sideways inside its own box so a phone never scrolls the whole page.
     * With no rows it shows `empty` instead.
     */
    interface GuideTableProps {
        rowCount: number;
        empty: string;
        caption?: string;
        head: Snippet;
        children: Snippet;
    }

    const { rowCount, empty, caption, head, children }: GuideTableProps = $props();
</script>

{#if rowCount}
    <div class="min-w-0 rounded-md border">
        <Table.Root class="text-sm [&_td]:px-3 [&_td]:py-2 [&_th]:h-10 [&_th]:px-3 [&_th]:whitespace-nowrap">
            {#if caption}
                <Table.Caption class="sr-only">{caption}</Table.Caption>
            {/if}
            <Table.Header>
                <Table.Row>
                    {@render head()}
                </Table.Row>
            </Table.Header>
            <Table.Body>
                {@render children()}
            </Table.Body>
        </Table.Root>
    </div>
{:else}
    <p class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">{empty}</p>
{/if}
