import type { HomepageSnapshot } from '$lib/models/homepage';
import { getHomepageSnapshot } from '$lib/services/homepage-service.server';

interface HomepageData {
    imageUrl?: string;
    /** The global sections, valued for a main. Null when they couldn't be loaded. */
    snapshot: HomepageSnapshot | null;
}

const npcImages: string[] = [
    'aggie.webp',
    'aris-maye.png',
    'carpenter.webp',
    'duke-horacio.webp',
    'forestry-f.webp',
    'horvik.webp',
    'prospector-f.webp',
    'wise-old-man.png',
    'anglers-outfit.png',
    'charlie-the-tramp.png',
    'evil-chicken-outfit.webp',
    'forestry-m.webp',
    'king-narnode-shareen.webp',
    'prospector-m.webp',
    'zanik.png',
    'bob-the-cat.webp',
    'chicken-outfit.png',
    'farmer-f.png',
    'frog-price.png',
    'lumberjack-f.webp',
    'sedridor.webp',
    'captain-barnaby.png',
    'django.png',
    'farmer-m.png',
    'frog-princess.png',
    'lumberjack-m.png',
    'shayzien.png',
];

async function assembleHomepageData(): Promise<HomepageData['imageUrl']> {
    try {
        const randomImage = npcImages[Math.floor(Math.random() * npcImages.length)];
        return `/npc-images/${randomImage}`;
    } catch {
        // Fallback to a default image.
        return '/npc-images/aris-maye.png';
    }
}

async function loadSnapshot(): Promise<HomepageSnapshot | null> {
    try {
        return await getHomepageSnapshot(false);
    } catch (error) {
        // The hero and FAQ still work without the data sections, so a failure here shouldn't take
        // the whole homepage down.
        console.error('Failed to load homepage snapshot:', error);
        return null;
    }
}

export async function load(): Promise<HomepageData> {
    const [imageUrl, snapshot] = await Promise.all([assembleHomepageData(), loadSnapshot()]);
    return { imageUrl, snapshot };
}
