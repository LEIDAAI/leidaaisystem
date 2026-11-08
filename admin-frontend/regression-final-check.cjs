/** 本轮修复的浏览器回归脚本：计费规则、菜单分组、抽屉清理、对话时间与筛选（run: node regression-final-check.cjs） */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://192.168.0.43:5174/#/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);
  const out = {};

  out.billingRules = await page.evaluate(() => {
    const t = document.body.textContent;
    return {
      prorated: t.includes('按实付价折算'),
      queue: t.includes('排队'),
      noRefund: t.includes('一律不退款'),
      reminder: t.includes('前 7 天提醒'),
      tiers: t.includes('标准版 / 高级版 / 旗舰版')
    };
  });

  out.menuGroups = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-menu-item-group__title, .submenu-title')).map((e) => e.textContent.trim()).slice(0, 8)
  );

  await page.goto('http://192.168.0.43:5174/#/plans');
  await page.waitForTimeout(1200);
  const rowButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-table__row button')).map((b) => b.textContent.trim()).slice(0, 10)
  );
  out.planRowButtons = rowButtons;
  if (rowButtons.includes('编辑')) {
    await page.evaluate(() => {
      Array.from(document.querySelectorAll('.el-table__row button')).find((b) => b.textContent.trim() === '编辑').click();
    });
    await page.waitForTimeout(800);
  }
  await page.goto('http://192.168.0.43:5174/#/credit-packages');
  await page.waitForTimeout(1200);
  out.staleDrawers = await page.evaluate(
    () => Array.from(document.querySelectorAll('.el-drawer')).filter((d) => d.offsetParent !== null || getComputedStyle(d).display !== 'none').length
  );
  out.credit365 = await page.evaluate(() => document.body.textContent.includes('365 天'));

  await page.goto('http://192.168.0.43:5174/#/chats');
  await page.waitForTimeout(1400);
  out.chatChecks = await page.evaluate(() => {
    const t = document.body.textContent;
    const timeRe = /20\d\d-\d\d-\d\d \d\d:\d\d:\d\d/;
    return { expertFilter: t.includes('专家'), bjTime: timeRe.test(t) };
  });

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  if (errors.length) {
    console.log('PAGE_ERRORS:', errors.slice(0, 5).join(' | '));
    process.exit(1);
  }
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
