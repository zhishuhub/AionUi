/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Divider, Input, Message, Typography } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ipcBridge } from '@/common';
import type { ZhishuStatus } from '@/common/types/provider/zhishu';
import { isElectronDesktop, openExternalUrl } from '@/renderer/utils/platform';
import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import { useZhishuWorkspaceLinks } from './useZhishuWorkspaceLinks';
import { announceZhishuStatus } from './zhishuStatusEvents';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className='flex flex-col gap-12px'>
    <Typography.Text className='text-16px font-600 text-t-primary'>{title}</Typography.Text>
    {children}
  </div>
);

/** Connection to the website's AI, and the optional company-server pages for the sidebar. */
const ZhishuSettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const desktop = isElectronDesktop();
  const [status, setStatus] = useState<ZhishuStatus | null>(null);
  const links = useZhishuWorkspaceLinks();
  const [inboxUrl, setInboxUrl] = useState('');
  const [knowledgeUrl, setKnowledgeUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!desktop) return;
    ipcBridge.zhishu.status
      .invoke({ verify: false })
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [desktop]);

  useEffect(() => {
    if (!links) return;
    setInboxUrl(links.inboxUrl);
    setKnowledgeUrl(links.knowledgeUrl);
  }, [links]);

  const reconnect = async () => {
    const next = await ipcBridge.zhishu.disconnect.invoke();
    setStatus(next);
    announceZhishuStatus(next);
    void navigate('/guid');
  };

  const openAppPage = () => {
    if (!status) return;
    openExternalUrl(`${status.siteOrigin}/apps/${status.appKey}`).catch((error) =>
      console.error('Failed to open link:', error)
    );
  };

  const saveLinks = async () => {
    setSaving(true);
    try {
      const saved = await ipcBridge.zhishu.setWorkspaceLinks.invoke({ inboxUrl, knowledgeUrl });
      setInboxUrl(saved.inboxUrl);
      setKnowledgeUrl(saved.knowledgeUrl);
      const rejected = (inboxUrl.trim() && !saved.inboxUrl) || (knowledgeUrl.trim() && !saved.knowledgeUrl);
      if (rejected) Message.warning(t('settings.zhishu.invalidUrl'));
      else Message.success(t('settings.zhishu.saved'));
    } catch {
      Message.error(t('settings.zhishu.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPageWrapper>
      <div className='flex flex-col gap-24px max-w-560px'>
        <Section title={t('settings.zhishu.connectionTitle')}>
          {!desktop ? (
            <Typography.Text className='text-14px text-t-secondary'>{t('settings.zhishu.desktopOnly')}</Typography.Text>
          ) : (
            <>
              <Typography.Text className='text-14px text-t-primary'>
                {status?.connected
                  ? t('settings.zhishu.connectedAs', { name: status.userName || '-' })
                  : t('settings.zhishu.notConnected')}
              </Typography.Text>
              <Typography.Text className='text-13px text-t-secondary'>
                {t('settings.zhishu.billingNote')}
              </Typography.Text>
              <div className='flex gap-8px'>
                <Button onClick={() => void reconnect()}>{t('settings.zhishu.reconnect')}</Button>
                <Button type='text' onClick={openAppPage} disabled={!status}>
                  {t('settings.zhishu.appPage')}
                </Button>
              </div>
            </>
          )}
        </Section>

        <Divider className='m-0' />

        <Section title={t('settings.zhishu.workspaceTitle')}>
          <Typography.Text className='text-13px text-t-secondary'>{t('settings.zhishu.workspaceHint')}</Typography.Text>
          <div className='flex flex-col gap-6px'>
            <Typography.Text className='text-13px text-t-primary'>{t('settings.zhishu.inboxUrl')}</Typography.Text>
            <Input
              value={inboxUrl}
              onChange={setInboxUrl}
              placeholder='https://'
              disabled={!desktop}
              aria-label={t('settings.zhishu.inboxUrl')}
            />
          </div>
          <div className='flex flex-col gap-6px'>
            <Typography.Text className='text-13px text-t-primary'>{t('settings.zhishu.knowledgeUrl')}</Typography.Text>
            <Input
              value={knowledgeUrl}
              onChange={setKnowledgeUrl}
              placeholder='https://'
              disabled={!desktop}
              aria-label={t('settings.zhishu.knowledgeUrl')}
            />
          </div>
          <div>
            <Button type='primary' loading={saving} disabled={!desktop} onClick={() => void saveLinks()}>
              {t('settings.zhishu.save')}
            </Button>
          </div>
        </Section>
      </div>
    </SettingsPageWrapper>
  );
};

export default ZhishuSettingsPage;
