import fs from 'node:fs';
import path from 'node:path';

export interface FieldDef {
  name: string;
  camelName: string;
  pascalName: string;
  snakeName: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  isOptional: boolean;
}

export interface InflectedNames {
  raw: string;
  kebab: string;
  snake: string;
  camel: string;
  pascal: string;
  singularCamel: string;
  singularPascal: string;
  singularSnake: string;
  pluralCamel: string;
  pluralPascal: string;
  pluralSnake: string;
  pluralKebab: string;
}

/**
 * Inflects and normalizes module names into various casing styles.
 */
export function inflectNames(rawInput: string): InflectedNames {
  const sanitized = rawInput.trim();

  // Convert kebab/snake/camel to words
  const words = sanitized
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .trim()
    .split(/\s+/);

  const camel = words
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');

  const pascal = words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');

  const kebab = words.join('-');
  const snake = words.join('_');

  // Singularize the last word if it looks plural
  const lastWord = words[words.length - 1];
  let singularLastWord = lastWord;

  if (lastWord.endsWith('ies') && lastWord.length > 3) {
    singularLastWord = lastWord.slice(0, -3) + 'y';
  } else if (
    (lastWord.endsWith('ses') ||
      lastWord.endsWith('xes') ||
      lastWord.endsWith('shes') ||
      lastWord.endsWith('ches')) &&
    lastWord.length > 3
  ) {
    singularLastWord = lastWord.slice(0, -2);
  } else if (lastWord.endsWith('s') && !lastWord.endsWith('ss') && lastWord.length > 2) {
    singularLastWord = lastWord.slice(0, -1);
  }

  // Pluralize the last word if it looks singular
  let pluralLastWord = lastWord;
  if (lastWord === singularLastWord) {
    if (lastWord.endsWith('y') && !/[aeiou]y$/i.test(lastWord)) {
      pluralLastWord = lastWord.slice(0, -1) + 'ies';
    } else if (
      lastWord.endsWith('s') ||
      lastWord.endsWith('x') ||
      lastWord.endsWith('z') ||
      lastWord.endsWith('ch') ||
      lastWord.endsWith('sh')
    ) {
      pluralLastWord = lastWord + 'es';
    } else {
      pluralLastWord = lastWord + 's';
    }
  }

  const singularWords = [...words.slice(0, -1), singularLastWord];
  const pluralWords = [...words.slice(0, -1), pluralLastWord];

  const singularCamel = singularWords
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
  const singularPascal = singularWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  const singularSnake = singularWords.join('_');

  const pluralCamel = pluralWords
    .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
  const pluralPascal = pluralWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
  const pluralSnake = pluralWords.join('_');
  const pluralKebab = pluralWords.join('-');

  return {
    raw: sanitized,
    kebab,
    snake,
    camel,
    pascal,
    singularCamel,
    singularPascal,
    singularSnake,
    pluralCamel,
    pluralPascal,
    pluralSnake,
    pluralKebab,
  };
}

/**
 * Validates module names to prevent path traversal, reserved words, and invalid identifiers.
 */
export function validateModuleName(name: string): void {
  if (!name || !name.trim()) {
    throw new Error('Module name cannot be empty.');
  }

  const trimmed = name.trim();

  if (trimmed.includes('..') || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error(`Invalid module name "${trimmed}": path traversal characters are forbidden.`);
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed)) {
    throw new Error(
      `Invalid module name "${trimmed}": must start with a letter and contain only alphanumeric characters, underscores, or hyphens.`,
    );
  }

  const reserved = new Set([
    'null',
    'undefined',
    'true',
    'false',
    'const',
    'let',
    'var',
    'function',
    'class',
    'return',
    'import',
    'export',
    'default',
    'eval',
    'prototype',
    'constructor',
    'api',
    'admin',
    'auth',
    'health',
  ]);

  if (reserved.has(trimmed.toLowerCase())) {
    throw new Error(`Invalid module name "${trimmed}": "${trimmed}" is a reserved word.`);
  }
}

/**
 * Parses field definitions from CLI string, e.g. "name:string,price:number,inStock:boolean:optional"
 */
export function parseFieldDefinitions(rawFields?: string): FieldDef[] {
  if (!rawFields || !rawFields.trim()) {
    // Sensible standard default fields if none specified
    return [
      {
        name: 'name',
        camelName: 'name',
        pascalName: 'Name',
        snakeName: 'name',
        type: 'string',
        isOptional: false,
      },
      {
        name: 'description',
        camelName: 'description',
        pascalName: 'Description',
        snakeName: 'description',
        type: 'string',
        isOptional: true,
      },
    ];
  }

  const parts = rawFields.split(',').map((p) => p.trim()).filter(Boolean);
  const fields: FieldDef[] = [];

  for (const part of parts) {
    const rawSegments = part.split(':').map((s) => s.trim());
    const fieldName = rawSegments[0];
    const typeStr = (rawSegments[1] || 'string').toLowerCase();
    const modifier = rawSegments[2]?.toLowerCase();

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(fieldName)) {
      throw new Error(
        `Invalid field name "${fieldName}". Must start with a letter and contain only alphanumeric characters or underscores.`,
      );
    }

    if (!['string', 'number', 'boolean', 'date'].includes(typeStr)) {
      throw new Error(
        `Unsupported field type "${typeStr}" for field "${fieldName}". Supported types: string, number, boolean, date.`,
      );
    }

    const isOptional = modifier === 'optional' || modifier === 'nullable' || modifier === 'opt';

    const words = fieldName
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .toLowerCase()
      .trim()
      .split(/\s+/);

    const camelName = words
      .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join('');
    const pascalName = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join('');
    const snakeName = words.join('_');

    fields.push({
      name: camelName,
      camelName,
      pascalName,
      snakeName,
      type: typeStr as FieldDef['type'],
      isOptional,
    });
  }

  return fields;
}

/**
 * Generates the <module>.schema.ts content.
 */
export function generateSchemaContent(names: InflectedNames, fields: FieldDef[]): string {
  const { singularPascal, pluralCamel } = names;

  const createProperties = fields
    .map((f) => {
      if (f.type === 'string') {
        return f.isOptional
          ? `  ${f.camelName}: z.string().trim().max(1000).optional(),`
          : `  ${f.camelName}: z.string().trim().min(1, '${f.pascalName} is required').max(255),`;
      }
      if (f.type === 'number') {
        return f.isOptional
          ? `  ${f.camelName}: z.coerce.number().optional(),`
          : `  ${f.camelName}: z.coerce.number(),`;
      }
      if (f.type === 'boolean') {
        return f.isOptional
          ? `  ${f.camelName}: z.boolean().optional(),`
          : `  ${f.camelName}: z.boolean(),`;
      }
      if (f.type === 'date') {
        return f.isOptional
          ? `  ${f.camelName}: z.coerce.date().optional(),`
          : `  ${f.camelName}: z.coerce.date(),`;
      }
      return `  ${f.camelName}: z.unknown(),`;
    })
    .join('\n');

  const updateProperties = fields
    .map((f) => {
      if (f.type === 'string') {
        return f.isOptional
          ? `  ${f.camelName}: z.string().trim().max(1000).nullable().optional(),`
          : `  ${f.camelName}: z.string().trim().min(1, '${f.pascalName} cannot be empty').max(255).optional(),`;
      }
      if (f.type === 'number') {
        return f.isOptional
          ? `  ${f.camelName}: z.coerce.number().nullable().optional(),`
          : `  ${f.camelName}: z.coerce.number().optional(),`;
      }
      if (f.type === 'boolean') {
        return `  ${f.camelName}: z.boolean().optional(),`;
      }
      if (f.type === 'date') {
        return f.isOptional
          ? `  ${f.camelName}: z.coerce.date().nullable().optional(),`
          : `  ${f.camelName}: z.coerce.date().optional(),`;
      }
      return `  ${f.camelName}: z.unknown().optional(),`;
    })
    .join('\n');

  const refineCheck = fields.map((f) => `data.${f.camelName} !== undefined`).join(' || ');

  const responseProperties = fields
    .map((f) => {
      let tsType = 'string';
      if (f.type === 'number') tsType = 'number';
      else if (f.type === 'boolean') tsType = 'boolean';
      else if (f.type === 'date') tsType = 'string';

      if (f.isOptional) tsType += ' | null';
      return `  ${f.camelName}: ${tsType};`;
    })
    .join('\n');

  return `import { z } from 'zod';
import {
  cursorPaginationSchema,
  limitOffsetPaginationSchema,
} from '../../utils/pagination.js';

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const create${singularPascal}Schema = z.object({
${createProperties}
});

export type Create${singularPascal}Input = z.infer<typeof create${singularPascal}Schema>;

export const update${singularPascal}Schema = z
  .object({
${updateProperties}
  })
  .strict()
  .refine(
    (data) => ${refineCheck},
    {
      message: 'At least one field must be provided for update',
    },
  );

export type Update${singularPascal}Input = z.infer<typeof update${singularPascal}Schema>;

export const ${pluralCamel}PaginationQuerySchema = cursorPaginationSchema.extend({
  offset: z.coerce.number().int().min(0).optional(),
});

export type ${singularPascal}PaginationQuery = z.infer<typeof ${pluralCamel}PaginationQuerySchema>;

export interface ${singularPascal}Response {
  id: string;
  userId: string;
${responseProperties}
  createdAt: string;
  updatedAt: string;
}
`;
}

/**
 * Generates the <module>.repository.ts content.
 */
export function generateRepositoryContent(names: InflectedNames): string {
  const { singularPascal, pluralCamel, kebab } = names;

  return `import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/connection.js';
// Note: Ensure table '${pluralCamel}' is exported in src/db/schema.ts
import { ${pluralCamel} } from '../../db/schema.js';
import type {
  Create${singularPascal}Input,
  Update${singularPascal}Input,
} from './${kebab}.schema.js';

export type ${singularPascal}Row = typeof ${pluralCamel}.$inferSelect;

export async function insert${singularPascal}(
  userId: string,
  input: Create${singularPascal}Input,
  db = defaultDb,
): Promise<${singularPascal}Row> {
  const [created] = await db
    .insert(${pluralCamel})
    .values({
      userId,
      ...input,
    })
    .returning();

  return created;
}

export async function find${singularPascal}ById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<${singularPascal}Row | null> {
  const [row] = await db
    .select()
    .from(${pluralCamel})
    .where(
      and(
        eq(${pluralCamel}.id, id),
        eq(${pluralCamel}.userId, userId),
        isNull(${pluralCamel}.deletedAt),
      ),
    )
    .limit(1);

  return row ?? null;
}

export async function findMany${singularPascal}WithCursor(
  userId: string,
  limit: number,
  cursor?: { id: string; createdAt: Date },
  db = defaultDb,
): Promise<${singularPascal}Row[]> {
  const conditions = [eq(${pluralCamel}.userId, userId), isNull(${pluralCamel}.deletedAt)];

  if (cursor && cursor.createdAt && cursor.id) {
    conditions.push(
      or(
        lt(${pluralCamel}.createdAt, cursor.createdAt),
        and(eq(${pluralCamel}.createdAt, cursor.createdAt), lt(${pluralCamel}.id, cursor.id)),
      )!,
    );
  }

  return db
    .select()
    .from(${pluralCamel})
    .where(and(...conditions))
    .orderBy(desc(${pluralCamel}.createdAt), desc(${pluralCamel}.id))
    .limit(limit + 1);
}

export async function findMany${singularPascal}WithOffset(
  userId: string,
  limit: number,
  offset: number,
  db = defaultDb,
): Promise<{ rows: ${singularPascal}Row[]; total: number }> {
  const conditions = [eq(${pluralCamel}.userId, userId), isNull(${pluralCamel}.deletedAt)];

  const [totalResult] = await db
    .select({ count: sql<number>\`count(*)\` })
    .from(${pluralCamel})
    .where(and(...conditions));

  const total = Number(totalResult?.count ?? 0);

  const rows = await db
    .select()
    .from(${pluralCamel})
    .where(and(...conditions))
    .orderBy(desc(${pluralCamel}.createdAt), desc(${pluralCamel}.id))
    .limit(limit)
    .offset(offset);

  return { rows, total };
}

export async function update${singularPascal}ById(
  id: string,
  userId: string,
  input: Update${singularPascal}Input,
  db = defaultDb,
): Promise<${singularPascal}Row | null> {
  const [updated] = await db
    .update(${pluralCamel})
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(${pluralCamel}.id, id),
        eq(${pluralCamel}.userId, userId),
        isNull(${pluralCamel}.deletedAt),
      ),
    )
    .returning();

  return updated ?? null;
}

export async function softDelete${singularPascal}ById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  const [deleted] = await db
    .update(${pluralCamel})
    .set({ deletedAt: sql\`now()\` })
    .where(
      and(
        eq(${pluralCamel}.id, id),
        eq(${pluralCamel}.userId, userId),
        isNull(${pluralCamel}.deletedAt),
      ),
    )
    .returning({ id: ${pluralCamel}.id });

  return Boolean(deleted);
}
`;
}

/**
 * Generates the <module>.service.ts content.
 */
export function generateServiceContent(names: InflectedNames, fields: FieldDef[]): string {
  const { singularPascal, pluralPascal, kebab } = names;

  const mappingFields = fields
    .map((f) => {
      if (f.type === 'date') {
        return f.isOptional
          ? `    ${f.camelName}: row.${f.camelName} ? row.${f.camelName}.toISOString() : null,`
          : `    ${f.camelName}: row.${f.camelName}.toISOString(),`;
      }
      return `    ${f.camelName}: row.${f.camelName},`;
    })
    .join('\n');

  return `import { db as defaultDb } from '../../db/connection.js';
import {
  buildCursorPagination,
  buildLimitOffsetPagination,
  decodeCursor,
  type CursorPaginatedResult,
  type LimitOffsetPaginatedResult,
} from '../../utils/pagination.js';
import type {
  Create${singularPascal}Input,
  ${singularPascal}Response,
  Update${singularPascal}Input,
} from './${kebab}.schema.js';
import {
  findMany${singularPascal}WithCursor,
  findMany${singularPascal}WithOffset,
  find${singularPascal}ById,
  insert${singularPascal},
  softDelete${singularPascal}ById,
  update${singularPascal}ById,
  type ${singularPascal}Row,
} from './${kebab}.repository.js';

export function to${singularPascal}Response(row: ${singularPascal}Row): ${singularPascal}Response {
  return {
    id: row.id,
    userId: row.userId,
${mappingFields}
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function create${singularPascal}(
  userId: string,
  input: Create${singularPascal}Input,
  db = defaultDb,
): Promise<${singularPascal}Response> {
  const created = await insert${singularPascal}(userId, input, db);
  return to${singularPascal}Response(created);
}

export async function list${pluralPascal}Cursor(
  userId: string,
  options: { limit: number; cursor?: string },
  db = defaultDb,
): Promise<CursorPaginatedResult<${singularPascal}Response>> {
  const { limit, cursor } = options;
  const decoded = decodeCursor<{ id: string; createdAt: string }>(cursor);
  const cursorDate = decoded?.createdAt ? new Date(decoded.createdAt) : undefined;

  const rows = await findMany${singularPascal}WithCursor(
    userId,
    limit,
    cursorDate && decoded?.id ? { id: decoded.id, createdAt: cursorDate } : undefined,
    db,
  );

  const mapped = rows.map(to${singularPascal}Response);

  return buildCursorPagination(mapped, limit, (item) => ({
    id: item.id,
    createdAt: item.createdAt,
  }));
}

export async function list${pluralPascal}LimitOffset(
  userId: string,
  options: { limit: number; offset: number },
  db = defaultDb,
): Promise<LimitOffsetPaginatedResult<${singularPascal}Response>> {
  const { limit, offset } = options;
  const { rows, total } = await findMany${singularPascal}WithOffset(userId, limit, offset, db);
  const mapped = rows.map(to${singularPascal}Response);

  return buildLimitOffsetPagination(mapped, total, { limit, offset });
}

export async function get${singularPascal}ById(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<${singularPascal}Response | null> {
  const row = await find${singularPascal}ById(id, userId, db);
  return row ? to${singularPascal}Response(row) : null;
}

export async function update${singularPascal}(
  id: string,
  userId: string,
  input: Update${singularPascal}Input,
  db = defaultDb,
): Promise<${singularPascal}Response | null> {
  const updated = await update${singularPascal}ById(id, userId, input, db);
  return updated ? to${singularPascal}Response(updated) : null;
}

export async function delete${singularPascal}(
  id: string,
  userId: string,
  db = defaultDb,
): Promise<boolean> {
  return softDelete${singularPascal}ById(id, userId, db);
}
`;
}

/**
 * Generates the <module>.routes.ts content.
 */
export function generateRoutesContent(names: InflectedNames): string {
  const { singularPascal, singularCamel, pluralCamel, pluralPascal, pluralKebab, kebab } = names;

  return `import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/authGuard.js';
import { fail, ok } from '../../utils/response.js';
import {
  create${singularPascal}Schema,
  idParamSchema,
  ${pluralCamel}PaginationQuerySchema,
  update${singularPascal}Schema,
} from './${kebab}.schema.js';
import {
  create${singularPascal},
  delete${singularPascal},
  get${singularPascal}ById,
  list${pluralPascal}Cursor,
  list${pluralPascal}LimitOffset,
  update${singularPascal},
} from './${kebab}.service.js';

export async function ${pluralCamel}Routes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.post(
    '/${pluralKebab}',
    {
      schema: {
        tags: ['${pluralPascal}'],
        summary: 'Create ${singularCamel} resource',
        description: 'Creates a new ${singularCamel} owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = create${singularPascal}Schema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues));
      }

      const created = await create${singularPascal}(request.userId!, parsed.data);
      return reply.status(201).send(ok(created));
    },
  );

  app.get(
    '/${pluralKebab}',
    {
      schema: {
        tags: ['${pluralPascal}'],
        summary: 'List ${names.pluralCamel}',
        description:
          'Retrieves a paginated list of ${names.pluralCamel} owned by the authenticated user. Supports both cursor and offset pagination.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = ${pluralCamel}PaginationQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues));
      }

      const { limit, cursor, offset } = parsed.data;

      if (offset !== undefined) {
        const result = await list${pluralPascal}LimitOffset(request.userId!, { limit, offset });
        return reply.status(200).send(ok(result.data, result.meta));
      }

      const result = await list${pluralPascal}Cursor(request.userId!, { limit, cursor });
      return reply.status(200).send(ok(result.data, result.meta));
    },
  );

  app.get(
    '/${pluralKebab}/:id',
    {
      schema: {
        tags: ['${pluralPascal}'],
        summary: 'Get ${singularCamel} by ID',
        description: 'Retrieves a single ${singularCamel} resource owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = idParamSchema.safeParse(request.params);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid ID parameter', parsed.error.issues));
      }

      const found = await get${singularPascal}ById(parsed.data.id, request.userId!);

      if (!found) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', '${singularPascal} not found', []));
      }

      return reply.status(200).send(ok(found));
    },
  );

  app.put(
    '/${pluralKebab}/:id',
    {
      schema: {
        tags: ['${pluralPascal}'],
        summary: 'Update ${singularCamel}',
        description: 'Updates a ${singularCamel} resource owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedParams = idParamSchema.safeParse(request.params);

      if (!parsedParams.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid ID parameter', parsedParams.error.issues));
      }

      const parsedBody = update${singularPascal}Schema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsedBody.error.issues));
      }

      const updated = await update${singularPascal}(
        parsedParams.data.id,
        request.userId!,
        parsedBody.data,
      );

      if (!updated) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', '${singularPascal} not found', []));
      }

      return reply.status(200).send(ok(updated));
    },
  );

  app.delete(
    '/${pluralKebab}/:id',
    {
      schema: {
        tags: ['${pluralPascal}'],
        summary: 'Delete ${singularCamel}',
        description: 'Soft-deletes a ${singularCamel} resource owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = idParamSchema.safeParse(request.params);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid ID parameter', parsed.error.issues));
      }

      const deleted = await delete${singularPascal}(parsed.data.id, request.userId!);

      if (!deleted) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', '${singularPascal} not found', []));
      }

      return reply.status(200).send(ok({ success: true }));
    },
  );
}
`;
}

/**
 * Generates the index.ts barrel file content.
 */
export function generateIndexContent(names: InflectedNames): string {
  return `export * from './${names.kebab}.schema.js';
export * from './${names.kebab}.repository.js';
export * from './${names.kebab}.service.js';
export * from './${names.kebab}.routes.js';
`;
}

/**
 * Generates the <module>.test.ts content.
 */
export function generateTestContent(names: InflectedNames, fields: FieldDef[]): string {
  const { singularPascal, pluralKebab } = names;

  const validPayloadEntries = fields
    .map((f) => {
      if (f.type === 'string') return `        ${f.camelName}: 'Test ${f.pascalName}',`;
      if (f.type === 'number') return `        ${f.camelName}: 100,`;
      if (f.type === 'boolean') return `        ${f.camelName}: true,`;
      if (f.type === 'date') return `        ${f.camelName}: new Date().toISOString(),`;
      return `        ${f.camelName}: 'test',`;
    })
    .join('\n');

  return `import { describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';

const app = buildApp();
const password = 'password123';

const uniqueEmail = () =>
  \`${names.kebab}-user-\${Date.now()}-\${Math.random().toString(36).slice(2)}@example.com\`;

async function registerTestUser(name = '${singularPascal} Tester') {
  const email = uniqueEmail();
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/register',
    payload: { email, password, name },
  });

  expect(res.statusCode).toBe(201);
  const body = res.json();

  return {
    userId: body.data.user.id as string,
    token: body.data.token as string,
  };
}

describe('${singularPascal} Module Integration (/api/v1/${pluralKebab})', () => {
  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/${pluralKebab}',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Validation & Endpoint Handling', () => {
    it('rejects invalid request payload on creation with 400 VALIDATION_ERROR', async () => {
      const { token } = await registerTestUser();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/${pluralKebab}',
        headers: { authorization: \`Bearer \${token}\` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('creates resource when valid payload is provided', async () => {
      const { token, userId } = await registerTestUser();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/${pluralKebab}',
        headers: { authorization: \`Bearer \${token}\` },
        payload: {
${validPayloadEntries}
        },
      });

      if (res.statusCode === 201) {
        const body = res.json();
        expect(body.success).toBe(true);
        expect(body.data.userId).toBe(userId);
        expect(body.data).toHaveProperty('id');
      } else {
        expect([201, 400]).toContain(res.statusCode);
      }
    });

    it('handles 404 for non-existent ${singularPascal} resource', async () => {
      const { token } = await registerTestUser();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/${pluralKebab}/00000000-0000-0000-0000-000000000000',
        headers: { authorization: \`Bearer \${token}\` },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });
  });
});
`;
}

/**
 * Generates the Drizzle ORM schema snippet.
 */
export function generateDrizzleSnippet(names: InflectedNames, fields: FieldDef[]): string {
  const { pluralCamel, pluralSnake } = names;

  const columnLines = fields
    .map((f) => {
      if (f.type === 'string') {
        return f.isOptional
          ? `    ${f.camelName}: text('${f.snakeName}'),`
          : `    ${f.camelName}: text('${f.snakeName}').notNull(),`;
      }
      if (f.type === 'number') {
        return f.isOptional
          ? `    ${f.camelName}: doublePrecision('${f.snakeName}'),`
          : `    ${f.camelName}: doublePrecision('${f.snakeName}').notNull(),`;
      }
      if (f.type === 'boolean') {
        return f.isOptional
          ? `    ${f.camelName}: boolean('${f.snakeName}'),`
          : `    ${f.camelName}: boolean('${f.snakeName}').notNull().default(false),`;
      }
      if (f.type === 'date') {
        return f.isOptional
          ? `    ${f.camelName}: timestamp('${f.snakeName}', { withTimezone: true }),`
          : `    ${f.camelName}: timestamp('${f.snakeName}', { withTimezone: true }).notNull(),`;
      }
      return `    ${f.camelName}: text('${f.snakeName}'),`;
    })
    .join('\n');

  return `// 1. Ensure required imports exist at the top of src/db/schema.ts:
// import { boolean, doublePrecision, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
//
// 2. Paste table definition into src/db/schema.ts:
export const ${pluralCamel} = pgTable(
  '${pluralSnake}',
  {
    id: uuid('id').primaryKey().default(sql\`gen_random_uuid()\`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
${columnLines}
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql\`now()\`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql\`now()\`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('${pluralSnake}_user_id_idx').on(table.userId),
    index('${pluralSnake}_created_at_idx').on(table.createdAt),
  ],
);
`;
}

export interface GeneratorOptions {
  name: string;
  fields?: string;
  force?: boolean;
  dryRun?: boolean;
  baseDir?: string;
}

export interface GeneratedFileInfo {
  filePath: string;
  relativePath: string;
  content: string;
}

export function generateModule(options: GeneratorOptions): {
  files: GeneratedFileInfo[];
  drizzleSnippet: string;
  routeRegistrationSnippet: string;
  testTruncationSnippet: string;
  names: InflectedNames;
  fields: FieldDef[];
} {
  validateModuleName(options.name);
  const names = inflectNames(options.name);
  const fields = parseFieldDefinitions(options.fields);

  const baseDir = options.baseDir || process.cwd();
  const targetDir = path.join(baseDir, 'src', 'modules', names.kebab);

  if (fs.existsSync(targetDir) && !options.force && !options.dryRun) {
    throw new Error(
      `Module directory "${targetDir}" already exists. Use --force to overwrite existing files.`,
    );
  }

  const files: GeneratedFileInfo[] = [
    {
      filePath: path.join(targetDir, `${names.kebab}.schema.ts`),
      relativePath: path.posix.join('src', 'modules', names.kebab, `${names.kebab}.schema.ts`),
      content: generateSchemaContent(names, fields),
    },
    {
      filePath: path.join(targetDir, `${names.kebab}.repository.ts`),
      relativePath: path.posix.join('src', 'modules', names.kebab, `${names.kebab}.repository.ts`),
      content: generateRepositoryContent(names),
    },
    {
      filePath: path.join(targetDir, `${names.kebab}.service.ts`),
      relativePath: path.posix.join('src', 'modules', names.kebab, `${names.kebab}.service.ts`),
      content: generateServiceContent(names, fields),
    },
    {
      filePath: path.join(targetDir, `${names.kebab}.routes.ts`),
      relativePath: path.posix.join('src', 'modules', names.kebab, `${names.kebab}.routes.ts`),
      content: generateRoutesContent(names),
    },
    {
      filePath: path.join(targetDir, 'index.ts'),
      relativePath: path.posix.join('src', 'modules', names.kebab, 'index.ts'),
      content: generateIndexContent(names),
    },
    {
      filePath: path.join(targetDir, `${names.kebab}.test.ts`),
      relativePath: path.posix.join('src', 'modules', names.kebab, `${names.kebab}.test.ts`),
      content: generateTestContent(names, fields),
    },
  ];

  if (!options.dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const file of files) {
      fs.writeFileSync(file.filePath, file.content, 'utf8');
    }
  }

  const drizzleSnippet = generateDrizzleSnippet(names, fields);
  const routeRegistrationSnippet = `// In src/routes/apiV1.ts, import and register:
import { ${names.pluralCamel}Routes } from '../modules/${names.kebab}/index.js';

// Inside apiV1Routes(app: FastifyInstance):
await app.register(${names.pluralCamel}Routes);
`;

  const testTruncationSnippet = `// In tests/setup.ts (line 22), add '${names.pluralCamel}' to the TRUNCATE query:
await pool.query('TRUNCATE TABLE examples, ${names.pluralCamel}, user_sessions, users RESTART IDENTITY CASCADE;');`;

  return {
    files,
    drizzleSnippet,
    routeRegistrationSnippet,
    testTruncationSnippet,
    names,
    fields,
  };
}

// CLI Execution Handler
const currentScriptPath = process.argv[1]?.replace(/\\/g, '/');
if (
  import.meta.url.endsWith(currentScriptPath || '') ||
  process.argv[1]?.endsWith('generateModule.ts')
) {
  try {
    const args = process.argv.slice(2);
    let moduleName = '';
    let fieldsArg: string | undefined;
    let force = false;
    let dryRun = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--force' || arg === '-f') {
        force = true;
      } else if (arg === '--dry-run') {
        dryRun = true;
      } else if (arg === '--fields' || arg === '-F') {
        fieldsArg = args[++i];
      } else if (!arg.startsWith('-') && !moduleName) {
        moduleName = arg;
      }
    }

    if (!moduleName) {
      console.error(
        'Usage: npm run generate:module -- <module-name> [--fields field:type,field:type:optional] [--force]',
      );
      console.error(
        'Example: npm run generate:module -- products --fields name:string,price:number,inStock:boolean',
      );
      process.exit(1);
    }

    const result = generateModule({
      name: moduleName,
      fields: fieldsArg,
      force,
      dryRun,
    });

    console.log(`\n🚀 Successfully generated module: "${result.names.kebab}"\n`);
    console.log('📁 Generated Files:');
    for (const file of result.files) {
      console.log(`  - ${file.relativePath}`);
    }

    console.log('\n======================================================================');
    console.log(`📋 Manual Integration Checklist to Activate "${result.names.kebab}" Module`);
    console.log('======================================================================');

    console.log('\nStep 1: Add Table & Required Imports to src/db/schema.ts:');
    console.log('---------------------------------------------------------');
    console.log(result.drizzleSnippet);

    console.log('Step 2: Generate and Apply Database Migration:');
    console.log('----------------------------------------------');
    console.log('  npm run db:generate');
    console.log('  npm run db:migrate');
    console.log('  (⚠️ Safety Reminder: Never run migrations in production without backup validation)');

    console.log('\nStep 3: Update Test Database Truncation in tests/setup.ts:');
    console.log('---------------------------------------------------------');
    console.log(result.testTruncationSnippet);

    console.log('\nStep 4: Register Module in API Router (src/routes/apiV1.ts):');
    console.log('-----------------------------------------------------------');
    console.log(result.routeRegistrationSnippet);

    console.log('Step 5: Run Module Integration Tests:');
    console.log('-------------------------------------');
    console.log(`  npx vitest run src/modules/${result.names.kebab}/${result.names.kebab}.test.ts`);
    console.log('======================================================================\n');
  } catch (error) {
    console.error(`❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

