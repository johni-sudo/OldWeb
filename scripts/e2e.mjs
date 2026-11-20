import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8788';
const chromePath =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const outDir = path.resolve('.local/screens');
fs.mkdirSync(outDir, { recursive: true });

const sessions = JSON.parse(fs.readFileSync('.local/dev-sessions.json', 'utf8'));
const failures = [];
const consoleErrors = [];

function noteFailure(message) {
  failures.push(message);
  console.error(`FAIL: ${message}`);
}

async function attachErrorCapture(page, label) {
  page.on('pageerror', (error) => {
    consoleErrors.push(`${label}: pageerror ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('favicon.ico')) return;
    consoleErrors.push(`${label}: console ${text}`);
  });
}

async function checkOverflow(page, label) {
  const overflow = await page.evaluate(() => {
    const de = document.documentElement;
    return { width: de.scrollWidth, viewport: window.innerWidth };
  });
  if (overflow.width > overflow.viewport + 2) {
    noteFailure(`${label}: horizontal overflow ${overflow.width} > ${overflow.viewport}`);
  }
}

async function newContext(browser, viewport, cookie) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    locale: 'ru-RU',
    timezoneId: 'Asia/Qyzylorda',
  });
  if (cookie?.token) {
    await context.addCookies([
      {
        name: 'project_session',
        value: cookie.token,
        domain: '127.0.0.1',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
  }
  return context;
}

async function visit(page, url, label, { waitFor, screenshot = true } = {}) {
  const response = await page.goto(`${BASE_URL}${url}`, { waitUntil: 'networkidle' });
  if (!response || response.status() >= 400) {
    noteFailure(`${label}: HTTP ${response?.status()}`);
  }
  if (waitFor) {
    try {
      await page.waitForSelector(waitFor, { timeout: 8000 });
    } catch {
      noteFailure(`${label}: missing selector ${waitFor}`);
    }
  }
  await page.waitForTimeout(250);
  await checkOverflow(page, label);
  if (screenshot) {
    await page.evaluate(async () => {
      const step = Math.max(420, Math.floor(window.innerHeight * 0.72));
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 55));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `${label}.png`), fullPage: true });
  }
}

async function main() {
  if (!fs.existsSync(chromePath)) {
    throw new Error(`Chrome not found at ${chromePath}`);
  }
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const desktop = { width: 1440, height: 1000 };

  const publicContext = await newContext(browser, desktop);
  const publicPage = await publicContext.newPage();
  await attachErrorCapture(publicPage, 'public');

  await visit(publicPage, '/', 'home', { waitFor: '.hero h1' });
  await visit(publicPage, '/servers', 'servers', { waitFor: '#servers-grid .server-card' });
  await visit(publicPage, '/privileges', 'privileges', { waitFor: '#privileges-grid .privilege-card' });
  await visit(publicPage, '/news', 'news', { waitFor: '#news-grid .news-card' });
  await visit(publicPage, '/rules', 'rules', { waitFor: '#rules-content .rule-category' });
  await visit(publicPage, '/article?slug=welcome-to-project', 'article', {
    waitFor: '#article-content h2',
  });
  await visit(publicPage, '/privacy', 'privacy', { screenshot: false });
  await visit(publicPage, '/terms', 'terms', { screenshot: false });

  await visit(publicPage, '/account', 'account-guest', { screenshot: true });
  const accountGate = await publicPage.locator('#auth-gate-title').textContent();
  if (!/Войдите через Steam/.test(accountGate || '')) {
    noteFailure(`account gate: unexpected title "${accountGate}"`);
  }

  await publicPage.goto(`${BASE_URL}/servers`, { waitUntil: 'networkidle' });
  await publicPage.locator('#server-search').fill('Rust');
  await publicPage.waitForTimeout(300);
  const filtered = await publicPage.locator('#servers-grid .server-card').count();
  if (filtered !== 1) noteFailure(`servers search: expected 1 card, got ${filtered}`);
  await publicPage.locator('#server-search').fill('');

  await publicPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
  await publicPage.locator('.hero-actions a[href="/servers"]').click();
  if (!publicPage.url().endsWith('/servers')) noteFailure('home CTA did not navigate to /servers');

  await publicContext.close();

  const playerContext = await newContext(browser, desktop, sessions.player);
  const playerPage = await playerContext.newPage();
  await attachErrorCapture(playerPage, 'player');
  await visit(playerPage, '/account', 'account-player', { waitFor: '#account-content:not([hidden])' });
  const activeCards = await playerPage.locator('.active-privilege').count();
  if (activeCards < 1) noteFailure(`account: expected active privilege card, got ${activeCards}`);
  const orders = await playerPage.locator('#purchases-list tbody tr').count();
  if (orders < 2) noteFailure(`account: expected at least 2 orders, got ${orders}`);

  await visit(playerPage, '/privileges', 'privileges-player', { waitFor: '.privilege-card' });
  await playerPage.locator('[data-buy="1"]').click();
  await playerPage.waitForSelector('#purchase-form');
  await playerPage.locator('[name="customerNote"]').fill('Проверка оформления через браузер');
  await playerPage.locator('#purchase-submit').click();
  await playerPage.waitForSelector('.purchase-success', { timeout: 8000 });
  const orderCode = await playerPage.locator('.order-code').textContent();
  if (!orderCode?.startsWith('PRJ-')) noteFailure(`purchase flow: unexpected order ${orderCode}`);
  await playerPage.screenshot({ path: path.join(outDir, 'purchase-success.png'), fullPage: true });

  await playerContext.close();

  const adminContext = await newContext(browser, desktop, sessions.admin);
  const adminPage = await adminContext.newPage();
  await attachErrorCapture(adminPage, 'admin');
  await visit(adminPage, '/admin', 'admin-overview', { waitFor: '#admin-shell:not([hidden])' });
  await adminPage.locator('[data-admin-view="servers"]').click();
  await adminPage.waitForSelector('#servers-panel .admin-table');
  await adminPage.locator('#add-server').click();
  await adminPage.waitForSelector('#admin-entity-form');
  await adminPage.waitForTimeout(500);
  await adminPage.screenshot({ path: path.join(outDir, 'admin-server-form.png'), fullPage: true });
  await adminPage.locator('[data-dialog-close]').first().click();

  await adminPage.locator('[data-admin-view="purchases"]').click();
  await adminPage.waitForSelector('#purchases-panel .admin-table');
  await adminPage.locator('[data-manage-purchase]').first().click();
  await adminPage.waitForSelector('#admin-entity-form');
  await adminPage.waitForTimeout(500);
  await adminPage.screenshot({ path: path.join(outDir, 'admin-purchase.png'), fullPage: true });
  await adminPage.locator('[data-dialog-close]').first().click();

  await adminContext.close();

  const mobileContext = await newContext(browser, { width: 390, height: 844 });
  const mobilePage = await mobileContext.newPage();
  await attachErrorCapture(mobilePage, 'mobile');
  await visit(mobilePage, '/', 'home-mobile', { waitFor: '.hero h1' });
  await mobilePage.locator('[data-menu-toggle]').click();
  await mobilePage.waitForTimeout(250);
  const menuOpen = await mobilePage.locator('[data-mobile-nav]').evaluate((node) =>
    node.classList.contains('is-open'),
  );
  if (!menuOpen) noteFailure('mobile menu did not open');
  await mobilePage.screenshot({ path: path.join(outDir, 'mobile-menu.png'), fullPage: true });
  await visit(mobilePage, '/servers', 'servers-mobile', {
    waitFor: '#servers-grid .server-card',
  });
  await visit(mobilePage, '/account', 'account-guest-mobile', { screenshot: false });
  await mobileContext.close();

  await browser.close();

  if (consoleErrors.length) {
    console.error('\nConsole / page errors:');
    for (const error of consoleErrors) console.error(`- ${error}`);
    failures.push(`${consoleErrors.length} browser console/page error(s)`);
  }

  console.log(`\nScreenshots: ${outDir}`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\nE2E checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
