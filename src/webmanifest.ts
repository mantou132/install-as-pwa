/* eslint-disable @typescript-eslint/camelcase */
import { browser } from 'webextension-polyfill-ts';

import { getIcon } from './icon';
import { Result } from './content';

const cache: Record<string, string> = {};

export async function generateManifest(url: string) {
  if (cache[url]) return cache[url];
  await browser.tabs.executeScript({
    file: 'content.js',
  });
  const info: Result[] = await browser.tabs.executeScript({
    code: 'window.pageInfo',
  });
  const { title, shortTitle, description, themeColor, backgroundColor } = info[0];
  const result = JSON.stringify(
    {
      name: title,
      short_name: shortTitle,
      description,
      theme_color: themeColor,
      background_color: backgroundColor,
      start_url: '/?utm_source=web_app_manifest',
      display: 'standalone',
      icons: [
        {
          src: await getIcon(url),
          sizes: '256x256',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    },
    null,
    2,
  );
  cache[url] = result;
  return result;
}
