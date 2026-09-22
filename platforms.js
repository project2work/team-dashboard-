// Read only: never click platform selection, submission, or payment controls.
function shortenRepresentativeReelUrl(value) {
  const original = String(value || '');
  try {
    const url = new URL(original);
    if (url.protocol !== 'https:' || !/(^|\.)instagram\.com$/i.test(url.hostname)) return original;
    const parts = url.pathname.split('/').filter(Boolean);
    const reelIndex = parts.findIndex((part) => /^reels?$/i.test(part));
    if (reelIndex < 0 || !parts[reelIndex + 1]) return original;
    return `${url.origin}/${parts[reelIndex]}/${parts[reelIndex + 1]}/`;
  } catch {
    return original;
  }
}

function readPlatformPage(provider, mode) {
  const shortenRepresentativeReelUrl = (value) => {
    const original = String(value || '');
    try {
      const url = new URL(original);
      if (url.protocol !== 'https:' || !/(^|\.)instagram\.com$/i.test(url.hostname)) return original;
      const parts = url.pathname.split('/').filter(Boolean);
      const reelIndex = parts.findIndex((part) => /^reels?$/i.test(part));
      if (reelIndex < 0 || !parts[reelIndex + 1]) return original;
      return `${url.origin}/${parts[reelIndex]}/${parts[reelIndex + 1]}/`;
    } catch {
      return original;
    }
  };
  const text = document.body.innerText || '';
  const number = (value) => {
    const m = String(value || '').replaceAll(',', '').match(/([\d.]+)\s*(억|만|천|[kmb])?/i);
    return m ? Math.round(Number(m[1]) * ({ 억: 1e8, 만: 1e4, 천: 1e3, k: 1e3, m: 1e6, b: 1e9 }[String(m[2]).toLowerCase()] || 1)) : 0;
  };
  const links = [...document.querySelectorAll('a[href]')];
  const pages = links.filter(a => {
    const u = new URL(a.href, location.href);
    return u.origin === location.origin && u.pathname === location.pathname && /^\d+$/.test(u.searchParams.get('page') || '');
  }).map(a => a.href);
  if (document.querySelector('input[type="password"]')) return { loginRequired: true };
  const campaigns = [];
  if (mode === 'campaigns') {
    for (const a of links) {
      const u = new URL(a.href, location.href);
      if (u.origin !== location.origin) continue;
      const match = provider === 'momnt' ? u.pathname.match(/^\/campaign\/(\d+)\/?$/) : u.pathname.match(/^\/biz\/[^/]+\/campaign\/([A-Za-z0-9]+)\/?$/);
      if (!match) continue;
      const row = provider === 'wereview' ? a.closest('tr') : a;
      const label = row?.innerText || a.innerText;
      const counts = label.match(/(\d+)\s*\/\s*(\d+)\s*\/\s*(\d+)/);
      const name = a.querySelector('h3')?.innerText || a.innerText.trim();
      campaigns.push({ id: match[1], url: u.origin + u.pathname, name,
        brand: ['센텔리안24', '마데카21', '마데카셀'].find(b => label.includes(b)) || '',
        applicants: provider === 'momnt' ? number(label.match(/신청\s*([\d,]+)/)?.[1]) : number(counts?.[2]),
        selectionCount: provider === 'momnt' ? number(label.match(/목표\s*([\d,]+)/)?.[1]) : number(counts?.[1]) });
    }
    return { campaigns: [...new Map(campaigns.map(c => [c.url, c])).values()], pages };
  }
  const applicants = [];
  if (provider === 'momnt') {
    // Stable form field supplied by Momnt, including applicants without an IG ID.
    for (const input of document.querySelectorAll('input[name="apply_seqs[]"]')) {
      let card = input.parentElement;
      while (card && !/팔로어/.test(card.innerText || '')) card = card.parentElement;
      if (!card || card.querySelectorAll('input[name="apply_seqs[]"]').length !== 1) continue;
      const body = card.innerText;
      const profile = [...card.querySelectorAll('a')].find(a => a.textContent.trim() === '인스타그램');
      const representative = [...card.querySelectorAll('a')].find(a => a.textContent.trim() === '대표 릴스');
      applicants.push({ id: input.value, name: card.querySelector('p')?.textContent.trim() || '',
        instaUserId: profile ? new URL(profile.href).pathname.split('/').filter(Boolean)[0] : '',
        followers: number(body.match(/팔로어\s*([\d,]+)/)?.[1]),
        duplicateSupport: number(body.match(/우리 캠페인 지원 중\s*(\d+)/)?.[1]) > 1,
        representativeReel: shortenRepresentativeReelUrl(representative?.href || ''), note: '-' });
    }
  } else {
    for (const name of document.querySelectorAll('.creator-name')) {
      const card = name.closest('.name-with-badge')?.parentElement;
      if (!card) continue;
      const profile = [...card.querySelectorAll('a[href]')].find(a => /^https:\/\/(?:www\.)?instagram\.com\//.test(a.href));
      const handle = profile ? new URL(profile.href).pathname.split('/').filter(Boolean)[0] : '';
      let metrics = card;
      while (metrics && !/평균\s*조회수/.test(metrics.innerText)) metrics = metrics.parentElement;
      const average = metrics?.querySelectorAll('.creator-name').length === 1 ? metrics.innerText.match(/평균\s*조회수\s*([\d.,]+\s*(?:만|천|억|[KMB])?)/i)?.[1] : undefined;
      let videoCard = card;
      while (videoCard && !videoCard.querySelector('img[alt="Video thumbnail"]')) videoCard = videoCard.parentElement;
      const recentVideo = videoCard?.querySelectorAll('.creator-name').length === 1 ? videoCard.querySelector('img[alt="Video thumbnail"]')?.parentElement : null;
      const recentUrl = recentVideo?.closest('a[href]')?.href || recentVideo?.querySelector('video[src]')?.src || '';
      applicants.push({ id: handle || `${location.search}:${applicants.length}`, name: name.textContent.trim(),
        instaUserId: handle, followers: number(card.innerText.match(/팔로워\s*([\d.,]+\s*(?:만|천|억)?)/)?.[1]),
        providedAverageViews: average === undefined ? null : number(average),
        duplicateSupport: false, representativeReel: /^https:\/\//.test(recentUrl) ? shortenRepresentativeReelUrl(recentUrl) : '', note: '-' });
    }
  }
  return { applicants, pages, name: document.querySelector('h1')?.innerText || '',
    selectionCount: number(text.match(provider === 'momnt' ? /목표선정\s*(\d+)/ : /모집 인원\s*(\d+)/)?.[1]),
    expected: provider === 'momnt' ? number(text.match(/신청 인플루언서\s*(\d+)/)?.[1]) : 0,
    wrongStage: provider === 'momnt' && !text.includes('신청 인플루언서') && text.includes('선정 인플루언서') };
}

function platformUrl(payload) {
  const url = new URL(payload.url);
  const valid = payload.provider === 'momnt'
    ? url.origin === 'https://brands.momnt.cc' && /^\/campaign(?:\/\d+)?\/?$/.test(url.pathname)
    : payload.provider === 'wereview' && url.origin === 'https://biz.wereview.fun' && /^\/biz\/[A-Za-z0-9]+(?:\/campaign(?:\/[A-Za-z0-9]+)?)?\/?$/.test(url.pathname);
  if (!valid || url.username || url.password) throw new Error('선택한 플랫폼의 캠페인 링크를 입력해주세요.');
  url.hash = ''; url.search = '';
  if (payload.mode === 'campaigns' && payload.provider === 'wereview') {
    url.pathname = url.pathname.match(/^\/biz\/[^/]+/)[0] + '/campaign';
    url.searchParams.set('viewMode', 'ALL');
  } else if (payload.provider === 'wereview') {
    url.searchParams.set('size', '100');
    url.searchParams.set('page', '1');
  }
  return url.href;
}

async function fetchPlatform(payload) {
  const target = platformUrl(payload);
  if (payload.mode === 'details') return fetchPlatformReelDetails(payload);
  const tab = await chrome.tabs.create({ url: target, active: false });
  const results = new Map();
  const seenPages = new Set();
  const queue = [target];
  let first;
  try {
    while (queue.length) {
      const url = queue.shift();
      const key = new URL(url).searchParams.get('page') || '1';
      if (seenPages.has(key)) continue;
      if (seenPages.size >= 200) throw new Error('페이지가 너무 많아 중단했습니다. 일부 명단은 출력하지 않습니다.');
      if (seenPages.size) await navigateTab(tab.id, url);
      else await waitForTab(tab.id);
      let page;
      for (let attempt = 0; attempt < 40; attempt++) {
        const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPlatformPage, args: [payload.provider, payload.mode || 'applicants'] });
        page = r.result;
        if (page.loginRequired) throw new Error('같은 Chrome에서 해당 플랫폼에 먼저 로그인한 뒤 다시 불러와주세요.');
        if (page.wrongStage) throw new Error('이 캠페인은 현재 선정자만 표시합니다. 신청 인플루언서 목록을 제공하는 캠페인을 선택해주세요.');
        const rows = payload.mode === 'campaigns' ? page.campaigns : page.applicants;
        if (rows?.length && (!page.expected || rows.length >= page.expected || page.pages.length)) break;
        await new Promise(r => setTimeout(r, 300));
      }
      first ||= page;
      const rows = payload.mode === 'campaigns' ? page.campaigns : page.applicants;
      if (!rows?.length) throw new Error(payload.mode === 'campaigns' ? '표시할 캠페인이 없습니다. 플랫폼 로그인과 목록을 확인해주세요.' : '지원자 목록이 비어 있거나 아직 표시되지 않았습니다.');
      const before = results.size;
      rows.forEach(row => results.set(String(row.id), row));
      if (seenPages.size && before === results.size) throw new Error('페이지 이동 후 같은 명단이 반환되어 중단했습니다. 다시 시도해주세요.');
      seenPages.add(key);
      for (const href of page.pages || []) {
        const u = new URL(href);
        if (u.origin === new URL(target).origin && u.pathname === new URL(target).pathname && !seenPages.has(u.searchParams.get('page') || '1')) queue.push(href);
      }
    }
    if (payload.mode === 'campaigns') return { ok: true, campaigns: [...results.values()] };
    const expected = first.expected || payload.expectedCount || 0;
    if (expected && results.size !== expected) throw new Error(`지원자 ${expected}명 중 ${results.size}명만 확인돼 출력을 중단했습니다. 목록을 새로고침한 뒤 다시 시도해주세요.`);
    return { ok: true, applicants: [...results.values()], selectionCount: first.selectionCount, name: first.name };
  } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}

async function fetchPlatformReelDetails(payload) {
  const details = {};
  const tab = await chrome.tabs.create({ url: 'https://www.instagram.com/', active: false });
  try {
    await waitForTab(tab.id);
    for (const value of payload.handles || []) {
      const handle = String(value).replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9._]{1,30}$/.test(handle)) continue;
      await navigateTab(tab.id, `https://www.instagram.com/${handle}/reels/`);
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: runInsideInstagram, args: [handle] });
      const reels = result.result || [];
      // Incomplete/hidden counts are not silently averaged as a different sample.
      details[handle] = { representativeReel: '', reelViews: reels.length === 5 && reels.every(r => Number.isFinite(r.views) && r.views >= 0) ? reels.map(r => r.views) : [] };
    }
    return { ok: true, details };
  } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}
