/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeImageGeneration } from '@/common/chat/imageGenCore';
import type { TProviderWithModel } from '@/common/config/storage';

// 1x1 transparent PNG
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const relay: TProviderWithModel = {
  id: 'zhishu',
  name: '智枢 AI',
  platform: 'custom',
  base_url: 'https://zhishuhub.com/v1/',
  api_key: 'sk-test',
  use_model: 'image',
};

describe('executeImageGeneration with the Zhishu relay (Images API)', () => {
  let workspace: string;
  const fetchMock = vi.fn();

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'zhishu-imagegen-'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('calls /images/generations with model "image" and saves the returned image', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }));

    const result = await executeImageGeneration({ prompt: 'a red apple' }, relay, workspace);

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://zhishuhub.com/v1/images/generations');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(init.body))).toEqual({ model: 'image', prompt: 'a red apple', n: 1 });
    expect(result.imagePath && existsSync(result.imagePath)).toBe(true);
    expect(readFileSync(result.imagePath as string).toString('base64')).toBe(PNG_B64);
  });

  it('sends input images to /images/edits as multipart files', async () => {
    writeFileSync(join(workspace, 'photo.png'), Buffer.from(PNG_B64, 'base64'));
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: PNG_B64 }] }), { status: 200 }));

    const result = await executeImageGeneration(
      { prompt: 'make it blue', image_uris: ['photo.png'] },
      relay,
      workspace
    );

    expect(result.success).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://zhishuhub.com/v1/images/edits');
    const form = init.body as FormData;
    expect(form.get('model')).toBe('image');
    expect(form.get('prompt')).toBe('make it blue');
    expect(form.get('image')).toBeInstanceOf(Blob);
  });

  it('returns the relay error message', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: '余额不足', code: 'insufficient_user_quota' } }), { status: 403 })
    );

    const result = await executeImageGeneration({ prompt: 'x' }, relay, workspace);

    expect(result.success).toBe(false);
    expect(result.error).toBe('余额不足');
  });
});
