(function () {
  'use strict';

  let subtitleData = [];
  let cachedSubtitles = null;
  let cachedVideoId = null;
  let button = null;
  let panel = null;
  let listElement = null;
  let lastHref = '';
  let currentVideoInfo = null;

  function currentVideoRef() {
    const url = new URL(window.location.href);
    const queryBvid = url.searchParams.get('bvid') || '';
    const pathBvid =
      url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/i)?.[1] || '';
    const bvid =
      (queryBvid.match(/BV[0-9A-Za-z]+/i) ||
        pathBvid.match(/BV[0-9A-Za-z]+/i) ||
        [])[0] || '';
    const page =
      Number(url.searchParams.get('p')) ||
      Number(url.pathname.match(/_p(\d+)/i)?.[1]) ||
      1;
    return { bvid, page: Math.max(1, page) };
  }

  function isSupportedPage() {
    const path = window.location.pathname;
    return path.includes('/video/') || path.includes('/list/watchlater');
  }

  function createUI() {
    if (button) return;

    button = document.createElement('div');
    button.id = 'bili-heytea-btn';
    button.className = 'bili-heytea-float-btn';
    button.title = '下载字幕';
    button.innerHTML = `<svg class="icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" width="27" height="27" aria-hidden="true"><rect x="44" y="62" width="384" height="288" rx="56" fill="#ffffff" stroke="#7b7f82" stroke-width="20"/><path d="M201 146a60 60 0 1 0 0 120" fill="none" stroke="#7b7f82" stroke-width="22" stroke-linecap="round"/><path d="M331 146a60 60 0 1 0 0 120" fill="none" stroke="#7b7f82" stroke-width="22" stroke-linecap="round"/><circle cx="410" cy="341" r="74" fill="#ffffff" stroke="#7b7f82" stroke-width="16"/><path d="M410 296.6v57.3m-24.1-24.1 24.1 24.1 24.1-24.1" fill="none" stroke="#7b7f82" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><rect x="378.6" y="374.3" width="62.9" height="11.8" rx="5.9" fill="#7b7f82"/></svg>`;
    document.body.appendChild(button);

    panel = document.createElement('div');
    panel.id = 'bili-heytea-panel';
    panel.className = 'bili-heytea-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="bili-heytea-header">
        <span class="bili-heytea-title">字幕列表</span>
        <span class="bili-heytea-close">&times;</span>
      </div>
      <div class="bili-heytea-list" id="bili-heytea-list"></div>
    `;
    document.body.appendChild(panel);
    listElement = panel.querySelector('.bili-heytea-list');

    button.addEventListener('click', () => {
      const opening = panel.style.display === 'none';
      panel.style.display = opening ? 'block' : 'none';
      if (opening) loadSubtitles();
    });

    panel.querySelector('.bili-heytea-close').addEventListener('click', () => {
      panel.style.display = 'none';
    });

    document.addEventListener('click', (event) => {
      if (panel.style.display === 'none') return;
      if (!panel.contains(event.target) && !button.contains(event.target)) {
        panel.style.display = 'none';
      }
    });

    listElement.addEventListener('click', async (event) => {
      const downloadButton = event.target.closest('.bili-heytea-download-single');
      if (!downloadButton) return;
      const subtitle = subtitleData[Number(downloadButton.dataset.index)];
      if (!subtitle) return;

      const subtitleUrl = subtitle.subtitle_url || subtitle.subtitle_url_v2;
      if (!subtitleUrl) {
        downloadButton.textContent = '地址不可用';
        return;
      }

      downloadButton.textContent = '下载中...';
      downloadButton.disabled = true;
      try {
        const isAI = String(subtitle.lan || '').startsWith('ai-');
        const response = await chrome.runtime.sendMessage({
          action: 'download',
          subtitleUrl,
          metadata: {
            ...(currentVideoInfo || {}),
            language: subtitle.lan_doc || subtitle.lan,
            languageCode: subtitle.lan,
            subtitleType: isAI ? 'AI生成' : '人工上传',
          },
        });
        if (!response?.success) throw new Error(response?.error || '下载失败');
        downloadButton.textContent = '已下载';
        setTimeout(() => {
          downloadButton.textContent = '下载';
          downloadButton.disabled = false;
        }, 1800);
      } catch (error) {
        console.error('字幕下载失败:', error);
        downloadButton.textContent = '重试';
        downloadButton.disabled = false;
      }
    });
  }

  async function getVideoInfo() {
    const current = currentVideoRef();
    if (!current.bvid) return null;
    try {
      return await chrome.runtime.sendMessage({
        action: 'getVideoInfo',
        bvid: current.bvid,
        page: current.page,
      });
    } catch {
      return null;
    }
  }

  async function loadSubtitles() {
    const info = await getVideoInfo();
    if (!info) {
      listElement.innerHTML =
        '<div class="bili-heytea-message">无法识别当前视频，请刷新页面后重试</div>';
      return;
    }

    const videoId = `${info.bvid}_${info.aid}_${info.cid}`;
    if (cachedSubtitles && cachedVideoId === videoId) {
      subtitleData = cachedSubtitles;
      renderSubtitleList(subtitleData, info);
      return;
    }

    listElement.innerHTML =
      '<div class="bili-heytea-message">正在获取字幕...</div>';
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getSubtitles',
        aid: info.aid,
        cid: info.cid,
        bvid: info.bvid,
      });
      if (!response?.success) {
        throw new Error(response?.error || '获取字幕失败');
      }
      subtitleData = response.subtitles || [];
      cachedSubtitles = subtitleData;
      cachedVideoId = videoId;
      renderSubtitleList(subtitleData, info);
    } catch (error) {
      listElement.innerHTML = `<div class="bili-heytea-message bili-heytea-error">${escapeHtml(error.message)}</div>`;
    }
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = String(value || '');
    return node.innerHTML;
  }

  function renderSubtitleList(subtitles, info) {
    if (!subtitles.length) {
      listElement.innerHTML =
        '<div class="bili-heytea-message">该视频暂无可下载字幕</div>';
      return;
    }

    listElement.innerHTML = subtitles
      .map((subtitle, index) => {
        const language = escapeHtml(subtitle.lan_doc || subtitle.lan);
        const isAI = String(subtitle.lan || '').startsWith('ai-');
        return `
          <div class="bili-heytea-item">
            <span class="bili-heytea-lang">
              <span class="bili-heytea-dot"></span>${language}
            </span>
            <span class="bili-heytea-type">${isAI ? 'AI生成' : '人工上传'}</span>
            <button class="bili-heytea-download-single" data-index="${index}">下载</button>
          </div>
        `;
      })
      .join('');

    currentVideoInfo = info;
  }

  function syncPage() {
    const hrefChanged = window.location.href !== lastHref;
    if (hrefChanged) {
      lastHref = window.location.href;
      cachedSubtitles = null;
      cachedVideoId = null;
      subtitleData = [];
      currentVideoInfo = null;
    }
    if (!isSupportedPage()) {
      if (button) button.style.display = 'none';
      if (panel) panel.style.display = 'none';
      return;
    }
    createUI();
    button.style.display = 'flex';
  }

  syncPage();
  window.addEventListener('popstate', syncPage);
  new MutationObserver(syncPage).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
