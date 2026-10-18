/**
 * What the hero character says and does. Each bit is one or more lines said in a row, one per
 * overhead message, each with an optional emote from static/hero-model/player.json. Lines use the
 * in-game "colour:effect:" prefixes.
 */
export interface ChatterLine {
    say: string;
    emote?: string;
}

export const HERO_CHATTER: ChatterLine[][] = [
    [{ say: 'Buying gf', emote: 'beckon' }],
    [{ say: 'flash1:wave:Free armour trimming!', emote: 'cheer' }],
    [
        { say: 'If u type ur pw it shows as stars', emote: 'think' },
        { say: 'hunter2', emote: 'shrug' },
        { say: 'Wait it doesnt look like stars', emote: 'panic' },
    ],
    [{ say: 'glow1:Doubling money', emote: 'beckon' }],
    [{ say: 'Selling gf 10k', emote: 'shrug' }],
    [{ say: 'wave:Dancing for money', emote: 'dance' }],
    [{ say: 'Sit', emote: 'raspberry' }],
    [{ say: 'Gz!', emote: 'clap' }],
    [{ say: 'cyan:scroll:Bank sale! Everything must go!', emote: 'jig' }],
    [{ say: 'lol noob', emote: 'laugh' }],
    [{ say: 'Plz dont pk me im poor', emote: 'panic' }],
    [{ say: 'red:shake:Run! Its a lvl 3!', emote: 'panic' }],
    [{ say: 'Buying lobbies 200 ea', emote: 'beckon' }],
    [{ say: 'Can i have free stuff pls', emote: 'bow' }],
    [{ say: 'flash2:wave2:Party at falador!', emote: 'headbang' }],
    [{ say: 'Selling rune scimmy cheap', emote: 'salute' }],
    [{ say: 'Duel me 4 my whip', emote: 'angry' }],
    [{ say: 'Bring back 2007', emote: 'cry' }],
    [{ say: 'glow3:slide:Zezima add me pls', emote: 'blowKiss' }],
    [{ say: 'Wave if ur in a cabbage patch', emote: 'wave' }],
    [{ say: 'One more log then im done', emote: 'yawn' }],
    [{ say: 'Yes', emote: 'yes' }],
    [{ say: 'No', emote: 'no' }],
    [{ say: 'Jump for joy!! 99 cooking!', emote: 'jumpForJoy' }],
    [{ say: 'green:Trimming armour 100% legit', emote: 'spin' }],
];
