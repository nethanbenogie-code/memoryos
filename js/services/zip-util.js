/**
 * MemoryOS — services/zip-util.js
 *
 * A tiny, dependency-free ZIP reader/writer for a SINGLE text entry —
 * enough to compress a backup into a real .zip (openable by Windows,
 * macOS, 7-Zip, etc.) and read it back. Compression itself uses the
 * browser's native Compression Streams API (deflate-raw), so there's no
 * library to ship.
 *
 * Supported in Chrome/Edge 103+, Safari 16.4+, Firefox 113+. Where it's
 * unavailable, callers fall back to plain JSON.
 */

export function isZipSupported() {
  return typeof CompressionStream !== "undefined" &&
         typeof DecompressionStream !== "undefined";
}

/** Do these bytes start with the ZIP magic "PK\x03\x04"? */
export function looksLikeZip(arrayBufferOrBytes) {
  const b = arrayBufferOrBytes instanceof Uint8Array
    ? arrayBufferOrBytes
    : new Uint8Array(arrayBufferOrBytes);
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/* ------------------------------- CRC-32 ------------------------------- */

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (CRC_TABLE = t);
}
function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (c >>> 8) ^ t[(c ^ bytes[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

/* --------------------------- deflate (native) -------------------------- */

async function pipe(bytes, stream) {
  const writer = stream.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const reader = stream.readable.getReader();
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
const deflateRaw = (bytes) => pipe(bytes, new CompressionStream("deflate-raw"));
const inflateRaw = (bytes) => pipe(bytes, new DecompressionStream("deflate-raw"));

/* ------------------------------ ZIP write ------------------------------ */

/**
 * Build a valid single-entry ZIP as a Blob.
 * @param {string} name inner filename (e.g. "memoryos-backup.json")
 * @param {string|Uint8Array} content
 * @returns {Promise<Blob>}
 */
export async function zipSingleFile(name, content) {
  const data = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const nameBytes = new TextEncoder().encode(name);
  const crc = crc32(data);
  const comp = await deflateRaw(data);
  const METHOD = 8; // deflate

  const lfh = new Uint8Array(30 + nameBytes.length);
  const lv = new DataView(lfh.buffer);
  lv.setUint32(0, 0x04034b50, true); // local file header sig
  lv.setUint16(4, 20, true);         // version needed
  lv.setUint16(6, 0, true);          // flags
  lv.setUint16(8, METHOD, true);     // compression
  lv.setUint16(10, 0, true);         // mod time
  lv.setUint16(12, 0, true);         // mod date
  lv.setUint32(14, crc, true);
  lv.setUint32(18, comp.length, true);
  lv.setUint32(22, data.length, true);
  lv.setUint16(26, nameBytes.length, true);
  lv.setUint16(28, 0, true);         // extra len
  lfh.set(nameBytes, 30);

  const cdh = new Uint8Array(46 + nameBytes.length);
  const cv = new DataView(cdh.buffer);
  cv.setUint32(0, 0x02014b50, true); // central dir sig
  cv.setUint16(4, 20, true);         // version made by
  cv.setUint16(6, 20, true);         // version needed
  cv.setUint16(8, 0, true);          // flags
  cv.setUint16(10, METHOD, true);
  cv.setUint16(12, 0, true);
  cv.setUint16(14, 0, true);
  cv.setUint32(16, crc, true);
  cv.setUint32(20, comp.length, true);
  cv.setUint32(24, data.length, true);
  cv.setUint16(28, nameBytes.length, true);
  cv.setUint16(30, 0, true);         // extra
  cv.setUint16(32, 0, true);         // comment
  cv.setUint16(34, 0, true);         // disk
  cv.setUint16(36, 0, true);         // internal attrs
  cv.setUint32(38, 0, true);         // external attrs
  cv.setUint32(42, 0, true);         // local header offset
  cdh.set(nameBytes, 46);

  const cdSize = cdh.length;
  const cdOffset = lfh.length + comp.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central dir sig
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, 1, true);          // entries on this disk
  ev.setUint16(10, 1, true);         // total entries
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdOffset, true);
  ev.setUint16(20, 0, true);         // comment len

  return new Blob([lfh, comp, cdh, eocd], { type: "application/zip" });
}

/* ------------------------------ ZIP read ------------------------------- */

/**
 * Read the first entry of a single-file ZIP back to text. Reads via the
 * central directory, so it handles zips made by standard tools too.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<{name: string, text: string}>}
 */
export async function unzipFirstFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);

  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid zip file.");

  const cdOffset = dv.getUint32(eocd + 16, true);
  if (dv.getUint32(cdOffset, true) !== 0x02014b50) throw new Error("Corrupt zip directory.");

  const method = dv.getUint16(cdOffset + 10, true);
  const compSize = dv.getUint32(cdOffset + 20, true);
  const nameLen = dv.getUint16(cdOffset + 28, true);
  const lhOffset = dv.getUint32(cdOffset + 42, true);
  const name = new TextDecoder().decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));

  if (dv.getUint32(lhOffset, true) !== 0x04034b50) throw new Error("Corrupt zip header.");
  const lhNameLen = dv.getUint16(lhOffset + 26, true);
  const lhExtraLen = dv.getUint16(lhOffset + 28, true);
  const dataStart = lhOffset + 30 + lhNameLen + lhExtraLen;
  const comp = bytes.subarray(dataStart, dataStart + compSize);

  let raw;
  if (method === 0) raw = comp.slice();
  else if (method === 8) raw = await inflateRaw(comp);
  else throw new Error("Unsupported zip compression method.");

  return { name, text: new TextDecoder().decode(raw) };
}
