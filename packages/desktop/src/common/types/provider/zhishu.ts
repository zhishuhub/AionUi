/**
 * @license
 * Copyright 2026 Zhishu (zhishuhub.com), based on AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Zhishu connection: the app is bound to a single OpenAI-compatible relay. The user
 * clicks "Connect in one click" on the website, the app exchanges the copied connect
 * code for `base_url` + `api_key`, and every AI call goes through that relay.
 */

/** Application id registered on the website. */
export const ZHISHU_APP_KEY = 'gongzt26';

/** Fixed connect endpoint; `ZHISHU_CONNECT_URL` only exists for local testing. */
export const ZHISHU_DEFAULT_CONNECT_URL = 'https://zhishuhub.com/api/apps/connect';

/** Connect code format, matched after upper-casing the input. */
export const ZHISHU_CODE_PATTERN = /APP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}/;

/** Id of the single provider row created for the relay. */
export const ZHISHU_PROVIDER_ID = 'zhishu';

/** The relay maps these names to its current models, so the app never hard-codes a model. */
export const ZHISHU_CHAT_MODEL = 'chat';
export const ZHISHU_IMAGE_MODEL = 'image';

export type ZhishuStatus = {
  connected: boolean;
  /** Masked account name returned by the website, e.g. "张**". */
  userName: string;
  /** Origin of the website the user connected from (sub-sites keep their own origin). */
  siteOrigin: string;
  appKey: string;
  /** Notice for the user; empty when there is nothing to show. */
  message: string;
};

/** Optional company-server pages shown as extra sidebar entries. Empty string = hidden. */
export type ZhishuWorkspaceLinks = {
  inboxUrl: string;
  knowledgeUrl: string;
};

export type ZhishuVersionInfo = {
  current: string;
  /** Latest version listed on the website; empty when it could not be fetched. */
  latest: string;
  updateAvailable: boolean;
  /** App page on the website where the new installer can be downloaded. */
  pageUrl: string;
};

const APP_NAME_BY_LOCALE: Record<string, string> = { 'zh-CN': '智枢 AI 工作台', 'zh-TW': '智樞 AI 工作台' };
const DEFAULT_APP_NAME = 'Zhishu AI Workbench';
/** The backend's built-in helper assistant; its stored name carries the upstream product name. */
const BUTLER_ASSISTANT_ID = 'aionui-assistant';
const BUTLER_NAME_BY_LOCALE: Record<string, string> = { 'zh-CN': '工作台管家', 'zh-TW': '工作台管家' };
const DEFAULT_BUTLER_NAME = 'Workbench Butler';

type BrandedText = {
  name: string;
  name_i18n: Record<string, string>;
  description?: string;
  description_i18n: Record<string, string>;
};

function withAppName(text: string, locale?: string): string {
  return text.replace(/AionU[iI]/g, (locale && APP_NAME_BY_LOCALE[locale]) || DEFAULT_APP_NAME);
}

function mapLocales(values: Record<string, string> | undefined, map: (value: string, locale: string) => string) {
  return Object.fromEntries(Object.entries(values ?? {}).map(([locale, value]) => [locale, map(value, locale)]));
}

/** Shows the app's own name in the names and descriptions the backend stores for built-in assistants. */
export function brandAssistant<T extends BrandedText & { id: string }>(assistant: T): T {
  const butler = assistant.id === BUTLER_ASSISTANT_ID;
  return {
    ...assistant,
    name: butler ? DEFAULT_BUTLER_NAME : withAppName(assistant.name),
    name_i18n: mapLocales(assistant.name_i18n, (value, locale) =>
      butler ? BUTLER_NAME_BY_LOCALE[locale] || DEFAULT_BUTLER_NAME : withAppName(value, locale)
    ),
    description: assistant.description === undefined ? undefined : withAppName(assistant.description),
    description_i18n: mapLocales(assistant.description_i18n, withAppName),
  };
}
