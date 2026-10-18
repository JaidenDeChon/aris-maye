/**
 * Overhead chat, drawn the way the game draws a player's public chat: yellow text with a one-pixel
 * black shadow over the head, for 150 client cycles, with the optional colour and effect prefixes
 * players type (e.g. "flash1:wave:Buying gf").
 *
 * Text is rendered with the site's RuneScape font into a small offscreen canvas, then cut to hard
 * one-bit edges before it's copied into the model's pixel buffer, so it scales up as crisply as the
 * game's bitmap fonts.
 */

export const OVERHEAD_CYCLES = 150;

export type ChatColour =
    | 'yellow'
    | 'red'
    | 'green'
    | 'cyan'
    | 'purple'
    | 'white'
    | 'flash1'
    | 'flash2'
    | 'flash3'
    | 'glow1'
    | 'glow2'
    | 'glow3';
export type ChatEffect = 'none' | 'wave' | 'wave2' | 'shake' | 'scroll' | 'slide';

export interface OverheadMessage {
    text: string;
    colour: ChatColour;
    effect: ChatEffect;
}

const COLOURS = new Set<string>([
    'yellow',
    'red',
    'green',
    'cyan',
    'purple',
    'white',
    'flash1',
    'flash2',
    'flash3',
    'glow1',
    'glow2',
    'glow3',
]);
const EFFECTS = new Set<string>(['wave', 'wave2', 'shake', 'scroll', 'slide']);

/** Splits "colour:effect:text" the way the chatbox does; either prefix may be left out. */
export function parseChat(input: string): OverheadMessage {
    let text = input;
    let colour: ChatColour = 'yellow';
    let effect: ChatEffect = 'none';
    const first = text.indexOf(':');
    if (first > 0 && COLOURS.has(text.slice(0, first))) {
        colour = text.slice(0, first) as ChatColour;
        text = text.slice(first + 1);
    }
    const second = text.indexOf(':');
    if (second > 0 && EFFECTS.has(text.slice(0, second))) {
        effect = text.slice(0, second) as ChatEffect;
        text = text.slice(second + 1);
    }
    return { text, colour, effect };
}

/** The colour for this cycle, as 0xRRGGBB. Mirrors the client's overhead chat colour switch. */
function colourAt(colour: ChatColour, cycle: number): number {
    switch (colour) {
        case 'red':
            return 0xff0000;
        case 'green':
            return 0x00ff00;
        case 'cyan':
            return 0x00ffff;
        case 'purple':
            return 0xff00ff;
        case 'white':
            return 0xffffff;
        case 'flash1':
            return cycle % 20 < 10 ? 0xff0000 : 0xffff00;
        case 'flash2':
            return cycle % 20 < 10 ? 0x0000ff : 0x00ffff;
        case 'flash3':
            return cycle % 20 < 10 ? 0x00b000 : 0x80ff80;
        case 'glow1': {
            const t = cycle % 150;
            if (t < 50) return 0xff0000 + t * 0x500;
            if (t < 100) return 0xffff00 - (t - 50) * 0x50000;
            return 0x00ff00 + (t - 100) * 5;
        }
        case 'glow2': {
            const t = cycle % 150;
            if (t < 50) return 0xff0000 + t * 5;
            if (t < 100) return 0xff00ff - (t - 50) * 0x50000;
            return 0x0000ff + (t - 100) * 0x50000 - (t - 100) * 5;
        }
        case 'glow3': {
            const t = cycle % 150;
            if (t < 50) return 0xffffff - t * 0x50005;
            if (t < 100) return 0x00ff00 + (t - 50) * 0x50005;
            return 0xffffff - (t - 100) * 0x50000;
        }
        default:
            return 0xffff00;
    }
}

export class OverheadText {
    private readonly canvas: HTMLCanvasElement | OffscreenCanvas;
    private readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    constructor(
        readonly width: number,
        readonly height: number,
        private readonly font = '16px RuneScape',
    ) {
        this.canvas =
            typeof OffscreenCanvas !== 'undefined'
                ? new OffscreenCanvas(width, height)
                : Object.assign(document.createElement('canvas'), { width, height });
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    }

    /**
     * Draws a message centred on x with its baseline at y into an RGBA pixel buffer.
     * `age` is how many cycles the message has been up; `cycle` is the global client cycle.
     */
    draw(pixels: Uint32Array, message: OverheadMessage, x: number, y: number, age: number, cycle: number): void {
        const { ctx, width, height } = this;
        ctx.clearRect(0, 0, width, height);
        ctx.font = this.font;
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#fff';

        const { text, effect } = message;
        const textWidth = Math.round(ctx.measureText(text).width);
        const remaining = OVERHEAD_CYCLES - age;
        let left = x - (textWidth >> 1);

        if (effect === 'scroll') {
            // Scrolls right to left through a window 100 pixels wide, as in game.
            const shift = Math.trunc(((textWidth + 100) * age) / OVERHEAD_CYCLES);
            ctx.save();
            ctx.beginPath();
            ctx.rect(x - 50, 0, 100, height);
            ctx.clip();
            ctx.fillText(text, x + 50 - shift, y);
            ctx.restore();
        } else if (effect === 'slide') {
            // Drops in from above, sits, then slides back up as it expires.
            let dy = 0;
            if (age < 25) dy = age - 25;
            else if (remaining < 25) dy = 25 - remaining;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, y - 14, width, 18);
            ctx.clip();
            ctx.fillText(text, left, y + dy);
            ctx.restore();
        } else if (effect === 'none') {
            ctx.fillText(text, left, y);
        } else {
            const shake = Math.max(0, 7 - (OVERHEAD_CYCLES - remaining) / 8);
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                let dx = 0;
                let dy = 0;
                if (effect === 'wave') dy = Math.sin(i / 2 + cycle / 5) * 2;
                else if (effect === 'wave2') {
                    dx = Math.sin(i / 5 + cycle / 5) * 2;
                    dy = Math.sin(i / 3 + cycle / 5) * 2;
                } else if (effect === 'shake') dy = Math.sin(i / 1.5 + cycle) * shake;
                ctx.fillText(ch, Math.round(left + dx), Math.round(y + dy));
                left += ctx.measureText(ch).width;
            }
        }

        const mask = ctx.getImageData(0, 0, width, height).data;
        const rgb = colourAt(message.colour, cycle);
        // Little-endian RGBA, as the model buffer stores it.
        const fill = 0xff000000 | ((rgb & 0xff) << 16) | (rgb & 0xff00) | ((rgb >> 16) & 0xff);
        const shadow = 0xff000000;
        for (let py = height - 2; py >= 0; py--) {
            for (let px = width - 2; px >= 0; px--) {
                if (mask[(py * width + px) * 4 + 3] >= 128) pixels[(py + 1) * width + px + 1] = shadow;
            }
        }
        for (let i = 0; i < width * height; i++) {
            if (mask[i * 4 + 3] >= 128) pixels[i] = fill;
        }
    }
}
