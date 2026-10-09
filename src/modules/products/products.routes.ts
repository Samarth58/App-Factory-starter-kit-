import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/authGuard.js';
import { fail, ok } from '../../utils/response.js';
import {
  createProductSchema,
  idParamSchema,
  productsPaginationQuerySchema,
  updateProductSchema,
} from './products.schema.js';
import {
  createProduct,
  deleteProduct,
  getProductById,
  listProductsCursor,
  listProductsLimitOffset,
  updateProduct,
} from './products.service.js';

export async function productsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.post(
    '/products',
    {
      schema: {
        tags: ['Products'],
        summary: 'Create product resource',
        description: 'Creates a new product owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = createProductSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues));
      }

      const created = await createProduct(request.userId!, parsed.data);
      return reply.status(201).send(ok(created));
    },
  );

  app.get(
    '/products',
    {
      schema: {
        tags: ['Products'],
        summary: 'List products',
        description:
          'Retrieves a paginated list of products owned by the authenticated user. Supports both cursor and offset pagination.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = productsPaginationQuerySchema.safeParse(request.query);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid query parameters', parsed.error.issues));
      }

      const { limit, cursor, offset } = parsed.data;

      if (offset !== undefined) {
        const result = await listProductsLimitOffset(request.userId!, { limit, offset });
        return reply.status(200).send(ok(result.data, result.meta as unknown as Record<string, unknown>));
      }

      const result = await listProductsCursor(request.userId!, { limit, cursor });
      return reply.status(200).send(ok(result.data, result.meta as unknown as Record<string, unknown>));
    },
  );

  app.get(
    '/products/:id',
    {
      schema: {
        tags: ['Products'],
        summary: 'Get product by ID',
        description: 'Retrieves a single product resource owned by the authenticated user.',
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

      const found = await getProductById(parsed.data.id, request.userId!);

      if (!found) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Product not found', []));
      }

      return reply.status(200).send(ok(found));
    },
  );

  app.put(
    '/products/:id',
    {
      schema: {
        tags: ['Products'],
        summary: 'Update product',
        description: 'Updates a product resource owned by the authenticated user.',
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

      const parsedBody = updateProductSchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply
          .status(400)
          .send(fail('VALIDATION_ERROR', 'Invalid request body', parsedBody.error.issues));
      }

      const updated = await updateProduct(
        parsedParams.data.id,
        request.userId!,
        parsedBody.data,
      );

      if (!updated) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Product not found', []));
      }

      return reply.status(200).send(ok(updated));
    },
  );

  app.delete(
    '/products/:id',
    {
      schema: {
        tags: ['Products'],
        summary: 'Delete product',
        description: 'Soft-deletes a product resource owned by the authenticated user.',
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

      const deleted = await deleteProduct(parsed.data.id, request.userId!);

      if (!deleted) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Product not found', []));
      }

      return reply.status(200).send(ok({ success: true }));
    },
  );
}
