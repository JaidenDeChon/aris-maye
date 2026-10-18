import { parseGeTaxInput } from '$lib/helpers/ge-tax-calculator';

export function load({ url }) {
    // Read on the server so a shared link, and a crawler, gets the same results.
    return { input: parseGeTaxInput(url.searchParams) };
}
