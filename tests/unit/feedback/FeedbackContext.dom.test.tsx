/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Zhishu build: every "Report issue" entry point opens the app's page on the website
 * (its feedback form reaches the app author) instead of the upstream crash-report modal.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const statusInvoke = vi.fn();
const openExternalUrl = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: { zhishu: { status: { invoke: (...args: unknown[]) => statusInvoke(...args) } } },
}));
vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: (url: string) => openExternalUrl(url),
}));

import { FeedbackProvider, useFeedback } from '@/renderer/hooks/context/FeedbackContext';

const Opener: React.FC = () => {
  const { openFeedback } = useFeedback();
  return (
    <button type='button' onClick={() => void openFeedback({ module: 'conversation-session', autoScreenshot: true })}>
      report
    </button>
  );
};

describe('FeedbackProvider / useFeedback (Zhishu build)', () => {
  beforeEach(() => {
    statusInvoke.mockReset();
    openExternalUrl.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it('opens the app page on the website the user connected from', async () => {
    statusInvoke.mockResolvedValue({
      connected: true,
      userName: '张**',
      siteOrigin: 'https://sub.example.com',
      appKey: 'gongzt26',
      message: '',
    });
    const { getByText } = render(
      <FeedbackProvider>
        <Opener />
      </FeedbackProvider>
    );

    await userEvent.click(getByText('report'));

    expect(statusInvoke).toHaveBeenCalledWith({ verify: false });
    expect(openExternalUrl).toHaveBeenCalledWith('https://sub.example.com/apps/gongzt26');
  });

  it('does not throw when the connection status cannot be read', async () => {
    statusInvoke.mockRejectedValue(new Error('main process busy'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <FeedbackProvider>
        <Opener />
      </FeedbackProvider>
    );

    await userEvent.click(getByText('report'));

    expect(openExternalUrl).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back to a no-op outside the provider', async () => {
    const { getByText } = render(<Opener />);
    await userEvent.click(getByText('report'));
    expect(statusInvoke).not.toHaveBeenCalled();
  });
});
