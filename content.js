const PAGE_SOURCE = 'glovv-list-maker';
const EXTENSION_SOURCE = 'glovv-list-connector';

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== PAGE_SOURCE) return;

  if (message.type === 'GLOVV_CONNECTOR_PING') {
    window.postMessage({ source: EXTENSION_SOURCE, type: 'GLOVV_CONNECTOR_PONG', version: chrome.runtime.getManifest().version }, window.location.origin);
    return;
  }

  if (message.type !== 'GLOVV_CONNECTOR_REQUEST' || !message.requestId) return;
  chrome.runtime.sendMessage({ type: 'FETCH_GLOVV_APPLICANTS', payload: message.payload }, (response) => {
    const error = chrome.runtime.lastError?.message;
    window.postMessage({
      source: EXTENSION_SOURCE,
      type: 'GLOVV_CONNECTOR_RESPONSE',
      requestId: message.requestId,
      response: error ? { ok: false, message: error } : response,
    }, window.location.origin);
  });
});
