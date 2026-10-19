import { PaginationQuerySchema, type Paginated } from '@vtmp/shared';

export interface PageRequest {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

/** Parses ?page=&pageSize= (pageSize capped at MAX_PAGE_SIZE) into Prisma skip/take. */
export function parsePagination(query: unknown): PageRequest {
  const { page, pageSize } = PaginationQuerySchema.parse(query ?? {});
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(data: T[], total: number, req: PageRequest): Paginated<T> {
  return {
    data,
    meta: {
      page: req.page,
      pageSize: req.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / req.pageSize)),
    },
  };
}
