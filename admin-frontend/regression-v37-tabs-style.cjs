/** v37 截图：技能页分组导航改版（容器卡片 + 行标签对齐 + 计数徽章） */
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.V37_BASE || 'http://192.168.0.43:5180';
const SHOTS = path.join(__dirname, 'Temp', 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 911 } });
  await page.goto(BASE + '/#/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/#/skills', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // 默认视图（全部）
  const el = page.locator('.group-tabs');
  await el.screenshot({ path: path.join(SHOTS, 'v37-tabs-default.png') });

  // 点一个平台 → 出现场景行
  await page.locator('.tab-pill', { hasText: '1688' }).first().click();
  await page.waitForTimeout(600);
  await el.screenshot({ path: path.join(SHOTS, 'v37-tabs-scenario.png') });

  // 校验：三行左缘对齐（标签定宽 46px）
  const check = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll('.group-tabs .row-label')).map((e) => ({
      text: e.textContent.trim(), w: e.getBoundingClientRect().width
    }));
    const pills1 = document.querySelector('.group-tabs .tab-row:not(.sub) .tab-pill')?.getBoundingClientRect();
    return { labels, firstPillLeft: pills1 ? Math.round(pills1.left) : null };
  });
  console.log(JSON.stringify(check, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
