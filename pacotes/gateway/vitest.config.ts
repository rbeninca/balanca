import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@balancagfig/protocolo':    path.resolve(__dirname, '../protocolo/src/codificador.ts'),
      '@balancagfig/processamento': path.resolve(__dirname, '../processamento/src/index.ts'),
    },
  },
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
});
