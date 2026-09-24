interface HomepageData {
    imageUrl?: string;
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

export async function load(): Promise<HomepageData> {
    const imageUrl = await assembleHomepageData();
    return { imageUrl };
}
