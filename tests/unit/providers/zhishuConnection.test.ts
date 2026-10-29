/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userData: '', version: '2.2.2-zs.1', fetch: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: () => state.userData, getVersion: () => state.version },
  net: { fetch: (...args: unknown[]) => state.fetch(...args) },
}));
vi.mock('@process/services/i18n', () => ({ default: { t: (key: string) => key } }));

import {
  connectZhishu,
  disconnectZhishu,
  getZhishuStatus,
  getZhishuVersionInfo,
  getZhishuWorkspaceLinks,
  loadZhishuConnection,
  setZhishuWorkspaceLinks,
} from '@process/zhishu/connection';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const CODE = 'APP-2K7Q-M9XP-4TZA';
const CONNECTED = {
  success: true,
  data: { base_url: 'https://sub.example.com/v1', api_key: 'sk-test', models: ['chat', 'image'], user_name: '张**' },
};

describe('Zhishu connection', () => {
  beforeEach(() => {
    state.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'zhishu-conn-'));
    state.fetch.mockReset();
  });

  afterEach(() => {
    fs.rmSync(state.userData, { recursive: true, force: true });
  });

  it('exchanges a connect code (found inside pasted text) and saves the result', async () => {
    state.fetch.mockResolvedValue(json(200, CONNECTED));

    const { status, connected } = await connectZhishu(`接入码：${CODE.toLowerCase()} 请粘贴`);

    expect(connected).toBe(true);
    expect(status).toMatchObject({
      connected: true,
      userName: '张**',
      siteOrigin: 'https://sub.example.com',
      appKey: 'gongzt26',
    });
    const [url, init] = state.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://zhishuhub.com/api/apps/connect');
    expect(JSON.parse(String(init.body))).toEqual({ app_id: 'gongzt26', code: CODE });
    expect(loadZhishuConnection()).toMatchObject({ base_url: 'https://sub.example.com/v1', api_key: 'sk-test' });
  });

  it('shows the website message as-is when the code is rejected', async () => {
    state.fetch.mockResolvedValue(
      json(200, { success: false, code: 'code_expired', message: '接入码已过期，请回到网站重新点「一键接入」' })
    );

    const { status, connected } = await connectZhishu(CODE);

    expect(connected).toBe(false);
    expect(status.connected).toBe(false);
    expect(status.message).toBe('接入码已过期，请回到网站重新点「一键接入」');
    expect(loadZhishuConnection()).toBeNull();
  });

  it('does not call the website when there is no code', async () => {
    const { status } = await connectZhishu('hello');
    expect(state.fetch).not.toHaveBeenCalled();
    expect(status.message).toBe('settings.zhishu.codeNotFound');
  });

  it('asks to wait on HTTP 429 and reports network errors', async () => {
    state.fetch.mockResolvedValueOnce(new Response('', { status: 429 }));
    expect((await connectZhishu(CODE)).status.message).toBe('settings.zhishu.tooManyAttempts');

    state.fetch.mockRejectedValueOnce(new Error('offline'));
    expect((await connectZhishu(CODE)).status.message).toBe('settings.zhishu.networkError');
  });

  it('clears the connection when the website has revoked the key', async () => {
    state.fetch.mockResolvedValueOnce(json(200, CONNECTED));
    await connectZhishu(CODE);

    state.fetch.mockResolvedValueOnce(json(401, { error: { code: 'invalid_token', message: 'revoked' } }));
    const { status, revoked } = await getZhishuStatus(true);

    expect(revoked).toBe(true);
    expect(status).toMatchObject({ connected: false, message: 'settings.zhishu.revoked' });
    expect(loadZhishuConnection()).toBeNull();
  });

  it('keeps the connection when only the app quota is used up', async () => {
    state.fetch.mockResolvedValueOnce(json(200, CONNECTED));
    await connectZhishu(CODE);

    state.fetch.mockResolvedValueOnce(json(401, { error: { code: 'app_quota_exhausted' } }));
    const { status, revoked } = await getZhishuStatus(true);

    expect(revoked).toBe(false);
    expect(status.connected).toBe(true);
  });

  it('forgets the connection on reconnect', async () => {
    state.fetch.mockResolvedValueOnce(json(200, CONNECTED));
    await connectZhishu(CODE);

    expect(disconnectZhishu().connected).toBe(false);
    expect(loadZhishuConnection()).toBeNull();
  });

  it('compares with the version listed on the website the user connected from', async () => {
    state.fetch.mockResolvedValueOnce(json(200, CONNECTED));
    await connectZhishu(CODE);

    state.fetch.mockResolvedValueOnce(json(200, { success: true, data: { version: '2.2.2-zs.2' } }));
    const info = await getZhishuVersionInfo();

    expect(state.fetch.mock.calls[1][0]).toBe('https://sub.example.com/api/apps/gongzt26');
    expect(info).toEqual({
      current: '2.2.2-zs.1',
      latest: '2.2.2-zs.2',
      updateAvailable: true,
      pageUrl: 'https://sub.example.com/apps/gongzt26',
    });
  });

  it('reports no update when the website is unreachable', async () => {
    state.fetch.mockRejectedValue(new Error('offline'));
    const info = await getZhishuVersionInfo();
    expect(info).toMatchObject({ latest: '', updateAvailable: false, pageUrl: 'https://zhishuhub.com/apps/gongzt26' });
  });

  it('keeps only http(s) company-server addresses', () => {
    const saved = setZhishuWorkspaceLinks({
      inboxUrl: ' https://chat.example.com/app ',
      knowledgeUrl: 'file:///etc/passwd',
    });
    expect(saved).toEqual({ inboxUrl: 'https://chat.example.com/app', knowledgeUrl: '' });
    expect(getZhishuWorkspaceLinks()).toEqual(saved);
  });
});
