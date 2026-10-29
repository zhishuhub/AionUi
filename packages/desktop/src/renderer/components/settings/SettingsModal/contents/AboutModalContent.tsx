/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Divider, Typography, Button, Message } from '@arco-design/web-react';
import { Right } from '@icon-park/react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import { ipcBridge } from '@/common';

// __APP_VERSION__ is injected by electron.vite.config.ts `define:` from the
// repo-root package.json. The previous `import packageJson from
// '../../../../../../package.json'` resolved to packages/desktop/package.json
// which is a workspace placeholder permanently pinned at "0.0.0".
declare const __APP_VERSION__: string;

const SOURCE_URL = 'https://github.com/zhishuhub/AionUi';
const UPSTREAM_URL = 'https://github.com/iOfficeAI/AionUi';

/**
 * Zhishu build: updates are published on the website, so "Check for updates" compares
 * with the version listed there and opens the app page to download the new installer.
 */
const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const isElectron = isElectronDesktop();
  const [checking, setChecking] = useState(false);

  const openLink = (url: string) => {
    openExternalUrl(url).catch((error) => console.error('Failed to open link:', error));
  };

  const openAppPage = async () => {
    try {
      const info = await ipcBridge.zhishu.versionInfo.invoke();
      openLink(info.pageUrl);
    } catch (error) {
      console.error('Failed to resolve the app page:', error);
    }
  };

  const checkUpdate = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const info = await ipcBridge.zhishu.versionInfo.invoke();
      if (!info.latest) {
        Message.error(t('settings.zhishu.checkUpdateFailed'));
      } else if (info.updateAvailable) {
        Message.info(t('settings.zhishu.updateAvailable', { version: info.latest }));
        openLink(info.pageUrl);
      } else {
        Message.info(t('settings.zhishu.alreadyLatest'));
      }
    } catch {
      Message.error(t('settings.zhishu.checkUpdateFailed'));
    } finally {
      setChecking(false);
    }
  };

  const linkItems: Array<{ title: string; onClick: () => void }> = [
    { title: t('settings.zhishu.appPage'), onClick: () => void openAppPage() },
    { title: t('settings.zhishu.sourceCode'), onClick: () => openLink(SOURCE_URL) },
    { title: t('settings.zhishu.upstreamProject'), onClick: () => openLink(UPSTREAM_URL) },
  ];

  return (
    <div className='flex flex-col h-full w-full'>
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-24px',
          isPageMode && 'px-0 overflow-visible'
        )}
      >
        <div className='flex flex-col max-w-500px mx-auto'>
          <div className='flex flex-col items-center pb-24px'>
            <Typography.Title heading={3} className='text-24px font-bold text-t-primary mb-8px'>
              {t('settings.zhishu.appName')}
            </Typography.Title>
            <Typography.Text className='text-14px text-t-secondary mb-12px text-center'>
              {t('settings.zhishu.appDescription')}
            </Typography.Text>
            <div className='flex items-center justify-center gap-8px mb-16px'>
              <span className='px-10px py-4px rd-6px text-13px bg-fill-2 text-t-primary font-500'>
                v{__APP_VERSION__}
              </span>
            </div>
            {isElectron && (
              <div className='flex flex-col items-center gap-12px w-full max-w-300px bg-fill-2 p-16px rounded-lg'>
                <Button type='primary' long loading={checking} onClick={() => void checkUpdate()}>
                  {checking ? t('settings.zhishu.checkingUpdate') : t('settings.zhishu.checkUpdate')}
                </Button>
              </div>
            )}
          </div>

          <Divider className='my-16px' />

          <div className='flex flex-col gap-4px pt-8px'>
            {linkItems.map((item) => (
              <div
                key={item.title}
                className='flex items-center justify-between px-16px py-12px rd-8px hover:bg-fill-2 transition-all cursor-pointer group'
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  item.onClick();
                }}
              >
                <Typography.Text className='text-14px text-t-primary'>{item.title}</Typography.Text>
                <div className='text-t-secondary group-hover:text-t-primary transition-colors'>
                  <Right theme='outline' size='16' className='rtl-mirror' />
                </div>
              </div>
            ))}
          </div>
          <Typography.Text className='text-12px text-t-secondary text-center mt-16px'>
            {t('settings.zhishu.licenseNote')}
          </Typography.Text>
        </div>
      </div>
    </div>
  );
};

export default AboutModalContent;
