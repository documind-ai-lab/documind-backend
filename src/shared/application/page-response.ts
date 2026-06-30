export type PageResponse<T> = {
  items: T[];
  page: number;
  size: number;
  total: number;
  hasNext: boolean;
};

export function createPageResponse<T>(params: {
  items: T[];
  page: number;
  size: number;
  total: number;
}): PageResponse<T> {
  return { ...params, hasNext: params.page * params.size < params.total };
}
