/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  connect: vi.fn(),
  connectFromClipboard: vi.fn(),
  desktop: true,
}));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/common', () => ({
  ipcBridge: {
    zhishu: {
      status: { invoke: mocks.status },
      connect: { invoke: mocks.connect },
      connectFromClipboard: { invoke: mocks.connectFromClipboard },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => mocks.desktop }));

import ZhishuGate from '@/renderer/pages/zhishu/ZhishuGate';

const base = { userName: '', siteOrigin: 'https://zhishuhub.com', appKey: 'gongzt26', message: '' };
const disconnected = { ...base, connected: false };
const connected = { ...base, connected: true, userName: '张**' };

function renderGate(path = '/guid') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ZhishuGate>
        <div>workbench</div>
      </ZhishuGate>
    </MemoryRouter>
  );
}

describe('ZhishuGate', () => {
  beforeEach(() => {
    mocks.desktop = true;
    mocks.status.mockReset();
    mocks.connect.mockReset();
    mocks.connectFromClipboard.mockReset().mockResolvedValue(null);
  });

  afterEach(() => cleanup());

  it('shows the connect page instead of the workbench until connected', async () => {
    mocks.status.mockResolvedValue(disconnected);
    renderGate();

    expect(await screen.findByText('settings.zhishu.gateTitle')).toBeInTheDocument();
    expect(screen.queryByText('workbench')).toBeNull();
    expect(mocks.status).toHaveBeenCalledWith({ verify: true });
    // The clipboard is checked as soon as the connect page appears.
    await waitFor(() => expect(mocks.connectFromClipboard).toHaveBeenCalled());
  });

  it('connects from a code typed or pasted into the box', async () => {
    mocks.status.mockResolvedValue(disconnected);
    mocks.connect.mockResolvedValue(connected);
    renderGate();

    const input = await screen.findByPlaceholderText('APP-XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'app-2k7q-m9xp-4tza' } });

    await waitFor(() => expect(mocks.connect).toHaveBeenCalledWith({ code: 'APP-2K7Q-M9XP-4TZA' }));
    expect(await screen.findByText('workbench')).toBeInTheDocument();
  });

  it('shows the website message when connecting fails', async () => {
    mocks.status.mockResolvedValue(disconnected);
    mocks.connect.mockResolvedValue({ ...disconnected, message: '接入码已过期' });
    renderGate();

    const input = await screen.findByPlaceholderText('APP-XXXX-XXXX-XXXX');
    fireEvent.change(input, { target: { value: 'APP-2K7Q-M9XP-4TZA' } });

    expect(await screen.findByText('接入码已过期')).toBeInTheDocument();
    expect(screen.queryByText('workbench')).toBeNull();
  });

  it('shows the workbench when already connected', async () => {
    mocks.status.mockResolvedValue(connected);
    renderGate();
    expect(await screen.findByText('workbench')).toBeInTheDocument();
  });

  it('keeps Settings reachable without a connection', () => {
    mocks.status.mockResolvedValue(disconnected);
    renderGate('/settings/system');
    expect(screen.getByText('workbench')).toBeInTheDocument();
  });

  it('does not gate the WebUI', () => {
    mocks.desktop = false;
    renderGate();
    expect(screen.getByText('workbench')).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
  });
});
