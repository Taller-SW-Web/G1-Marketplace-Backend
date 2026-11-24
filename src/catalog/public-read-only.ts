import { CatalogError } from './errors';

const listParameters = new Set([
  'canal', 'pagina', 'tamanio', 'q', 'categoriaId', 'marcaId', 'precioMin', 'precioMax', 'orden',
]);
const productById = /^\/api\/v1\/productos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Closed transport boundary for existing public catalog consumers, not a generic proxy. */
export function assertPublicCatalogRead(method: string, path: string, options: { allowDetailBySlug?: boolean } = {}): void {
  const deny = () => { throw new CatalogError('CATALOG_UNAVAILABLE', 503, 'PUBLIC_READ_NOT_ALLOWED'); };
  if (method !== 'GET' || !path.startsWith('/api/v1/')) return deny();
  const url = new URL(path, 'https://catalog.invalid');
  // Reject absolute URLs, normalized traversal, encoded path segments and fragments.
  if (url.origin !== 'https://catalog.invalid' || `${url.pathname}${url.search}` !== path ||
      url.pathname.includes('%') || url.hash) return deny();
  if (['/api/v1/categorias', '/api/v1/marcas'].includes(url.pathname)) {
    if (url.search) return deny();
    return;
  }
  const list = url.pathname === '/api/v1/productos';
  const slug = options.allowDetailBySlug === true && /^\/api\/v1\/productos\/por-slug\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname) && url.pathname.split('/').at(-1)!.length <= 120;
  if (!list && !productById.test(url.pathname) && !slug) return deny();
  const seen = new Set<string>();
  for (const key of url.searchParams.keys()) {
    if (seen.has(key) || !(list ? listParameters.has(key) : key === 'canal')) return deny();
    seen.add(key);
  }
  if (url.searchParams.get('canal') !== 'MARKETPLACE') return deny();
}
