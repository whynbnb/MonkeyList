// ==UserScript==
// @name         GitHub Release Asset Navigator
// @namespace    https://github.com/
// @version      0.4.0
// @description  Highlight platform, architecture, and package type in GitHub release assets, emphasizing the recommended build (Android arm64-v8a, macOS arm64, Windows/Linux x64) while de-emphasizing metadata and source archives.
// @match        https://github.com/*/*/releases*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'gh-release-asset-navigator-style';
  const PROCESSED = 'data-gh-ran-processed';
  const ASSETS_ID = 'gh-ran-assets';
  const SOURCE_CODE_TEXT = /^source code \((?:zip|tar\.gz)\)$/i;
  const SOURCE_CODE_URL = /\/archive\/refs\/(?:tags|heads)\/[^?#]+\.(?:zip|tar\.gz)(?:[?#]|$)/i;
  const ATTESTATION_TEXT = /^release attestation \(json\)$/i;
  const METADATA_FILE = /(?:\.blockmap|\.(?:asc|sig|gpg|json|yml|yaml|txt))$/i;
  const CHECKSUM_SUFFIX = /\.(?:sha(?:1|224|256|384|512)?(?:sum)?|md5)$/i;
  const SMALL_METADATA_SIZE = 2 * 1024 * 1024;
  const PLATFORM = [
    ['mobile', 'Android', /(?:^|[-_.])android(?:$|[-_.])|\.(?:apk|aab)$/i],
    ['mobile', 'iOS', /(?:^|[-_.])(?:ios|iphone|ipad)(?:$|[-_.])|\.ipa$/i],
    ['desktop', 'Windows', /(?:^|[-_.])(?:windows|win(?:32|64)?)(?:$|[-_.])|\.(?:exe|msi|msix|appx)$/i],
    ['desktop', 'macOS', /(?:^|[-_.])(?:mac(?:os)?|osx|darwin)(?:$|[-_.])|\.(?:dmg|pkg)$/i],
    ['desktop', 'Linux', /(?:^|[-_.])(?:linux|ubuntu|debian|fedora|appimage)(?:$|[-_.])|\.appimage$/i],
  ];
  const ARCHITECTURE = [
    ['ARM64', /(?:^|[-_.])(?:arm64(?:-v8a)?|aarch64|v8a|apple[-_.]?silicon)(?:$|[-_.])/i],
    ['ARM', /(?:^|[-_.])(?:armv?[5-8](?:l|hf)?|arm32|armeabi(?:-v7a)?|v7a)(?:$|[-_.])/i],
    ['x64', /(?:^|[-_.])(?:x64|x86[_-]64|amd64|win64)(?:$|[-_.])/i],
    ['x86', /(?:^|[-_.])(?:x86|i[3-6]86|ia32|win32)(?:$|[-_.])/i],
    ['Universal', /(?:^|[-_.])(?:universal|all)(?:$|[-_.])/i],
  ];
  // The mainstream 64-bit target for each platform. These assets get an extra
  // "recommended" highlight so the right download is obvious at a glance.
  const PREFERRED_ARCH = {
    Android: 'ARM64',
    macOS: 'ARM64',
    Windows: 'x64',
    Linux: 'x64',
  };
  const PACKAGE_TYPE = [
    ['APK', /\.apk$/i],
    ['AAB', /\.aab$/i],
    ['IPA', /\.ipa$/i],
    ['DMG', /\.dmg$/i],
    ['EXE', /\.exe$/i],
    ['MSI', /\.msi$/i],
    ['AppImage', /\.appimage$/i],
    ['DEB', /\.deb$/i],
    ['RPM', /\.rpm$/i],
    ['PKG', /\.pkg$/i],
    ['ZIP', /\.zip$/i],
    ['tar.gz', /\.tar\.gz$/i],
    ['tar.xz', /\.tar\.xz$/i],
    ['7Z', /\.7z$/i],
  ];

  function firstMatch(value, rules) {
    const match = rules.find(([, pattern]) => pattern.test(value));
    return match?.[0];
  }

  function findPlatform(value) {
    return PLATFORM.find(([, , pattern]) => pattern.test(value));
  }

  function createBadge(text, kind) {
    const badge = document.createElement('span');
    badge.className = `gh-ran-badge gh-ran-badge--${kind}`;
    badge.textContent = text;
    return badge;
  }

  function findAssetRows() {
    return document.querySelectorAll(
      'a[href*="/releases/download/"]'
    );
  }

  function getAssetRow(link) {
    return link.closest('li, .Box-row') || link.parentElement;
  }

  function getFileSize(row) {
    const text = [...row.querySelectorAll('span')]
      .map((span) => span.textContent.trim())
      .find((value) => /^[\d.]+\s*(?:bytes?|kb|mb|gb)$/i.test(value));
    if (!text) return null;

    const match = /([\d.]+)\s*(bytes?|kb|mb|gb)/i.exec(text);
    const units = { byte: 1, bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
    return match ? Number(match[1]) * units[match[2].toLowerCase()] : null;
  }

  function isChecksum(name, row) {
    return CHECKSUM_SUFFIX.test(name) && (getFileSize(row) ?? 0) <= SMALL_METADATA_SIZE;
  }

  function processAsset(link) {
    if (link.hasAttribute(PROCESSED)) return;

    const name = link.textContent.trim();
    if (!name) return;

    link.setAttribute(PROCESSED, '');
    const row = getAssetRow(link);
    if (!row) return;

    const checksum = isChecksum(name, row);
    if (METADATA_FILE.test(name) || checksum) {
      row.classList.add('gh-ran-muted');
      link.classList.add('gh-ran-link-muted');
      if (checksum) row.dataset.ghRanChecksum = name.replace(CHECKSUM_SUFFIX, '');
      return;
    }

    const platform = findPlatform(name);
    const architecture = firstMatch(name, ARCHITECTURE);
    const packageType = firstMatch(name, PACKAGE_TYPE);
    const badges = document.createElement('span');
    badges.className = 'gh-ran-badges';

    if (platform) {
      const [device, system] = platform;
      badges.append(createBadge(device === 'mobile' ? 'MOBILE' : 'DESKTOP', `device-${device}`));
      badges.append(createBadge(system, `platform-${system.toLowerCase()}`));
      row.classList.add(`gh-ran-${device}`);
    }
    const preferred = !!(platform && architecture && PREFERRED_ARCH[platform[1]] === architecture);
    if (architecture) {
      const badge = createBadge(preferred ? `★ ${architecture}` : architecture, 'architecture');
      if (preferred) {
        badge.classList.add('gh-ran-badge--preferred');
        badge.title = `Recommended ${platform[1]} build`;
      }
      badges.append(badge);
    }
    if (packageType) badges.append(createBadge(packageType, 'package'));
    if (preferred) row.classList.add('gh-ran-preferred');

    if (badges.childElementCount) {
      link.insertAdjacentElement('afterend', badges);
      row.classList.add('gh-ran-asset');
    }
  }

  function processSourceCode() {
    document.querySelectorAll('a').forEach((link) => {
      const text = link.textContent.replace(/\s+/g, ' ').trim();
      const href = link.getAttribute('href') || '';
      if (link.hasAttribute(PROCESSED) || (!SOURCE_CODE_TEXT.test(text) && !SOURCE_CODE_URL.test(href))) return;
      link.setAttribute(PROCESSED, '');
      const row = link.closest('li, .Box-row') || link.parentElement;
      row?.classList.add('gh-ran-muted');
      link.classList.add('gh-ran-link-muted');
    });
  }

  function processAttestations() {
    document.querySelectorAll('a').forEach((link) => {
      if (link.hasAttribute(PROCESSED) || !ATTESTATION_TEXT.test(link.textContent.replace(/\s+/g, ' ').trim())) return;
      link.setAttribute(PROCESSED, '');
      const row = link.closest('li, .Box-row') || link.parentElement;
      row?.classList.add('gh-ran-muted');
      link.classList.add('gh-ran-link-muted');
    });
  }

  function groupChecksums() {
    document.querySelectorAll('[data-gh-ran-checksum]').forEach((checksumRow) => {
      const targetName = checksumRow.dataset.ghRanChecksum;
      if (!targetName || checksumRow.dataset.ghRanGrouped === 'true') return;

      const assets = [...findAssetRows()].filter((link) => {
        const row = getAssetRow(link);
        return row !== checksumRow && !row?.hasAttribute('data-gh-ran-checksum');
      });
      const assetLink = assets.find((link) => link.textContent.trim() === targetName)
        || assets.find((link) => link.textContent.trim().startsWith(`${targetName}.`));
      const assetRow = assetLink && getAssetRow(assetLink);
      if (!assetRow || assetRow === checksumRow) return;

      assetRow.insertAdjacentElement('afterend', checksumRow);
      checksumRow.dataset.ghRanGrouped = 'true';
    });
  }

  function visualizeAssetDetails() {
    document.querySelectorAll('li.Box-row').forEach((row) => {
      if (row.hasAttribute('data-gh-ran-details')) return;

      const copyButton = row.querySelector('clipboard-copy[value^="sha256:"]');
      if (!copyButton) return;

      const digest = copyButton.getAttribute('value');
      const digestBlock = copyButton.closest('div');
      const details = digestBlock?.parentElement;
      if (!digest || !digestBlock || !details) return;

      row.setAttribute('data-gh-ran-details', '');
      digestBlock.classList.add('gh-ran-digest');
      digestBlock.dataset.digest = digest;
      copyButton.setAttribute('title', `Copy ${digest}`);

      const info = [...details.children].filter((child) => child.tagName === 'SPAN');
      const [size, time] = info;
      if (size) {
        size.classList.add('gh-ran-file-size');
        size.dataset.sizeTier = getSizeTier(size.textContent.trim());
      }
      if (time) {
        time.classList.add('gh-ran-file-time');
        const relativeTime = time.querySelector('relative-time');
        const timestamp = relativeTime?.getAttribute('datetime');
        if (timestamp) time.title = new Date(timestamp).toLocaleString();
      }
    });
  }

  function getSizeTier(value) {
    const match = /([\d.]+)\s*(bytes?|kb|mb|gb)/i.exec(value);
    if (!match) return 'unknown';

    const units = { byte: 1, bytes: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
    const bytes = Number(match[1]) * units[match[2].toLowerCase()];
    if (bytes < 10 * 1024 ** 2) return 'small';
    if (bytes < 100 * 1024 ** 2) return 'medium';
    return 'large';
  }

  function addAssetsJump() {
    if (!/^\/[^/]+\/[^/]+\/releases\/tag\//.test(location.pathname)) return;

    const assetsSummary = [...document.querySelectorAll('details > summary')]
      .find((summary) => summary.textContent.replace(/\s+/g, ' ').trim().startsWith('Assets'));
    const assetsSection = assetsSummary?.closest('details-toggle, .tmp-mb-3');
    const breadcrumb = document.querySelector('nav[aria-label="Breadcrumb"]');
    if (!assetsSection || !breadcrumb || document.getElementById('gh-ran-assets-jump')) return;

    assetsSection.id = ASSETS_ID;
    const jump = document.createElement('a');
    jump.id = 'gh-ran-assets-jump';
    jump.className = 'gh-ran-assets-jump';
    jump.href = `#${ASSETS_ID}`;
    jump.textContent = 'Jump to Assets';
    jump.setAttribute('aria-label', 'Jump to release assets');
    breadcrumb.classList.add('gh-ran-breadcrumb');
    breadcrumb.append(jump);
  }

  let processingScheduled = false;
  let retryTimer;

  function processPage() {
    addStyles();
    findAssetRows().forEach(processAsset);
    groupChecksums();
    processSourceCode();
    processAttestations();
    visualizeAssetDetails();
    addAssetsJump();
  }

  function scheduleProcessing() {
    if (processingScheduled) return;
    processingScheduled = true;
    requestAnimationFrame(() => {
      processingScheduled = false;
      processPage();
    });
  }

  function processWithRetries() {
    clearTimeout(retryTimer);
    scheduleProcessing();

    // GitHub may replace lazy include-fragments after the navigation event.
    const delays = [150, 500, 1500, 3500];
    let index = 0;
    const retry = () => {
      scheduleProcessing();
      if (index < delays.length) retryTimer = setTimeout(retry, delays[index++]);
    };
    retryTimer = setTimeout(retry, delays[index++]);
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .gh-ran-asset {
        position: relative;
        border-left: 4px solid transparent;
      }
      .gh-ran-preferred {
        background-image: linear-gradient(90deg, rgb(26 127 55 / .07), rgb(26 127 55 / 0) 45%);
      }
      .gh-ran-mobile { border-left-color: #bf8700; }
      .gh-ran-desktop { border-left-color: #0969da; }
      @media (min-width: 768px) {
        .gh-ran-asset > div:first-child {
          flex: 1 1 auto !important;
          width: auto !important;
          max-width: none !important;
        }
        .gh-ran-asset > div:nth-child(2) {
          flex: 0 0 auto !important;
          width: auto !important;
          max-width: none !important;
          margin-left: auto !important;
        }
      }
      .gh-ran-badges {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 0 8px;
        vertical-align: middle;
      }
      .gh-ran-badge {
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 0 7px;
        border: 1px solid;
        border-radius: 999px;
        font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .02em;
        white-space: nowrap;
      }
      .gh-ran-badge--device-mobile { color: #fff; background: #9a6700; border-color: #825000; }
      .gh-ran-badge--device-desktop { color: #fff; background: #24292f; border-color: #1b1f24; }
      .gh-ran-badge--platform-android { color: #1a7f37; background: #dafbe1; border-color: #4ac26b; }
      .gh-ran-badge--platform-ios { color: #57606a; background: #f6f8fa; border-color: #afb8c1; }
      .gh-ran-badge--platform-windows { color: #0969da; background: #ddf4ff; border-color: #54aeff; }
      .gh-ran-badge--platform-macos { color: #57606a; background: #f6f8fa; border-color: #8c959f; }
      .gh-ran-badge--platform-linux { color: #9a6700; background: #fff8c5; border-color: #d4a72c; }
      .gh-ran-badge--architecture { color: #8250df; background: #fbefff; border-color: #d8b4fe; }
      .gh-ran-badge--architecture.gh-ran-badge--preferred { color: #fff; background: #1a7f37; border-color: #116329; }
      .gh-ran-badge--package { color: #1a7f37; background: #dafbe1; border-color: #7ee787; }
      .gh-ran-digest {
        position: relative;
        flex: 0 0 auto !important;
        overflow: visible !important;
        margin-right: 2px;
      }
      .gh-ran-digest > .Truncate { display: none !important; }
      .gh-ran-digest::before {
        content: 'SHA-256';
        display: inline-flex;
        align-items: center;
        min-height: 20px;
        padding: 0 6px;
        border: 1px solid var(--borderColor-muted, #d8dee4);
        border-radius: 4px;
        color: var(--fgColor-muted, #57606a);
        background: var(--bgColor-muted, #f6f8fa);
        font: 600 10px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .02em;
      }
      .gh-ran-digest::after {
        content: attr(data-digest);
        position: absolute;
        z-index: 20;
        right: 0;
        bottom: calc(100% + 7px);
        width: max-content;
        max-width: min(460px, 78vw);
        padding: 7px 9px;
        border-radius: 6px;
        color: #fff;
        background: #24292f;
        box-shadow: 0 4px 12px rgb(27 31 36 / .25);
        font: 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        overflow-wrap: anywhere;
        opacity: 0;
        pointer-events: none;
        transform: translateY(3px);
        transition: opacity .15s ease, transform .15s ease;
      }
      .gh-ran-digest:hover::after,
      .gh-ran-digest:focus-within::after { opacity: 1; transform: translateY(0); }
      .gh-ran-file-size,
      .gh-ran-file-time {
        display: inline-flex !important;
        align-items: center;
        min-height: 28px;
        min-width: auto !important;
        margin-left: 8px !important;
        padding: 0 8px;
        border: 1px solid var(--borderColor-muted, #d8dee4);
        border-radius: 5px;
        font-size: 11px;
        font-weight: 600;
        line-height: 20px;
      }
      .gh-ran-file-size {
        min-width: 76px !important;
        justify-content: center;
        color: #1a7f37;
        background: #dafbe1;
        border-color: #7ee787;
      }
      .gh-ran-file-size[data-size-tier="medium"] { color: #9a6700; background: #fff8c5; border-color: #d4a72c; }
      .gh-ran-file-size[data-size-tier="large"] { color: #cf222e; background: #ffebe9; border-color: #ff8182; }
      .gh-ran-file-size[data-size-tier="unknown"] { color: #57606a; background: #f6f8fa; border-color: #d8dee4; }
      .gh-ran-file-time {
        color: #57606a;
        background: #f6f8fa;
      }
      .gh-ran-file-time::before {
        display: inline-block;
        width: 8px;
        height: 8px;
        margin-right: 6px;
        border: 2px solid #8250df;
        border-radius: 50%;
        box-sizing: border-box;
        content: '';
        box-shadow: inset 2px -1px 0 -1px #8250df;
      }
      .gh-ran-file-time::before {
        flex-shrink: 0;
      }
      .gh-ran-muted {
        opacity: .42;
        filter: grayscale(1);
        transition: opacity .15s ease, filter .15s ease;
      }
      .gh-ran-muted:hover,
      .gh-ran-muted:focus-within { opacity: .82; filter: none; }
      .gh-ran-link-muted { font-size: .9em; }
      #${ASSETS_ID} { scroll-margin-top: 76px; }
      .gh-ran-breadcrumb {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 12px;
      }
      .gh-ran-breadcrumb ol { margin-bottom: 0; }
      .gh-ran-assets-jump {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 0 15px;
        border: 1px solid #0550ae;
        border-radius: 7px;
        box-shadow: 0 2px 5px rgb(9 105 218 / .28);
        color: #fff;
        background: #0969da;
        font-size: 14px;
        font-weight: 700;
        line-height: 24px;
        text-decoration: none;
      }
      .gh-ran-assets-jump:hover {
        background: #0550ae;
        box-shadow: 0 3px 8px rgb(9 105 218 / .38);
        text-decoration: none;
      }
      .gh-ran-assets-jump:focus-visible { outline: 2px solid #54aeff; outline-offset: 2px; }
      @media (prefers-color-scheme: dark) {
        .gh-ran-mobile { border-left-color: #d4a72c; }
        .gh-ran-desktop { border-left-color: #58a6ff; }
        .gh-ran-badge--device-mobile { color: #fff8c5; background: #6e4c00; border-color: #9e6a03; }
        .gh-ran-badge--device-desktop { color: #f0f6fc; background: #30363d; border-color: #484f58; }
        .gh-ran-badge--platform-android { color: #7ee787; background: #173c24; border-color: #2ea043; }
        .gh-ran-badge--platform-ios { color: #c9d1d9; background: #21262d; border-color: #6e7681; }
        .gh-ran-badge--platform-windows { color: #79c0ff; background: #0d2847; border-color: #1f6feb; }
        .gh-ran-badge--platform-macos { color: #c9d1d9; background: #21262d; border-color: #6e7681; }
        .gh-ran-badge--platform-linux { color: #e3b341; background: #3d2e00; border-color: #9e6a03; }
        .gh-ran-digest::before { color: #8b949e; background: #21262d; border-color: #30363d; }
        .gh-ran-file-size { color: #7ee787; background: #173c24; border-color: #2ea043; }
        .gh-ran-file-size[data-size-tier="medium"] { color: #e3b341; background: #3d2e00; border-color: #9e6a03; }
        .gh-ran-file-size[data-size-tier="large"] { color: #ff7b72; background: #490202; border-color: #da3633; }
        .gh-ran-file-size[data-size-tier="unknown"] { color: #8b949e; background: #21262d; border-color: #30363d; }
        .gh-ran-file-time { color: #8b949e; background: #21262d; border-color: #30363d; }
        .gh-ran-file-time::before { border-color: #a371f7; box-shadow: inset 2px -1px 0 -1px #a371f7; }
        .gh-ran-badge--architecture { color: #d2a8ff; background: #2d1f4e; border-color: #8957e5; }
        .gh-ran-badge--architecture.gh-ran-badge--preferred { color: #fff; background: #238636; border-color: #2ea043; }
        .gh-ran-preferred { background-image: linear-gradient(90deg, rgb(46 160 67 / .16), rgb(46 160 67 / 0) 45%); }
        .gh-ran-badge--package { color: #7ee787; background: #173c24; border-color: #2ea043; }
      }
    `;
    document.head.append(style);
  }

  addStyles();
  processWithRetries();

  new MutationObserver(scheduleProcessing).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener('turbo:load', processWithRetries);
  document.addEventListener('turbo:render', processWithRetries);
  document.addEventListener('turbo:frame-load', processWithRetries);
  document.addEventListener('pjax:end', processWithRetries);
  document.addEventListener('include-fragment-replace', processWithRetries);
  document.addEventListener('include-fragment-load', processWithRetries);
  document.addEventListener('toggle', processWithRetries, true);
})();
