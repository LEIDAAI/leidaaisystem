/**
 * v45.2 线上核验：消耗明细筛选（v44）+ 详情抽屉逐接口双价（v43）+ 双窗口登录态（v45）。
 * run: V452_BASE=https://leidaai.github.io/leidaaisystem node regression-v452-online.cjs
 */
const { chromium } = require('playwright');
const BASE = process.env.V452_BASE || 'https://leidaai.github.io/leidaaisystem';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  const login = async (p) => {
    await p.goto(BASE + '/#/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForTimeout(1200);
    await p.evaluate(() => {
      const set = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value');
        d.set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      set(document.querySelector('input[type="text"]'), 'admin');
      set(document.querySelector('input[type="password"]'), 'admin123');
    });
    await p.click('button:has-text("登录")');
    await p.waitForTimeout(2200);
    return p.url();
  };

  const out = {};
  out.loginUrl = await login(page);

  // 消耗明细页
  await page.goto(BASE + '/#/credits', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  out.rows = await page.locator('.el-table__body-wrapper .el-table__row').count();
  out.kpi = await page.locator('.kpi-card, .stat-card, .summary-card').allInnerTexts().catch(() => []);
  out.hasExpertFilter = await page.locator('text=专家').first().isVisible().catch(() => false);
  out.filterPlaceholders = await page.locator('.filter-bar input, .el-input__inner').evaluateAll(
    (els) => els.map((e) => e.placeholder || '').filter(Boolean)
  ).catch(() => []);

  // 打开第一条详情抽屉
  const firstView = page.locator('button:has-text("详情"), a:has-text("详情")').first();
  if (await firstView.count()) {
    await firstView.click();
    await page.waitForTimeout(1200);
    out.drawerVisible = await page.locator('.el-drawer').isVisible().catch(() => false);
    out.drawerHeaders = await page.locator('.el-drawer .el-table__header th').allInnerTexts().catch(() => []);
    out.drawerRows = await page.locator('.el-drawer .el-table__body tbody tr').allInnerTexts().catch(() => []);
    await page.keyboard.press('Escape');
  }

  // 双窗口：新标签页应共享登录态
  const page2 = await ctx.newPage();
  await page2.goto(BASE + '/#/dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page2.waitForTimeout(2000);
  out.secondTabUrl = page2.url();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  out.afterReloadUrl = page.url();

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})();
