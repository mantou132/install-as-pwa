import { browser } from 'webextension-polyfill-ts';

import { generateManifest } from './webmanifest';

const MANIFEST_NAME = '/?~webmanifest.json';
const SERVICE_WORKER_NAME = '/?~serviceworker.js';
const SERVICE_WORKER_SOURCE =
  'https://gist.githubusercontent.com/mantou132/52c2795604f7b1779cd66b2241650093/raw/c1be067ca7ad8e942b982a1e42d3f1ee92f4dd91/serviceworker.js';

const injectWebManifestAndServiceWorker = (html: string) => {
  return html.replace(
    '</head>',
    `
      <link rel="manifest" href="${MANIFEST_NAME}">
      <script>
        navigator.serviceWorker.register('${SERVICE_WORKER_NAME}');
      </script>
    </head>
    `,
  );
};

if (typeof chrome !== 'undefined' && chrome.debugger) {
  const CDP_VERSION = '1.2';
  browser.browserAction.onClicked.addListener(tab => {
    // 😢 degugging tip show in all tabs
    const debuggee = { tabId: tab.id };
    chrome.debugger.attach(debuggee, CDP_VERSION, () => {
      chrome.debugger.sendCommand(debuggee, 'Fetch.enable', { patterns: [{ urlPattern: '*' }] }, () => {
        browser.tabs.reload();
      });
    });
  });

  chrome.debugger.onEvent.addListener(async (source, method, params: any) => {
    if (method === 'Fetch.requestPaused') {
      const { requestId, request, resourceType } = params;
      if (resourceType === 'Document') {
        const res = await fetch(request.url);
        const headers = [...res.headers].map(e => e.join(': ')).join('\u0000\u0000');
        const html = await res.text();
        chrome.debugger.sendCommand(source, 'Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          binaryResponseHeaders: btoa(unescape(encodeURIComponent(headers))),
          body: btoa(unescape(encodeURIComponent(injectWebManifestAndServiceWorker(html)))),
        });
      } else if (request.url.endsWith(MANIFEST_NAME)) {
        chrome.debugger.sendCommand(source, 'Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          binaryResponseHeaders: btoa(unescape(encodeURIComponent('content-type: application/json'))),
          body: btoa(unescape(encodeURIComponent(await generateManifest(source.tabId as number, request.url)))),
        });
      } else if (request.url.endsWith(SERVICE_WORKER_NAME)) {
        // 😢 not capture
        console.log(request.url);
        const res = await fetch(SERVICE_WORKER_SOURCE);
        const data = await res.text();
        chrome.debugger.sendCommand(source, 'Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          binaryResponseHeaders: btoa(unescape(encodeURIComponent('content-type: application/javascript'))),
          body: btoa(unescape(encodeURIComponent(data))),
        });
      } else {
        chrome.debugger.sendCommand(source, 'Fetch.continueRequest', { requestId: params.requestId });
      }
    }
  });
} else {
  browser.webRequest.onBeforeRequest.addListener(
    details => {
      const filter = browser.webRequest.filterResponseData(details.requestId);

      // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
      // @ts-ignore
      filter.ondata = event => {
        const html = new TextDecoder('utf-8').decode(event.data, { stream: true });
        filter.write(new TextEncoder().encode(injectWebManifestAndServiceWorker(html)));
        filter.disconnect();
      };

      return {};
    },
    { urls: ['https://*/*'], types: ['main_frame'] },
    ['blocking'],
  );
  browser.webRequest.onBeforeRequest.addListener(
    details => {
      if (details.url.endsWith(MANIFEST_NAME)) {
        const filter = browser.webRequest.filterResponseData(details.requestId);

        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        filter.ondata = async () => {
          filter.write(new TextEncoder().encode(await generateManifest(details.tabId, details.url)));
          filter.disconnect();
        };

        return {};
      }
    },
    { urls: ['https://*/*'] },
    ['blocking'],
  );
  browser.webRequest.onBeforeRequest.addListener(
    details => {
      if (details.url.endsWith(SERVICE_WORKER_NAME)) {
        const filter = browser.webRequest.filterResponseData(details.requestId);

        // eslint-disable-next-line @typescript-eslint/ban-ts-ignore
        // @ts-ignore
        filter.ondata = async () => {
          const res = await fetch(SERVICE_WORKER_SOURCE);
          const text = await res.text();
          filter.write(new TextEncoder().encode(text));
          filter.disconnect();
        };

        return {};
      }
    },
    { urls: ['https://*/*'] },
    ['blocking'],
  );
  browser.webRequest.onHeadersReceived.addListener(
    details => {
      if (!details.responseHeaders) return;
      if (details.url.endsWith(SERVICE_WORKER_NAME)) {
        details.responseHeaders.length = 0;
        details.responseHeaders.push({
          name: 'content-type',
          value: 'application/javascript',
        });
        return { responseHeaders: details.responseHeaders };
      }
      if (details.url.endsWith(MANIFEST_NAME)) {
        details.responseHeaders.length = 0;
        details.responseHeaders.push({
          name: 'content-type',
          value: 'application/json',
        });
        return { responseHeaders: details.responseHeaders };
      }
    },
    { urls: ['https://*/*'] },
    ['blocking', 'responseHeaders'],
  );
}
