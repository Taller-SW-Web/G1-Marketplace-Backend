// Real adapter path against a local G6 HTTP double; synthetic ranking port, no external grant.
import * as http from 'node:http';
import { once } from 'node:events';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogController } from '../src/catalog/catalog.controller';
import { CatalogService } from '../src/catalog/catalog.service';
import { CatalogExceptionFilter } from '../src/catalog/catalog-exception.filter';
import { CatalogRequestInterceptor } from '../src/catalog/catalog-request.interceptor';
import { createRealProvider, CONTRACT_SHA, CONTRACT_VERSION } from '../src/catalog/provider';
import { CATALOG_PROVIDER } from '../src/catalog/types';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const product = (n: number) => ({ product_id: id(n), name: 'Product '+n, slug: 'product-'+n,
  categoria_id: 'cat', marca_id: 'brand', images: [], status: 'ACTIVO', private_field: 'must-not-publish' });
describe('F006: defined highlights > historical best sellers > confirmed cold-start random', () => {
  let app: INestApplication, upstream: http.Server, base: string, mode: string;
  let seen: string[], signals: AbortSignal[], ranking: jest.Mock;
  beforeAll(async () => {
    upstream = http.createServer((req,res) => {
      seen.push(req.url!); res.setHeader('Content-Type','application/json');
      expect(req.headers.authorization).toBe('Bearer synthetic-test-token');
      const url = new URL(req.url!,'http://local');
      if (url.pathname.endsWith('/categorias')) return void res.end('{"categories":[]}');
      if (mode === 'catalog-error') { res.statusCode=503; return void res.end('{}'); }
      if (url.pathname.endsWith('/productos')) {
        expect(url.searchParams.get('orden')).toBe('NOMBRE_ASC');
        expect(url.searchParams.get('canal')).toBe('MARKETPLACE');
        const pagina=Number(url.searchParams.get('pagina')), tamanio=Number(url.searchParams.get('tamanio'));
        const total=mode==='empty-catalog'?0:73;
        const items=Array.from({length:Math.max(0,Math.min(tamanio,total-(pagina-1)*tamanio))},(_,i)=>product((pagina-1)*tamanio+i+1));
        return void res.end(JSON.stringify({items,total,pagina,tamanio}));
      }
      if (url.pathname.endsWith(id(99)) && mode !== 'editorial' || mode === 'ineligible-history') {
        res.statusCode=404; return void res.end('{"code":"PRODUCTO_NO_ENCONTRADO"}');
      }
      const n=Number(url.pathname.split('/').pop()!.slice(-12));
      res.end(JSON.stringify(product(n)));
    });
    upstream.listen(0,'127.0.0.1'); await once(upstream,'listening');
    base=`http://127.0.0.1:${(upstream.address() as {port:number}).port}`;
  });
  beforeEach(async () => {
    mode='cold';seen=[];signals=[];
    ranking=jest.fn(async () => {
      if (mode==='sales-error') throw new Error('private-sales-error');
      return ['history','ineligible-history'].includes(mode)
        ? {hasHistory:true,orderedProductIds:[id(2),id(1)]}
        : {hasHistory:false,orderedProductIds:[]};
    });
    const provider=createRealProvider({NODE_ENV:'test',CATALOG_INTEGRATION_APPROVED:'true',
      PRODUCTOS_BASE_URL:base,PRODUCTOS_SERVICE_TOKEN:'synthetic-test-token',
      PRODUCTOS_CONTRACT_VERSION:CONTRACT_VERSION,PRODUCTOS_CONTRACT_SHA:CONTRACT_SHA,
      CATALOG_FEATURED_ENABLED:'true',CATALOG_FEATURED_APPROVED:'true',CATALOG_FEATURED_IDS:id(99),
      CATALOG_HOME_FALLBACK_ENABLED:'true'}, async (url, options) => {
        signals.push(options.signal!); return fetch(url,options);
      },{salesRanking:ranking,randomIndex:max=>max-1});
    const module=await Test.createTestingModule({controllers:[CatalogController],providers:[
      CatalogService,CatalogExceptionFilter,CatalogRequestInterceptor,{provide:CATALOG_PROVIDER,useValue:provider},
    ]}).compile();
    app=module.createNestApplication({logger:false});await app.init();
  });
  afterEach(async () => {await app.close();});
  afterAll(async () => {upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));});
  it('keeps defined highlights without querying sales',async()=>{
    mode='editorial';const response=await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(response.body.featuredProducts.map((p:{productId:string})=>p.productId)).toEqual([id(99)]);
    expect(ranking).not.toHaveBeenCalled();
  });
  it('uses sales order and revalidates product facts against G6',async()=>{
    mode='history';const response=await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(response.body.featuredProducts.map((p:{productId:string})=>p.productId)).toEqual([id(2),id(1)]);
    expect(seen.some(url=>url.includes('/productos?'))).toBe(false);
  });
  it('samples beyond page one only on confirmed absence of history, with one Home signal',async()=>{
    const response=await request(app.getHttpServer()).get('/api/v1/catalog/home')
      .set('Authorization','Bearer visitor-must-not-forward').expect(200);
    expect(response.body.featuredProducts.map((p:{productId:string})=>p.productId)).toEqual([73,72,71,70,69,68,67,66].map(id));
    expect(new Set(signals).size).toBe(1);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(response.body)).not.toMatch(/private_field|hasHistory|orderedProductIds|synthetic-test-token/);
    expect(response.headers['x-catalog-source']).toBe('REAL');
  });
  it('does not label existing but ineligible history as a cold start',async()=>{
    mode='ineligible-history';const response=await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(response.body.featuredProducts).toEqual([]);
    expect(seen.some(url=>url.includes('/productos?'))).toBe(false);
  });
  it('returns empty for an actually empty catalog',async()=>{
    mode='empty-catalog';const response=await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(200);
    expect(response.body.featuredProducts).toEqual([]);
  });
  it.each(['sales-error','catalog-error'])('keeps %s as an error, not a fabricated fallback',async next=>{
    mode=next;const response=await request(app.getHttpServer()).get('/api/v1/catalog/home').expect(503);
    expect(response.body.code).toBe('CATALOG_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/private-sales-error|synthetic-test-token/);
  });
});
