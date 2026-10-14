/** Минимальный zip без сжатия («store») — чтобы отдать проект одним файлом */

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  content: string;
}

export function makeZip(entries: readonly ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const u16 = (v: DataView, o: number, n: number) => v.setUint16(o, n, true);
  const u32 = (v: DataView, o: number, n: number) => v.setUint32(o, n >>> 0, true);

  for (const e of entries) {
    const name = enc.encode(e.name);
    const data = enc.encode(e.content);
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20); // версия для распаковки
    u16(lv, 6, 0x0800); // имена в UTF-8
    u16(lv, 8, 0); // без сжатия
    u16(lv, 10, 0);
    u16(lv, 12, 0x21); // дата 1980-01-01
    u32(lv, 14, crc);
    u32(lv, 18, data.length);
    u32(lv, 22, data.length);
    u16(lv, 26, name.length);
    u16(lv, 28, 0);
    local.set(name, 30);
    parts.push(local, data);

    const rec = new Uint8Array(46 + name.length);
    const cv = new DataView(rec.buffer);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20);
    u16(cv, 6, 20);
    u16(cv, 8, 0x0800);
    u16(cv, 10, 0);
    u16(cv, 12, 0);
    u16(cv, 14, 0x21);
    u32(cv, 16, crc);
    u32(cv, 20, data.length);
    u32(cv, 24, data.length);
    u16(cv, 28, name.length);
    u32(cv, 38, 0o100644 << 16); // права rw-r--r--
    u32(cv, 42, offset);
    rec.set(name, 46);
    central.push(rec);
    offset += local.length + data.length;
  }

  const centralSize = central.reduce((s, r) => s + r.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  u32(ev, 0, 0x06054b50);
  u16(ev, 8, entries.length);
  u16(ev, 10, entries.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, offset);

  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const chunk of [...parts, ...central, end]) {
    out.set(chunk, p);
    p += chunk.length;
  }
  return out;
}
