<script lang="ts">
    import { onMount, untrack } from 'svelte';
    import { replaceState } from '$app/navigation';
    import { page } from '$app/state';
    import SeoHead from '$lib/components/global/seo-head.svelte';
    import RelatedCalculators from '$lib/components/calculators/related-calculators.svelte';
    import GuideHeader from '$lib/components/guides/guide-header.svelte';
    import GuideSection from '$lib/components/guides/guide-section.svelte';
    import { Input } from '$lib/components/ui/input';
    import { Label } from '$lib/components/ui/label';
    import { Switch } from '$lib/components/ui/switch';
    import { GE_TAX_CAP, GE_TAX_RATE } from '$lib/constants/ge-tax';
    import { MAX_CASH, geTaxParams, geTaxResult, type GeTaxInput } from '$lib/helpers/ge-tax-calculator';
    import { geTaxCalculatorSeo } from '$lib/seo/calculator-seo';

    const { data } = $props();

    // Seeded from the URL the server read.
    let input = $state<GeTaxInput>(untrack(() => data.input));
    const result = $derived(geTaxResult(input));

    let urlTimer: ReturnType<typeof setTimeout> | undefined;
    function update(next: Partial<GeTaxInput>) {
        input = { ...input, ...next };
        clearTimeout(urlTimer);
        urlTimer = setTimeout(() => {
            const query = geTaxParams(input).toString();
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
    }

    onMount(() => () => clearTimeout(urlTimer));

    /** A whole number from a box, clamped, or null when it's empty or not a number. */
    function readBox(event: Event & { currentTarget: HTMLInputElement }, min: number): number | null {
        const raw = event.currentTarget.value.replaceAll(',', '').trim();
        const value = Number(raw);
        if (raw === '' || !Number.isFinite(value)) return null;
        return Math.min(MAX_CASH, Math.max(min, Math.floor(value)));
    }

    const gp = (value: number) => `${value.toLocaleString('en-US')} gp`;
    const percent = `${GE_TAX_RATE * 100}%`;
</script>

<SeoHead seo={geTaxCalculatorSeo} />

<GuideHeader title="GE tax calculator" answer="Calculate profits after GE tax." />

<section class="flex min-w-0 flex-col gap-4 rounded-md border bg-muted/20 p-4" aria-label="Your sale">
    <div class="grid gap-4 sm:grid-cols-3">
        <div class="flex flex-col gap-2">
            <Label for="tax-price">Sell price each</Label>
            <Input
                id="tax-price"
                type="number"
                inputmode="numeric"
                min="0"
                value={input.price}
                oninput={(event) => {
                    const price = readBox(event, 0);
                    if (price !== null) update({ price });
                }}
                class="tabular-nums"
            />
        </div>
        <div class="flex flex-col gap-2">
            <Label for="tax-qty">Quantity</Label>
            <Input
                id="tax-qty"
                type="number"
                inputmode="numeric"
                min="1"
                value={input.quantity}
                oninput={(event) => {
                    const quantity = readBox(event, 1);
                    if (quantity !== null) update({ quantity });
                }}
                class="tabular-nums"
            />
        </div>
        <div class="flex flex-col gap-2">
            <Label for="tax-buy">Buy price each (optional)</Label>
            <Input
                id="tax-buy"
                type="number"
                inputmode="numeric"
                min="0"
                placeholder="To work out profit"
                value={input.buy ?? ''}
                oninput={(event) => update({ buy: readBox(event, 0) })}
                class="tabular-nums"
            />
        </div>
    </div>
    <div class="flex items-center gap-2">
        <Switch id="tax-bond" checked={input.bond} onCheckedChange={(bond: boolean) => update({ bond })} />
        <Label for="tax-bond" class="cursor-pointer text-sm select-none">It's an Old School bond</Label>
    </div>

    <dl class="grid gap-3 text-sm sm:grid-cols-4" data-testid="tax-results">
        <div class="flex flex-col gap-0.5">
            <dt class="text-muted-foreground">Tax each</dt>
            <dd class="text-xl font-semibold tabular-nums" data-testid="tax-each">{gp(result.taxEach)}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
            <dt class="text-muted-foreground">Total tax</dt>
            <dd class="text-xl font-semibold tabular-nums" data-testid="tax-total">{gp(result.totalTax)}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
            <dt class="text-muted-foreground">You receive</dt>
            <dd class="text-xl font-semibold tabular-nums" data-testid="tax-received">{gp(result.received)}</dd>
        </div>
        {#if result.profit !== null}
            <div class="flex flex-col gap-0.5">
                <dt class="text-muted-foreground">Profit after tax</dt>
                <dd
                    class="text-xl font-semibold tabular-nums {result.profit >= 0
                        ? 'text-emerald-500'
                        : 'text-red-500'}"
                    data-testid="tax-profit"
                >
                    {gp(result.profit)}
                </dd>
            </div>
        {/if}
    </dl>
</section>

<GuideSection title="How GE tax works">
    <ul class="flex max-w-prose list-disc flex-col gap-1 pl-5 text-sm">
        <li>The seller pays {percent} of the sale price, rounded down, on each item.</li>
        <li>Anything that sells for under 50 gp is tax-free.</li>
        <li>The tax on one item never goes over {gp(GE_TAX_CAP)}.</li>
        <li>Old School bonds are tax-free.</li>
    </ul>
</GuideSection>

<RelatedCalculators current="ge-tax" />
