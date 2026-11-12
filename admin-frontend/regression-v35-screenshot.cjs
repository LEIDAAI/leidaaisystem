/** v35 截图：导入预览（附件缩略图列）+ 技能编辑器图片预览 */
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.V35_BASE || 'http://192.168.0.43:5180';
const ZIP = path.join(__dirname, 'Temp', 'import-image-test.zip');
const SHOTS = path.join(__dirname, 'Temp', 'shots');
require('fs').mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1560, height: 940 } });
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/#/skills', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.setInputFiles('input[type="file"][accept*="zip"]', ZIP);
  await page.waitForTimeout(1600);
  const skip = await page.$('.el-message-box');
  if (skip) { const b = await skip.$('.el-message-box__btns .el-button--primary'); if (b) await b.click(); await page.waitForTimeout(600); }

  // 附件缩略图是否真的渲染出图
  const thumb = await page.evaluate(() => {
    const img = document.querySelector('.attach-thumb img');
    return img ? { w: img.naturalWidth, h: img.naturalHeight, len: (img.getAttribute('src') || '').length } : null;
  });
  console.log('import dialog thumb:', JSON.stringify(thumb));
  await page.screenshot({ path: path.join(SHOTS, 'v35-import-preview.png') });

  // 导入
  await page.click('.import-settings .el-select');
  await page.waitForTimeout(500);
  await page.click('.el-select-dropdown__item:has-text("有维AI")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("应用到勾选")');
  await page.waitForTimeout(300);
  await page.click('.el-dialog__footer button:has-text("开始导入")');
  await page.waitForTimeout(1500);
  await page.click('.el-dialog__footer button:has-text("关闭")');
  await page.waitForTimeout(900);

  // 打开编辑器 → 选图片
  await page.locator('.rows .row', { hasText: '图片导入测试技能' }).locator('button', { hasText: '编辑' }).first().click();
  await page.waitForTimeout(1600);
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.skill-editor-dialog .tree-item'));
    const t = items.find((i) => i.textContent.includes('icon.png'));
    if (t) t.click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SHOTS, 'v35-editor-image-preview.png') });
  console.log('shots ->', SHOTS);
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
