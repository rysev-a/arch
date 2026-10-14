import {
  INTERFACES,
  busText,
  canConnect,
  childFields,
  interfaceOf,
  isSimple,
  leafPaths,
  sliceOf,
  typeWidth,
} from './interfaces';

describe('interfaces', () => {
  it('все поля ссылаются на существующие типы, имена сходятся с ключами', () => {
    for (const [key, t] of Object.entries(INTERFACES)) {
      expect(t.name).toBe(key);
      for (const f of t.fields) expect(INTERFACES[f.type], `${key}.${f.name}`).toBeDefined();
    }
  });

  it('ширина: простые типы — один бит, составные — сумма полей', () => {
    expect(typeWidth('Bit')).toBe(1);
    expect(typeWidth('Clk')).toBe(1);
    expect(typeWidth('Word2')).toBe(2);
    expect(typeWidth('Instr')).toBe(4);
    expect(typeWidth('Ctl')).toBe(5);
    expect(typeWidth('Phases')).toBe(4);
    expect(isSimple('Bit')).toBe(true);
    expect(isSimple('Word2')).toBe(false);
  });

  it('листья идут в порядке старший → младший, вложенность — через точку', () => {
    expect(leafPaths('Bit')).toEqual(['']);
    expect(leafPaths('Word2')).toEqual(['D1', 'D0']);
    expect(leafPaths('Instr')).toEqual(['op.Op1', 'op.Op0', 'k.D1', 'k.D0']);
    for (const name of Object.keys(INTERFACES)) {
      expect(leafPaths(name).length, name).toBe(typeWidth(name));
    }
  });

  it('срез по пути: целиком, поле, вложенное поле', () => {
    expect(sliceOf('Instr', '')).toEqual({ type: 'Instr', offset: 0, length: 4 });
    expect(sliceOf('Instr', 'op')).toEqual({ type: 'Op2', offset: 0, length: 2 });
    expect(sliceOf('Instr', 'k')).toEqual({ type: 'Word2', offset: 2, length: 2 });
    expect(sliceOf('Instr', 'k.D0')).toEqual({ type: 'Bit', offset: 3, length: 1 });
    expect(sliceOf('Ctl', 'Take')).toEqual({ type: 'Bit', offset: 2, length: 1 });
    expect(sliceOf('Instr', 'zzz')).toBeUndefined();
    expect(sliceOf('Word2', 'D1.x')).toBeUndefined();
  });

  it('срезы полей не пересекаются и покрывают тип целиком', () => {
    for (const name of Object.keys(INTERFACES)) {
      const covered: number[] = [];
      for (const leaf of leafPaths(name)) {
        const s = sliceOf(name, leaf)!;
        covered.push(s.offset);
      }
      expect(covered, name).toEqual(covered.map((_, i) => i));
    }
  });

  it('раскрытие порта показывает непосредственные поля', () => {
    expect(childFields('Instr', '').map((f) => `${f.path}:${f.type}`)).toEqual([
      'op:Op2',
      'k:Word2',
    ]);
    expect(childFields('Instr', 'k').map((f) => f.path)).toEqual(['k.D1', 'k.D0']);
    expect(childFields('Bit', '')).toEqual([]);
  });

  it('совместимость — только по имени типа', () => {
    expect(canConnect('Word2', 'Word2')).toBe(true);
    expect(canConnect('Word2', 'Addr2')).toBe(false);
    expect(canConnect('Bit', 'Clk')).toBe(false);
  });

  it('текст шины: старший бит слева, неизвестное — вопрос', () => {
    expect(busText([1, 0])).toBe('10');
    expect(busText([undefined, 1])).toBe('?1');
  });

  it('неизвестный тип — ошибка', () => {
    expect(() => interfaceOf('Nope')).toThrow();
  });
});
