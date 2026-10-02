import { z } from 'zod';
import {
  cursorPaginationSchema,
  limitOffsetPaginationSchema,
} from '../../utils/pagination.js';

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const createExampleSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  description: z.string().trim().max(1000).optional(),
});

export type CreateExampleInput = z.infer<typeof createExampleSchema>;

export const updateExampleSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(255).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (data) => data.name !== undefined || data.description !== undefined,
    {
      message: 'At least one field (name or description) must be provided for update',
    },
  );

export type UpdateExampleInput = z.infer<typeof updateExampleSchema>;

export const examplePaginationQuerySchema = cursorPaginationSchema.extend({
  offset: z.coerce.number().int().min(0).optional(),
});

export type ExamplePaginationQuery = z.infer<typeof examplePaginationQuerySchema>;

export interface ExampleResponse {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
