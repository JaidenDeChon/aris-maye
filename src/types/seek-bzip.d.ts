declare module 'seek-bzip' {
    const Bunzip: {
        /** Decompresses a whole bzip2 stream (including its "BZh" header). */
        decode(input: Buffer | Uint8Array, output?: Buffer, multistream?: boolean): Buffer;
    };
    export default Bunzip;
}
