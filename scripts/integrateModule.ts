import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';
import { inflectNames, type InflectedNames, validateModuleName } from './generateModule.js';

export interface FilePatchPlan {
  filePath: string;
  relativePath: string;
  originalContent: string;
  patchedContent: string;
  hasChanges: boolean;
  diff: string;
  changeType: 'modified' | 'unchanged';
}

export interface IntegrationPlan {
  moduleName: string;
  kebab: string;
  pluralCamel: string;
  patches: FilePatchPlan[];
  hasAnyChanges: boolean;
}

export interface IntegrateOptions {
  name: string;
  baseDir?: string;
  dryRun?: boolean;
  yes?: boolean;
  skipTypeCheck?: boolean;
}

export interface IntegrationResult {
  success: boolean;
  plan: IntegrationPlan;
  rolledBack: boolean;
  error?: string;
  typeCheckPassed?: boolean;
}

/**
 * Generates a standard unified diff string between two text inputs.
 */
export function generateUnifiedDiff(
  oldContent: string,
  newContent: string,
  relativePath: string,
): string {
  if (oldContent === newContent) {
    return `--- a/${relativePath}\n+++ b/${relativePath}\n(No changes)`;
  }

  const oldLines = oldContent.replace(/\r\n/g, '\n').split('\n');
  const newLines = newContent.replace(/\r\n/g, '\n').split('\n');

  // Simple and clean line-by-line diff generator
  const diffLines: string[] = [
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
  ];

  let i = 0;
  let j = 0;

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++;
      j++;
    } else {
      // Found divergence
      const chunkOld: string[] = [];
      const chunkNew: string[] = [];
      const startOld = i + 1;
      const startNew = j + 1;

      // Look ahead for matching point
      while (
        (i < oldLines.length || j < newLines.length) &&
        (i >= oldLines.length || j >= newLines.length || oldLines[i] !== newLines[j])
      ) {
        if (i < oldLines.length) {
          chunkOld.push(oldLines[i]);
          i++;
        }
        if (j < newLines.length) {
          chunkNew.push(newLines[j]);
          j++;
        }
      }

      diffLines.push(
        `@@ -${startOld},${chunkOld.length} +${startNew},${chunkNew.length} @@`,
      );
      for (const line of chunkOld) {
        diffLines.push(`-${line}`);
      }
      for (const line of chunkNew) {
        diffLines.push(`+${line}`);
      }
    }
  }

  return diffLines.join('\n');
}

/**
 * Patches src/db/schema.ts by exporting the modular table.
 * Idempotent: does not add duplicate exports.
 */
export function patchSchemaContent(original: string, names: InflectedNames): string {
  const { pluralCamel, kebab } = names;

  // Check if export already exists
  const exportPattern = new RegExp(
    `export\\s*\\{[^}]*\\b${pluralCamel}\\b[^}]*\\}\\s*from\\s*['"][^'"]*${kebab}[^'"]*['"]`,
    'i',
  );
  if (exportPattern.test(original)) {
    return original;
  }

  const normalized = original.endsWith('\n') ? original : `${original}\n`;
  return `${normalized}export { ${pluralCamel} } from '../modules/${kebab}/index.js';\n`;
}

/**
 * Patches src/routes/apiV1.ts by importing and registering the route plugin.
 * Idempotent: does not add duplicate imports or registrations.
 */
export function patchApiV1Content(original: string, names: InflectedNames): string {
  const { pluralCamel, kebab } = names;
  const routeName = `${pluralCamel}Routes`;

  let content = original.replace(/\r\n/g, '\n');

  // Check if import already exists
  const hasImport = new RegExp(`import\\s*\\{[^}]*\\b${routeName}\\b[^}]*\\}\\s*from`, 'i').test(
    content,
  );

  // Check if register already exists
  const hasRegister = new RegExp(`app\\.register\\(\\s*${routeName}\\s*\\)`, 'i').test(content);

  if (hasImport && hasRegister) {
    return original;
  }

  // 1. Add import after last import statement if missing
  if (!hasImport) {
    const lines = content.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^import\s/.test(lines[i].trim())) {
        lastImportIdx = i;
      }
    }

    const importStatement = `import { ${routeName} } from '../modules/${kebab}/index.js';`;
    if (lastImportIdx !== -1) {
      lines.splice(lastImportIdx + 1, 0, importStatement);
    } else {
      lines.unshift(importStatement);
    }
    content = lines.join('\n');
  }

  // 2. Add app.register() inside apiV1Routes before closing brace if missing
  if (!hasRegister) {
    const registerStatement = `  await app.register(${routeName});`;
    const funcMatch = content.match(/export\s+async\s+function\s+apiV1Routes[\s\S]*?\n\}/);

    if (funcMatch) {
      const fullFunc = funcMatch[0];
      const lastBraceIdx = fullFunc.lastIndexOf('}');
      const updatedFunc = `${fullFunc.slice(0, lastBraceIdx)}${registerStatement}\n}`;
      content = content.replace(fullFunc, updatedFunc);
    } else {
      throw new Error(
        'Could not locate "export async function apiV1Routes" in src/routes/apiV1.ts',
      );
    }
  }

  return original.includes('\r\n') ? content.replace(/\n/g, '\r\n') : content;
}

/**
 * Patches tests/setup.ts by adding the table to the TRUNCATE query list.
 * Idempotent: does not add duplicate table names.
 */
export function patchSetupContent(original: string, names: InflectedNames): string {
  const { pluralCamel } = names;

  // Pattern 1: appTables = [...]
  const appTablesRegex = /appTables\s*=\s*\[([^\]]+)\]/;
  const appTablesMatch = original.match(appTablesRegex);
  if (appTablesMatch) {
    const rawList = appTablesMatch[1];
    const items = rawList
      .split(',')
      .map((t) => t.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    if (items.includes(pluralCamel)) {
      return original;
    }

    const examplesIdx = items.indexOf('examples');
    if (examplesIdx !== -1) {
      items.splice(examplesIdx + 1, 0, pluralCamel);
    } else {
      items.unshift(pluralCamel);
    }

    const formattedList = items.map((t) => `'${t}'`).join(', ');
    return original.replace(appTablesMatch[0], `appTables = [${formattedList}]`);
  }

  // Pattern 2: TRUNCATE TABLE ...
  const truncateRegex = /TRUNCATE\s+TABLE\s+([a-zA-Z0-9_,\s]+)\s+RESTART\s+IDENTITY\s+CASCADE;/i;
  const match = original.match(truncateRegex);

  if (!match) {
    throw new Error(
      'Could not locate appTables array or "TRUNCATE TABLE ... RESTART IDENTITY CASCADE;" in tests/setup.ts',
    );
  }

  const rawTables = match[1];
  const tables = rawTables.split(',').map((t) => t.trim()).filter(Boolean);

  if (tables.includes(pluralCamel)) {
    return original;
  }

  // Insert after 'examples' if present, otherwise at index 1
  const examplesIdx = tables.indexOf('examples');
  if (examplesIdx !== -1) {
    tables.splice(examplesIdx + 1, 0, pluralCamel);
  } else {
    tables.unshift(pluralCamel);
  }

  const newQuery = `TRUNCATE TABLE ${tables.join(', ')} RESTART IDENTITY CASCADE;`;
  return original.replace(match[0], newQuery);
}

/**
 * Validates that the module files exist on disk and export the expected symbols.
 */
export function validateModuleForIntegration(
  moduleName: string,
  baseDir = process.cwd(),
): { names: InflectedNames; moduleDir: string } {
  validateModuleName(moduleName);
  const names = inflectNames(moduleName);
  const moduleDir = path.join(baseDir, 'src', 'modules', names.kebab);

  if (!fs.existsSync(moduleDir)) {
    throw new Error(
      `Module directory "${moduleDir}" does not exist. Generate the module first before integrating.`,
    );
  }

  const requiredFiles = [
    `${names.kebab}.schema.ts`,
    `${names.kebab}.repository.ts`,
    `${names.kebab}.service.ts`,
    `${names.kebab}.routes.ts`,
    'index.ts',
  ];

  for (const file of requiredFiles) {
    const fullPath = path.join(moduleDir, file);
    if (!fs.existsSync(fullPath)) {
      throw new Error(
        `Required module file "${file}" is missing in "${moduleDir}". Cannot integrate an incomplete module.`,
      );
    }
  }

  // Check schema file for table export
  const schemaContent = fs.readFileSync(path.join(moduleDir, `${names.kebab}.schema.ts`), 'utf8');
  if (!schemaContent.includes(`export const ${names.pluralCamel} = pgTable`)) {
    throw new Error(
      `Module schema "${names.kebab}.schema.ts" does not export Drizzle table "${names.pluralCamel}".`,
    );
  }

  // Check routes file for routes function export
  const routesContent = fs.readFileSync(path.join(moduleDir, `${names.kebab}.routes.ts`), 'utf8');
  if (!routesContent.includes(`export async function ${names.pluralCamel}Routes`)) {
    throw new Error(
      `Module routes "${names.kebab}.routes.ts" does not export route handler "${names.pluralCamel}Routes".`,
    );
  }

  return { names, moduleDir };
}

/**
 * Creates an integration plan with unified diffs for all affected files without modifying disk.
 */
export function createIntegrationPlan(
  moduleName: string,
  baseDir = process.cwd(),
): IntegrationPlan {
  const { names } = validateModuleForIntegration(moduleName, baseDir);

  const targets = [
    {
      relativePath: 'src/db/schema.ts',
      filePath: path.join(baseDir, 'src', 'db', 'schema.ts'),
      patchFn: patchSchemaContent,
    },
    {
      relativePath: 'src/routes/apiV1.ts',
      filePath: path.join(baseDir, 'src', 'routes', 'apiV1.ts'),
      patchFn: patchApiV1Content,
    },
    {
      relativePath: 'tests/setup.ts',
      filePath: path.join(baseDir, 'tests', 'setup.ts'),
      patchFn: patchSetupContent,
    },
  ];

  const patches: FilePatchPlan[] = [];

  for (const target of targets) {
    if (!fs.existsSync(target.filePath)) {
      throw new Error(`Integration target file "${target.filePath}" does not exist.`);
    }

    const originalContent = fs.readFileSync(target.filePath, 'utf8');
    const patchedContent = target.patchFn(originalContent, names);
    const hasChanges = originalContent !== patchedContent;
    const diff = generateUnifiedDiff(originalContent, patchedContent, target.relativePath);

    patches.push({
      filePath: target.filePath,
      relativePath: target.relativePath,
      originalContent,
      patchedContent,
      hasChanges,
      diff,
      changeType: hasChanges ? 'modified' : 'unchanged',
    });
  }

  const hasAnyChanges = patches.some((p) => p.hasChanges);

  return {
    moduleName,
    kebab: names.kebab,
    pluralCamel: names.pluralCamel,
    patches,
    hasAnyChanges,
  };
}

/**
 * Executes integration plan with snapshotting, validation, and atomic rollback on failure.
 */
export function executeIntegration(options: IntegrateOptions): IntegrationResult {
  const baseDir = options.baseDir || process.cwd();
  const plan = createIntegrationPlan(options.name, baseDir);

  if (!plan.hasAnyChanges) {
    return {
      success: true,
      plan,
      rolledBack: false,
      typeCheckPassed: true,
    };
  }

  if (options.dryRun) {
    return {
      success: true,
      plan,
      rolledBack: false,
    };
  }

  // 1. Snapshot original contents for atomic rollback
  const snapshots = new Map<string, string>();
  for (const patch of plan.patches) {
    if (patch.hasChanges) {
      snapshots.set(patch.filePath, patch.originalContent);
    }
  }

  try {
    // 2. Apply patches to disk
    for (const patch of plan.patches) {
      if (patch.hasChanges) {
        fs.writeFileSync(patch.filePath, patch.patchedContent, 'utf8');
      }
    }

    // 3. Post-patch TypeScript validation
    if (!options.skipTypeCheck) {
      try {
        execSync('npx tsc --noEmit', { cwd: baseDir, stdio: 'pipe' });
      } catch (tsError) {
        // Rollback immediately on typecheck error
        for (const [filePath, originalContent] of snapshots.entries()) {
          fs.writeFileSync(filePath, originalContent, 'utf8');
        }

        const stderr = (tsError as { stderr?: Buffer }).stderr?.toString() || '';
        const stdout = (tsError as { stdout?: Buffer }).stdout?.toString() || '';
        const errMessage = stderr || stdout || (tsError as Error).message;

        return {
          success: false,
          plan,
          rolledBack: true,
          typeCheckPassed: false,
          error: `TypeScript verification failed after integration. Changes were rolled back.\n${errMessage}`,
        };
      }
    }

    return {
      success: true,
      plan,
      rolledBack: false,
      typeCheckPassed: true,
    };
  } catch (err) {
    // Rollback on any filesystem or unexpected exception
    for (const [filePath, originalContent] of snapshots.entries()) {
      try {
        fs.writeFileSync(filePath, originalContent, 'utf8');
      } catch {
        // preserve original error
      }
    }

    return {
      success: false,
      plan,
      rolledBack: true,
      error: `Integration failed: ${(err as Error).message}. Changes were rolled back.`,
    };
  }
}

/**
 * Interactive prompt helper with stream injection and graceful cancellation.
 */
export async function promptConfirmation(
  question: string,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<boolean> {
  const rl = readline.createInterface({
    input,
    output,
  });

  return new Promise((resolve) => {
    let resolved = false;

    const finish = (result: boolean) => {
      if (!resolved) {
        resolved = true;
        rl.close();
        resolve(result);
      }
    };

    rl.on('SIGINT', () => finish(false));
    rl.on('close', () => finish(false));
    if (typeof (input as { on?: unknown }).on === 'function') {
      (input as { on: (evt: string, cb: () => void) => void }).on('SIGINT', () => finish(false));
    }

    rl.question(question, (answer) => {
      const normalized = answer.trim().toLowerCase();
      finish(normalized === 'y' || normalized === 'yes');
    });
  });
}

// CLI Execution Handler
const currentScriptPath = process.argv[1]?.replace(/\\/g, '/');
if (
  import.meta.url.endsWith(currentScriptPath || '') ||
  process.argv[1]?.endsWith('integrateModule.ts')
) {
  (async () => {
    try {
      const args = process.argv.slice(2);
      let moduleName = '';
      let dryRun = false;
      let yes = false;

      for (const arg of args) {
        if (arg === '--dry-run') {
          dryRun = true;
        } else if (arg === '--yes' || arg === '-y') {
          yes = true;
        } else if (!arg.startsWith('-') && !moduleName) {
          moduleName = arg;
        }
      }

      if (!moduleName) {
        console.error('Usage: npm run integrate:module -- <module-name> [--dry-run] [--yes]');
        console.error('Example: npm run integrate:module -- categories --dry-run');
        console.error('Example: npm run integrate:module -- categories --yes');
        process.exit(1);
      }

      const plan = createIntegrationPlan(moduleName);

      console.log(`\n🔍 Integration Plan for Module: "${plan.kebab}"`);
      console.log('======================================================================');

      if (!plan.hasAnyChanges) {
        console.log(`ℹ️ Module "${plan.kebab}" is already fully integrated across all targets:`);
        for (const patch of plan.patches) {
          console.log(`  - ${patch.relativePath} [Already Integrated]`);
        }
        console.log('======================================================================\n');
        process.exit(0);
      }

      console.log('📋 Planned File Modifications:\n');
      for (const patch of plan.patches) {
        if (patch.hasChanges) {
          console.log(`📝 File: ${patch.relativePath}`);
          console.log('---------------------------------------------------------');
          console.log(patch.diff);
          console.log('---------------------------------------------------------\n');
        } else {
          console.log(`✓ File: ${patch.relativePath} [No changes needed - Already integrated]`);
        }
      }

      if (dryRun) {
        console.log('✨ Dry-run complete. No files were modified on disk.');
        console.log('======================================================================\n');
        process.exit(0);
      }

      // Check for confirmation
      if (!yes) {
        if (!process.stdin.isTTY) {
          console.error(
            '❌ Non-interactive environment detected. Pass --yes to apply integration changes.',
          );
          process.exit(1);
        }

        const confirmed = await promptConfirmation('Apply these integration changes? (y/N): ');
        if (!confirmed) {
          console.log('🚫 Integration cancelled by user. No files were modified.');
          process.exit(0);
        }
      }

      console.log('🚀 Applying integration patches and running typecheck...');
      const result = executeIntegration({
        name: moduleName,
        dryRun: false,
      });

      if (!result.success) {
        console.error(`\n❌ ${result.error}`);
        process.exit(1);
      }

      console.log('\n✅ Integration Successful!');
      console.log('======================================================================');
      console.log('Updated Targets:');
      for (const patch of plan.patches) {
        if (patch.hasChanges) {
          console.log(`  ✓ ${patch.relativePath}`);
        }
      }

      console.log('\n📋 Manual Next Steps:');
      console.log('---------------------');
      console.log('1. Generate and review migration:');
      console.log('   npm run db:generate');
      console.log('2. Apply migration to development database:');
      console.log('   npm run db:migrate');
      console.log('3. Run integration tests:');
      console.log(`   npx vitest run src/modules/${plan.kebab}/${plan.kebab}.test.ts`);
      console.log('======================================================================\n');
    } catch (error) {
      console.error(`❌ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
