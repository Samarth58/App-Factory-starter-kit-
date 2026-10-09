import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
  createIntegrationPlan,
  executeIntegration,
  generateUnifiedDiff,
  patchApiV1Content,
  patchSchemaContent,
  patchSetupContent,
  promptConfirmation,
  validateModuleForIntegration,
} from '../scripts/integrateModule.js';
import { inflectNames, generateModule } from '../scripts/generateModule.js';

describe('Safe Automatic Module Integration Engine', () => {
  const names = inflectNames('categories');

  describe('Content Patchers & Idempotency', () => {
    it('patchSchemaContent appends export and is idempotent', () => {
      const original = `import { users } from './users.js';\nexport const examples = pgTable('examples', {});\n`;
      const patched = patchSchemaContent(original, names);

      expect(patched).toContain("export { categories } from '../modules/categories/index.js';");

      // Idempotency check: running again on patched content produces identical output
      const patchedAgain = patchSchemaContent(patched, names);
      expect(patchedAgain).toBe(patched);
    });

    it('patchApiV1Content adds import and route registration and is idempotent', () => {
      const original = `import type { FastifyInstance } from 'fastify';
import { exampleRoutes } from '../modules/example/index.js';

export async function apiV1Routes(app: FastifyInstance): Promise<void> {
  await app.register(exampleRoutes);
}
`;
      const patched = patchApiV1Content(original, names);

      expect(patched).toContain("import { categoriesRoutes } from '../modules/categories/index.js';");
      expect(patched).toContain('await app.register(categoriesRoutes);');

      // Idempotency check
      const patchedAgain = patchApiV1Content(patched, names);
      expect(patchedAgain).toBe(patched);
    });

    it('patchSetupContent adds table to TRUNCATE query and is idempotent', () => {
      const original = `await pool.query('TRUNCATE TABLE examples, user_sessions, users RESTART IDENTITY CASCADE;');`;
      const patched = patchSetupContent(original, names);

      expect(patched).toBe(
        `await pool.query('TRUNCATE TABLE examples, categories, user_sessions, users RESTART IDENTITY CASCADE;');`,
      );

      // Idempotency check
      const patchedAgain = patchSetupContent(patched, names);
      expect(patchedAgain).toBe(patched);
    });

    it('patchSetupContent throws when TRUNCATE TABLE query is not found', () => {
      expect(() => patchSetupContent('const x = 1;', names)).toThrow(/Could not locate/);
    });
  });

  describe('generateUnifiedDiff', () => {
    it('generates standard unified diff format for modified content', () => {
      const oldStr = 'line1\nline2\nline3\n';
      const newStr = 'line1\nline2_modified\nline3\nline4\n';
      const diff = generateUnifiedDiff(oldStr, newStr, 'src/test.ts');

      expect(diff).toContain('--- a/src/test.ts');
      expect(diff).toContain('+++ b/src/test.ts');
      expect(diff).toContain('-line2');
      expect(diff).toContain('+line2_modified');
      expect(diff).toContain('+line4');
    });

    it('returns "(No changes)" when old and new contents match', () => {
      const diff = generateUnifiedDiff('same content', 'same content', 'src/test.ts');
      expect(diff).toContain('(No changes)');
    });
  });

  describe('validateModuleForIntegration', () => {
    it('throws when module directory does not exist', () => {
      expect(() => validateModuleForIntegration('non_existent_module')).toThrow(
        /does not exist\. Generate the module first/,
      );
    });

    it('throws on invalid module name', () => {
      expect(() => validateModuleForIntegration('../evil')).toThrow(/path traversal/);
      expect(() => validateModuleForIntegration('admin')).toThrow(/reserved/);
    });
  });

  describe('Isolated Integration Workflow with Fixtures', () => {
    function createFixtureWorkspace(): string {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'af-integrate-test-'));

      // 1. Generate module inside fixture
      generateModule({
        name: 'categories',
        fields: 'name:string,displayOrder:number',
        baseDir: tmpDir,
      });

      // 2. Create substrate targets
      fs.mkdirSync(path.join(tmpDir, 'src', 'db'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src', 'routes'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'tests'), { recursive: true });

      fs.writeFileSync(
        path.join(tmpDir, 'src', 'db', 'schema.ts'),
        `import { sql } from 'drizzle-orm';\nexport const users = {};\nexport const examples = {};\n`,
      );

      fs.writeFileSync(
        path.join(tmpDir, 'src', 'routes', 'apiV1.ts'),
        `import type { FastifyInstance } from 'fastify';\nimport { exampleRoutes } from '../modules/example/index.js';\n\nexport async function apiV1Routes(app: FastifyInstance): Promise<void> {\n  await app.register(exampleRoutes);\n}\n`,
      );

      fs.writeFileSync(
        path.join(tmpDir, 'tests', 'setup.ts'),
        `await pool.query('TRUNCATE TABLE examples, user_sessions, users RESTART IDENTITY CASCADE;');\n`,
      );

      return tmpDir;
    }

    it('createIntegrationPlan previews diffs without modifying files', () => {
      const fixtureDir = createFixtureWorkspace();
      try {
        const schemaBefore = fs.readFileSync(path.join(fixtureDir, 'src', 'db', 'schema.ts'), 'utf8');

        const plan = createIntegrationPlan('categories', fixtureDir);

        expect(plan.hasAnyChanges).toBe(true);
        expect(plan.patches).toHaveLength(3);

        const schemaPatch = plan.patches.find((p) => p.relativePath === 'src/db/schema.ts')!;
        expect(schemaPatch.hasChanges).toBe(true);
        expect(schemaPatch.diff).toContain("+export { categories } from '../modules/categories/index.js';");

        // Verify disk was NOT modified during planning
        const schemaAfter = fs.readFileSync(path.join(fixtureDir, 'src', 'db', 'schema.ts'), 'utf8');
        expect(schemaAfter).toBe(schemaBefore);
      } finally {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      }
    });

    it('executeIntegration in dry-run mode does not modify disk', () => {
      const fixtureDir = createFixtureWorkspace();
      try {
        const schemaBefore = fs.readFileSync(path.join(fixtureDir, 'src', 'db', 'schema.ts'), 'utf8');

        const result = executeIntegration({
          name: 'categories',
          baseDir: fixtureDir,
          dryRun: true,
        });

        expect(result.success).toBe(true);
        const schemaAfter = fs.readFileSync(path.join(fixtureDir, 'src', 'db', 'schema.ts'), 'utf8');
        expect(schemaAfter).toBe(schemaBefore);
      } finally {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      }
    });

    it('executeIntegration applies patches successfully and reports idempotency on rerun', () => {
      const fixtureDir = createFixtureWorkspace();
      try {
        const result = executeIntegration({
          name: 'categories',
          baseDir: fixtureDir,
          dryRun: false,
          skipTypeCheck: true,
        });

        expect(result.success).toBe(true);
        expect(result.rolledBack).toBe(false);

        const schemaContent = fs.readFileSync(path.join(fixtureDir, 'src', 'db', 'schema.ts'), 'utf8');
        expect(schemaContent).toContain("export { categories } from '../modules/categories/index.js';");

        const apiV1Content = fs.readFileSync(path.join(fixtureDir, 'src', 'routes', 'apiV1.ts'), 'utf8');
        expect(apiV1Content).toContain("import { categoriesRoutes } from '../modules/categories/index.js';");
        expect(apiV1Content).toContain('await app.register(categoriesRoutes);');

        const setupContent = fs.readFileSync(path.join(fixtureDir, 'tests', 'setup.ts'), 'utf8');
        expect(setupContent).toContain('TRUNCATE TABLE examples, categories, user_sessions, users');

        // Rerun check: running integration again produces no changes and succeeds
        const rerunResult = executeIntegration({
          name: 'categories',
          baseDir: fixtureDir,
          dryRun: false,
          skipTypeCheck: true,
        });

        expect(rerunResult.success).toBe(true);
        expect(rerunResult.plan.hasAnyChanges).toBe(false);
      } finally {
        fs.rmSync(fixtureDir, { recursive: true, force: true });
      }
    });
  });

  describe('Interactive Confirmation, Rejection, and Cancellation', () => {
    it('returns true when user enters "y" or "yes"', async () => {
      const input = new PassThrough();
      const output = new PassThrough();

      const promise = promptConfirmation('Apply changes? (y/N): ', input, output);
      input.write('yes\n');
      const result = await promise;

      expect(result).toBe(true);

      const input2 = new PassThrough();
      const output2 = new PassThrough();
      const promise2 = promptConfirmation('Apply changes? (y/N): ', input2, output2);
      input2.write('  Y  \n');
      const result2 = await promise2;

      expect(result2).toBe(true);
    });

    it('returns false when user enters "no", "n", or an empty response', async () => {
      const input = new PassThrough();
      const output = new PassThrough();

      const promise = promptConfirmation('Apply changes? (y/N): ', input, output);
      input.write('no\n');
      const result = await promise;

      expect(result).toBe(false);

      const input2 = new PassThrough();
      const output2 = new PassThrough();
      const promise2 = promptConfirmation('Apply changes? (y/N): ', input2, output2);
      input2.write('\n');
      const result2 = await promise2;

      expect(result2).toBe(false);
    });

    it('returns false safely when input stream closes before answering', async () => {
      const input = new PassThrough();
      const output = new PassThrough();

      const promise = promptConfirmation('Apply changes? (y/N): ', input, output);
      input.end();
      const result = await promise;

      expect(result).toBe(false);
    });

    it('returns false safely when input stream emits SIGINT (Ctrl+C)', async () => {
      const input = new PassThrough();
      const output = new PassThrough();

      const promise = promptConfirmation('Apply changes? (y/N): ', input, output);
      input.emit('SIGINT');
      const result = await promise;

      expect(result).toBe(false);
    });
  });
});

