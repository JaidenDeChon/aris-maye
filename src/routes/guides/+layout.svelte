<script lang="ts">
    let { children } = $props();
</script>

<div class="w-full min-w-0 px-4 py-6 sm:px-6 lg:px-8">
    <div class="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-10">
        {@render children()}
    </div>
</div>
