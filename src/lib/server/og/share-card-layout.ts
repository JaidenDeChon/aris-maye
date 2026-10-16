import type { ShareCard, ShareCardSegment } from '$lib/seo/share-card';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '$lib/seo/share-image';
import type { ScaledIcon } from './pixel-icon';

/**
 * The item share image, drawn to match the homepage one (`static/other-images/share-thumb.png`).
 * The colours and positions were measured from that image; the item's icon, in a gold glow,
 * takes the place of Aris Maye.
 */

const COLORS = {
    background: '#14100b',
    stripe: 'rgba(255, 236, 190, 0.016)',
    frameOuter: '#634e15',
    frameInner: '#3a2e11',
    eyebrow: '#cba24a',
    title: '#f7c227',
    titleShadow: '#020201',
    body: '#f3ede1',
    chipBackground: '#251d0c',
    chipBorder: '#665015',
    chipText: '#e4c878',
} as const;

const LEFT = 112;
const TEXT_WIDTH = 520;
const ICON_CENTER_X = 925;

/** A satori element. Satori takes plain objects shaped like React elements, so no JSX is needed. */
type Node = {
    type: string;
    props: { style?: Record<string, unknown>; children?: unknown; src?: string; width?: number; height?: number };
};

function el(type: string, style: Record<string, unknown>, children?: unknown): Node {
    return { type, props: { style, children } };
}

/**
 * The largest title size that fits the name in two lines.
 *
 * The RuneScape font averages about 0.37em per character in lowercase and up to 0.47em in
 * capitals ("Aris Maye" is 370px wide at 88px). 0.42em leaves room for capital-heavy names, and
 * line breaks are estimated the way satori makes them, word by word.
 */
export function titleFontSize(name: string): number {
    const words = name.split(/\s+/).filter(Boolean);
    for (const size of [88, 76, 64, 56, 48]) {
        const perChar = size * 0.42;
        let lines = 1;
        let width = 0;
        for (const word of words) {
            const wordWidth = word.length * perChar;
            const next = width === 0 ? wordWidth : width + perChar + wordWidth;
            if (next <= TEXT_WIDTH) {
                width = next;
            } else {
                lines += 1;
                width = wordWidth;
            }
        }
        if (lines <= 2 && words.every((word) => word.length * perChar <= TEXT_WIDTH)) return size;
    }
    return 40;
}

/**
 * Splits the sentence into words, each a list of styled pieces.
 *
 * Satori can't flow text across differently styled spans, so the sentence is laid out as a
 * wrapping row of words instead. Splitting at spaces rather than at style changes keeps
 * punctuation with the word before it ("XP" then ".") so a line never starts with a full stop.
 */
export function sentenceWords(sentence: ShareCardSegment[]): ShareCardSegment[][] {
    const words: ShareCardSegment[][] = [];
    let current: ShareCardSegment[] = [];
    for (const segment of sentence) {
        segment.text.split(/( +)/).forEach((part) => {
            if (/^ +$/.test(part)) {
                if (current.length) words.push(current);
                current = [];
            } else if (part) {
                current.push({ text: part, strong: segment.strong });
            }
        });
    }
    if (current.length) words.push(current);
    return words;
}

function frame(inset: number, width: number, color: string, radius: number): Node {
    return el('div', {
        position: 'absolute',
        top: inset,
        left: inset,
        right: inset,
        bottom: inset,
        border: `${width}px solid ${color}`,
        borderRadius: radius,
    });
}

function chip(label: string): Node {
    return el(
        'div',
        {
            display: 'flex',
            padding: '5px 16px 6px',
            background: COLORS.chipBackground,
            border: `1px solid ${COLORS.chipBorder}`,
            borderRadius: 5,
            color: COLORS.chipText,
            fontFamily: 'Inter',
            fontWeight: 700,
            fontSize: 17,
        },
        label,
    );
}

function iconArt(icon: ScaledIcon | null): Node[] {
    const glow = el('div', {
        position: 'absolute',
        left: ICON_CENTER_X - 330,
        top: SHARE_CARD_HEIGHT / 2 - 330,
        width: 660,
        height: 660,
        backgroundImage:
            'radial-gradient(circle at center, rgba(247, 194, 39, 0.26) 0%, rgba(247, 194, 39, 0.1) 38%, rgba(247, 194, 39, 0) 68%)',
    });
    if (!icon) return [glow];

    const image: Node = {
        type: 'img',
        props: {
            src: icon.uri,
            width: icon.width,
            height: icon.height,
            style: {
                position: 'absolute',
                left: ICON_CENTER_X - icon.width / 2,
                top: SHARE_CARD_HEIGHT / 2 - icon.height / 2,
            },
        },
    };
    return [glow, image];
}

export function shareCardLayout(card: ShareCard, icon: ScaledIcon | null): Node {
    const titleSize = titleFontSize(card.name);

    const text = el(
        'div',
        {
            position: 'absolute',
            left: LEFT,
            top: 0,
            bottom: 0,
            width: TEXT_WIDTH,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
        },
        [
            el(
                'div',
                {
                    color: COLORS.eyebrow,
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: 4.5,
                },
                'OLD SCHOOL RUNESCAPE',
            ),
            el(
                'div',
                {
                    marginTop: 26,
                    color: COLORS.title,
                    fontFamily: 'RuneScape',
                    fontSize: titleSize,
                    lineHeight: 1.05,
                    textShadow: `${Math.round(titleSize / 22)}px ${Math.round(titleSize / 22)}px 0 ${COLORS.titleShadow}`,
                },
                card.name,
            ),
            el(
                'div',
                {
                    display: 'flex',
                    flexWrap: 'wrap',
                    columnGap: 7,
                    marginTop: 34,
                    color: COLORS.body,
                    fontFamily: 'Inter',
                    fontWeight: 500,
                    fontSize: 26,
                    lineHeight: 1.55,
                },
                sentenceWords(card.sentence).map((word) =>
                    el(
                        'div',
                        { display: 'flex' },
                        word.map((piece) =>
                            el('span', piece.strong ? { color: COLORS.title, fontWeight: 700 } : {}, piece.text),
                        ),
                    ),
                ),
            ),
            el('div', { display: 'flex', gap: 12, marginTop: 30 }, card.chips.map(chip)),
        ],
    );

    const site = el(
        'div',
        {
            position: 'absolute',
            right: 52,
            bottom: 44,
            color: COLORS.eyebrow,
            fontFamily: 'RuneScape',
            fontSize: 26,
        },
        'aris-maye.com',
    );

    return el(
        'div',
        {
            position: 'relative',
            display: 'flex',
            width: SHARE_CARD_WIDTH,
            height: SHARE_CARD_HEIGHT,
            backgroundColor: COLORS.background,
            backgroundImage: `repeating-linear-gradient(45deg, ${COLORS.stripe} 0px, ${COLORS.stripe} 1px, transparent 1px, transparent 6px)`,
        },
        [...iconArt(icon), frame(15, 2, COLORS.frameOuter, 6), frame(22, 1, COLORS.frameInner, 4), text, site],
    );
}
