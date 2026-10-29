/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { ipcBridge } from '@/common';
import type {
  FeedbackDiagnosticsExplicitContext,
  FeedbackDiagnosticsProfile,
} from '@/common/types/feedbackDiagnostics';
import type {
  FeedbackEventExtra,
  FeedbackEventTags,
} from '@/renderer/components/settings/SettingsModal/contents/FeedbackReportModal';
import { openExternalUrl } from '@/renderer/utils/platform';

type OpenFeedbackOptions = {
  module?: string;
  autoScreenshot?: boolean;
  diagnosticsContext?: FeedbackDiagnosticsExplicitContext;
  diagnosticsProfiles?: FeedbackDiagnosticsProfile[];
  tags?: FeedbackEventTags;
  extra?: FeedbackEventExtra;
};

type FeedbackContextValue = {
  openFeedback: (options?: OpenFeedbackOptions) => Promise<void>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

/**
 * Zhishu build: feedback goes to the app's page on the website (its feedback form reaches
 * the app author), instead of the upstream crash-report service. Every "Report issue"
 * entry point keeps working and opens that page.
 */
export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const openFeedback = useCallback(async (_options?: OpenFeedbackOptions) => {
    try {
      const status = await ipcBridge.zhishu.status.invoke({ verify: false });
      await openExternalUrl(`${status.siteOrigin}/apps/${status.appKey}`);
    } catch (error) {
      console.error('Failed to open the feedback page:', error);
    }
  }, []);

  const value = useMemo(() => ({ openFeedback }), [openFeedback]);

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
};

export const useFeedback = (): FeedbackContextValue => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    // Fallback so consumers don't crash when the provider isn't mounted (e.g. web build).
    return {
      openFeedback: async () => {
        /* no-op */
      },
    };
  }
  return ctx;
};
