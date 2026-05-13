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
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
  resolve: {
    alias: {
      '@balancagfig/protocolo': path.resolve(__dirname, '../protocolo/src/codificador.ts'),
      '@balancagfig/processamento': path.resolve(__dirname, '../processamento/src/pipeline/PipelineProcessamento.ts'),
      '@balancagfig/processamento/tipos': path.resolve(__dirname, '../processamento/src/tipos.ts'),
      '@balancagfig/analise': path.resolve(__dirname, '../analise/src/index.ts'),
      '@balancagfig/relatorio': path.resolve(__dirname, '../relatorio/src/index.ts'),
    },
  },
});
