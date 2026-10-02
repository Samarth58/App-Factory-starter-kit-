import type { FastifyInstance } from 'fastify';
import { authGuard } from '../../middleware/authGuard.js';
import { fail, ok } from '../../utils/response.js';
import {
  createExampleSchema,
  examplePaginationQuerySchema,
  idParamSchema,
  updateExampleSchema,
} from './exampleSchemas.js';
import {
  createExample,
  deleteExample,
  getExampleById,
  listExamplesCursor,
  listExamplesLimitOffset,
  updateExample,
} from './exampleService.js';

export async function exampleRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authGuard);

  app.post(
    '/examples',
    {
      schema: {
        tags: ['Examples'],
        summary: 'Create example resource',
        description: 'Creates a new example item owned by the authenticated user.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsed = createExampleSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply
          .status(400)
          .send(
            fail('VALIDATION_ERROR', 'Invalid request body', parsed.error.issues),
          );
      }

      const created = await createExample(request.userId!, parsed.data);
      return reply.status(201).send(ok(created));
    },
  );

  app.get(
    '/examples',
    {
      schema: {
        tags: ['Examples'],
        summary: 'List example resources',
        description:
          'Lists example items for the authenticated user with cursor or limit-offset pagination.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedQuery = examplePaginationQuerySchema.safeParse(request.query);

      if (!parsedQuery.success) {
        return reply
          .status(400)
          .send(
            fail(
              'VALIDATION_ERROR',
              'Invalid pagination query parameters',
              parsedQuery.error.issues,
            ),
          );
      }

      const query = parsedQuery.data;

      if (query.offset !== undefined) {
        const result = await listExamplesLimitOffset(request.userId!, {
          limit: query.limit,
          offset: query.offset,
        });
        return reply
          .status(200)
          .send(ok(result.data, result.meta as unknown as Record<string, unknown>));
      }

      const result = await listExamplesCursor(request.userId!, {
        limit: query.limit,
        cursor: query.cursor,
      });

      return reply
        .status(200)
        .send(ok(result.data, result.meta as unknown as Record<string, unknown>));
    },
  );

  app.get(
    '/examples/:id',
    {
      schema: {
        tags: ['Examples'],
        summary: 'Get example by ID',
        description:
          'Retrieves an example resource by ID ensuring tenant isolation.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(
            fail('VALIDATION_ERROR', 'Invalid example id', parsedId.error.issues),
          );
      }

      const example = await getExampleById(parsedId.data.id, request.userId!);

      if (!example) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Example not found', []));
      }

      return reply.status(200).send(ok(example));
    },
  );

  app.patch(
    '/examples/:id',
    {
      schema: {
        tags: ['Examples'],
        summary: 'Update example resource',
        description:
          'Partially updates an example resource ensuring tenant isolation.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(
            fail('VALIDATION_ERROR', 'Invalid example id', parsedId.error.issues),
          );
      }

      const parsedBody = updateExampleSchema.safeParse(request.body);

      if (!parsedBody.success) {
        return reply
          .status(400)
          .send(
            fail('VALIDATION_ERROR', 'Invalid request body', parsedBody.error.issues),
          );
      }

      const updated = await updateExample(
        parsedId.data.id,
        request.userId!,
        parsedBody.data,
      );

      if (!updated) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Example not found', []));
      }

      return reply.status(200).send(ok(updated));
    },
  );

  app.delete(
    '/examples/:id',
    {
      schema: {
        tags: ['Examples'],
        summary: 'Delete example resource',
        description: 'Soft-deletes an example resource ensuring tenant isolation.',
        security: [{ bearerAuth: [] }],
      },
    },
    async (request, reply) => {
      const parsedId = idParamSchema.safeParse(request.params);

      if (!parsedId.success) {
        return reply
          .status(400)
          .send(
            fail('VALIDATION_ERROR', 'Invalid example id', parsedId.error.issues),
          );
      }

      const deleted = await deleteExample(parsedId.data.id, request.userId!);

      if (!deleted) {
        return reply
          .status(404)
          .send(fail('RESOURCE_NOT_FOUND', 'Example not found', []));
      }

      return reply.status(200).send(ok({ success: true }));
    },
  );
}
