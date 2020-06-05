import { browser } from 'webextension-polyfill-ts';

import { generateManifest } from './webmanifest';

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
    const { pathname } = new URL(request.url);
    if (resourceType === 'Document') {
      const res = await fetch(request.url);
      const headers = [...res.headers].map(e => e.join(': ')).join('\u0000\u0000');
      const data = await res.text();
      chrome.debugger.sendCommand(source, 'Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        binaryResponseHeaders: btoa(unescape(encodeURIComponent(headers))),
        body: btoa(
          unescape(
            encodeURIComponent(
              data.replace(
                '</head>',
                `
                  <link rel="manifest" href="/~webmanifest.json">
                  <script>
                    navigator.serviceWorker.register('/~serviceworker.js');
                  </script>
                </head>
                `,
              ),
            ),
          ),
        ),
      });
    } else if (pathname === '/~webmanifest.json') {
      chrome.debugger.sendCommand(source, 'Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        binaryResponseHeaders: btoa(unescape(encodeURIComponent('content-type: application/json'))),
        body: btoa(unescape(encodeURIComponent(await generateManifest(source.tabId as number)))),
      });
    } else if (pathname === '/~serviceworker.js') {
      const res = await fetch(
        'https://gist.githubusercontent.com/mantou132/52c2795604f7b1779cd66b2241650093/raw/cadd81cab4eb37c80ce9ed8e00365679b310ad8a/serviceworker.js',
      );
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
