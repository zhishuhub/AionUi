/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import WebviewHost from '@/renderer/components/media/WebviewHost';
import { useZhishuWorkspaceLinks, type ZhishuWorkspaceKind } from './useZhishuWorkspaceLinks';

/**
 * Company-server pages opened inside the workbench: the message inbox and the knowledge
 * base. Each keeps its own persistent session, so signing in once is remembered.
 */
const WorkspaceWebPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { kind } = useParams<{ kind: ZhishuWorkspaceKind }>();
  const links = useZhishuWorkspaceLinks();
  const url = kind === 'knowledge' ? links?.knowledgeUrl : kind === 'inbox' ? links?.inboxUrl : '';

  if (!links) return null;

  if (!url) {
    return (
      <div className='flex flex-col items-center justify-center h-full gap-16px'>
        <Empty description={t('settings.zhishu.workspaceNotConfigured')} />
        <Button type='primary' onClick={() => void navigate('/settings/zhishu')}>
          {t('settings.zhishu.goConfigure')}
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col w-full h-full min-h-0'>
      <WebviewHost
        key={`${kind}-${url}`}
        url={url}
        id={`zhishu-${kind}`}
        showNavBar
        partition={`persist:zhishu-${kind}`}
        className='flex-1 min-h-0'
        style={{ height: '100%' }}
      />
    </div>
  );
};

export default WorkspaceWebPage;
