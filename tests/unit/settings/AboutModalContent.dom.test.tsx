/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Zhishu build: About checks the version listed on the website and sends the user to the
 * app page to download; the upstream auto-updater is not involved.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  versionInfoMock: vi.fn(),
  openExternalUrlMock: vi.fn(),
  messageInfoMock: vi.fn(),
  messageErrorMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => (params?.version ? `${key}:${params.version}` : key),
  }),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: { ...actual.Message, info: mocks.messageInfoMock, error: mocks.messageErrorMock },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: { zhishu: { versionInfo: { invoke: mocks.versionInfoMock } } },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: mocks.openExternalUrlMock,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';

const PAGE = 'https://zhishuhub.com/apps/gongzt26';

describe('AboutModalContent (Zhishu build)', () => {
  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '2.2.2-zs.1');
    mocks.openExternalUrlMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the app name, version and the Apache-2.0 notice', () => {
    render(<AboutModalContent />);
    expect(screen.getByText('settings.zhishu.appName')).toBeInTheDocument();
    expect(screen.getByText('v2.2.2-zs.1')).toBeInTheDocument();
    expect(screen.getByText('settings.zhishu.licenseNote')).toBeInTheDocument();
  });

  it('opens the app page when the website lists a newer version', async () => {
    mocks.versionInfoMock.mockResolvedValue({
      current: '2.2.2-zs.1',
      latest: '2.2.2-zs.2',
      updateAvailable: true,
      pageUrl: PAGE,
    });
    render(<AboutModalContent />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.zhishu.checkUpdate' }));

    await waitFor(() => expect(mocks.openExternalUrlMock).toHaveBeenCalledWith(PAGE));
    expect(mocks.messageInfoMock).toHaveBeenCalledWith('settings.zhishu.updateAvailable:2.2.2-zs.2');
  });

  it('says it is up to date when the website version is not newer', async () => {
    mocks.versionInfoMock.mockResolvedValue({
      current: '2.2.2-zs.1',
      latest: '2.2.2-zs.1',
      updateAvailable: false,
      pageUrl: PAGE,
    });
    render(<AboutModalContent />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.zhishu.checkUpdate' }));

    await waitFor(() => expect(mocks.messageInfoMock).toHaveBeenCalledWith('settings.zhishu.alreadyLatest'));
    expect(mocks.openExternalUrlMock).not.toHaveBeenCalled();
  });

  it('reports a failure when the website version cannot be read', async () => {
    mocks.versionInfoMock.mockResolvedValue({
      current: '2.2.2-zs.1',
      latest: '',
      updateAvailable: false,
      pageUrl: PAGE,
    });
    render(<AboutModalContent />);

    fireEvent.click(screen.getByRole('button', { name: 'settings.zhishu.checkUpdate' }));

    await waitFor(() => expect(mocks.messageErrorMock).toHaveBeenCalledWith('settings.zhishu.checkUpdateFailed'));
  });

  it('links to the source code and the original project', () => {
    render(<AboutModalContent />);

    fireEvent.click(screen.getByText('settings.zhishu.sourceCode'));
    fireEvent.click(screen.getByText('settings.zhishu.upstreamProject'));

    expect(mocks.openExternalUrlMock).toHaveBeenCalledWith('https://github.com/zhishuhub/AionUi');
    expect(mocks.openExternalUrlMock).toHaveBeenCalledWith('https://github.com/iOfficeAI/AionUi');
  });
});
