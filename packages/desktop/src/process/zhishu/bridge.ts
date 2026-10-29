/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { clipboard } from 'electron';
import { ipcBridge } from '@/common';
import { ZHISHU_CODE_PATTERN, type ZhishuStatus } from '@/common/types/provider/zhishu';
import {
  connectZhishu,
  disconnectZhishu,
  getZhishuStatus,
  getZhishuVersionInfo,
  getZhishuWorkspaceLinks,
  setZhishuWorkspaceLinks,
} from './connection';
import { syncZhishuProvider } from './providerSync';

/** Keeps the backend provider in line with the connection; failures are logged, not fatal. */
async function syncProvider(reason: string): Promise<void> {
  try {
    await syncZhishuProvider();
  } catch (error) {
    console.error(`[Zhishu] provider sync failed after ${reason}:`, error);
  }
}

async function connectAndSync(code: string): Promise<ZhishuStatus> {
  const { status, connected } = await connectZhishu(code);
  if (connected) await syncProvider('connect');
  return status;
}

export function initZhishuBridge(): void {
  ipcBridge.zhishu.status.provider(async (params) => {
    const { status, revoked } = await getZhishuStatus(params?.verify === true);
    if (revoked) await syncProvider('revoke');
    return status;
  });

  ipcBridge.zhishu.connect.provider(async ({ code }) => connectAndSync(code));

  ipcBridge.zhishu.connectFromClipboard.provider(async () => {
    const text = clipboard.readText();
    const match = ZHISHU_CODE_PATTERN.exec(text.toUpperCase());
    if (!match) return null;
    const status = await connectAndSync(match[0]);
    // A used code is worthless; clear it so it is not pasted somewhere else by accident.
    if (status.connected && clipboard.readText() === text) clipboard.clear();
    return status;
  });

  ipcBridge.zhishu.disconnect.provider(async () => {
    const status = disconnectZhishu();
    await syncProvider('disconnect');
    return status;
  });

  ipcBridge.zhishu.versionInfo.provider(async () => getZhishuVersionInfo());

  ipcBridge.zhishu.getWorkspaceLinks.provider(async () => getZhishuWorkspaceLinks());

  ipcBridge.zhishu.setWorkspaceLinks.provider(async (links) => {
    const saved = setZhishuWorkspaceLinks(links);
    ipcBridge.zhishu.workspaceLinksChanged.emit(saved);
    return saved;
  });
}
