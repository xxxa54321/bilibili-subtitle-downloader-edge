const API_BASE = 'https://api.bilibili.com';
// Public encoding tables used by the subtitle URL format. These are not
// account credentials, API tokens, Cookie values, or user secrets.
const SUBTITLE_URL_DECODE_KEYS = [
  [
    'nP](wOFRvU.+<fjS{jn-!$D|Dz&",zT`',
    '=CFxYRn{.y|uVyO$uh&sikph?N.ilF/`',
  ],
  [
    'Bn"q~|albg@]Go~ACgyDvKnd+)_D}^&J?',
    "Cu~L!xs~f^&r@'vh=q]q{eeng*sEg^kp#J",
  ],
];

function requestHeaders(referer) {
  return {
    Accept: 'application/json, application/x-protobuf, */*',
    Referer: referer,
  };
}

async function fetchBuffer(url, referer) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: requestHeaders(referer),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { response, bytes };
}

async function fetchJson(url, referer, timeout = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      credentials: 'include',
      cache: 'no-store',
      headers: requestHeaders(referer),
      signal: controller.signal,
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`接口返回了无效内容（HTTP ${response.status}）`);
    }
    if (!response.ok || json.code !== 0) {
      throw new Error(json.message || `请求失败（HTTP ${response.status}）`);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSubtitlePayload(url) {
  const response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json, */*',
      Referer: 'https://www.bilibili.com/',
    },
  });
  if (!response.ok) {
    throw new Error(`字幕下载失败（HTTP ${response.status}）`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error('字幕文件不是有效 JSON');
  }
}

function decodeFields(input) {
  const fields = [];
  let offset = 0;

  function readVarint() {
    let value = 0;
    let shift = 0;
    while (offset < input.length) {
      const byte = input[offset++];
      value += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return value;
      shift += 7;
    }
    throw new Error('字幕轨道数据不完整');
  }

  while (offset < input.length) {
    const key = readVarint();
    const fieldNumber = Math.floor(key / 8);
    const wireType = key & 7;
    if (wireType === 0) {
      fields.push({ fieldNumber, wireType, value: readVarint() });
    } else if (wireType === 2) {
      const length = readVarint();
      const bytes = input.subarray(offset, offset + length);
      if (bytes.length !== length) throw new Error('字幕轨道数据被截断');
      offset += length;
      fields.push({ fieldNumber, wireType, bytes });
    } else if (wireType === 5) {
      fields.push({
        fieldNumber,
        wireType,
        bytes: input.subarray(offset, offset + 4),
      });
      offset += 4;
    } else if (wireType === 1) {
      fields.push({
        fieldNumber,
        wireType,
        bytes: input.subarray(offset, offset + 8),
      });
      offset += 8;
    } else {
      throw new Error(`不支持的字幕数据格式：${wireType}`);
    }
  }
  return fields;
}

function parseSubtitleTracks(bytes) {
  if (bytes.length <= 2) return [];
  const root = decodeFields(bytes);
  const data = root.find((field) => field.fieldNumber === 1)?.bytes;
  if (!data) return [];
  return decodeFields(data)
    .filter((field) => field.fieldNumber === 3 && field.bytes)
    .map((field) => {
      const item = decodeFields(field.bytes);
      const text = (number) => {
        const value = item.find(
          (part) => part.fieldNumber === number && part.bytes,
        )?.bytes;
        return value ? new TextDecoder().decode(value) : '';
      };
      return {
        language: text(3),
        label: text(4) || text(3),
        encryptedUrl: text(5),
      };
    })
    .filter((track) => track.language && track.encryptedUrl);
}

function xorWithKey(value, key) {
  let output = '';
  for (let index = 0; index < value.length; index++) {
    output += String.fromCharCode(
      value.charCodeAt(index) ^ key.charCodeAt(index % key.length),
    );
  }
  return output;
}

function decodeSubtitleUrl(rawUrl) {
  if (!rawUrl) return '';
  const match = rawUrl.match(/\/\/subtitle\.bilibili\.com\/([^?]+)/);
  if (!match) {
    if (rawUrl.startsWith('//')) return `https:${rawUrl}`;
    return rawUrl;
  }

  const encrypted = decodeURIComponent(match[1]);
  const queryIndex = rawUrl.indexOf('?');
  const query = queryIndex >= 0 ? rawUrl.slice(queryIndex) : '';
  for (const [prefix, key] of SUBTITLE_URL_DECODE_KEYS) {
    const decoded = xorWithKey(encrypted, `${key}bilibili`);
    if (decoded.startsWith(prefix)) {
      return `https://aisubtitle.hdslb.com${decoded.slice(prefix.length)}${query}`;
    }
  }
  return '';
}

async function getVideoInfo(bvid, page = 1) {
  const referer = `https://www.bilibili.com/video/${bvid}/`;
  const json = await fetchJson(
    `${API_BASE}/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    referer,
  );
  const data = json.data || {};
  const pages = Array.isArray(data.pages) ? data.pages : [];
  const requestedPage = Math.max(1, Number(page) || 1);
  const selected =
    pages.find((item) => Number(item.page) === requestedPage) ||
    pages[requestedPage - 1] ||
    null;
  const aid = Number(data.aid);
  const cid = Number(selected?.cid || data.cid);
  if (!aid || !cid) throw new Error('视频信息中缺少 aid 或 cid');
  return {
    aid,
    bvid: data.bvid || bvid,
    cid,
    page: Number(selected?.page || requestedPage),
    pages: pages.length || 1,
    duration: Number(selected?.duration || data.duration || 0),
    pubdate: Number(data.pubdate || 0),
    title: String(data.title || bvid),
    owner: String(data.owner?.name || ''),
  };
}

async function fetchSubtitleTracks(aid, cid, bvid, retries = 12) {
  const referer = `https://www.bilibili.com/video/${bvid}/`;
  const context = encodeURIComponent(JSON.stringify({ video_type: 1 }));
  const endpoint =
    `${API_BASE}/x/v2/subtitle/web/view?oid=${cid}` +
    `&pid=${aid}&context_ext=${context}&type=1` +
    '&cur_production_type=0&preferred_language=ai-zh&playlist_switch=0';
  const expectedIdentity = `${aid}${cid}`;
  const merged = new Map();
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const { response, bytes } = await fetchBuffer(endpoint, referer);
      if (!response.ok) throw new Error(`字幕请求失败（HTTP ${response.status}）`);
      const tracks = parseSubtitleTracks(bytes)
        .map((track) => {
          const url = decodeSubtitleUrl(track.encryptedUrl);
          return {
            lan: track.language,
            lan_doc: track.label,
            subtitle_url: url,
            type: track.language.startsWith('ai-') ? 1 : 0,
          };
        })
        .filter((track) => {
          if (!track.subtitle_url) return false;
          if (!track.lan.startsWith('ai-')) return true;
          try {
            return new URL(track.subtitle_url).pathname.includes(expectedIdentity);
          } catch {
            return false;
          }
        });

      for (const track of tracks) merged.set(track.lan, track);
      // The subtitle endpoint occasionally returns only the uploaded track
      // first, then exposes the complete AI/translation set on the next call.
      if (tracks.some((track) => track.lan.startsWith('ai-'))) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  if (merged.size > 0) return [...merged.values()];
  if (lastError) throw lastError;
  return [];
}

function sanitizeFileName(value, maxLength = 120) {
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function formatPublishedDate(timestamp, compact = false) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return compact ? 'unknown-date' : '未知';
  }
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(seconds * 1000));
  const value = (type) => parts.find((part) => part.type === type)?.value || '';
  return compact
    ? `${value('year')}-${value('month')}-${value('day')}`
    : `${value('year')}年${value('month')}月${value('day')}日`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}小时${minutes}分${remainder}秒`;
  return `${minutes}分${remainder}秒`;
}

function singleLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function buildTxtContent(payload, metadata) {
  const body = payload.body || [];
  const title = singleLine(metadata.title) || metadata.bvid || '未命名视频';
  const owner = singleLine(metadata.owner) || '未知';
  const page = Math.max(1, Number(metadata.page) || 1);
  const pages = Math.max(page, Number(metadata.pages) || 1);
  const videoUrl =
    `https://www.bilibili.com/video/${metadata.bvid}/` +
    (pages > 1 ? `?p=${page}` : '');
  const transcript = body
    .map((row) => String(row.content || '').trim())
    .filter(Boolean)
    .join('\n');

  return [
    `视频标题：${title}`,
    `UP主：${owner}`,
    `BVID：${metadata.bvid || ''}`,
    `视频链接：${videoUrl}`,
    `发布日期：${formatPublishedDate(metadata.pubdate)}`,
    `分P：P${page}（共${pages}P）`,
    `视频时长：${formatDuration(metadata.duration)}`,
    `字幕语言：${singleLine(metadata.language) || metadata.languageCode || '未知'}`,
    `字幕类型：${singleLine(metadata.subtitleType) || '未知'}`,
    `字幕条数：${body.length}`,
    '',
    '===== 字幕正文 =====',
    '',
    transcript,
    '',
  ].join('\n');
}

function buildTxtFileName(metadata) {
  const owner = sanitizeFileName(metadata.owner, 60);
  const title = sanitizeFileName(metadata.title, 100);
  const bvid = sanitizeFileName(metadata.bvid, 20);
  const page = Math.max(1, Number(metadata.page) || 1);
  const pages = Math.max(page, Number(metadata.pages) || 1);
  const part = pages > 1 ? `_P${page}` : '';
  const date = formatPublishedDate(metadata.pubdate, true);
  const language = sanitizeFileName(
    metadata.languageCode || metadata.language || 'subtitle',
    24,
  );
  const fixedSuffix = `_${bvid}${part}_${date}_subtitle_${language}.txt`;
  const identity = [owner, title].filter(Boolean).join('_') || bvid || 'bilibili';
  const available = Math.max(20, 180 - fixedSuffix.length);
  return `${identity.slice(0, available)}${fixedSuffix}`;
}

async function downloadSubtitle(subtitleUrl, metadata) {
  const fullUrl = subtitleUrl.startsWith('//')
    ? `https:${subtitleUrl}`
    : subtitleUrl;
  const url = new URL(fullUrl);
  if (url.hostname !== 'aisubtitle.hdslb.com') {
    throw new Error('字幕下载地址不可信');
  }
  const json = await fetchSubtitlePayload(fullUrl);
  if (!Array.isArray(json.body) || json.body.length === 0) {
    throw new Error('字幕内容为空');
  }
  return {
    content: buildTxtContent(json, metadata),
    fileName: buildTxtFileName(metadata),
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getVideoInfo') {
    getVideoInfo(request.bvid, request.page)
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }

  if (request.action === 'getSubtitles') {
    fetchSubtitleTracks(
      request.aid,
      request.cid,
      request.bvid,
      request.retries || 12,
    )
      .then((subtitles) => sendResponse({ success: true, subtitles }))
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || '获取字幕失败',
        }),
      );
    return true;
  }

  if (request.action === 'download') {
    downloadSubtitle(request.subtitleUrl, request.metadata || {})
      .then(({ content, fileName }) => {
        chrome.downloads.download(
          {
            url: `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`,
            filename: fileName,
            saveAs: false,
          },
          () => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
              });
            } else {
              sendResponse({ success: true });
            }
          },
        );
      })
      .catch((error) =>
        sendResponse({
          success: false,
          error: error?.message || '下载字幕失败',
        }),
      );
    return true;
  }
});
