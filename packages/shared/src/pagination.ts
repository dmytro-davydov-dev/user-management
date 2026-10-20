import { z } from 'zod';

export const USERS_PAGE_SIZE = 6;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(USERS_PAGE_SIZE).default(USERS_PAGE_SIZE),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const PaginationMetaSchema = z.object({
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const paginatedResponseSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), pagination: PaginationMetaSchema });

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}
