import { loadGuide } from '$lib/services/guide-service.server';

export async function load({ setHeaders }) {
    return { report: await loadGuide('market', setHeaders) };
}
