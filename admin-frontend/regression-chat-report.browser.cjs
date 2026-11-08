const { chromium } = require('playwright')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  try {
    await page.goto(process.argv[2] || 'http://127.0.0.1:5190')
    await page.getByRole('button', { name: '超级管理员 admin / admin123' }).click()
    await page.getByRole('button', { name: '登录工作台' }).click()
    await page.waitForURL('**/#/dashboard')
    await page.getByText('控制台总览', { exact:true }).waitFor()
    await page.goto((process.argv[2] || 'http://127.0.0.1:5190')+'/#/chats')
    await page.getByRole('button', {name:'查看分析',exact:true}).first().waitFor()
    const expert = page.locator('.el-select').first()
    await expert.click()
    await page.getByRole('option').first().waitFor()
    assert.match(await page.getByRole('option').first().innerText(),/ID:/)
    await page.keyboard.press('Escape')
    await page.getByRole('button', {name:'重置',exact:true}).click()
    await page.getByRole('button', {name:'查看分析',exact:true}).first().click()
    await page.getByText('HTML 选品报告', {exact:true}).waitFor()
    await page.getByText('HTML 选品报告', {exact:true}).click()
    const preview = page.frameLocator('.pv-frame-wrap > iframe').frameLocator('iframe')
    await preview.getByRole('heading', {name:'选品分析报告',exact:true}).waitFor()
    assert.match(await preview.locator('body').innerText(),/北京时间 UTC\+08:00/)
    assert.equal(await preview.locator('h1').evaluate(el=>getComputedStyle(el).fontSize),'22px')
    const popupPromise = page.waitForEvent('popup')
    await page.getByRole('button', {name:'新窗口打开',exact:true}).first().click()
    const popup = await popupPromise
    await popup.waitForLoadState()
    assert.equal(await popup.evaluate(()=>window.opener===null),true)
    await popup.frameLocator('iframe').getByRole('heading',{name:'选品分析报告',exact:true}).waitFor()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button',{name:'下载 HTML',exact:true}).click()
    const download = await downloadPromise
    fs.statSync(os.tmpdir())
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'chat-report-regression-'))
    const saved = path.join(folder,download.suggestedFilename())
    await download.saveAs(saved)
    const offline = await context.newPage()
    await offline.goto('file:///'+saved.replace(/\\/g,'/'))
    await offline.frameLocator('iframe').getByRole('heading',{name:'选品分析报告',exact:true}).waitFor()
    assert.equal(await offline.locator('script').count(),0)
    assert.equal(await offline.locator('iframe').getAttribute('sandbox'),'')
    console.log('通过：真实页面专家名称选择、重置、分析预览、新窗口与下载后离线打开')
    // 向隔离工具投放无害探针；只改当前测试页内存，不写入应用数据。
    const probe = await page.evaluate(async()=>{
      const index=await(await fetch('/')).text()
      const main=index.match(/src="([^"]+\.js)"/)[1]
      const mainCode=await(await fetch(main)).text()
      const file=mainCode.match(/static-chat-report-[\w-]+\.js/)[0]
      const {s:staticReport}=await import('/assets/'+file)
      window.__probe=0
      const html=staticReport('<h1>无害隔离探针</h1><script>parent.__probe=1<\/script><img src="https://invalid.example/probe" onerror="parent.__probe=2"><form action="/probe"><input></form><a href="javascript:parent.__probe=3">导航探针</a><style>@import url("https://invalid.example/probe.css")</style>')
      const iframe=document.createElement('iframe');iframe.id='untrusted-report';iframe.sandbox='';iframe.srcdoc=html
      const done=new Promise(resolve=>iframe.onload=resolve);document.body.append(iframe);await done
      let blocked=false;try{iframe.contentWindow.localStorage}catch{blocked=true}
      return {html,scriptRan:window.__probe!==0,blocked}
    })
    assert.equal(probe.scriptRan,false)
    assert.equal(probe.blocked,true)
    const probeFrame=page.frameLocator('#untrusted-report').frameLocator('iframe')
    await probeFrame.getByRole('heading',{name:'无害隔离探针'}).waitFor()
    assert.equal(await probeFrame.locator('script,img,form,a,object,iframe').count(),0)
    const probePath=path.join(folder,'untrusted-report.html')
    const fixtureDownloadPromise=page.waitForEvent('download')
    await page.evaluate(html=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([html],{type:'text/html'}));a.download='untrusted-report.html';a.click()},probe.html)
    await (await fixtureDownloadPromise).saveAs(probePath)
    await offline.goto('file:///'+probePath.replace(/\\/g,'/'))
    await offline.frameLocator('iframe').getByRole('heading',{name:'无害隔离探针'}).waitFor()
    assert.equal(await offline.frameLocator('iframe').locator('script,img,form,a,object,iframe').count(),0)
    assert.equal(await offline.evaluate(()=>{try{document.querySelector('iframe').contentWindow.localStorage;return false}catch{return true}}),true)
    assert.deepEqual(errors,[])
    console.log('通过：不可信报告静态净化、父页面/存储隔离、离线同策略及无页面运行异常')
    console.log('测试下载保存在系统临时目录：'+folder)
  } finally { await browser.close() }
}
main().catch(e=>{console.error(e);process.exitCode=1})
