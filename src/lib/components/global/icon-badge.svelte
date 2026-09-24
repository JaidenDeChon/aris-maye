<script lang="ts">
    import { Badge } from '../ui/badge';
    import type { Snippet } from 'svelte';

    const { icon, text, secondaryText }: { icon: Snippet; text?: string; secondaryText?: string } = $props();
</script>

<Badge class="gap-2" variant="outline">
    {@render icon()}
    {text}
    <span class="text-xs opacity-50">{secondaryText}</span>
</Badge>
