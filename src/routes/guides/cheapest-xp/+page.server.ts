import { loadGuide } from '$lib/services/guide-service.server';

export async function load({ setHeaders }) {
    return { guide: await loadGuide('cheapest-xp', setHeaders) };
}
