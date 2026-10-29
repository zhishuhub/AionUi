/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { httpRequest } from '@/common/adapter/httpBridge';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { ImageGenerationModelSetting } from '@/common/config/clientSettings';
import { removeImageGenerationEnvKeys, resolveImageGenerationMcpEnv } from '@/common/config/imageGenerationMcpEnv';
import { BUILTIN_IMAGE_GEN_NAME, type IProvider } from '@/common/config/storage';
import type { CreateProviderRequest } from '@/common/types/provider/providerApi';
import { ZHISHU_CHAT_MODEL, ZHISHU_IMAGE_MODEL, ZHISHU_PROVIDER_ID } from '@/common/types/provider/zhishu';
import { loadZhishuConnection, type ZhishuConnection } from './connection';

/**
 * Mirrors the saved connection into the backend: one `custom` (OpenAI-compatible) provider
 * whose models are the relay aliases `chat` and `image`, plus the built-in image-generation
 * tool pointed at `image`. Without a connection the provider is removed.
 */

const PROVIDER_NAME = '智枢 AI';
// `chat` first: the new-conversation picker defaults to the first model of the first provider.
const PROVIDER_MODELS = [ZHISHU_CHAT_MODEL, ZHISHU_IMAGE_MODEL];

function providerBody(connection: ZhishuConnection): CreateProviderRequest {
  return {
    id: ZHISHU_PROVIDER_ID,
    platform: 'custom',
    name: PROVIDER_NAME,
    base_url: connection.base_url.replace(/\/+$/, ''),
    api_key: connection.api_key,
    models: PROVIDER_MODELS,
    enabled: true,
    model_enabled: { [ZHISHU_CHAT_MODEL]: true, [ZHISHU_IMAGE_MODEL]: true },
    model_settings: {
      [ZHISHU_CHAT_MODEL]: { image_input: 'supported', openai_api_mode: 'chat_completions' },
    },
  };
}

function needsUpdate(existing: IProvider, desired: CreateProviderRequest): boolean {
  return (
    existing.platform !== desired.platform ||
    existing.base_url !== desired.base_url ||
    existing.api_key !== desired.api_key ||
    existing.enabled !== true ||
    JSON.stringify(existing.models) !== JSON.stringify(desired.models)
  );
}

async function listProviders(): Promise<IProvider[]> {
  return (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
}

async function upsertProvider(connection: ZhishuConnection): Promise<IProvider[]> {
  const desired = providerBody(connection);
  const providers = await listProviders();
  const existing = providers.find((provider) => provider.id === ZHISHU_PROVIDER_ID);
  if (!existing) {
    await httpRequest<IProvider>('POST', '/api/providers', desired);
  } else if (needsUpdate(existing, desired)) {
    const { id: _id, ...update } = desired;
    await httpRequest<IProvider>('PUT', `/api/providers/${ZHISHU_PROVIDER_ID}`, update);
  }
  return listProviders();
}

/** Points the built-in image tool at the relay's `image` model and turns it on (or off). */
async function syncImageTool(providers: IProvider[], connected: boolean): Promise<void> {
  const provider = providers.find((item) => item.id === ZHISHU_PROVIDER_ID);
  const setting: ImageGenerationModelSetting | null =
    connected && provider
      ? // Secrets stay on the provider row; the setting only references it (same as the Tools page).
        (({ models: _models, ...rest }) => ({
          ...rest,
          base_url: '',
          api_key: '',
          use_model: ZHISHU_IMAGE_MODEL,
          switch: true,
        }))(provider)
      : null;
  await httpRequest<void>('PUT', '/api/settings/client', { 'tools.imageGenerationModel': setting });

  const servers = (await mcpService.listServers.invoke()) ?? [];
  const server = servers.find((item) => item.name === BUILTIN_IMAGE_GEN_NAME);
  if (!server || server.transport.type !== 'stdio') return;

  const resolution = setting ? resolveImageGenerationMcpEnv(setting, providers) : null;
  if (resolution?.ok) {
    const env = { ...removeImageGenerationEnvKeys(server.transport.env || {}), ...resolution.env };
    const transport = { ...server.transport, env };
    const original_json = JSON.stringify(
      { mcpServers: { [BUILTIN_IMAGE_GEN_NAME]: { command: transport.command, args: transport.args || [], env } } },
      null,
      2
    );
    await mcpService.updateServer.invoke({ id: server.id, data: { transport, original_json } });
  }
  const shouldEnable = Boolean(resolution?.ok);
  if (Boolean(server.enabled) !== shouldEnable) {
    await mcpService.toggleServer.invoke({ id: server.id });
  }
}

/** Idempotent; safe to call on every launch and after each connect / reconnect. */
export async function syncZhishuProvider(): Promise<void> {
  const connection = loadZhishuConnection();
  if (connection) {
    const providers = await upsertProvider(connection);
    await syncImageTool(providers, true);
    return;
  }
  const providers = await listProviders();
  if (providers.some((provider) => provider.id === ZHISHU_PROVIDER_ID)) {
    await httpRequest<void>('DELETE', `/api/providers/${ZHISHU_PROVIDER_ID}`);
  }
  await syncImageTool(await listProviders(), false);
}
