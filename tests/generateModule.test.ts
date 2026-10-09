import { describe, expect, it } from 'vitest';
import {
  generateModule,
  inflectNames,
  parseFieldDefinitions,
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

  describe('generateModule in dry-run mode', () => {
    it('generates all expected module files with schema, service, routes, repository, and test', () => {
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
      expect(result.drizzleSnippet).toContain('export const products = pgTable(');
      expect(result.drizzleSnippet).toContain("doublePrecision('price').notNull()");
      expect(result.drizzleSnippet).toContain("boolean('in_stock').notNull().default(false)");
      expect(result.routeRegistrationSnippet).toContain('productsRoutes');
    });
  });
});
