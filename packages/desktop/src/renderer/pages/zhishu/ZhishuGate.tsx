/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { ipcBridge } from '@/common';
import { ZHISHU_CODE_PATTERN, type ZhishuStatus } from '@/common/types/provider/zhishu';
import { isElectronDesktop } from '@/renderer/utils/platform';
import { subscribeZhishuStatus } from './zhishuStatusEvents';

const VERIFY_INTERVAL_MS = 60_000;

/**
 * Until the app is connected, every page except Settings shows the connect page. The code
 * is picked up from the clipboard when the window opens or regains focus, or pasted by hand.
 * Once connected, regaining focus re-checks (at most once a minute) that the website has
 * not revoked access. Desktop only: the WebUI has no access to the connection.
 */
const ZhishuGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const desktop = isElectronDesktop();
  const [status, setStatus] = useState<ZhishuStatus | null>(null);
  const [code, setCode] = useState('');
  const [tip, setTip] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const connectingRef = useRef(false);
  const lastVerifyRef = useRef(0);

  const apply = useCallback((next: ZhishuStatus) => {
    setStatus(next);
    setTip(next.message);
  }, []);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    ipcBridge.zhishu.status
      .invoke({ verify: true })
      .then((next) => {
        if (disposed) return;
        lastVerifyRef.current = Date.now();
        apply(next);
      })
      .catch(() => {
        if (!disposed) setLoadFailed(true);
      });
    const unsubscribe = subscribeZhishuStatus(apply);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [apply, desktop]);

  const run = useCallback(
    async (task: () => Promise<ZhishuStatus | null>) => {
      if (connectingRef.current) return;
      connectingRef.current = true;
      setConnecting(true);
      try {
        const next = await task();
        if (next) {
          apply(next);
          if (next.connected) setCode('');
        }
      } catch {
        setTip(t('settings.zhishu.connectInterrupted'));
      } finally {
        connectingRef.current = false;
        setConnecting(false);
      }
    },
    [apply, t]
  );

  const connectWithText = useCallback(
    (raw: string) => {
      const match = ZHISHU_CODE_PATTERN.exec(raw.toUpperCase());
      if (!match) return;
      setTip(t('settings.zhishu.connecting'));
      void run(() => ipcBridge.zhishu.connect.invoke({ code: match[0] }));
    },
    [run, t]
  );

  // Not connected: read the clipboard on open and on focus. Connected: re-verify on focus.
  useEffect(() => {
    if (!desktop || !status) return;
    const onFocus = () => {
      if (!status.connected) {
        void run(() => ipcBridge.zhishu.connectFromClipboard.invoke());
        return;
      }
      if (Date.now() - lastVerifyRef.current < VERIFY_INTERVAL_MS) return;
      lastVerifyRef.current = Date.now();
      ipcBridge.zhishu.status
        .invoke({ verify: true })
        .then((next) => {
          if (!next.connected) apply(next);
        })
        .catch(() => {
          // Main process busy: try again on the next focus.
        });
    };
    if (!status.connected) onFocus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [apply, desktop, run, status]);

  const pasteFromClipboard = () => {
    void run(async () => {
      const next = await ipcBridge.zhishu.connectFromClipboard.invoke();
      if (!next) setTip(t('settings.zhishu.clipboardEmpty'));
      return next;
    });
  };

  if (!desktop || pathname.startsWith('/settings')) return <>{children}</>;
  if (loadFailed) {
    return (
      <div className='flex items-center justify-center w-full h-full px-24px'>
        <Typography.Text className='text-14px text-danger' role='alert'>
          {t('settings.zhishu.loadFailed')}
        </Typography.Text>
      </div>
    );
  }
  if (!status) return null;
  if (status.connected) return <>{children}</>;

  return (
    <div className='flex items-center justify-center w-full h-full overflow-y-auto px-24px'>
      <div className='flex flex-col gap-16px w-full max-w-460px py-32px'>
        <Typography.Title heading={4} className='text-22px font-bold text-t-primary m-0'>
          {t('settings.zhishu.gateTitle')}
        </Typography.Title>
        <Typography.Text className='text-14px text-t-secondary'>{t('settings.zhishu.gateLead')}</Typography.Text>
        <ol className='flex flex-col gap-8px m-0 pl-20px text-14px text-t-primary'>
          <li>{t('settings.zhishu.gateStepWebsite')}</li>
          <li>{t('settings.zhishu.gateStepPaste')}</li>
        </ol>
        <div className='flex items-center gap-8px'>
          <Input
            value={code}
            onChange={(value) => {
              setCode(value);
              connectWithText(value);
            }}
            placeholder='APP-XXXX-XXXX-XXXX'
            aria-label={t('settings.zhishu.codeLabel')}
            autoFocus
          />
          <Button disabled={connecting} onClick={pasteFromClipboard}>
            {t('settings.zhishu.paste')}
          </Button>
        </div>
        <Typography.Text
          className={tip && !connecting ? 'text-13px text-danger' : 'text-13px text-t-secondary'}
          role='status'
          aria-live='polite'
        >
          {tip}
        </Typography.Text>
      </div>
    </div>
  );
};

export default ZhishuGate;
