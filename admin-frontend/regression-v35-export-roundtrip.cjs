/**
 * v35 回归 2：导出 ZIP 往返 —— 含图片附件的技能导出后，图片字节须原样保留（可再导入）。
 * run: node regression-v35-export-roundtrip.cjs
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BASE = process.env.V35_BASE || 'http://192.168.0.43:5180';
const ZIP = path.join(__dirname, 'Temp', 'import-image-test.zip');
const OUT = path.join(__dirname, 'Temp', 'exported-skill.zip');
const SRC_IMG = path.join(__dirname, 'Temp', 'imgtest', 'dld-img-test', 'icon.png');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);
  await page.goto(BASE + '/#/skills', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // 导入含图技能包
  await page.setInputFiles('input[type="file"][accept*="zip"]', ZIP);
  await page.waitForTimeout(1500);
  const skipBox = await page.$('.el-message-box');
  if (skipBox) {
    const btn = await skipBox.$('.el-message-box__btns .el-button--primary');
    if (btn) await btn.click();
    await page.waitForTimeout(700);
  }
  await page.click('.import-settings .el-select');
  await page.waitForTimeout(500);
  await page.click('.el-select-dropdown__item:has-text("有维AI")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("应用到勾选")');
  await page.waitForTimeout(300);
  await page.click('.el-dialog__footer button:has-text("开始导入")');
  await page.waitForTimeout(1500);
  await page.click('.el-dialog__footer button:has-text("关闭")');
  await page.waitForTimeout(800);

  // 行操作「更多」→「导出 ZIP」（先开下拉，再点菜单项触发下载）
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.rows .row')).find((r) => r.textContent.includes('图片导入测试技能'));
    const more = row && Array.from(row.querySelectorAll('button')).find((b) => b.textContent.includes('更多'));
    if (more) more.click();
  });
  await page.waitForTimeout(800);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.evaluate(() => {
      const item = Array.from(document.querySelectorAll('.el-dropdown-menu__item')).filter((i) => i.offsetParent !== null && i.textContent.includes('导出 ZIP'))[0];
      if (item) item.click();
    })
  ]);
  await dl.saveAs(OUT);
  await page.waitForTimeout(500);

  // 校验导出包里的图片字节与原图一致
  const { execFileSync } = require('child_process');
  const tmp = path.join(__dirname, 'Temp', 'export-check');
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${OUT}' -DestinationPath '${tmp}' -Force`], { stdio: 'ignore' });

  const findImg = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { const r = findImg(p); if (r) return r; }
      else if (e.name.toLowerCase() === 'icon.png') return p;
    }
    return null;
  };
  const exportedImg = findImg(tmp);
  const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const out = {
    downloaded: dl.suggestedFilename(),
    exportedImg: exportedImg ? exportedImg.replace(tmp, '<tmp>') : null,
    srcSha: sha(SRC_IMG),
    outSha: exportedImg ? sha(exportedImg) : null,
    same: exportedImg ? sha(SRC_IMG) === sha(exportedImg) : false,
    outSize: exportedImg ? fs.statSync(exportedImg).size : 0,
    srcSize: fs.statSync(SRC_IMG).size,
    errors
  };
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
