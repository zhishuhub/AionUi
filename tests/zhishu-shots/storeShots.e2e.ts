/**
 * Store screenshots for 智枢 AI 工作台, taken from the real app against a stand-in Zhishu site.
 *
 * Each step catches its own failure so one broken screen does not hide the others; every
 * screenshot comes with the page text and HTML next to it, and the stand-in logs every request.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ElectronApplication, Page } from '@playwright/test';
import { test } from '../e2e/fixtures';
import { httpGet, startAutoApprovePermissionMessages } from '../e2e/helpers';
import { createAionrsConversationViaBridge, getAionrsTestModels, waitForAionrsReply } from '../e2e/helpers/chatAionrs';
import { startFakeZhishu, type FakeZhishu } from './fakeZhishu';

test.describe.configure({ timeout: 900_000 });

const OUT = path.resolve(__dirname, 'out');
const PORT = Number(process.env.ZHISHU_FAKE_PORT || 3999);
const WORKSPACE = process.env.SHOTS_WORKSPACE || path.join(os.homedir(), 'Documents', '客户询价');
const WIDTH = 1440;
const HEIGHT = 900;

const INQUIRIES: Record<string, string> = {
  '01-Anna Schmidt.txt': `From: Anna Schmidt <anna.schmidt@example.de>
Date: 2026-10-27
Subject: Request for quotation - LED panel 600x600

Hello,

we are planning to order 500 pcs of the LED panel 600x600 (40W, 4000K).
Please send us your FOB Shanghai price and confirm the CE certificate.
We need the goods in our warehouse before 15 December.

Best regards,
Anna Schmidt
Purchasing
`,
  '02-佐藤 健.txt': `差出人: 佐藤 健 <sato@example.jp>
件名: ダウンライト DL-90 お見積りのお願い

いつもお世話になっております。
DL-90 ダウンライトを 1,200 台、色温度 3000K で検討しております。
日本語の取扱説明書は付属可能でしょうか。
納期は来年 1 月中旬を希望します。

よろしくお願いいたします。
`,
  '03-Luis García.txt': `De: Luis García <luis.garcia@example.es>
Asunto: Cotización proyectores LED 100W

Hola,

necesitamos 300 proyectores LED de exterior de 100W lo antes posible.
Estamos comparando dos ofertas: ¿pueden darnos pago a 30 días?

Saludos,
Luis García
`,
  '04-王磊.txt': `发件人：王磊 <wanglei@example.cn>
主题：30×120 面板灯询价

你好，我们这边要 800 套 30×120 的面板灯，11 月底前要到货。
麻烦报一下含税价，能不能先寄两套样品？

王磊
`,
};

const SUMMARY = `# 询价汇总（2026-10-28）

| 客户 | 国家 | 产品 | 数量 | 期望交期 | 要点 |
| --- | --- | --- | --- | --- | --- |
| Anna Schmidt | 德国 | LED 面板灯 600×600 40W 4000K | 500 套 | 12 月 15 日前到仓 | 要 FOB 上海价，确认 CE 认证 |
| 佐藤 健 | 日本 | 筒灯 DL-90 3000K | 1,200 台 | 明年 1 月中旬 | 问能否附日文说明书 |
| Luis García | 西班牙 | 户外投光灯 100W | 300 台 | 越快越好 | 在比价，问能否 30 天账期 |
| 王磊 | 中国 | 面板灯 30×120 | 800 套 | 11 月底前到货 | 要含税价，先寄 2 套样品 |
`;

const FINAL_ANSWER = `已整理 4 份询价，汇总表存为 \`询价汇总.md\`：

| 客户 | 国家 | 产品 | 数量 | 期望交期 | 要点 |
| --- | --- | --- | --- | --- | --- |
| Anna Schmidt | 德国 | LED 面板灯 600×600 | 500 套 | 12 月 15 日前 | 要 FOB 上海价和 CE 认证 |
| 佐藤 健 | 日本 | 筒灯 DL-90 | 1,200 台 | 明年 1 月中旬 | 要日文说明书 |
| Luis García | 西班牙 | 户外投光灯 100W | 300 台 | 越快越好 | 在比价，问 30 天账期 |
| 王磊 | 中国 | 面板灯 30×120 | 800 套 | 11 月底前 | 要含税价和样品 |

建议先回 **Luis García**（他在比价，最急）和 **王磊**（交期最近）。要我按这张表给每位客户起草回复吗？`;

const errors: string[] = [];
let fake: FakeZhishu | null = null;

async function snap(page: Page, name: string, withDom = true): Promise<void> {
  await page.evaluate(() => document.fonts.ready).catch((): undefined => undefined);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  if (!withDom) return;
  const text = await page.evaluate(() => `${location.hash}\n\n${document.body.innerText}`).catch(() => '');
  fs.writeFileSync(path.join(OUT, `${name}.txt`), text);
  fs.writeFileSync(path.join(OUT, `${name}.html`), await page.content().catch(() => ''));
}

async function step(page: Page, name: string, run: () => Promise<void>): Promise<void> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    errors.push(`## ${name}\n${message}\n`);
    fs.writeFileSync(path.join(OUT, 'errors.md'), errors.join('\n'));
    await snap(page, `ERR-${name}`).catch((): undefined => undefined);
  }
}

async function resizeWindow(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows().find((item) => !item.webContents.getURL().startsWith('devtools'));
      if (!win) return;
      if (win.isMaximized()) win.unmaximize();
      win.setContentSize(size.width, size.height);
      win.center();
    },
    { width: WIDTH, height: HEIGHT }
  );
}

async function go(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => window.location.assign(target), hash);
  await page.waitForFunction((target) => window.location.hash.startsWith(target), hash, { timeout: 10_000 });
  await page.waitForTimeout(1500);
}

async function saveJson(name: string, load: () => Promise<unknown>): Promise<void> {
  const value = await load().catch((error: unknown) => ({ error: String(error) }));
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(value, null, 2));
}

test.beforeAll(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(WORKSPACE, { recursive: true });
  for (const [name, content] of Object.entries(INQUIRIES)) fs.writeFileSync(path.join(WORKSPACE, name), content);
  fake = await startFakeZhishu({
    port: PORT,
    outDir: OUT,
    workspace: WORKSPACE,
    summaryMarkdown: SUMMARY,
    finalAnswer: FINAL_ANSWER,
  });
});

test.afterAll(async () => {
  await fake?.close();
});

test('store screenshots', async ({ electronApp, page }) => {
  const mainLog = path.join(OUT, 'main.log');
  electronApp.process().stdout?.on('data', (data: Buffer) => fs.appendFileSync(mainLog, data));
  electronApp.process().stderr?.on('data', (data: Buffer) => fs.appendFileSync(mainLog, data));
  await resizeWindow(electronApp);
  await page.waitForTimeout(2000);

  await step(page, 'connect', async () => {
    const input = page.locator('input[placeholder="APP-XXXX-XXXX-XXXX"]');
    await input.waitFor({ state: 'visible', timeout: 60_000 });
    await page.waitForTimeout(800);
    await snap(page, '01-connect');
    await input.fill('APP-7K3M-Q8WD-ZH2N');
    await input.waitFor({ state: 'detached', timeout: 30_000 });
    await page.waitForTimeout(2500);
    await snap(page, '02-home');
  });

  await saveJson('providers.json', () => httpGet(page, '/api/providers'));
  await saveJson('assistants.json', () => httpGet(page, '/api/assistants'));
  await saveJson('agents.json', () => httpGet(page, '/api/agents/management'));

  await step(page, 'files', async () => {
    const models = await getAionrsTestModels(page);
    if (!models) throw new Error('no aionrs-compatible provider after connecting');
    const id = await createAionrsConversationViaBridge(page, {
      name: '客户询价汇总',
      workspace: WORKSPACE,
      provider: models.modelA,
    });
    await go(page, `#/conversation/${id}`);
    const input = page.locator('textarea').last();
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await input.fill(
      '把这个文件夹里客户发来的询价整理成一张汇总表（客户、国家、产品、数量、交期、要点），存成「询价汇总.md」。'
    );
    await page.waitForTimeout(500);
    await snap(page, '03-files-typed', false);
    await input.press('Enter');
    let stopApprove: (() => void) | null = null;
    const started = Date.now();
    for (let frame = 0; Date.now() - started < 60_000; frame++) {
      await page.waitForTimeout(2000);
      await snap(page, `03-files-frame-${String(frame).padStart(2, '0')}`, frame % 5 === 0);
      if (!stopApprove && Date.now() - started > 6000) stopApprove = startAutoApprovePermissionMessages(page);
      const exists = fs.existsSync(path.join(WORKSPACE, '询价汇总.md'));
      if (exists && frame > 6) break;
    }
    await waitForAionrsReply(page, id, 120_000).catch((error: unknown) => errors.push(`files reply: ${String(error)}`));
    stopApprove?.();
    await page.waitForTimeout(1500);
    await snap(page, '03-files-done');
    await saveJson('files-conversation.json', () => httpGet(page, `/api/conversations/${encodeURIComponent(id)}`));
  });

  await step(page, 'image', async () => {
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      const gradient = ctx.createLinearGradient(0, 0, 1024, 1024);
      gradient.addColorStop(0, '#f6d365');
      gradient.addColorStop(1, '#fda085');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 1024);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    if (png) fake?.setImage(Buffer.from(png, 'base64'));
    const models = await getAionrsTestModels(page);
    if (!models) throw new Error('no provider');
    const id = await createAionrsConversationViaBridge(page, {
      name: '新品宣传海报',
      workspace: WORKSPACE,
      provider: models.modelA,
    });
    await go(page, `#/conversation/${id}`);
    const input = page.locator('textarea').last();
    await input.waitFor({ state: 'visible', timeout: 30_000 });
    await input.fill('画一张新品宣传海报：LED 面板灯，简洁明亮，暖色背景。');
    await input.press('Enter');
    const stopApprove = startAutoApprovePermissionMessages(page);
    await waitForAionrsReply(page, id, 90_000).catch((error: unknown) => errors.push(`image reply: ${String(error)}`));
    stopApprove();
    await page.waitForTimeout(1500);
    await snap(page, '04-image-done');
  });

  await step(page, 'cron', async () => {
    await go(page, '#/scheduled');
    await snap(page, '05-cron-empty');
    await page.getByText('新建任务', { exact: true }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(800);
    await snap(page, '05-cron-menu', false);
    await page.getByText('手动创建', { exact: true }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    await snap(page, '05-cron-form');
  });

  await step(page, 'settings', async () => {
    await go(page, '#/settings/zhishu');
    await snap(page, '06-settings');
    await go(page, '#/settings/about');
    await snap(page, '07-about');
  });

  await step(page, 'home-again', async () => {
    await go(page, '#/guid');
    await snap(page, '08-home-with-history');
  });

  fs.writeFileSync(path.join(OUT, 'errors.md'), errors.join('\n') || 'no errors\n');
});
