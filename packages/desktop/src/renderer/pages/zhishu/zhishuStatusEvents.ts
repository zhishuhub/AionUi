/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ZhishuStatus } from '@/common/types/provider/zhishu';

type Listener = (status: ZhishuStatus) => void;

const listeners = new Set<Listener>();

/** Lets the settings page tell the gate about a reconnect without a round trip. */
export function announceZhishuStatus(status: ZhishuStatus): void {
  listeners.forEach((listener) => listener(status));
}

export function subscribeZhishuStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
