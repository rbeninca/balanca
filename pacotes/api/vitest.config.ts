import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['testes/**/*.teste.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { lines: 85, functions: 85, branches: 80 },
    },
  },
  resolve: {
    // Só para os testes comparando a view resumo_sessoes com o pacote analise.
    alias: {
      '@balancagfig/processamento/tipos': path.resolve(__dirname, '../processamento/src/tipos.ts'),
      '@balancagfig/analise': path.resolve(__dirname, '../analise/src/index.ts'),
    },
  },
});
