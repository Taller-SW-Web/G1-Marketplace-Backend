import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const frontend = process.argv[2];
if (!frontend) throw new Error('Pasa la ruta del worktree de frontend.');
const { chromium } = createRequire(resolve(frontend, 'package.json'))('@playwright/test');
const origin = 'http://127.0.0.1:3002';
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const context = await browser.newContext();
  await context.route('**/*', route =>
    route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
  const page = await context.newPage();
  await page.goto(origin + '/login');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('a@fixture.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('Fixture-only!123');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await page.waitForURL(origin + '/');
  const response = await context.request.get(origin + '/api/v1/auth/session');
  const session = await response.json();
  assert.equal(session.authenticated, true);
  assert.ok(!('accessToken' in session) && !('refreshToken' in session));
  const cookie = (await context.cookies(origin)).find(item => item.name === 'g1_session');
  assert.ok(cookie?.httpOnly);
  const storage = await page.evaluate(() => JSON.stringify({
    local: { ...localStorage },
    session: { ...sessionStorage },
    cookies: document.cookie,
  }));
  assert.ok(!storage.includes(cookie.value), 'La credencial de sesión aparece en estado legible por JavaScript');
  assert.ok(!/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(storage), 'Se observó un JWT en almacenamiento web');
  assert.ok(!/access.?token|refresh.?token/i.test(storage), 'Se observó un campo de credencial en almacenamiento web');
  console.log('MOCK navegador PASS: cookie HttpOnly; sin tokens en respuesta, cookies JS ni Web Storage.');
} finally {
  await browser.close();
}
