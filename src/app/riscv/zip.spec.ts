import { crc32, makeZip } from './zip';
import { projectFiles } from './rv-project';

describe('zip', () => {
  it('crc32 совпадает с известным значением', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('архив: подписи, число файлов и содержимое на месте', () => {
    const files = projectFiles('_start:\n  ebreak');
    const zip = makeZip(files.map((f) => ({ name: f.name, content: f.content })));
    const v = new DataView(zip.buffer);
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(3);
    const text = new TextDecoder().decode(zip);
    expect(text).toContain('program.s');
    expect(text).toContain('_start:\n  ebreak\n');
  });

  it('Makefile: рецепты начинаются с табуляции', () => {
    const mk = projectFiles('x').find((f) => f.name === 'Makefile')!.content;
    expect(mk).toContain('\n\t$(CLANG)');
    expect(mk).not.toMatch(/\n {2,}\$\(CLANG\)/);
  });
});
