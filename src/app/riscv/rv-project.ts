import { ZipEntry } from './zip';

export interface ProjectFile {
  name: string;
  content: string;
  /** что это за файл — для подписи на странице */
  note: string;
}

const MAKEFILE = `# Сборка программы для RISC-V (32 бита, команды RV32IM) обычным clang + lld.
CLANG ?= clang
FLAGS  = --target=riscv32 -march=rv32im -mabi=ilp32 -nostdlib -static -fuse-ld=lld

program: program.s
\t$(CLANG) $(FLAGS) -o program program.s

# запустить в эмуляторе qemu (режим «пользовательских программ»)
run: program
\tqemu-riscv32 ./program; echo "код возврата: $$?"

# посмотреть, какие 32-битные слова получились (сравните с листингом на сайте)
dump: program
\tllvm-objdump -d program

clean:
\trm -f program
`;

const README = `# Программа для RISC-V

Файл program.s — ваша программа на ассемблере RISC-V (то, что вы писали на сайте).
Точка входа — метка _start. Вывод — системный вызов write (a7 = 64),
завершение — exit (a7 = 93), как в Linux.

## Что нужно установить

macOS:
  brew install llvm lld qemu
  export PATH="$(brew --prefix llvm)/bin:$(brew --prefix lld)/bin:$PATH"

Ubuntu / Debian:
  sudo apt install clang lld llvm qemu-user

## Сборка и запуск

  make run     # собрать и запустить, в конце покажет код возврата
  make dump    # дизассемблировать: увидеть настоящие 32-битные слова
  make clean

Если у вас GNU-инструментарий (riscv64-unknown-elf-gcc), сборка такая:
  riscv64-unknown-elf-gcc -march=rv32im -mabi=ilp32 -nostdlib -static -o program program.s
  qemu-riscv32 ./program
`;

/** Файлы проекта, который можно собрать на своём компьютере */
export function projectFiles(source: string): ProjectFile[] {
  return [
    {
      name: 'program.s',
      content: source.endsWith('\n') ? source : `${source}\n`,
      note: 'ваша программа',
    },
    { name: 'Makefile', content: MAKEFILE, note: 'сборка: make run' },
    { name: 'README.md', content: README, note: 'что установить' },
  ];
}

export const projectZip = (files: readonly ProjectFile[]): ZipEntry[] =>
  files.map((f) => ({ name: f.name, content: f.content }));
