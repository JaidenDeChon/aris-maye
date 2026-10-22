<script lang="ts">
    let { children } = $props();
</script>

<div class="content-sizing flex flex-col gap-10 py-6">
    {@render children()}
</div>
