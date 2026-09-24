<script lang="ts">
    import FavoriteButton from './favorite-button.svelte';
    import HideButton from './hide-button.svelte';
    import * as Avatar from '$lib/components/ui/avatar';
    import { Skeleton } from '$lib/components/ui/skeleton';
    import { timeSince } from '$lib/helpers/time-since';
    import { formatWithCommas } from '$lib/helpers/format-number';
    import type { IGameItem } from '$lib/models/game-item';
    import { iconToDataUri } from '$lib/helpers/icon-to-data-uri';
    import { resolve } from '$app/paths';

    const headerTextDivClasses = 'flex-1 flex flex-col mb-2 text-sm';

    const emptyGameItem: IGameItem = {
        id: -1,
        name: '',
        icon: '',
        examine: '',
        wikiName: '',
        cost: -1,
        highalch: -1,
        lowalch: -1,
        incomplete: false,
        members: false,
        tradeable: false,
        buyLimit: -1,
        highPrice: -1,
        highTime: -1,
        lowPrice: -1,
        lowTime: -1,
    };

    const {
        item = emptyGameItem,
        loading = false,
        linkToItemPage = false,
        allowFavorite = true,
        allowHide = true,
        showProfit = false,
        profitContext = 'Profit',
        ironman = false,
    } = $props<{
        item?: IGameItem;
        loading?: boolean;
        linkToItemPage?: boolean;
        allowFavorite?: boolean;
        allowHide?: boolean;
        showProfit?: boolean;
        profitContext?: string;
        ironman?: boolean;
    }>();

    let timeSincePriceTime = $state('Calculating...');
    const iconSrc = $derived(iconToDataUri(item.icon));
    const priceValue = $derived(resolveDisplayPrice(item));
    const hasPrice = $derived(priceValue !== null);
    const formattedPrice = $derived(hasPrice ? formatWithCommas(priceValue!) : '—');
    // Why a price is missing. Untradeables reach the browse list under Ironman mode, and a bare dash
    // with no explanation reads as broken data rather than as a fact about the item.
    const missingPriceReason = $derived.by(() => {
        if (hasPrice) return null;
        if (ironman) return 'No sell value';
        if (item.tradeable_on_ge === false) return 'Not tradeable';
        return 'No recent trades';
    });
    // Where an Ironman value came from. Shop names join this once shop data is scraped.
    const valueSourceLabel = $derived(ironman && hasPrice ? 'High alch' : null);
    const priceTime = $derived(resolveDisplayTime(item));
    const profitValue = $derived(resolveProfit(item));
    const hasProfit = $derived(typeof profitValue === 'number' && Number.isFinite(profitValue));
    const formattedProfit = $derived(
        hasProfit ? `${profitValue! >= 0 ? '+' : ''}${formatWithCommas(Math.round(profitValue!))}` : '—',
    );
    const profitPercent = $derived(resolveProfitPercent(item));
    const formattedProfitPercent = $derived(formatProfitPercent(profitPercent));
    const investmentValue = $derived(resolveInvestment(item));
    const hasInvestment = $derived(investmentValue !== null);
    const formattedInvestment = $derived(hasInvestment ? formatWithCommas(Math.round(investmentValue!)) : '—');

    $effect(() => {
        if (priceTime) timeSincePriceTime = timeSince(priceTime);
        else timeSincePriceTime = '';
    });

    function resolveDisplayPrice(item: IGameItem): number | null {
        // An Ironman cannot realise a Grand Exchange price, so showing one as the headline number
        // states a value they can never get. The server sends what they can actually clear.
        const price = ironman ? item.ironmanExitValue : (item.highPrice ?? item.lowPrice ?? null);
        if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
        return price;
    }

    function resolveDisplayTime(item: IGameItem): number | null {
        const high = item.highPrice;
        if (typeof high === 'number' && Number.isFinite(high) && high > 0) {
            const highTime = item.highTime;
            if (typeof highTime === 'number' && Number.isFinite(highTime) && highTime > 0) return highTime;
        }

        const low = item.lowPrice;
        if (typeof low === 'number' && Number.isFinite(low) && low > 0) {
            const lowTime = item.lowTime;
            if (typeof lowTime === 'number' && Number.isFinite(lowTime) && lowTime > 0) return lowTime;
        }

        return null;
    }

    function resolveProfit(item: IGameItem): number | null {
        const profit = item.creationProfit;
        if (typeof profit !== 'number' || !Number.isFinite(profit)) return null;
        return profit;
    }

    /** The gp that has to be fronted to create the item, i.e. the cost of its ingredients. */
    function resolveInvestment(item: IGameItem): number | null {
        const cost = item.creationCost;
        if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) return null;
        return cost;
    }

    function resolveProfitPercent(item: IGameItem): number | null {
        const profit = item.creationProfit;
        const cost = item.creationCost;
        if (typeof profit !== 'number' || !Number.isFinite(profit)) return null;
        if (typeof cost !== 'number' || !Number.isFinite(cost) || cost <= 0) return null;
        return (profit / cost) * 100;
    }

    function formatProfitPercent(value: number | null): string | null {
        if (value === null) return null;
        const sign = value > 0 ? '+' : '';
        return `${sign}${value.toFixed(1)}%`;
    }
</script>

{#snippet itemCardHeaderContent()}
    <span class="font-medium animate-fade-in">{item.name}</span>
    <span class="text-muted-foreground animate-fade-in">{item.examine}</span>
{/snippet}

<div class="item-card custom-card group flex h-full flex-col">
    <!-- Header -->
    <header class="flex justify-between gap-6 group/header">
        {#if loading}
            <div class={headerTextDivClasses}>
                <Skeleton class="h-4 w-1/3 mb-1" />
                <Skeleton class="h-4 w-3/5" />
            </div>
            <Skeleton class="rounded-full size-12" />
        {:else if linkToItemPage}
            <a
                href={resolve(`/items/${item.id}`)}
                class="flex justify-between gap-6 w-full items-start"
                data-sveltekit-preload-data="hover"
            >
                <div class="group-hover/header:underline {headerTextDivClasses}">
                    {@render itemCardHeaderContent()}
                </div>
                <Avatar.Root class="p-2 bg-muted border item-card__img-background h-12 w-12">
                    <Avatar.Image src={iconSrc} class="item-card__image object-contain animate-fade-in" />
                    <Avatar.Fallback class="animate-fade-in">{item.name}</Avatar.Fallback>
                </Avatar.Root>
            </a>
        {:else}
            <div class={headerTextDivClasses}>
                {@render itemCardHeaderContent()}
            </div>
            <Avatar.Root class="p-2 bg-muted border item-card__img-background h-12 w-12">
                <Avatar.Image src={iconSrc} class="item-card__image object-contain animate-fade-in" />
                <Avatar.Fallback class="animate-fade-in">{item.name}</Avatar.Fallback>
            </Avatar.Root>
        {/if}
    </header>

    <!-- Body -->
    <div class="flex justify-between items-end gap-4 mt-auto pt-4">
        <div>
            {#if loading}
                <Skeleton class="h-5 w-24 mb-3 mt-2" />
                <Skeleton class="h-2 w-12" />
            {:else}
                <p class="text-2xl font-bold animate-fade-in">
                    <span class="text-primary">{formattedPrice}</span>{#if hasPrice}gp{/if}
                </p>
                {#if valueSourceLabel}
                    <p class="text-muted-foreground text-xs animate-fade-in">
                        {valueSourceLabel}
                    </p>
                {:else if priceTime && !ironman}
                    <p class="text-muted-foreground text-xs animate-fade-in">
                        {timeSincePriceTime}
                    </p>
                {:else if missingPriceReason}
                    <p class="text-muted-foreground text-xs animate-fade-in">
                        {missingPriceReason}
                    </p>
                {/if}
                {#if showProfit && hasProfit}
                    <p class="text-xs animate-fade-in">
                        <span class="text-muted-foreground">{profitContext}:</span>
                        <span class={profitValue! >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                            {formattedProfit} gp
                            {#if formattedProfitPercent}
                                <span class="text-muted-foreground">({formattedProfitPercent})</span>
                            {/if}
                        </span>
                    </p>
                {/if}
                {#if showProfit && hasInvestment}
                    <p class="text-xs animate-fade-in">
                        <span class="text-muted-foreground">Investment required:</span>
                        <span>
                            <span aria-hidden="true">≤</span>
                            <span class="sr-only">at most</span>
                            {formattedInvestment}gp
                        </span>
                    </p>
                {/if}
            {/if}
        </div>
        {#if !loading}
            <div class="flex items-center gap-2 ml-auto">
                {#if allowHide}
                    <HideButton gameItem={item} />
                {/if}
                {#if allowFavorite}
                    <FavoriteButton gameItem={item} />
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .item-card :global(header img) {
        filter: drop-shadow(2px 2px 5px rgba(0, 0, 0, 0.4));
    }
</style>
