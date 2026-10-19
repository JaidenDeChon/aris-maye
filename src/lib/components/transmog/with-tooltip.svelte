<script lang="ts">
    /** Gives an icon-only control a tooltip. Spread the props it passes onto the control. */
    import type { Snippet } from 'svelte';
    import * as Tooltip from '$lib/components/ui/tooltip';

    interface Props {
        label: string;
        side?: 'top' | 'right' | 'bottom' | 'left';
        children: Snippet<[Record<string, unknown>]>;
    }

    const { label, side = 'top', children }: Props = $props();
</script>

<!-- The app's sidebar provider sets the timing for every tooltip. -->
<Tooltip.Root>
    <Tooltip.Trigger>
        {#snippet child({ props })}
            {@render children(props)}
        {/snippet}
    </Tooltip.Trigger>
    <Tooltip.Content {side}>{label}</Tooltip.Content>
</Tooltip.Root>
