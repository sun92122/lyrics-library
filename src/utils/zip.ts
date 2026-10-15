/**
 * A lightweight, zero-dependency browser-compatible ZIP archive generator (PKWARE format).
 * Creates uncompressed (STORE) ZIP files with standard UTF-8 filenames and Unix permissions.
 */

export interface ZipFileEntry {
  name: string;
  data: Uint8Array | ArrayBuffer | string;
}

// Precomputed CRC-32 table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c;
}

export function crc32(data: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function getDosDateTime(d: Date = new Date()): {
  dosTime: number;
  dosDate: number;
} {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = Math.floor(d.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((Math.max(1980, year) - 1980) << 9) | (month << 5) | day;
  return { dosTime, dosDate };
}

/**
 * Creates a standard uncompressed ZIP file Uint8Array from a list of files.
 */
export function createZip(files: ZipFileEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const { dosTime, dosDate } = getDosDateTime();

  interface HeaderInfo {
    localHeader: Uint8Array;
    dataBytes: Uint8Array;
    centralHeader: Uint8Array;
  }

  const entries: HeaderInfo[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    let dataBytes: Uint8Array;
    if (typeof file.data === "string") {
      dataBytes = encoder.encode(file.data);
    } else if (file.data instanceof Uint8Array) {
      dataBytes = file.data;
    } else {
      dataBytes = new Uint8Array(file.data);
    }

    const size = dataBytes.length;
    const fileCrc = crc32(dataBytes);

    // 1. Local File Header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // General purpose bit flag (Bit 11: UTF-8)
    lv.setUint16(8, 0, true); // Compression method (0 = STORED / uncompressed)
    lv.setUint16(10, dosTime, true); // File last modification time
    lv.setUint16(12, dosDate, true); // File last modification date
    lv.setUint32(14, fileCrc, true); // CRC-32
    lv.setUint32(18, size, true); // Compressed size
    lv.setUint32(22, size, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    // 2. Central Directory Header (46 bytes + name length)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central file header signature
    cv.setUint16(4, (3 << 8) | 20, true); // Version made by (Unix, 2.0)
    cv.setUint16(6, 20, true); // Version needed to extract (2.0)
    cv.setUint16(8, 0x0800, true); // General purpose bit flag (Bit 11: UTF-8)
    cv.setUint16(10, 0, true); // Compression method (0 = STORED)
    cv.setUint16(12, dosTime, true); // File last modification time
    cv.setUint16(14, dosDate, true); // File last modification date
    cv.setUint32(16, fileCrc, true); // CRC-32
    cv.setUint32(20, size, true); // Compressed size
    cv.setUint32(24, size, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, (0o100644 << 16) >>> 0, true); // External file attributes (Unix -rw-r--r--)
    cv.setUint32(42, currentOffset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    entries.push({ localHeader, dataBytes, centralHeader });
    currentOffset += localHeader.length + size;
  }

  const centralOffset = currentOffset;
  let centralSize = 0;
  for (const entry of entries) {
    centralSize += entry.centralHeader.length;
  }

  // 3. End of Central Directory Record (EOCD, 22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // End of central dir signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Number of the disk with start of central directory
  ev.setUint16(8, files.length, true); // Total entries in the central dir on this disk
  ev.setUint16(10, files.length, true); // Total entries in the central dir
  ev.setUint32(12, centralSize, true); // Size of the central directory
  ev.setUint32(16, centralOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // ZIP file comment length

  // 4. Assemble the complete ZIP binary
  const totalLength = currentOffset + centralSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const entry of entries) {
    result.set(entry.localHeader, pos);
    pos += entry.localHeader.length;
    result.set(entry.dataBytes, pos);
    pos += entry.dataBytes.length;
  }

  for (const entry of entries) {
    result.set(entry.centralHeader, pos);
    pos += entry.centralHeader.length;
  }

  result.set(eocd, pos);
  return result;
}

/**
 * Triggers browser download of a generated ZIP file.
 */
export function downloadZip(files: ZipFileEntry[], zipFilename: string): void {
  const zipBytes = createZip(files);
  const blob = new Blob([zipBytes.buffer as ArrayBuffer], {
    type: "application/zip",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFilename.endsWith(".zip")
    ? zipFilename
    : `${zipFilename}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
