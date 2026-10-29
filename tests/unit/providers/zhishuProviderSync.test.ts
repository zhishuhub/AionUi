/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer, IProvider } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  connection: null as null | {
    base_url: string;
    api_key: string;
    user_name: string;
    models: string[];
    connected_at: string;
  },
  providers: [] as IProvider[],
  servers: [] as IMcpServer[],
  httpRequest: vi.fn(),
  updateServer: vi.fn(),
  toggleServer: vi.fn(),
}));

vi.mock('@process/zhishu/connection', () => ({ loadZhishuConnection: () => mocks.connection }));
vi.mock('@/common/adapter/httpBridge', () => ({ httpRequest: mocks.httpRequest }));
vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    listServers: { invoke: async () => mocks.servers },
    updateServer: { invoke: mocks.updateServer },
    toggleServer: { invoke: mocks.toggleServer },
  },
}));

import { syncZhishuProvider } from '@process/zhishu/providerSync';

const imageServer = (enabled: boolean): IMcpServer =>
  ({
    id: 'srv-image',
    name: 'aionui-image-generation',
    enabled,
    builtin: true,
    transport: { type: 'stdio', command: 'node', args: ['/mock/builtin-mcp-image-gen.js'], env: { KEEP: '1' } },
  }) as unknown as IMcpServer;

function calls(method: string) {
  return mocks.httpRequest.mock.calls.filter(([m]) => m === method);
}

describe('syncZhishuProvider', () => {
  beforeEach(() => {
    mocks.connection = null;
    mocks.providers = [];
    mocks.servers = [imageServer(false)];
    mocks.httpRequest.mockReset().mockImplementation(async (method: string, url: string, body?: unknown) => {
      if (method === 'GET' && url === '/api/providers') return mocks.providers;
      if (method === 'POST' && url === '/api/providers') {
        mocks.providers = [...mocks.providers, { ...(body as IProvider) }];
        return body;
      }
      if (method === 'PUT' && url.startsWith('/api/providers/')) {
        mocks.providers = mocks.providers.map((p) =>
          p.id === 'zhishu' ? { ...p, ...(body as Partial<IProvider>) } : p
        );
        return body;
      }
      if (method === 'DELETE') {
        mocks.providers = mocks.providers.filter((p) => p.id !== 'zhishu');
        return undefined;
      }
      return undefined;
    });
    mocks.updateServer.mockReset().mockResolvedValue(undefined);
    mocks.toggleServer.mockReset().mockResolvedValue(undefined);
  });

  it('creates one OpenAI-compatible provider with the chat and image aliases', async () => {
    mocks.connection = {
      base_url: 'https://zhishuhub.com/v1/',
      api_key: 'sk-a',
      user_name: 'u',
      models: ['chat', 'image'],
      connected_at: '',
    };

    await syncZhishuProvider();

    const [, , body] = calls('POST')[0];
    expect(body).toMatchObject({
      id: 'zhishu',
      platform: 'custom',
      base_url: 'https://zhishuhub.com/v1',
      api_key: 'sk-a',
      models: ['chat', 'image'],
      enabled: true,
    });
  });

  it('points the image tool at the relay without storing the key in settings, and turns it on', async () => {
    mocks.connection = {
      base_url: 'https://zhishuhub.com/v1',
      api_key: 'sk-a',
      user_name: 'u',
      models: [],
      connected_at: '',
    };

    await syncZhishuProvider();

    const settingsCall = calls('PUT').find(([, url]) => url === '/api/settings/client');
    const settingsBody = settingsCall?.[2] as Record<string, Record<string, unknown>> | undefined;
    const setting = settingsBody?.['tools.imageGenerationModel'];
    expect(setting).toMatchObject({ id: 'zhishu', use_model: 'image', switch: true, api_key: '', base_url: '' });

    const { data } = mocks.updateServer.mock.calls[0][0] as { data: { transport: { env: Record<string, string> } } };
    expect(data.transport.env).toMatchObject({
      KEEP: '1',
      AIONUI_IMG_PROVIDER_ID: 'zhishu',
      AIONUI_IMG_PLATFORM: 'custom',
      AIONUI_IMG_BASE_URL: 'https://zhishuhub.com/v1',
      AIONUI_IMG_API_KEY: 'sk-a',
      AIONUI_IMG_MODEL: 'image',
    });
    expect(mocks.toggleServer).toHaveBeenCalledWith({ id: 'srv-image' });
  });

  it('updates the provider when the key changes and leaves it alone when nothing changed', async () => {
    mocks.connection = {
      base_url: 'https://zhishuhub.com/v1',
      api_key: 'sk-a',
      user_name: 'u',
      models: [],
      connected_at: '',
    };
    await syncZhishuProvider();
    mocks.httpRequest.mockClear();

    await syncZhishuProvider();
    expect(calls('PUT').filter(([, url]) => url === '/api/providers/zhishu')).toHaveLength(0);

    mocks.connection = { ...mocks.connection, api_key: 'sk-b' };
    await syncZhishuProvider();
    const update = calls('PUT').find(([, url]) => url === '/api/providers/zhishu');
    expect(update?.[2]).toMatchObject({ api_key: 'sk-b' });
    expect(update?.[2]).not.toHaveProperty('id');
  });

  it('removes the provider and turns the image tool off after reconnect is chosen', async () => {
    mocks.providers = [
      { id: 'zhishu', platform: 'custom', name: '智枢 AI', base_url: 'x', api_key: 'y', models: ['chat', 'image'] },
    ];
    mocks.servers = [imageServer(true)];

    await syncZhishuProvider();

    expect(calls('DELETE')[0][1]).toBe('/api/providers/zhishu');
    const settingsCall = calls('PUT').find(([, url]) => url === '/api/settings/client');
    expect(settingsCall?.[2]).toEqual({ 'tools.imageGenerationModel': null });
    expect(mocks.toggleServer).toHaveBeenCalledWith({ id: 'srv-image' });
  });
});
