import { join } from 'node:path';

const root = process.cwd();

/** Where the site serves the transmog data from. Generated; ignored by git. */
export const TRANSMOG_OUT_DIR = join(root, 'static', 'transmog');

/** Survives between builds: Netlify keeps node_modules, and with it this folder. */
export const TRANSMOG_PERSIST_DIR = join(root, 'node_modules', '.cache', 'transmog');

/** Which stand animation each weapon uses (see update-stances.ts). */
export const TRANSMOG_STANCES = join(root, 'scripts', 'transmog', 'stances.json');
