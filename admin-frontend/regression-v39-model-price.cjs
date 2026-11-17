/**
 * v39 回归：模型管理「输入价格 / 输出价格」（元/百万 tokens，4 位小数）+ 列表价格列。
 * run: node regression-v39-model-price.cjs
 */
const { chromium } = require('playwright');
const BASE = process.env.V39_BASE || 'http://192.168.0.43:5180';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 911 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  const out = {};

  await page.goto(BASE + '/#/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/#/models', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // 1) 手动新建：切到手动添加模式
  await page.locator('button:has-text("新建"), button:has-text("新增"), button:has-text("接入")').first().click();
  await page.waitForTimeout(900);
  await page.waitForTimeout(600);
  out.drawerButtons = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-drawer button, .el-drawer .el-radio-button')).map((b) => b.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20)
  );
  const manualBtn = page.locator('.el-drawer button, .el-drawer .el-radio-button').filter({ hasText: /手动/ }).first();
  if (await manualBtn.count()) { await manualBtn.click(); await page.waitForTimeout(600); }
  out.modeAfterClick = await page.evaluate(() => document.querySelector('.el-drawer')?.textContent.includes('模型编码') || false);

  // 2) 价格输入框存在性
  out.inputs = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.el-drawer .el-form-item'));
    const pick = (label) => {
      const item = items.find((i) => i.querySelector('.el-form-item__label')?.textContent.trim() === label);
      if (!item) return null;
      return { hasNumberInput: !!item.querySelector('.el-input-number input'), unit: item.querySelector('.price-unit')?.textContent.trim() || '' };
    };
    return { in: pick('输入价格'), out: pick('输出价格') };
  });

  // 3) 填表保存
  await page.fill('.el-drawer .el-form-item:has(.el-form-item__label:has-text("模型编码")) input', 'price-test-model');
  await page.fill('.el-drawer .el-form-item:has(.el-form-item__label:has-text("显示名")) input', '价格测试模型');
  const priceFields = page.locator('.el-drawer .el-form-item:has(.el-form-item__label:has-text("价格（元/M）")) .el-input-number input');
  await priceFields.nth(0).fill('14.12345');
  await priceFields.nth(1).fill('56.5');
  await priceFields.nth(0).blur(); await priceFields.nth(1).blur();
  await page.waitForTimeout(400);
  out.inValue = await priceFields.nth(0).inputValue().catch(() => null);
  out.outValue = await priceFields.nth(1).inputValue().catch(() => null);

  await page.locator('.el-drawer button:has-text("保存模型"), .el-drawer button:has-text("保存")').last().click();
  await page.waitForTimeout(700);
  out.msgAfterSave = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  await page.waitForTimeout(600);
  // 版本确认框（若有）
  await page.locator('.el-dialog:visible button').filter({ hasText: /确认|确定|保存/ }).first().click().catch(() => {});
  await page.waitForTimeout(1800);

  // 4) 列表行显示价格
  out.listRow = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.el-table__row')).find((r) => r.textContent.includes('价格测试模型'));
    return row ? row.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) : null;
  });
  // 调试：直接从 mock db 读该模型的落库数据
  out.dbRecord = await page.evaluate(() => {
    const parsed = JSON.parse(localStorage.getItem('leidaai-admin-demo-v1') || '{}');
    const pool = parsed?.data?.models || [];
    const m = pool.find((x) => x.code === 'price-test-model');
    if (!m) return { total: pool.length, sample: pool[0] ? Object.keys(pool[0]) : null };
    return { inputPrice: m.inputPrice, outputPrice: m.outputPrice, keys: Object.keys(m) };
  });

  // 5) 编辑回显
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.el-table__row')).find((r) => r.textContent.includes('价格测试模型'));
    const btn = row && Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === '编辑');
    if (btn) btn.click();
  });
  await page.waitForTimeout(900);
  const eFields = page.locator('.el-drawer .el-form-item:has(.el-form-item__label:has-text("价格（元/M）")) .el-input-number input');
  out.editIn = await eFields.nth(0).inputValue().catch(() => null);
  out.editOut = await eFields.nth(1).inputValue().catch(() => null);

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
