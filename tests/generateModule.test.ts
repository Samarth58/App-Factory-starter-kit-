import { describe, expect, it } from 'vitest';
import {
  generateModule,
  inflectNames,
  mapSpecToFieldDefs,
  parseFieldDefinitions,
  parseModuleSpec,
  validateModuleName,
} from '../scripts/generateModule.js';

describe('Module Generator CLI', () => {
  describe('validateModuleName', () => {
    it('accepts valid module names', () => {
      expect(() => validateModuleName('products')).not.toThrow();
      expect(() => validateModuleName('categories')).not.toThrow();
      expect(() => validateModuleName('order_items')).not.toThrow();
      expect(() => validateModuleName('order-items')).not.toThrow();
    });

    it('rejects empty or whitespace-only names', () => {
      expect(() => validateModuleName('')).toThrow(/empty/);
      expect(() => validateModuleName('   ')).toThrow(/empty/);
    });

    it('rejects path traversal attempts', () => {
      expect(() => validateModuleName('../evil')).toThrow(/path traversal/);
      expect(() => validateModuleName('foo/bar')).toThrow(/path traversal/);
      expect(() => validateModuleName('foo\\bar')).toThrow(/path traversal/);
    });

    it('rejects reserved keywords and identifiers', () => {
      expect(() => validateModuleName('admin')).toThrow(/reserved/);
      expect(() => validateModuleName('auth')).toThrow(/reserved/);
      expect(() => validateModuleName('prototype')).toThrow(/reserved/);
    });

    it('rejects invalid identifier characters', () => {
      expect(() => validateModuleName('123products')).toThrow(/letter/);
      expect(() => validateModuleName('prod@ucts')).toThrow(/letter/);
    });
  });

  describe('inflectNames', () => {
    it('correctly handles regular plural names', () => {
      const names = inflectNames('products');
      expect(names.kebab).toBe('products');
      expect(names.singularPascal).toBe('Product');
      expect(names.pluralPascal).toBe('Products');
      expect(names.pluralCamel).toBe('products');
    });

    it('correctly handles -ies plurals like categories', () => {
      const names = inflectNames('categories');
      expect(names.kebab).toBe('categories');
      expect(names.singularPascal).toBe('Category');
      expect(names.pluralPascal).toBe('Categories');
      expect(names.singularCamel).toBe('category');
    });

    it('correctly handles singular inputs', () => {
      const names = inflectNames('booking');
      expect(names.singularPascal).toBe('Booking');
      expect(names.pluralPascal).toBe('Bookings');
    });
  });

  describe('parseFieldDefinitions', () => {
    it('returns default name and description when no fields provided', () => {
      const fields = parseFieldDefinitions();
      expect(fields).toHaveLength(2);
      expect(fields[0].name).toBe('name');
      expect(fields[0].isOptional).toBe(false);
      expect(fields[1].name).toBe('description');
      expect(fields[1].isOptional).toBe(true);
    });

    it('parses multiple data types and modifiers', () => {
      const fields = parseFieldDefinitions(
        'title:string,price:number,inStock:boolean,dueDate:date:optional',
      );
      expect(fields).toHaveLength(4);

      expect(fields[0]).toMatchObject({
        name: 'title',
        type: 'string',
        isOptional: false,
      });
      expect(fields[1]).toMatchObject({
        name: 'price',
        type: 'number',
        isOptional: false,
      });
      expect(fields[2]).toMatchObject({
        name: 'inStock',
        type: 'boolean',
        isOptional: false,
      });
      expect(fields[3]).toMatchObject({
        name: 'dueDate',
        type: 'date',
        isOptional: true,
      });
    });

    it('throws on unsupported types or invalid field names', () => {
      expect(() => parseFieldDefinitions('count:unsupported')).toThrow(/Unsupported/);
      expect(() => parseFieldDefinitions('123invalid:string')).toThrow(/Invalid field name/);
    });
  });

  describe('Specification-to-Module Bridge', () => {
    it('parses a valid module specification', () => {
      const spec = {
        name: 'products',
        fields: [
          { name: 'name', type: 'string', required: true },
          { name: 'price', type: 'number', required: true },
          { name: 'description', type: 'string', required: false },
        ],
        operations: ['create', 'read', 'update', 'delete'],
        pagination: true,
      };

      const parsed = parseModuleSpec(spec);
      expect(parsed.name).toBe('products');
      expect(parsed.fields).toHaveLength(3);
      expect(parsed.operations).toEqual(['create', 'read', 'update', 'delete']);
      expect(parsed.pagination).toBe(true);
    });

    it('maps specification fields into generator FieldDef format', () => {
      const fieldDefs = mapSpecToFieldDefs([
        { name: 'product_name', type: 'string', required: true },
        { name: 'unit_price', type: 'number', required: false },
        { name: 'is_active', type: 'boolean', required: true },
        { name: 'released_at', type: 'date', required: false },
      ]);

      expect(fieldDefs).toHaveLength(4);
      expect(fieldDefs[0]).toMatchObject({
        camelName: 'productName',
        pascalName: 'ProductName',
        snakeName: 'product_name',
        type: 'string',
        isOptional: false,
      });
      expect(fieldDefs[1]).toMatchObject({
        camelName: 'unitPrice',
        type: 'number',
        isOptional: true,
      });
      expect(fieldDefs[2]).toMatchObject({
        camelName: 'isActive',
        type: 'boolean',
        isOptional: false,
      });
      expect(fieldDefs[3]).toMatchObject({
        camelName: 'releasedAt',
        type: 'date',
        isOptional: true,
      });
    });

    it('rejects specifications with unsupported field types', () => {
      const spec = {
        name: 'products',
        fields: [{ name: 'category', type: 'relation', required: true }],
      };

      expect(() => parseModuleSpec(spec)).toThrow(/Invalid field type/);
    });

    it('rejects specifications with unsupported operations', () => {
      const spec = {
        name: 'products',
        fields: [{ name: 'name', type: 'string', required: true }],
        operations: ['create', 'archive'],
      };

      expect(() => parseModuleSpec(spec)).toThrow(/Invalid operation/);
    });

    it('rejects duplicate field definitions in specification', () => {
      const spec = {
        name: 'products',
        fields: [
          { name: 'name', type: 'string', required: true },
          { name: 'name', type: 'string', required: false },
        ],
      };

      expect(() => parseModuleSpec(spec)).toThrow(/Duplicate field/);
    });

    it('rejects reserved system fields in specification (id, userId, createdAt, etc.)', () => {
      const spec = {
        name: 'products',
        fields: [{ name: 'created_at', type: 'date', required: true }],
      };

      expect(() => parseModuleSpec(spec)).toThrow(/reserved system field/);
    });

    it('rejects malformed specification objects missing required fields', () => {
      expect(() => parseModuleSpec({})).toThrow(/Specification validation failed/);
      expect(() => parseModuleSpec({ name: 'products', fields: [] })).toThrow(
        /at least one field/i,
      );
      expect(() => parseModuleSpec(null)).toThrow(/valid JSON object/);
    });
  });

  describe('generateModule in dry-run mode', () => {
    it('generates all expected module files with schema, service, routes, repository, and test using CLI parameters', () => {
      const result = generateModule({
        name: 'products',
        fields: 'name:string,price:number,inStock:boolean,description:string:optional',
        dryRun: true,
      });

      expect(result.files).toHaveLength(6);
      const fileNames = result.files.map((f) => f.relativePath);

      expect(fileNames).toContain('src/modules/products/products.schema.ts');
      expect(fileNames).toContain('src/modules/products/products.repository.ts');
      expect(fileNames).toContain('src/modules/products/products.service.ts');
      expect(fileNames).toContain('src/modules/products/products.routes.ts');
      expect(fileNames).toContain('src/modules/products/index.ts');
      expect(fileNames).toContain('src/modules/products/products.test.ts');

      // Check Drizzle table and route registration snippets
      const schemaFile = result.files.find((f) => f.relativePath.endsWith('products.schema.ts'))!;
      const repoFile = result.files.find((f) => f.relativePath.endsWith('products.repository.ts'))!;
      const routesFile = result.files.find((f) => f.relativePath.endsWith('products.routes.ts'))!;

      // Modular schema defines pgTable and Row type
      expect(schemaFile.content).toContain('export const products = pgTable(');
      expect(schemaFile.content).toContain("doublePrecision('price').notNull()");
      expect(schemaFile.content).toContain("boolean('in_stock').notNull().default(false)");
      expect(schemaFile.content).toContain('export type ProductRow = typeof products.$inferSelect;');

      // Repository imports from modular schema and re-exports Row type
      expect(repoFile.content).toContain("from './products.schema.js'");
      expect(repoFile.content).toContain('export type { ProductRow };');

      // Regression test: pagination metadata is properly cast to Record<string, unknown>
      expect(routesFile.content).toContain('result.meta as unknown as Record<string, unknown>');

      // Integration checklist snippets
      expect(result.drizzleSnippet).toContain("export { products } from '../modules/products/index.js';");
      expect(result.routeRegistrationSnippet).toContain('productsRoutes');
    });

    it('generates all expected module files using specification input', () => {
      const spec = {
        name: 'orders',
        fields: [
          { name: 'orderNumber', type: 'string', required: true },
          { name: 'totalAmount', type: 'number', required: true },
          { name: 'isPaid', type: 'boolean', required: false },
          { name: 'placedAt', type: 'date', required: true },
        ],
        operations: ['create', 'read', 'update', 'delete'],
        pagination: true,
      };

      const result = generateModule({
        spec,
        dryRun: true,
      });

      expect(result.files).toHaveLength(6);
      expect(result.names.kebab).toBe('orders');
      expect(result.names.singularPascal).toBe('Order');
      expect(result.names.pluralPascal).toBe('Orders');

      const schemaFile = result.files.find((f) => f.relativePath.endsWith('orders.schema.ts'))!;
      expect(schemaFile.content).toContain('export const orders = pgTable(');
      expect(schemaFile.content).toContain("text('order_number').notNull()");
      expect(schemaFile.content).toContain("doublePrecision('total_amount').notNull()");
      expect(schemaFile.content).toContain("boolean('is_paid')");
      expect(schemaFile.content).toContain(
        "timestamp('placed_at', { withTimezone: true }).notNull()",
      );
      expect(result.drizzleSnippet).toContain("export { orders } from '../modules/orders/index.js';");
    });
  });
});
