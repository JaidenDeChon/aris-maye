/**
 * Reads groups out of a live Old School RuneScape cache from the OpenRS2 Archive
 * (https://archive.openrs2.org).
 *
 * The whole cache is downloaded once as the archive's disk.zip (one ~190MB request rather than
 * thousands of small ones), unpacked into a temporary directory, and read the way the client reads
 * its own files: main_file_cache.idx<N> points at chains of 520-byte sectors in main_file_cache.dat2.
 *
 * Runs on plain Node (the Netlify build) as well as Bun, with no command-line tools: the zip is read
 * here and bzip2 groups go through seek-bzip.
 */
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, inflateRawSync } from 'node:zlib';
import Bunzip from 'seek-bzip';
import { Buffer } from './buffer';

const ARCHIVE = 'https://archive.openrs2.org';

export interface CacheSource {
    /** OpenRS2's id for this cache. */
    id: number;
    /** The game build (revision) it was taken from. */
    build: number;
    timestamp: string;
}

interface OpenRs2Cache {
    id: number;
    game: string;
    environment: string;
    language: string;
    builds: { major: number; minor: number | null }[];
    timestamp: string | null;
}

/** The newest live, English OSRS cache the archive holds. */
export async function latestOsrsCache(): Promise<CacheSource> {
    const response = await fetch(`${ARCHIVE}/caches.json`);
    if (!response.ok) throw new Error(`caches.json: HTTP ${response.status}`);
    const caches = (await response.json()) as OpenRs2Cache[];
    const live = caches
        .filter((c) => c.game === 'oldschool' && c.environment === 'live' && c.language === 'en' && c.timestamp)
        .sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1));
    const newest = live.at(-1);
    if (!newest) throw new Error('No live OSRS cache found on OpenRS2');
    return { id: newest.id, build: newest.builds[0]?.major ?? 0, timestamp: newest.timestamp! };
}

/** Downloads and unpacks a cache into `dir`, returning the folder holding main_file_cache.dat2. */
export async function downloadDiskCache(cacheId: number, dir: string): Promise<string> {
    const cacheDir = join(dir, 'cache');
    if (existsSync(join(cacheDir, 'main_file_cache.dat2'))) return cacheDir;
    mkdirSync(dir, { recursive: true });
    const url = `${ARCHIVE}/caches/runescape/${cacheId}/disk.zip`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    unzip(new Uint8Array(await response.arrayBuffer()), dir);
    if (!existsSync(join(cacheDir, 'main_file_cache.dat2')))
        throw new Error('disk.zip had no cache/main_file_cache.dat2');
    return cacheDir;
}

/**
 * Writes every file in a zip archive under `dir`. Handles stored and deflated entries and the
 * zip64 fields large archives use; that covers what OpenRS2 serves.
 */
export function unzip(zip: Uint8Array, dir: string): void {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // The end-of-central-directory record is in the last 64KB (it can be followed by a comment).
    let eocd = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
        if (view.getUint32(i, true) === 0x06054b50) {
            eocd = i;
            break;
        }
    }
    if (eocd < 0) throw new Error('Not a zip file');
    let entries = view.getUint16(eocd + 10, true);
    let directory = view.getUint32(eocd + 16, true);
    const locator = eocd - 20;
    if (
        (entries === 0xffff || directory === 0xffffffff) &&
        locator >= 0 &&
        view.getUint32(locator, true) === 0x07064b50
    ) {
        const zip64 = Number(view.getBigUint64(locator + 8, true));
        entries = Number(view.getBigUint64(zip64 + 32, true));
        directory = Number(view.getBigUint64(zip64 + 48, true));
    }

    let p = directory;
    for (let n = 0; n < entries; n++) {
        if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip central directory');
        const method = view.getUint16(p + 10, true);
        let compressedSize = view.getUint32(p + 20, true);
        let size = view.getUint32(p + 24, true);
        const nameLength = view.getUint16(p + 28, true);
        const extraLength = view.getUint16(p + 30, true);
        const commentLength = view.getUint16(p + 32, true);
        let localOffset = view.getUint32(p + 42, true);
        const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLength));
        // Zip64 extra field: the 64-bit values appear in this order, only for the fields maxed out above.
        for (let e = p + 46 + nameLength; e < p + 46 + nameLength + extraLength; ) {
            const id = view.getUint16(e, true);
            const length = view.getUint16(e + 2, true);
            if (id === 0x0001) {
                let q = e + 4;
                if (size === 0xffffffff) {
                    size = Number(view.getBigUint64(q, true));
                    q += 8;
                }
                if (compressedSize === 0xffffffff) {
                    compressedSize = Number(view.getBigUint64(q, true));
                    q += 8;
                }
                if (localOffset === 0xffffffff) localOffset = Number(view.getBigUint64(q, true));
            }
            e += 4 + length;
        }
        p += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith('/')) continue;
        if (name.split('/').includes('..')) throw new Error(`Unsafe path in zip: ${name}`);
        const dataStart =
            localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
        const raw = zip.subarray(dataStart, dataStart + compressedSize);
        let data: Uint8Array;
        if (method === 0) data = raw;
        else if (method === 8) data = new Uint8Array(inflateRawSync(raw));
        else throw new Error(`Unsupported zip compression ${method} for ${name}`);
        if (data.length !== size) throw new Error(`Zip entry ${name} is the wrong size`);
        const path = join(dir, ...name.split('/'));
        mkdirSync(join(path, '..'), { recursive: true });
        writeFileSync(path, data);
    }
}

/** Unpacks a JS5 container: one compression byte, the lengths, then the (possibly compressed) data. */
export function decompressContainer(raw: Uint8Array): Uint8Array {
    const stream = new Buffer(raw);
    const compression = stream.readUnsignedByte();
    const compressedLength = stream.readInt();
    if (compression === 0) return raw.slice(5, 5 + compressedLength);

    const decompressedLength = stream.readInt();
    const payload = raw.slice(9, 9 + compressedLength);
    let data: Uint8Array;
    if (compression === 1) {
        // Jagex strips the "BZh1" magic from their bzip2 streams.
        const withHeader = new Uint8Array(payload.length + 4);
        withHeader.set([0x42, 0x5a, 0x68, 0x31]);
        withHeader.set(payload, 4);
        data = new Uint8Array(Bunzip.decode(globalThis.Buffer.from(withHeader)));
    } else if (compression === 2) {
        data = new Uint8Array(gunzipSync(payload));
    } else {
        throw new Error(`Unknown container compression ${compression}`);
    }
    if (data.length !== decompressedLength) {
        throw new Error(`Container length mismatch: ${data.length} != ${decompressedLength}`);
    }
    return data;
}

/** Parses an index's reference table (index 255). Mirrors RuneLite's IndexData.load. */
function parseReferenceTable(data: Uint8Array): Map<number, number[]> {
    const stream = new Buffer(data);
    const protocol = stream.readUnsignedByte();
    if (protocol < 5 || protocol > 7) throw new Error(`Unsupported reference table protocol ${protocol}`);
    if (protocol >= 6) stream.readInt();
    const flags = stream.readUnsignedByte();
    const named = (flags & 1) !== 0;
    const sized = (flags & 4) !== 0;
    const readCount = () => (protocol >= 7 ? stream.readBigSmart() : stream.readUnsignedShort());

    const count = readCount();
    const ids: number[] = [];
    let last = 0;
    for (let i = 0; i < count; i++) ids.push((last += readCount()));
    if (named) stream.skip(count * 4);
    stream.skip(count * 4); // crc
    if (sized) stream.skip(count * 8);
    stream.skip(count * 4); // revision
    const fileCounts = ids.map(() => readCount());
    const groups = new Map<number, number[]>();
    ids.forEach((id, i) => {
        const files: number[] = [];
        let lastFile = 0;
        for (let f = 0; f < fileCounts[i]; f++) files.push((lastFile += readCount()));
        groups.set(id, files);
    });
    return groups;
}

/** Splits a group into its files. Mirrors RuneLite's ArchiveFiles.loadContents. */
function splitGroup(data: Uint8Array, fileIds: number[]): Map<number, Uint8Array> {
    const files = new Map<number, Uint8Array>();
    if (fileIds.length === 1) return files.set(fileIds[0], data);
    const filesCount = fileIds.length;
    const chunks = data[data.length - 1];
    const stream = new Buffer(data);
    stream.offset = data.length - 1 - chunks * filesCount * 4;
    const chunkSizes: number[][] = fileIds.map(() => []);
    const fileSizes = fileIds.map(() => 0);
    for (let chunk = 0; chunk < chunks; chunk++) {
        let chunkSize = 0;
        for (let id = 0; id < filesCount; id++) {
            chunkSize += stream.readInt();
            chunkSizes[id][chunk] = chunkSize;
            fileSizes[id] += chunkSize;
        }
    }
    const contents = fileSizes.map((size) => new Uint8Array(size));
    const written = fileIds.map(() => 0);
    let offset = 0;
    for (let chunk = 0; chunk < chunks; chunk++) {
        for (let id = 0; id < filesCount; id++) {
            const size = chunkSizes[id][chunk];
            contents[id].set(data.subarray(offset, offset + size), written[id]);
            written[id] += size;
            offset += size;
        }
    }
    fileIds.forEach((fileId, i) => files.set(fileId, contents[i]));
    return files;
}

const SECTOR_SIZE = 520;

/** A cache on disk in the client's own .dat2/.idx layout. */
export class DiskCache {
    private readonly dat: number;
    private readonly datSize: number;
    private readonly indexes = new Map<number, Uint8Array>();
    private readonly tables = new Map<number, Map<number, number[]>>();

    constructor(readonly dir: string) {
        this.dat = openSync(join(dir, 'main_file_cache.dat2'), 'r');
        this.datSize = fstatSync(this.dat).size;
    }

    close(): void {
        closeSync(this.dat);
    }

    private index(index: number): Uint8Array {
        let data = this.indexes.get(index);
        if (!data) {
            data = new Uint8Array(readFileSync(join(this.dir, `main_file_cache.idx${index}`)));
            this.indexes.set(index, data);
        }
        return data;
    }

    /** The raw container for a group, following its sector chain through the .dat2 file. */
    private readContainer(index: number, group: number): Uint8Array | null {
        const idx = this.index(index);
        if ((group + 1) * 6 > idx.length) return null;
        const p = group * 6;
        const size = (idx[p] << 16) | (idx[p + 1] << 8) | idx[p + 2];
        let sector = (idx[p + 3] << 16) | (idx[p + 4] << 8) | idx[p + 5];
        if (size <= 0 || sector <= 0) return null;

        const out = new Uint8Array(size);
        const extended = group > 0xffff;
        const headerSize = extended ? 10 : 8;
        const block = new Uint8Array(SECTOR_SIZE);
        let read = 0;
        for (let chunk = 0; read < size; chunk++) {
            if (sector * SECTOR_SIZE >= this.datSize) throw new Error(`Sector out of range for ${index}/${group}`);
            readSync(this.dat, block, 0, SECTOR_SIZE, sector * SECTOR_SIZE);
            const header = new Buffer(block);
            const headerGroup = extended ? header.readInt() : header.readUnsignedShort();
            const headerChunk = header.readUnsignedShort();
            const next = header.readUnsignedMedium();
            const headerIndex = header.readUnsignedByte();
            if (headerGroup !== group || headerChunk !== chunk || headerIndex !== index) {
                throw new Error(`Corrupt sector chain for ${index}/${group}`);
            }
            const n = Math.min(SECTOR_SIZE - headerSize, size - read);
            out.set(block.subarray(headerSize, headerSize + n), read);
            read += n;
            sector = next;
        }
        return out;
    }

    /** A group's decompressed bytes, or null if it doesn't exist. */
    group(index: number, group: number): Uint8Array | null {
        const raw = this.readContainer(index, group);
        return raw ? decompressContainer(raw) : null;
    }

    /** Every file in a group, keyed by file id. */
    files(index: number, group: number): Map<number, Uint8Array> {
        let table = this.tables.get(index);
        if (!table) {
            table = parseReferenceTable(this.group(255, index)!);
            this.tables.set(index, table);
        }
        const fileIds = table.get(group);
        const data = fileIds && this.group(index, group);
        if (!fileIds || !data) throw new Error(`Index ${index} has no group ${group}`);
        return splitGroup(data, fileIds);
    }
}
