import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Undo vi.spyOn/vi.fn mocks after every test so they can't leak between tests.
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // server.ts only wires config to listen(); all logic lives in tested modules.
      exclude: ['src/server.ts'],
      // skipFull: false lists every file, including 100%-covered ones. Set explicitly because
      // Vitest defaults it to true when it detects it is running under an AI coding agent.
      reporter: [['text', { skipFull: false }], 'html', 'lcov'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 75 },
    },
  },
});
