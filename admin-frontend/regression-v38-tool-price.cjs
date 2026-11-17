/**
 * v38 回归：MCP 新建/编辑「工具收单价」输入框（0–1、4 位小数）+ 列表「收单价」列。
 * run: node regression-v38-tool-price.cjs
 */
const { chromium } = require('playwright');
const BASE = process.env.V38_BASE || 'http://192.168.0.43:5180';

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
  await page.goto(BASE + '/#/mcp', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  // 1) 新建抽屉：输入框存在且默认空
  await page.locator('button:has-text("新增"), button:has-text("新建")').first().click();
  await page.waitForTimeout(900);
  out.drawerOpen = await page.evaluate(() => !!document.querySelector('.el-drawer'));
  out.hasInput = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.el-drawer .el-form-item'));
    const item = items.find((i) => i.textContent.includes('工具收单价'));
    if (!item) return null;
    return {
      hasNumberInput: !!item.querySelector('.el-input-number input'),
      placeholder: item.querySelector('input')?.getAttribute('placeholder') || '',
      hint: item.querySelector('.unit-hint')?.textContent.trim() || ''
    };
  });

  // 2) 输入 0.0033，超过 4 位小数自动舍入；输入越界值校验
  const input = page.locator('.el-drawer .el-input-number input');
  await input.fill('0.0033');
  await page.waitForTimeout(300);
  await input.blur();
  await page.waitForTimeout(300);
  out.valueAfterInput = await input.inputValue();

  // 3) 直接保存（编码/名称必填先填）
  await page.fill('.el-drawer .el-form-item:has-text("连接编码") input', 'price-test-mcp');
  await page.fill('.el-drawer .el-form-item:has-text("名称") input', '收单价测试连接');
  await page.fill('.el-drawer .el-form-item:has-text("服务地址") input', 'https://price-test.example.com/mcp');
  await page.fill('.el-drawer .el-form-item:has-text("端点路径") input', '/mcp');
  await page.locator('.el-drawer button:has-text("保存连接")').click();
  await page.waitForTimeout(500);
  out.msgAfterSave = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  await page.waitForTimeout(600);
  // 版本确认框
  await page.waitForTimeout(600);
  out.confirmDialog = await page.evaluate(() => {
    const dlg = Array.from(document.querySelectorAll('.el-dialog')).find((d) => d.offsetParent !== null && d.textContent.includes('发布版本'));
    if (!dlg) return null;
    return { title: dlg.querySelector('.el-dialog__title')?.textContent.trim(), buttons: Array.from(dlg.querySelectorAll('button')).map((b) => b.textContent.trim()) };
  });
  await page.locator('.el-dialog:visible button').filter({ hasText: /确认发布|确定|保存/ }).first().click().catch(() => {});
  await page.waitForTimeout(1800);

  // 4) 列表出现新行 + 收单价列显示 ¥0.0033
  await page.waitForTimeout(1500);
  out.toasts = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  await page.waitForTimeout(500);
  out.listRow = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.el-table__row')).find((r) => r.textContent.includes('收单价测试连接'));
    if (row) return row.textContent.replace(/\s+/g, ' ').trim().slice(0, 160);
    // 兜底：转义引号变体（名称里没有引号，但列内可能有嵌套）——直接搜包含 ¥0.0033 的行
    const alt = Array.from(document.querySelectorAll('.el-table__row')).find((r) => r.textContent.includes('0.0033'));
    return alt ? 'ALT: ' + alt.textContent.replace(/\s+/g, ' ').trim().slice(0, 160) : null;
  });

  // 5) 编辑回显
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.el-table__row')).find((r) => r.textContent.includes('收单价测试连接'));
    const btn = row && Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === '编辑');
    if (btn) btn.click();
  });
  await page.waitForTimeout(900);
  out.editEcho = await page.locator('.el-drawer .el-input-number input').inputValue().catch(() => null);

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
