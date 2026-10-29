/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, net } from 'electron';
import semver from 'semver';
import i18n from '@process/services/i18n';
import {
  ZHISHU_APP_KEY,
  ZHISHU_CODE_PATTERN,
  ZHISHU_DEFAULT_CONNECT_URL,
  type ZhishuStatus,
  type ZhishuVersionInfo,
  type ZhishuWorkspaceLinks,
} from '@/common/types/provider/zhishu';

/**
 * One-click connection. The website hands the user a connect code; the app sends it with
 * its app id to the connect endpoint and gets back `base_url` + `api_key`. The result is
 * kept in `userData/zhishu-connection.json`; there is no UI to type an address or a key.
 */

const CONNECT_URL = process.env.ZHISHU_CONNECT_URL?.trim() || ZHISHU_DEFAULT_CONNECT_URL;
const CONNECTION_FILE = 'zhishu-connection.json';
const WORKSPACE_FILE = 'zhishu-workspace.json';

export type ZhishuConnection = {
  base_url: string;
  api_key: string;
  user_name: string;
  models: string[];
  connected_at: string;
};

const say = (key: string): string => i18n.t(`settings.zhishu.${key}`);

function userDataFile(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function readJson<T>(name: string): Partial<T> | null {
  try {
    return JSON.parse(fs.readFileSync(userDataFile(name), 'utf-8')) as Partial<T>;
  } catch {
    return null;
  }
}

function writeJson(name: string, value: unknown): void {
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(userDataFile(name), JSON.stringify(value, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

export function loadZhishuConnection(): ZhishuConnection | null {
  const data = readJson<ZhishuConnection>(CONNECTION_FILE);
  if (!data?.base_url || !data.api_key) return null;
  return {
    base_url: data.base_url,
    api_key: data.api_key,
    user_name: data.user_name ?? '',
    models: Array.isArray(data.models) ? data.models : [],
    connected_at: data.connected_at ?? '',
  };
}

function clearZhishuConnection(): void {
  try {
    fs.unlinkSync(userDataFile(CONNECTION_FILE));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/** Origin of the website the user connected from; sub-site users stay on their own site. */
function siteOrigin(connection: ZhishuConnection | null): string {
  const match = /^(https?:\/\/[^/]+)/.exec(connection?.base_url || CONNECT_URL);
  return match ? match[1] : 'https://zhishuhub.com';
}

function toStatus(connection: ZhishuConnection | null, message = ''): ZhishuStatus {
  return {
    connected: connection !== null,
    userName: connection?.user_name ?? '',
    siteOrigin: siteOrigin(connection),
    appKey: ZHISHU_APP_KEY,
    message,
  };
}

/** A 401 on the model list (other than an exhausted app quota) means the website revoked access. */
async function isRevoked(connection: ZhishuConnection): Promise<boolean> {
  let response: Response;
  try {
    response = await net.fetch(`${connection.base_url.replace(/\/+$/, '')}/models`, {
      headers: { Authorization: `Bearer ${connection.api_key}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return false;
  }
  if (response.status !== 401) return false;
  const body = (await response.json().catch((): null => null)) as { error?: { code?: string } } | null;
  return body?.error?.code !== 'app_quota_exhausted';
}

/** Current status; with `verify` the saved key is checked and cleared when revoked. */
export async function getZhishuStatus(verify: boolean): Promise<{ status: ZhishuStatus; revoked: boolean }> {
  const connection = loadZhishuConnection();
  if (connection && verify && (await isRevoked(connection))) {
    clearZhishuConnection();
    return { status: toStatus(null, say('revoked')), revoked: true };
  }
  return { status: toStatus(connection), revoked: false };
}

/** Exchanges a connect code for the relay address and key. Website messages are shown as-is. */
export async function connectZhishu(rawCode: string): Promise<{ status: ZhishuStatus; connected: boolean }> {
  const current = loadZhishuConnection();
  const match = ZHISHU_CODE_PATTERN.exec(String(rawCode ?? '').toUpperCase());
  if (!match) return { status: toStatus(current, say('codeNotFound')), connected: false };

  let response: Response;
  try {
    response = await net.fetch(CONNECT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: ZHISHU_APP_KEY, code: match[0] }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { status: toStatus(current, say('networkError')), connected: false };
  }
  if (response.status === 429) return { status: toStatus(current, say('tooManyAttempts')), connected: false };

  const result = (await response.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: Partial<ZhishuConnection>;
  };
  if (!result.success || !result.data?.base_url || !result.data.api_key) {
    return { status: toStatus(current, result.message || say('connectFailed')), connected: false };
  }

  const connection: ZhishuConnection = {
    base_url: result.data.base_url,
    api_key: result.data.api_key,
    user_name: result.data.user_name ?? '',
    models: Array.isArray(result.data.models) ? result.data.models : [],
    connected_at: new Date().toISOString(),
  };
  writeJson(CONNECTION_FILE, connection);
  return { status: toStatus(connection), connected: true };
}

/** "Reconnect": forget the saved connection and go back to the connect page. */
export function disconnectZhishu(): ZhishuStatus {
  clearZhishuConnection();
  return toStatus(null);
}

/** Version listed for this app on the website (public endpoint). */
export async function getZhishuVersionInfo(): Promise<ZhishuVersionInfo> {
  const connection = loadZhishuConnection();
  const origin = siteOrigin(connection);
  const current = app.getVersion();
  const info: ZhishuVersionInfo = {
    current,
    latest: '',
    updateAvailable: false,
    pageUrl: `${origin}/apps/${ZHISHU_APP_KEY}`,
  };
  try {
    const response = await net.fetch(`${origin}/api/apps/${ZHISHU_APP_KEY}`, {
      signal: AbortSignal.timeout(10_000),
    });
    const result = (await response.json()) as { success?: boolean; data?: { version?: string } };
    const latest = result.success ? String(result.data?.version ?? '').trim() : '';
    info.latest = latest;
    info.updateAvailable = Boolean(semver.valid(latest) && semver.valid(current) && semver.gt(latest, current));
  } catch {
    // Offline or the site is unreachable: just report no update.
  }
  return info;
}

/** Only http(s) addresses are accepted; anything else is stored as empty (entry hidden). */
function normalizeLink(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function getZhishuWorkspaceLinks(): ZhishuWorkspaceLinks {
  const data = readJson<ZhishuWorkspaceLinks>(WORKSPACE_FILE);
  return { inboxUrl: normalizeLink(data?.inboxUrl), knowledgeUrl: normalizeLink(data?.knowledgeUrl) };
}

export function setZhishuWorkspaceLinks(links: ZhishuWorkspaceLinks): ZhishuWorkspaceLinks {
  const next = { inboxUrl: normalizeLink(links?.inboxUrl), knowledgeUrl: normalizeLink(links?.knowledgeUrl) };
  writeJson(WORKSPACE_FILE, next);
  return next;
}
