import { defineConfig } from 'vitest/config';

// Two projects, deliberately not one suite.
//
// `unit` runs in jsdom against fakes and must stay green on a laptop with no
// database and no Docker — it is what `npm test` and the pre-commit hook run.
// `db` runs in node against a real Postgres (the Supabase CLI local stack) and
// is what `npm run test:db` runs. Before this split, the jsdom project's
// default glob swept `test/db/` up too, which made `npm test` red for anyone
// without the stack running — the failure mode this file exists to prevent.
//
// Selecting a project is explicit (`--project unit` / `--project db`) rather
// than implicit, so neither suite can start silently running in the other's
// environment.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          include: ['**/*.test.{ts,tsx}'],
          // `test/db/**` is the carve-out; everything else in the app is a
          // unit test by default, so a new one anywhere gets picked up
          // without touching this file.
          exclude: ['**/node_modules/**', '.next/**', 'test/db/**'],
        },
      },
      {
        test: {
          name: 'db',
          environment: 'node',
          globals: true,
          include: ['test/db/**/*.test.ts'],
          exclude: ['**/node_modules/**'],
          // Every db test file shares one database, so they run one file at a
          // time: parallel files would truncate each other's fixtures mid-test
          // and turn a real failure into a flake. Vitest 4 accepts
          // `fileParallelism` per project, so this states the requirement
          // directly; under Vitest 3 it was root-level only and this had to be
          // spelled `poolOptions: { forks: { singleFork: true } }` instead.
          pool: 'forks',
          fileParallelism: false,
          // Migrations against a cold stack are slow; the assertions
          // themselves are not.
          hookTimeout: 120_000,
          testTimeout: 30_000,
        },
      },
    ],
  },
});
