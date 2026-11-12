/**
 * v35 回归：技能包「图片附件」导入 + 编辑器预览。
 * run: node regression-v35-image-import.cjs
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.V35_BASE || 'http://192.168.0.43:5180';
const ZIP = path.join(__dirname, 'Temp', 'import-image-test.zip');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  const out = {};
  await page.goto(BASE + '/#/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="text"]', 'admin');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button:has-text("登录")');
  await page.waitForTimeout(1500);

  await page.goto(BASE + '/#/skills', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // ---- 1. 导入含图片的技能包
  await page.setInputFiles('input[type="file"][accept*="zip"]', ZIP);
  await page.waitForTimeout(1500);

  // 跳过项弹窗：图片已被支持 → 不应出现（或内容为空）
  const skipBox = await page.$('.el-message-box');
  if (skipBox) {
    out.skipDialog = (await skipBox.textContent()).replace(/\s+/g, ' ').trim();
    const btn = await page.$('.el-message-box__btns .el-button--primary');
    if (btn) await btn.click();
    await page.waitForTimeout(800);
  } else {
    out.skipDialog = null;
  }

  // ---- 2. 导入预览：附件列显示图片缩略图
  const dlg = await page.$('.el-dialog:has-text("导入技能预览")');
  out.dialogOpen = !!dlg;
  if (dlg) {
    out.attachments = await page.evaluate(() => {
      const thumbs = Array.from(document.querySelectorAll('.attach-thumb')).map((i) => ({
        src: (i.getAttribute('src') || '').slice(0, 30),
        len: (i.getAttribute('src') || '').length
      }));
      const text = Array.from(document.querySelectorAll('.attach-text')).map((e) => e.textContent.trim());
      return { thumbs, text };
    });

    // 选归属智能体 → 应用到勾选
    await page.click('.import-settings .el-select');
    await page.waitForTimeout(500);
    await page.click('.el-select-dropdown__item:has-text("有维AI")');
    await page.waitForTimeout(300);
    await page.click('button:has-text("应用到勾选")');
    await page.waitForTimeout(400);

    // 开始导入
    await page.click('.el-dialog__footer button:has-text("开始导入")');
    await page.waitForTimeout(1500);
    out.importResult = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.el-dialog__body .hint-ok, .el-dialog__body .hint-err')).map((e) => e.textContent.trim())
    );
    await page.click('.el-dialog__footer button:has-text("关闭")');
    await page.waitForTimeout(800);
  }

  // ---- 3. 列表出现新技能
  await page.waitForTimeout(500);
  out.listHasSkill = await page.evaluate(() => document.body.textContent.includes('图片导入测试技能'));

  // ---- 4. 打开编辑器 → 选图片 → 预览
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.rows .row')).find((r) => r.textContent.includes('图片导入测试技能'));
    const btn = row && Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === '编辑');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
  out.editorOpen = await page.evaluate(() => !!document.querySelector('.skill-editor-dialog'));

  // 文件树里的图片缩略图
  out.treeThumbs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.skill-editor-dialog .tree-thumb')).map((t) => ({
      alt: t.getAttribute('alt'), len: (t.getAttribute('src') || '').length
    }))
  );

  // 点击 icon.png → 右侧应出现图片预览
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll('.skill-editor-dialog .tree-item'));
    const target = items.find((i) => i.textContent.includes('icon.png'));
    if (target) target.click();
  });
  await page.waitForTimeout(900);
  out.preview = await page.evaluate(() => {
    const p = document.querySelector('.skill-editor-dialog .img-preview');
    if (!p) return null;
    const img = p.querySelector('img');
    return {
      visible: !!p,
      srcHead: (img?.getAttribute('src') || '').slice(0, 24),
      srcLen: (img?.getAttribute('src') || '').length,
      meta: p.querySelector('.img-preview-meta')?.textContent.replace(/\s+/g, ' ').trim(),
      statusBar: document.querySelector('.skill-editor-dialog .status-bar')?.textContent.replace(/\s+/g, ' ').trim()
    };
  });

  // 图片自然尺寸（确认 base64 解码成功，不是坏图）
  out.imgNatural = await page.evaluate(() => {
    const img = document.querySelector('.skill-editor-dialog .img-preview img');
    return img ? { w: img.naturalWidth, h: img.naturalHeight, complete: img.complete } : null;
  });

  // ---- 5. 发布版本（校验 encoding/mime 能落库）
  console.log('PHASE-A', JSON.stringify(out, null, 2));
  await page.locator('button:has-text("发布版本")').first().click();
  await page.waitForTimeout(900);
  out.publishDialog = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.el-dialog__body .el-form-item__label')).map((e) => e.textContent.trim()).filter((t) => /版本名称|变更说明|归属智能体/.test(t))
  );
  const nameInput = await page.$('.el-dialog:has-text("发布版本确认") input');
  if (nameInput) await nameInput.fill('v35 图片导入验证');
  await page.click('.el-dialog:has-text("发布版本确认") .el-dialog__footer button:has-text("确认发布")');
  await page.waitForTimeout(2000);

  // 发布后重新打开，图片仍在（localStorage 落库验证）
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.skill-editor-dialog .se-header-right button')).find((b) => b.textContent.includes('关闭'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);
  const confirmLeave = await page.$('.el-message-box');
  if (confirmLeave) {
    const ok = await confirmLeave.$('.el-message-box__btns .el-button--primary');
    if (ok) await ok.click();
  }
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('.rows .row')).find((r) => r.textContent.includes('图片导入测试技能'));
    const btn = row && Array.from(row.querySelectorAll('button')).find((b) => b.textContent.trim() === '编辑');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
  out.persistedThumbs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.skill-editor-dialog .tree-thumb')).map((t) => ({
      alt: t.getAttribute('alt'), len: (t.getAttribute('src') || '').length
    }))
  );

  out.errors = errors;
  console.log(JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
