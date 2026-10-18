import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HERO_CHATTER } from './hero-chatter';
import { parseChat } from './overhead-text';
import { PlayerModel, SequencePlayer, type PlayerModelData } from './player-model';

const data = JSON.parse(
    readFileSync(join(import.meta.dir, '..', '..', '..', 'static', 'hero-model', 'player.json'), 'utf8'),
) as PlayerModelData;

describe('hero model data', () => {
    test('faces only point at vertices that exist', () => {
        const vertexCount = data.vertices.length / 3;
        expect(data.faces.length % 3).toBe(0);
        expect(data.faces.every((v) => v >= 0 && v < vertexCount)).toBe(true);
        expect(data.colors.length).toBe(data.faces.length);
        expect(data.labels.length).toBe(vertexCount);
    });

    test('every animation frame names a framemap and slots inside it', () => {
        for (const [name, animation] of Object.entries(data.animations)) {
            expect(animation.frames.length, name).toBe(animation.lengths.length);
            for (const frame of animation.frames) {
                const framemap = data.framemaps[frame[0]];
                expect(framemap, name).toBeDefined();
                for (let i = 1; i < frame.length; i += 4) {
                    expect(frame[i]).toBeLessThan(framemap.types.length);
                }
            }
        }
    });

    test('every emote the chatter asks for was extracted', () => {
        for (const line of HERO_CHATTER.flat()) {
            if (line.emote) expect(data.animations[line.emote], line.emote).toBeDefined();
        }
    });
});

describe('PlayerModel', () => {
    test('posing a frame moves vertices and posing nothing restores the bind pose', () => {
        const model = new PlayerModel(data);
        const bind = Array.from(model.y);
        model.pose(data.animations.cheer.frames[10]);
        expect(Array.from(model.y)).not.toEqual(bind);
        model.pose(null);
        expect(Array.from(model.y)).toEqual(bind);
    });

    test('the cheer emote raises the fists past the top of the head', () => {
        const model = new PlayerModel(data);
        model.pose(data.animations.idle.frames[0]);
        const idleTop = Math.min(...model.y);
        const tops = data.animations.cheer.frames.map((frame) => {
            model.pose(frame);
            return Math.min(...model.y);
        });
        // y points down, so a higher hand is a smaller y.
        expect(Math.min(...tops)).toBeLessThan(idleTop);
    });
});

describe('SequencePlayer', () => {
    const animation = { lengths: [2, 3], frames: [[0], [1]] };

    test('steps through frames by client cycle and loops', () => {
        const player = new SequencePlayer(animation);
        expect(player.current).toEqual([0]);
        player.advance(3, true);
        expect(player.current).toEqual([1]);
        player.advance(3, true);
        expect(player.current).toEqual([0]);
    });

    test('reports when a one-off run is over and holds the last frame', () => {
        const player = new SequencePlayer(animation);
        expect(player.advance(4, false)).toBe(false);
        expect(player.advance(10, false)).toBe(true);
        expect(player.current).toEqual([1]);
    });
});

describe('parseChat', () => {
    test('reads colour and effect prefixes like the chatbox', () => {
        expect(parseChat('flash1:wave:Free armour trimming!')).toEqual({
            text: 'Free armour trimming!',
            colour: 'flash1',
            effect: 'wave',
        });
        expect(parseChat('scroll:hi')).toEqual({ text: 'hi', colour: 'yellow', effect: 'scroll' });
        expect(parseChat('Buying gf')).toEqual({ text: 'Buying gf', colour: 'yellow', effect: 'none' });
    });

    test('leaves colons that are not prefixes alone', () => {
        expect(parseChat('Note: hunter2').text).toBe('Note: hunter2');
    });
});
