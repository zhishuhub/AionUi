/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@arco-design/web-react';
import { BookOne, Message } from '@icon-park/react';
import classNames from 'classnames';
import type { SiderTooltipProps } from '@renderer/utils/ui/siderTooltip';
import { useZhishuWorkspaceLinks } from '@renderer/pages/zhishu/useZhishuWorkspaceLinks';

interface SiderWorkspaceEntriesProps {
  isMobile: boolean;
  collapsed: boolean;
  pathname: string;
  siderTooltipProps: SiderTooltipProps;
  onNavigate: (path: string) => void;
}

type EntryIcon = typeof Message;

/**
 * "Messages" and "Knowledge base" entries for the company-server pages. Each entry only
 * appears once its address is filled in under Settings → Zhishu AI.
 */
const SiderWorkspaceEntries: React.FC<SiderWorkspaceEntriesProps> = ({
  isMobile,
  collapsed,
  pathname,
  siderTooltipProps,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const links = useZhishuWorkspaceLinks();
  if (!links) return null;

  const entries: Array<{ path: string; label: string; Icon: EntryIcon }> = [];
  if (links.inboxUrl) entries.push({ path: '/workspace/inbox', label: t('settings.zhishu.inboxEntry'), Icon: Message });
  if (links.knowledgeUrl) {
    entries.push({ path: '/workspace/knowledge', label: t('settings.zhishu.knowledgeEntry'), Icon: BookOne });
  }

  return (
    <>
      {entries.map(({ path, label, Icon }) => {
        const isActive = pathname === path;
        return (
          <Tooltip key={path} {...siderTooltipProps} content={label} position='right'>
            {collapsed ? (
              <div
                className={classNames(
                  'w-full h-34px flex items-center justify-center cursor-pointer transition-colors rd-8px text-t-primary',
                  isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
                )}
                onClick={() => onNavigate(path)}
              >
                <Icon theme='outline' size='20' fill='currentColor' className='block leading-none shrink-0' />
              </div>
            ) : (
              <div
                className={classNames(
                  'box-border group h-34px w-full flex items-center justify-start gap-8px ps-10px pe-8px rd-0.5rem cursor-pointer shrink-0 transition-all text-t-primary',
                  isMobile && 'sider-action-btn-mobile',
                  isActive ? 'bg-fill-3' : 'hover:bg-fill-3 active:bg-fill-4'
                )}
                onClick={() => onNavigate(path)}
              >
                <span className='size-22px flex items-center justify-center shrink-0 text-t-primary'>
                  <Icon theme='outline' size='16' fill='currentColor' className='block leading-none' />
                </span>
                <span className='collapsed-hidden text-t-primary text-14px font-[500] leading-24px'>{label}</span>
              </div>
            )}
          </Tooltip>
        );
      })}
    </>
  );
};

export default SiderWorkspaceEntries;
