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
    button.innerHTML = `<svg class="icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M182.857143 192A118.857143 118.857143 0 0 0 64 310.857143v402.285714A118.857143 118.857143 0 0 0 182.857143 832h658.285714a118.857143 118.857143 0 0 0 118.857143-118.857143v-402.285714A118.857143 118.857143 0 0 0 841.142857 192H182.857143z m0-54.857143h658.285714a173.714286 173.714286 0 0 1 173.714286 173.714286v402.285714A173.714286 173.714286 0 0 1 841.142857 886.857143H182.857143A173.714286 173.714286 0 0 1 9.142857 713.142857v-402.285714A173.714286 173.714286 0 0 1 182.857143 137.142857z m274.285714 475.428572a27.428571 27.428571 0 1 1 0 54.857142h-32.914286c-87.04 0-159.085714-62.244571-159.085714-141.202285v-28.452572c0-78.957714 72.045714-141.202286 159.085714-141.202285h32.914286a27.428571 27.428571 0 1 1 0 54.857142h-32.914286c-58.368 0-104.228571 39.606857-104.228571 86.345143v28.452572c0 46.738286 45.860571 86.345143 104.228571 86.345143h32.914286z m256 0a27.428571 27.428571 0 1 1 0 54.857142h-32.914286c-87.04 0-159.085714-62.244571-159.085714-141.202285v-28.452572c0-78.957714 72.045714-141.202286 159.085714-141.202285h32.914286a27.428571 27.428571 0 1 1 0 54.857142h-32.914286c-58.368 0-104.228571 39.606857-104.228571 86.345143v28.452572c0 46.738286 45.860571 86.345143 104.228571 86.345143h32.914286z" fill="#8a8a8a"/></svg>`;
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
