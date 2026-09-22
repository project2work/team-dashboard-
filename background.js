importScripts('platforms.js');

async function runInsideGlovv(payload) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function scrapeVisibleCards() {
    return [...document.querySelectorAll('.model-card')].map((card) => {
      const text = card.innerText || '';
      const handleElement = [...card.querySelectorAll('span')]
        .find((element) => /^@[A-Za-z0-9._]+$/.test((element.textContent || '').trim()));
      if (!handleElement) return null;

      const handle = (handleElement.textContent || '').trim().replace(/^@/, '');
      const nameElement = handleElement.parentElement?.previousElementSibling?.querySelector('span');
      const name = (nameElement?.textContent || handle).trim();
      const followers = Number((text.match(/팔로워\s*([\d,]+)/)?.[1] || '0').replace(/,/g, ''));
      const feeManwon = Number(text.match(/(\d+)만원\s*그대로 지원/)?.[1] || 30);
      const activeApplications = Number(text.match(/우리 캠페인에 지원 중\s*(\d+)/)?.[1] || 0);
      const selectedHistory = text.split('우리가 선정한 적 있음')[1]?.split('우리 캠페인에 지원 중')[0] || '';
      const lines = selectedHistory.split('\n').map((line) => line.trim()).filter(Boolean);
      const recentCampaigns = [];
      for (let index = 1; index < lines.length; index += 1) {
        if (!/^\d{4}\/\d{2}\/\d{2}$/.test(lines[index])) continue;
        const productName = lines[index - 1];
        if (!productName || /최대 \d+건|총 \d+번|선정/.test(productName)) continue;
        recentCampaigns.push({ productName, createdAt: lines[index].replaceAll('/', '-') });
      }

      return {
        id: handle,
        name,
        instaUserId: handle,
        followers,
        commissionAmount: feeManwon * 10000,
        duplicateSupport: activeApplications > 1,
        recentCampaigns,
      };
    }).filter(Boolean);
  }

  async function scrapeAllApplicantPages() {
    const byHandle = new Map();
    const collect = () => scrapeVisibleCards().forEach((item) => {
      const key = item.instaUserId.toLowerCase();
      const previous = byHandle.get(key);
      byHandle.set(key, previous ? {
        ...previous,
        ...item,
        followers: Math.max(previous.followers || 0, item.followers || 0),
        duplicateSupport: previous.duplicateSupport || item.duplicateSupport,
        recentCampaigns: previous.recentCampaigns?.length ? previous.recentCampaigns : item.recentCampaigns,
      } : item);
    });

    const getRegularPagination = () => [...document.querySelectorAll('.pagination')]
      .map((element) => ({ element, numeric: [...element.querySelectorAll('.page-link')].filter((button) => /^\d+$/.test((button.textContent || '').trim())) }))
      .sort((a, b) => b.numeric.length - a.numeric.length)[0];
    const regularPagination = getRegularPagination();

    collect();
    if (!regularPagination || regularPagination.numeric.length <= 1) return [...byHandle.values()];

    const pageCount = Math.max(...regularPagination.numeric.map((button) => Number((button.textContent || '').trim())));
    for (let page = 1; page <= pageCount; page += 1) {
      const livePagination = getRegularPagination();
      const button = [...livePagination.element.querySelectorAll('.page-link')]
        .find((candidate) => (candidate.textContent || '').trim() === String(page));
      if (!button) continue;
      const active = button.parentElement?.classList.contains('active');
      if (!active) {
        button.click();
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const current = getRegularPagination();
          const activePage = current?.element.querySelector('.page-item.active .page-link')?.textContent?.trim();
          if (activePage === String(page)) break;
          await sleep(100);
        }
        await sleep(450);
      }
      collect();
    }

    const finalPagination = getRegularPagination();
    const first = [...finalPagination.element.querySelectorAll('.page-link')]
      .find((button) => (button.textContent || '').trim() === '1');
    if (first && !first.parentElement?.classList.contains('active')) first.click();
    return [...byHandle.values()];
  }

  async function clickRepresentativeReel(rawHandle) {
    const requestedHandle = String(rawHandle || '').replace(/^@/, '').toLowerCase();
    const getRegularPagination = () => [...document.querySelectorAll('.pagination')]
      .map((element) => ({ element, numeric: [...element.querySelectorAll('.page-link')].filter((button) => /^\d+$/.test((button.textContent || '').trim())) }))
      .sort((a, b) => b.numeric.length - a.numeric.length)[0];
    const pagination = getRegularPagination();
    const pageCount = pagination?.numeric.length ? Math.max(...pagination.numeric.map((button) => Number((button.textContent || '').trim()))) : 1;

    for (let page = 1; page <= pageCount; page += 1) {
      const livePagination = getRegularPagination();
      const pageButton = [...(livePagination?.element.querySelectorAll('.page-link') || [])]
        .find((button) => (button.textContent || '').trim() === String(page));
      if (pageButton && !pageButton.parentElement?.classList.contains('active')) {
        pageButton.click();
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const activePage = getRegularPagination()?.element.querySelector('.page-item.active .page-link')?.textContent?.trim();
          if (activePage === String(page)) break;
          await sleep(100);
        }
        await sleep(450);
      }
      for (const card of document.querySelectorAll('.model-card')) {
        const handleElement = [...card.querySelectorAll('span')].find((element) => /^@[A-Za-z0-9._]+$/.test((element.textContent || '').trim()));
        const handle = (handleElement?.textContent || '').trim().replace(/^@/, '').toLowerCase();
        if (handle !== requestedHandle) continue;
        const reelButton = [...card.querySelectorAll('div.button')].find((button) => {
          const label = (button.textContent || '').trim();
          return label.includes('대표 릴스 보기') || label === '확인했음' || Boolean(button.querySelector('img[alt="instagram"]'));
        });
        if (!reelButton) return { clicked: false, url: '' };
        const hrefCandidates = [
          reelButton.closest('a')?.href,
          reelButton.querySelector('a[href*="instagram.com"], a[href*="/reel/"]')?.href,
          ...[...card.querySelectorAll('a[href*="instagram.com/reel/"], a[href*="instagram.com/reels/"], a[href*="/reel/"]')].map((link) => link.href),
        ].filter(Boolean);
        const directUrl = hrefCandidates.find((url) => /instagram\.com\/(?:[^/]+\/)?reels?\//i.test(String(url)));
        if (directUrl) return { clicked: false, url: new URL(directUrl, location.href).href };
        // Capture the button's actual destination even when noopener removes
        // openerTabId. Suppress only this Instagram popup, restore immediately.
        const originalOpen = window.open;
        let destination = '';
        window.open = function(url, ...args) {
          const href = String(url || '');
          if (/^https:\/\/(?:www\.)?instagram\.com\/(?:[^/]+\/)?(?:reels?|p)\//i.test(href)) { destination = href; return null; }
          return originalOpen.call(this, url, ...args);
        };
        try {
          reelButton.click();
          await sleep(350);
          const warning = [...document.querySelectorAll('span')].find((element) => (element.textContent || '').includes('릴스 작업물을 반드시 확인'));
          if (warning) {
            const confirm = [...document.querySelectorAll('span')].find((element) => (element.textContent || '').trim() === '확인');
            confirm?.closest('div.button')?.click();
          }
          for (let attempt = 0; !destination && attempt < 10; attempt++) await sleep(150);
          return { clicked: true, url: destination };
        } finally { window.open = originalOpen; }
      }
    }
    return { clicked: false, url: '' };
  }

  async function fetchExport({ token, productId }) {
    const url = new URL('/api/export/campaign/applicants', location.origin);
    url.searchParams.set('brand_token', token);
    url.searchParams.set('products', String(productId));
    const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    const signature = String.fromCharCode(...bytes.slice(0, 2));
    if (!response.ok || signature !== 'PK') return null;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return btoa(binary);
  }
  async function fetchPage({ token, campaignId, productId, isSuggested, page, size }) {
    const url = new URL(`/api/campaign/${campaignId}/product/${productId}/applicants`, location.origin);
    const params = {
      brand_token: token,
      is_suggested: String(isSuggested),
      with_rental_posting_due: 'true',
      order_column: 'created_at',
      order_value: 'desc',
      page: String(page),
      size: String(size),
    };
    if (isSuggested) params.is_commission_increased = 'false';
    else params.has_tag_assignments_seedable_product_category_beauty = 'true';
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, { credentials: 'include', headers: { accept: 'application/json' }, cache: 'no-store' });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || (json.code && json.code !== 200)) throw new Error(json.message || `글로브 응답 오류 (${response.status})`);
    const data = json.data || {};
    return { applicants: data.applicants || [], paginator: data.paginator || {} };
  }
  const { token, campaignId, productId } = payload || {};
  if (!token || !campaignId || !productId) throw new Error('캠페인 연결 정보가 부족합니다.');
  const pageCampaignId = location.pathname.match(/\/campaigns\/(\d+)/)?.[1];
  const pageProductId = location.pathname.match(/\/product\/(\d+)/)?.[1];
  if (pageCampaignId === String(campaignId) && pageProductId === String(productId)) {
    for (let attempt = 0; !document.querySelector('.model-card') && attempt < 40; attempt++) await sleep(250);
    if (payload.mode === 'representative') return { ...await clickRepresentativeReel(payload.handle), source: 'page-representative' };
    const visibleApplicants = await scrapeAllApplicantPages();
    const selectionCount = Number([...document.body.innerText.matchAll(/(\d+)\s*\/\s*(\d+)/g)].at(-1)?.[2] || 0);
    if (visibleApplicants.length) return { applicants: visibleApplicants, selectionCount, source: 'page' };
  }
  const workbookBase64 = await fetchExport({ token, productId });
  if (workbookBase64) return { workbookBase64 };
  const [suggested, firstRegular] = await Promise.all([
    fetchPage({ token, campaignId, productId, isSuggested: true, page: 1, size: 10000 }),
    fetchPage({ token, campaignId, productId, isSuggested: false, page: 1, size: 50 }),
  ]);
  const applicants = [...suggested.applicants, ...firstRegular.applicants];
  const lastPage = Number(firstRegular.paginator.lastPage || firstRegular.paginator.last_page || 1);
  for (let page = 2; page <= Math.min(lastPage, 100); page += 1) {
    const next = await fetchPage({ token, campaignId, productId, isSuggested: false, page, size: 50 });
    applicants.push(...next.applicants);
  }
  return { applicants: [...new Map(applicants.map((item) => [String(item.id || item.userId || item.user?.id), item])).values()] };
}

async function runInsideInstagram(handle) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const parseViews = (label) => {
    const match = String(label || '').replace(/,/g, '').trim().match(/^(?:(?:조회수|재생|views?|plays?)\s*[:：]?\s*)?(\d+(?:\.\d+)?)\s*(억|만|천|[KMB])?(?:\s*(?:회|views?|plays?))?$/i);
    if (!match) return null;
    const multiplier = ({ 억: 1e8, 만: 1e4, 천: 1e3, K: 1e3, M: 1e6, B: 1e9 })[String(match[2]).toUpperCase()] || 1;
    return Math.round(Number(match[1]) * multiplier);
  };
  const pinned = (link) => [...link.querySelectorAll('[alt], [aria-label], title')].some(el => /고정|pinned/i.test([el.getAttribute('alt'), el.getAttribute('aria-label'), el.textContent].join(' '))) || /고정 게시물|pinned/i.test(link.innerText || '');
  const readViews = (link) => {
    // Read count labels, not image captions containing unrelated numbers/dates.
    const labels = [link.innerText, ...[...link.querySelectorAll('span, [aria-label], [title]')].flatMap(el => [el.children.length ? '' : el.textContent, el.getAttribute('aria-label'), el.getAttribute('title')])];
    return labels.flatMap(label => String(label || '').split('\n')).map(parseViews).find(value => value !== null) ?? null;
  };
  let reelLinks = [];
  let previousCount = -1;
  let stableCount = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    reelLinks = [...new Map([...document.querySelectorAll('a[href*="/reel/"]')]
      .map((link) => [new URL(link.href, location.origin).href, link])).values()];
    const usable = reelLinks.filter(link => !pinned(link));
    const usableCount = usable.length;
    if (usableCount >= 5 && usable.slice(0, 5).every(link => readViews(link) !== null)) break;
    stableCount = usableCount > 0 && usableCount === previousCount ? stableCount + 1 : 0;
    if (document.body.innerText.includes('비공개 계정입니다')) break;
    previousCount = usableCount;
    if (attempt > 0 && attempt % 8 === 0) window.scrollBy(0, Math.max(500, window.innerHeight * 0.8));
    await sleep(350);
  }
  return reelLinks
    .filter((link) => !pinned(link))
    .map(link => ({ url: new URL(link.href, location.origin).href, views: readViews(link) }))
    .slice(0, 5);
}

function runInsideInstagramReel() {
  const parseViews = (label) => {
    const normalized = String(label || '').replace(/,/g, '');
    const patterns = [
      /(?:조회수|재생|views?|plays?)\s*([\d.]+)\s*(억|만|천|[KMB])?/i,
      /([\d.]+)\s*(억|만|천|[KMB])?\s*(?:회\s*)?(?:조회|재생|views?|plays?)/i,
    ];
    const match = patterns.map((pattern) => normalized.match(pattern)).find(Boolean);
    if (!match) return 0;
    const unit = String(match[2] || '').toUpperCase();
    const multiplier = unit === '억' ? 100000000 : unit === '만' ? 10000 : unit === '천' || unit === 'K' ? 1000 : unit === 'M' ? 1000000 : unit === 'B' ? 1000000000 : 1;
    return Math.round(Number(match[1]) * multiplier);
  };
  const metadata = [...document.querySelectorAll('meta[name="description"], meta[property="og:description"]')]
    .map((element) => element.getAttribute('content')).filter(Boolean).join(' ');
  return parseViews(`${document.body.innerText || ''} ${metadata}`);
}

async function captureRepresentativeUrl(glovvTabId, payload, handle) {
  return new Promise((resolve) => {
    let createdTabId;
    let settled = false;
    const isRepresentativeUrl = (url) => /^https:\/\/(?:www\.)?instagram\.com\/(?:[^/]+\/)?reels?\//i.test(String(url || ''));
    const cleanup = () => {
      chrome.tabs.onCreated.removeListener(onCreated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
    };
    const finish = async (url = '') => {
      if (settled) return;
      settled = true;
      cleanup();
      if (createdTabId) await chrome.tabs.remove(createdTabId).catch(() => undefined);
      resolve(url);
    };
    const onCreated = (tab) => {
      if (tab.openerTabId !== glovvTabId) return;
      createdTabId = tab.id;
      if (isRepresentativeUrl(tab.url)) finish(tab.url);
    };
    const onUpdated = (tabId, info, tab) => {
      if (tabId === createdTabId && isRepresentativeUrl(info.url || tab.url)) finish(info.url || tab.url);
    };
    const timer = setTimeout(() => finish(''), 60000);
    chrome.tabs.onCreated.addListener(onCreated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.scripting.executeScript({
      target: { tabId: glovvTabId },
      world: 'MAIN',
      func: runInsideGlovv,
      args: [{ mode: 'representative', handle, campaignId: payload.campaignId, productId: payload.productId, token: payload.token }],
    }).then(([injected]) => {
      if (injected?.result?.url) finish(injected.result.url);
      else if (!injected?.result?.clicked) finish('');
    }).catch(() => finish(''));
  });
}

async function waitForTab(tabId) {
  const current = await chrome.tabs.get(tabId).catch(() => null);
  if (current?.status === 'complete') return;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('글로브 탭을 여는 데 시간이 오래 걸립니다.')); }, 30000);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
  });
}

function navigateTab(tabId, url) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); reject(new Error('인스타그램 페이지를 여는 데 시간이 오래 걸립니다.')); }, 30000);
    const listener = (updatedId, info, tab) => {
      if (updatedId !== tabId || info.status !== 'complete' || !String(tab.url || '').startsWith(url)) return;
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.update(tabId, { url }).catch((error) => {
      clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); reject(error);
    });
  });
}

async function fetchApplicants(payload) {
  const targetUrl = `https://brand.glovv.co.kr/campaigns/${payload.campaignId}/product/${payload.productId}`;
  let [tab] = await chrome.tabs.query({ url: `${targetUrl}*` });
  if (!tab?.id) {
    tab = await chrome.tabs.create({ url: `${targetUrl}?tab=applicants`, active: false });
    await waitForTab(tab.id);
  }
  if (payload.mode === 'details') {
    const details = {};
    let instagramTab;
    try {
      instagramTab = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: false });
      await waitForTab(instagramTab.id).catch(() => undefined);
      for (const rawHandle of payload.handles || []) {
        const handle = String(rawHandle).replace(/^@/, '').toLowerCase();
        const representativeReel = shortenRepresentativeReelUrl(await captureRepresentativeUrl(tab.id, payload, handle));
        const profileUrl = `https://www.instagram.com/${handle}/reels/`;
        await navigateTab(instagramTab.id, profileUrl).catch(() => undefined);
        const [instagramResult] = await chrome.scripting.executeScript({ target: { tabId: instagramTab.id }, world: 'MAIN', func: runInsideInstagram, args: [handle] }).catch(() => []);
        const reels = instagramResult?.result || [];
        for (const reel of reels) {
          if (reel.views !== null) continue;
          await navigateTab(instagramTab.id, reel.url).catch(() => undefined);
          const [reelResult] = await chrome.scripting.executeScript({ target: { tabId: instagramTab.id }, world: 'MAIN', func: runInsideInstagramReel }).catch(() => []);
          reel.views = reelResult?.result > 0 ? Number(reelResult.result) : null;
        }
        details[handle] = {
          representativeReel,
          reelViews: reels.length === 5 && reels.every(reel => Number.isFinite(reel.views) && reel.views >= 0) ? reels.map(reel => reel.views) : [],
        };
      }
    } finally {
      if (instagramTab?.id) await chrome.tabs.remove(instagramTab.id).catch(() => undefined);
    }
    return { ok: true, details, source: 'page-and-instagram-details' };
  }
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: 'MAIN',
    func: runInsideGlovv,
    args: [payload],
  });
  return { ok: true, applicants: result?.applicants || [], workbookBase64: result?.workbookBase64 || '', selectionCount: result?.selectionCount || 0, source: result?.source || 'api' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'FETCH_GLOVV_APPLICANTS') return false;
  if (_sender.origin !== 'https://glovv-list-maker-kimdh.doheeeeeeeee.chatgpt.site') return false;
  const task = message.payload?.provider && message.payload.provider !== 'glovv' ? fetchPlatform : fetchApplicants;
  task(message.payload).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message || '지원자를 불러오지 못했습니다.' }));
  return true;
});
