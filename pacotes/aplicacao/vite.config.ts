import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist-web',
    target: 'es2022',
  },
  resolve: {
    alias: [
      { find: '@balancagfig/processamento/tipos', replacement: r('../processamento/src/tipos.ts') },
      { find: '@balancagfig/protocolo',           replacement: r('../protocolo/src/codificador.ts') },
      { find: '@balancagfig/processamento',        replacement: r('../processamento/src/index.ts') },
      { find: '@balancagfig/analise',              replacement: r('../analise/src/index.ts') },
      { find: '@balancagfig/relatorio',            replacement: r('../relatorio/src/index.ts') },
    ],
  },
});
