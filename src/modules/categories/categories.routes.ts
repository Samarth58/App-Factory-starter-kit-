import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/authGuard.js';
import { fail, ok } from '../../utils/response.js';
import {
  createCategorySchema,
  idParamSchema,
  categoriesPaginationQuerySchema,
  updateCategorySchema,
} from './categories.schema.js';
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  listCategoriesCursor,
  listCategoriesLimitOffset,
  updateCategory,
} from './categories.service.js';

export async function categoriesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.post(
    '/categories',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Create category resource',
        description: 'Creates a new category owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = createCategorySchema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues));
      }

      const created = await createCategory(request.userId!, parsed.data);
      return reply.status(201).send(ok(created));
    },
  );

  app.get(
    '/categories',
    {
      schema: {
        tags: ['Categories'],
        summary: 'List categories',
        description:
          'Retrieves a paginated list of categories owned by the authenticated user. Supports both cursor and offset pagination.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = categoriesPaginationQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues));
      }

      const { limit, cursor, offset } = parsed.data;

      if (offset !== undefined) {
        const result = await listCategoriesLimitOffset(request.userId!, { limit, offset });
        return reply.status(200).send(ok(result.data, result.meta as unknown as Record<string, unknown>));
      }

      const result = await listCategoriesCursor(request.userId!, { limit, cursor });
      return reply.status(200).send(ok(result.data, result.meta as unknown as Record<string, unknown>));
    },
  );

  app.get(
    '/categories/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Get category by ID',
        description: 'Retrieves a single category resource owned by the authenticated user.',
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

      const found = await getCategoryById(parsed.data.id, request.userId!);

      if (!found) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Category not found', []));
      }

      return reply.status(200).send(ok(found));
    },
  );

  app.put(
    '/categories/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Update category',
        description: 'Updates a category resource owned by the authenticated user.',
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

      const parsedBody = updateCategorySchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsedBody.error.issues));
      }

      const updated = await updateCategory(
        parsedParams.data.id,
        request.userId!,
        parsedBody.data,
      );

      if (!updated) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Category not found', []));
      }

      return reply.status(200).send(ok(updated));
    },
  );

  app.delete(
    '/categories/:id',
    {
      schema: {
        tags: ['Categories'],
        summary: 'Delete category',
        description: 'Soft-deletes a category resource owned by the authenticated user.',
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

      const deleted = await deleteCategory(parsed.data.id, request.userId!);

      if (!deleted) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Category not found', []));
      }

      return reply.status(200).send(ok({ success: true }));
    },
  );
}
