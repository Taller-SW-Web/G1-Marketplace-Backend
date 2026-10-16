export type CatalogSource = 'MOCK' | 'REAL' | 'UNCONFIGURED';
export type CatalogEnvironment = Record<string, string | undefined>;
export type CatalogFetch = (url: URL, options: RequestInit) => Promise<Response>;

export interface Category {
  categoryId: string;
  name: string;
}

export interface ProductCardDTO {
  productId: string;
  slug: string;
  name: string;
  categoryId: string;
  brandId: string;
  image: { url: string; alt: string };
}

export interface HomeDTO {
  categories: Category[];
  featuredProducts: ProductCardDTO[];
}

export interface CatalogPageDTO {
  data: ProductCardDTO[];
  page: { number: number; size: number; totalElements: number; totalPages: number };
}

export interface CatalogQuery {
  q: string;
  page: number;
  pageSize: number;
  categoryId?: string;
  sort?: 'NAME_ASC' | 'NAME_DESC';
}

export interface CatalogProvider {
  readonly source: CatalogSource;
  home(requestId?: string): Promise<HomeDTO>;
  search(query: CatalogQuery, requestId?: string): Promise<CatalogPageDTO>;
}

export const CATALOG_PROVIDER = Symbol('CATALOG_PROVIDER');
