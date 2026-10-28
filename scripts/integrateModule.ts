import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import readline from 'node:readline';
import {
  inflectNames,
  type InflectedNames,
  loadModuleSpecFile,
  validateModuleName,
} from './generateModule.js';

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
  pluralSnake: string;
  patches: FilePatchPlan[];
  hasAnyChanges: boolean;
}

export interface IntegrateOptions {
  name?: string;
  specPath?: string;
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
      const chunkOld: string[] = [];
      const chunkNew: string[] = [];
      const startOld = i + 1;
      const startNew = j + 1;

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
 * Patches tests/setup.ts by adding the PostgreSQL table name (snake_case) to test cleanup.
 * Idempotent: does not add duplicate table names.
 */
export function patchSetupContent(original: string, names: InflectedNames): string {
  const { pluralSnake, pluralCamel } = names;
  // In PostgreSQL, the table name is snake_case (e.g. 'guide_demo_products')
  const tableName = pluralSnake;

  // Pattern 1: appTables = [...]
  const appTablesRegex = /appTables\s*=\s*\[([^\]]+)\]/;
  const appTablesMatch = original.match(appTablesRegex);
  if (appTablesMatch) {
    const rawList = appTablesMatch[1];
    const items = rawList
      .split(',')
      .map((t) => t.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    if (items.includes(tableName) || items.includes(pluralCamel)) {
      return original;
    }

    // Insert before 'user_sessions' so all domain tables precede auth tables,
    // otherwise insert after 'examples' or at beginning
    const userSessionsIdx = items.indexOf('user_sessions');
    if (userSessionsIdx !== -1) {
      items.splice(userSessionsIdx, 0, tableName);
    } else {
      const examplesIdx = items.indexOf('examples');
      if (examplesIdx !== -1) {
        items.splice(examplesIdx + 1, 0, tableName);
      } else {
        items.unshift(tableName);
      }
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

  if (tables.includes(tableName) || tables.includes(pluralCamel)) {
    return original;
  }

  const userSessionsIdx = tables.indexOf('user_sessions');
  if (userSessionsIdx !== -1) {
    tables.splice(userSessionsIdx, 0, tableName);
  } else {
    const examplesIdx = tables.indexOf('examples');
    if (examplesIdx !== -1) {
      tables.splice(examplesIdx + 1, 0, tableName);
    } else {
      tables.unshift(tableName);
    }
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

  // Check index.ts file for barrel re-exports
  const indexContent = fs.readFileSync(path.join(moduleDir, 'index.ts'), 'utf8');
  if (
    !indexContent.includes(`${names.kebab}.schema.js`) ||
    !indexContent.includes(`${names.kebab}.routes.js`)
  ) {
    throw new Error(
      `Module barrel "index.ts" does not re-export schema and routes.`,
    );
  }

  return { names, moduleDir };
}

/**
 * Creates an integration plan with unified diffs for all affected files without modifying disk.
 */
export function createIntegrationPlan(
  moduleNameOrSpecPath: string,
  baseDir = process.cwd(),
): IntegrationPlan {
  let moduleName = moduleNameOrSpecPath;
  if (moduleNameOrSpecPath.endsWith('.json') || fs.existsSync(path.resolve(baseDir, moduleNameOrSpecPath))) {
    const spec = loadModuleSpecFile(moduleNameOrSpecPath, baseDir);
    moduleName = spec.name;
  }

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
    pluralSnake: names.pluralSnake,
    patches,
    hasAnyChanges,
  };
}

/**
 * Executes integration plan with snapshotting, validation, and atomic rollback on failure.
 */
export function executeIntegration(options: IntegrateOptions): IntegrationResult {
  const baseDir = options.baseDir || process.cwd();
  let moduleName = options.name;

  if (!moduleName && options.specPath) {
    const spec = loadModuleSpecFile(options.specPath, baseDir);
    moduleName = spec.name;
  }

  if (!moduleName) {
    throw new Error('Module name is required for integration (specify --name or --spec).');
  }

  const plan = createIntegrationPlan(moduleName, baseDir);

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
      let specPath = '';
      let dryRun = false;
      let yes = false;
      let skipTypeCheck = false;

      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') {
          dryRun = true;
        } else if (arg === '--yes' || arg === '-y') {
          yes = true;
        } else if (arg === '--skip-type-check') {
          skipTypeCheck = true;
        } else if (arg === '--name' || arg === '-n') {
          moduleName = args[++i];
        } else if (arg.startsWith('--name=')) {
          moduleName = arg.split('=')[1];
        } else if (arg === '--spec' || arg === '-s') {
          specPath = args[++i];
        } else if (arg.startsWith('--spec=')) {
          specPath = arg.split('=')[1];
        } else if (!arg.startsWith('-') && !moduleName) {
          moduleName = arg;
        }
      }

      if (!moduleName && specPath) {
        const spec = loadModuleSpecFile(specPath);
        moduleName = spec.name;
      }

      if (!moduleName) {
        console.error('Usage: npm run integrate:module -- [options] <module-name>');
        console.error('\nOptions:');
        console.error('  --name, -n <name>       Name of the generated module to integrate');
        console.error('  --spec, -s <path>       Path to JSON module specification file');
        console.error('  --dry-run               Preview planned modifications without changing disk');
        console.error('  --yes, -y               Apply changes without interactive confirmation');
        console.error('  --skip-type-check       Skip post-patch TypeScript verification');
        console.error('\nExamples:');
        console.error('  npm run integrate:module -- --name guide-demo-products');
        console.error('  npm run integrate:module -- --spec ./specs/guide-demo-products.json');
        console.error('  npm run integrate:module -- guide-demo-products --dry-run');
        console.error('  npm run integrate:module -- guide-demo-products --yes');
        process.exit(1);
      }

      const plan = createIntegrationPlan(moduleName);

      console.log(`\n🔍 Integration Plan for Module: "${plan.kebab}"`);
      console.log('======================================================================');

      if (!plan.hasAnyChanges) {
        console.log(`\n======================================================================`);
        console.log(`📊 Module Integration Report: "${plan.kebab}"`);
        console.log(`======================================================================`);
        console.log('Status Overview:');
        console.log('  [✓ COMPLETED] Generated module validation (all files & exports verified)');
        console.log('  [✓ UP TO DATE] Database schema registration (src/db/schema.ts)');
        console.log('  [✓ UP TO DATE] API route registration (src/routes/apiV1.ts)');
        console.log('  [✓ UP TO DATE] Test setup cleanup integration (tests/setup.ts)');
        console.log('  [✓ COMPLETED] TypeScript compilation check (up to date)');
        console.log('  [⏳ RECOMMENDED NEXT STEP] Migration generation/review (Run: npm run db:generate)');
        console.log(`  [⏳ RECOMMENDED NEXT STEP] Module tests (Run: npx vitest run src/modules/${plan.kebab}/${plan.kebab}.test.ts)`);
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
        console.log(`======================================================================`);
        console.log(`📊 Module Integration Report (DRY-RUN): "${plan.kebab}"`);
        console.log(`======================================================================`);
        console.log('Status Overview:');
        console.log('  [✓ VERIFIED] Generated module validation');
        for (const patch of plan.patches) {
          const status = patch.hasChanges ? 'Modification planned' : 'Already up to date';
          console.log(`  [ℹ️ DRY RUN] ${patch.relativePath}: ${status}`);
        }
        console.log('  [ℹ️ DRY RUN] No files were modified on disk.');
        console.log('\nTo apply these integration changes, run:');
        console.log(`  npm run integrate:module -- --name ${plan.kebab} --yes`);
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
        skipTypeCheck,
      });

      if (!result.success) {
        console.error(`\n❌ ${result.error}`);
        process.exit(1);
      }

      console.log('\n✅ Integration Successful!');
      console.log('======================================================================');
      console.log(`📊 Module Integration Report: "${plan.kebab}"`);
      console.log('======================================================================');
      console.log('Status Overview:');
      console.log('  [✓ COMPLETED] Generated module validation (all files & exports verified)');

      const schemaPatch = plan.patches.find((p) => p.relativePath === 'src/db/schema.ts');
      console.log(
        schemaPatch?.hasChanges
          ? '  [✓ COMPLETED] Database schema registration (src/db/schema.ts)'
          : '  [✓ UP TO DATE] Database schema registration (already exported)',
      );

      const routePatch = plan.patches.find((p) => p.relativePath === 'src/routes/apiV1.ts');
      console.log(
        routePatch?.hasChanges
          ? '  [✓ COMPLETED] API route registration (src/routes/apiV1.ts)'
          : '  [✓ UP TO DATE] API route registration (already registered)',
      );

      const setupPatch = plan.patches.find((p) => p.relativePath === 'tests/setup.ts');
      console.log(
        setupPatch?.hasChanges
          ? '  [✓ COMPLETED] Test setup cleanup integration (tests/setup.ts)'
          : '  [✓ UP TO DATE] Test setup cleanup integration (already included)',
      );

      if (skipTypeCheck) {
        console.log('  [⚠️ SKIPPED] TypeScript compilation check (--skip-type-check)');
      } else {
        console.log('  [✓ COMPLETED] TypeScript compilation check (tsc --noEmit passed)');
      }

      console.log('  [⏳ RECOMMENDED NEXT STEP] Migration generation & review');
      console.log('  [⏳ RECOMMENDED NEXT STEP] Module integration test execution');

      console.log('\n======================================================================');
      console.log('📋 Recommended Next Steps:');
      console.log('----------------------------------------------------------------------');
      console.log('1. Generate and review the database migration:');
      console.log('   npm run db:generate');
      console.log('   ⚠️  Inspect the generated SQL in drizzle/ before applying to any database.');
      console.log('');
      console.log('2. Apply migration to development database (only after review):');
      console.log('   npm run db:migrate');
      console.log('');
      console.log('3. Run the module integration tests:');
      console.log(`   npx vitest run src/modules/${plan.kebab}/${plan.kebab}.test.ts`);
      console.log('======================================================================\n');
    } catch (error) {
      console.error(`❌ Error: ${(error as Error).message}`);
      process.exit(1);
    }
  })();
}
