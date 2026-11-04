import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
// Assets oficiais empacotados pelo npm; nenhuma CDN ou chave é exposta no HTML.
export async function docsRoutes(app: FastifyInstance) {
  const assets = [
    ['swagger-ui.css', 'text/css'],
    ['swagger-ui-bundle.js', 'application/javascript'],
  ] as const;
  for (const [name, type] of assets) {
    const content = readFileSync(require.resolve(`swagger-ui-dist/${name}`));
    app.get(`/docs/${name}`, { schema: { hide: true } }, async (_request, reply) =>
      reply.type(type).send(content),
    );
  }
  app.get('/docs/init.js', { schema: { hide: true } }, async (_request, reply) =>
    reply
      .type('application/javascript')
      .send(
        'window.onload=()=>{window.ui=SwaggerUIBundle({url:"/docs/json",dom_id:"#swagger-ui",deepLinking:true,persistAuthorization:false});};',
      ),
  );
  app.get('/docs/json', { schema: { hide: true } }, async () => app.swagger());
  app.get('/docs', { schema: { hide: true } }, async (_request, reply) =>
    reply
      .type('text/html')
      .send(
        '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AGRO CERTA · API</title><link rel="stylesheet" href="/docs/swagger-ui.css"></head><body><div id="swagger-ui"></div><script src="/docs/swagger-ui-bundle.js"></script><script src="/docs/init.js"></script></body></html>',
      ),
  );
}
