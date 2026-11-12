/**
 * v36 回归：导入设置「选中即生效」——只选归属智能体，不点「应用到勾选」，直接开始导入应成功。
 * run: node regression-v36-import-settings.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.V36_BASE || 'http://192.168.0.43:5180';
const ZIP = path.join(__dirname, 'Temp', 'import-image-test.zip');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const out = {};

  await page.goto(BASE + '/#/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/#/skills', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.setInputFiles('input[type="file"][accept*="zip"]', ZIP);
  await page.waitForTimeout(1500);
  const skip = await page.$('.el-message-box');
  if (skip) { const b = await skip.$('.el-message-box__btns .el-button--primary'); if (b) await b.click(); await page.waitForTimeout(700); }

  // 初始状态：行内归属为空
  out.beforePick = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.owner-line')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3)
  );

  // 只选智能体（千问），不点「应用到勾选」
  await page.click('.import-settings .el-select');
  await page.waitForTimeout(500);
  await page.click('.el-select-dropdown__item:has-text("千问")');
  await page.waitForTimeout(600);

  out.afterPick = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.owner-line')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()).slice(0, 3)
  );
  out.pendingHighlight = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.owner-pending')).map((e) => e.textContent.trim())
  );
  out.toastAfterPick = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-message')).map((e) => e.textContent.replace(/\s+/g, ' ').trim())
  );

  // 直接开始导入（不点「应用到勾选」）
  await page.click('.el-dialog__footer button:has-text("开始导入")');
  await page.waitForTimeout(1800);
  out.importResult = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-dialog__body .hint-ok, .el-dialog__body .hint-err')).map((e) => e.textContent.replace(/\s+/g, ' ').trim())
  );
  out.blockingToast = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-message--warning')).map((e) => e.textContent.replace(/\s+/g, ' ').trim())
  );

  // 关闭后看列表标签：应显示 千问
  await page.click('.el-dialog__footer button:has-text("关闭")');
  await page.waitForTimeout(1000);
  out.rowTags = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.rows .row')).find((r) => r.textContent.includes('图片导入测试技能'));
    return row ? row.textContent.replace(/\s+/g, ' ').trim().slice(0, 120) : null;
  });

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
