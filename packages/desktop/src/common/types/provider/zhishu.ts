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
