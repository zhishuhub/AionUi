/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import type { ZhishuWorkspaceLinks } from '@/common/types/provider/zhishu';
import { isElectronDesktop } from '@/renderer/utils/platform';

export type ZhishuWorkspaceKind = 'inbox' | 'knowledge';

const EMPTY_LINKS: ZhishuWorkspaceLinks = { inboxUrl: '', knowledgeUrl: '' };

/** Company-server page addresses; `null` while loading. Desktop only (empty in WebUI). */
export function useZhishuWorkspaceLinks(): ZhishuWorkspaceLinks | null {
  const [links, setLinks] = useState<ZhishuWorkspaceLinks | null>(null);

  useEffect(() => {
    if (!isElectronDesktop()) {
      setLinks(EMPTY_LINKS);
      return;
    }
    let disposed = false;
    ipcBridge.zhishu.getWorkspaceLinks
      .invoke()
      .then((next) => {
        if (!disposed) setLinks(next);
      })
      .catch(() => {
        if (!disposed) setLinks(EMPTY_LINKS);
      });
    const removeListener = ipcBridge.zhishu.workspaceLinksChanged.on((next: ZhishuWorkspaceLinks) => {
      setLinks(next);
    });
    return () => {
      disposed = true;
      removeListener();
    };
  }, []);

  return links;
}
