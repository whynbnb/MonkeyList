// ==UserScript==
// @name         GitHub Release Asset Navigator
// @namespace    https://github.com/
// @version      0.7.1
// @description  Highlight platform, architecture, and package type in GitHub release assets, emphasizing the recommended build (Android arm64-v8a, macOS arm64, Windows/Linux x64), ranking package formats with per-platform colors (Linux: AppImage > deb > rpm; Windows: portable > zip > setup), labelling each platform group once, and offering an eye toggle in the Assets header to temporarily disable the styling while de-emphasizing metadata and source archives.
// @match        https://github.com/*/*/releases*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'gh-release-asset-navigator-style';
  const PROCESSED = 'data-gh-ran-processed';
  const ASSETS_ID = 'gh-ran-assets';
  const TOGGLE_ID = 'gh-ran-toggle';
  const TOGGLE_STYLE_ID = 'gh-ran-toggle-style';
  const ENABLED_KEY = 'gh-ran-enabled';
  const checksumOrigins = new WeakMap();
  let enabled = true;
  try {
    enabled = localStorage.getItem(ENABLED_KEY) !== 'false';
  } catch (error) {
    enabled = true;
  }
  const SOURCE_CODE_TEXT = /^source code \((?:zip|tar\.gz)\)$/i;
  const SOURCE_CODE_URL = /\/archive\/refs\/(?:tags|heads)\/[^?#]+\.(?:zip|tar\.gz)(?:[?#]|$)/i;
  const ATTESTATION_TEXT = /^release attestation \(json\)$/i;
  const METADATA_FILE = /(?:\.blockmap|\.(?:asc|sig|gpg|json|yml|yaml|txt))$/i;
  const CHECKSUM_SUFFIX = /\.(?:sha(?:1|224|256|384|512)?(?:sum)?|md5)$/i;
  // Checksum manifests such as SHA256SUMS, SHA512SUMS.txt, checksums.txt or
  // MD5SUMS. Anchored so normal release assets are not pulled in.
  const CHECKSUM_FILE = /^(?:sha(?:1|224|256|384|512)?(?:sums?|checksums?)|md5sums?|checksums?)(?:\.(?:txt|asc|sig|gpg|sha(?:1|224|256|384|512)?|md5))*$/i;
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
    iOS: 'ARM64',
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

  // Preferred package format per platform: lower is better.
  // Linux: AppImage > deb > rpm. Windows: portable > zip > setup.
  const PACKAGE_TIER = {
    Linux: { AppImage: 1, DEB: 2, RPM: 3 },
    Windows: { ZIP: 2 },
  };

  function getPackageInfo(name, system) {
    const type = firstMatch(name, PACKAGE_TYPE);
    if (system === 'Windows') {
      if (/(?:^|[-_.])portable(?:$|[-_.])/i.test(name)) return { label: 'Portable', tier: 1 };
      if (/(?:^|[-_.])(?:setup|installer)(?:$|[-_.])/i.test(name)) return { label: 'Setup', tier: 3 };
    }
    return { label: type, tier: PACKAGE_TIER[system]?.[type] || 0 };
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
    return (CHECKSUM_SUFFIX.test(name) || CHECKSUM_FILE.test(name))
      && (getFileSize(row) ?? 0) <= SMALL_METADATA_SIZE;
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
      if (checksum) {
        const target = name.replace(CHECKSUM_SUFFIX, '');
        // Manifest files (SHA256SUMS, checksums.txt, ...) cover every asset and
        // have no single target to group with.
        if (target !== name) row.dataset.ghRanChecksum = target;
      }
      return;
    }

    const platform = findPlatform(name);
    const architecture = firstMatch(name, ARCHITECTURE);
    const packageInfo = getPackageInfo(name, platform?.[1]);
    const badges = document.createElement('span');
    badges.className = 'gh-ran-badges gh-ran-badges--trail';

    if (platform) {
      const [device, system] = platform;
      row.classList.add(`gh-ran-${device}`);
      row.classList.add(`gh-ran-system-${system.toLowerCase()}`);
      row.dataset.ghRanSystem = system;
    }
    const preferred = !!(platform && architecture && PREFERRED_ARCH[platform[1]] === architecture);
    if (architecture) {
      const badge = createBadge(preferred ? `★ ${architecture}` : architecture, 'architecture');
      if (preferred) {
        badge.classList.add('gh-ran-badge--preferred');
        badge.title = `Recommended ${platform[1]} build`;
      }
      badges.append(badge);
      row.dataset.ghRanArch = architecture;
    }
    if (packageInfo.label) {
      const badge = createBadge(packageInfo.label, 'package');
      badge.classList.add('gh-ran-package-badge');
      badge.dataset.ghRanPkgLabel = packageInfo.label;
      if (packageInfo.tier) badge.dataset.ghRanPkgTier = String(packageInfo.tier);
      badges.append(badge);
    }
    if (badges.childElementCount) link.insertAdjacentElement('beforebegin', badges);
    if (platform || badges.childElementCount) row.classList.add('gh-ran-asset');
  }

  function rankPackages() {
    const groups = new Map();
    document.querySelectorAll('.gh-ran-package-badge').forEach((badge) => {
      const tier = Number(badge.dataset.ghRanPkgTier) || 0;
      const row = badge.closest('.gh-ran-asset');
      if (!tier || !row) return;
      const key = `${row.dataset.ghRanSystem || ''}|${row.dataset.ghRanArch || ''}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ badge, row, tier });
    });

    groups.forEach((entries) => {
      // Rank only the formats actually present for this platform + architecture,
      // so a lone rpm is not labelled "#3" just because better formats exist in
      // theory.
      const tiers = [...new Set(entries.map((entry) => entry.tier))].sort((a, b) => a - b);
      const ranked = tiers.length > 1;
      entries.forEach(({ badge, row, tier }) => {
        const label = badge.dataset.ghRanPkgLabel || badge.textContent;
        badge.classList.remove(
          'gh-ran-badge--package-tier-1',
          'gh-ran-badge--package-tier-2',
          'gh-ran-badge--package-tier-3'
        );
        row.classList.remove('gh-ran-pkg-rank-1', 'gh-ran-pkg-rank-2', 'gh-ran-pkg-rank-3');
        if (!ranked) {
          if (badge.textContent !== label) badge.textContent = label;
          badge.removeAttribute('title');
          return;
        }
        const rank = tiers.indexOf(tier) + 1;
        const text = `#${rank} ${label}`;
        if (badge.textContent !== text) badge.textContent = text;
        // Only the best format in each group is highlighted; the rest keep the
        // neutral platform colour.
        if (rank === 1) {
          badge.classList.add('gh-ran-badge--package-tier-1');
          row.classList.add('gh-ran-pkg-rank-1');
        }
        const system = row.dataset.ghRanSystem || 'this platform';
        const hint = rank === 1 ? 'Best' : rank === 2 ? 'Alternative' : 'Least preferred';
        badge.title = `${hint} package format for ${system}`;
      });
    });
  }

  function markBestItems() {
    const groups = new Map();
    document.querySelectorAll('.gh-ran-asset').forEach((row) => {
      const system = row.dataset.ghRanSystem || '';
      const arch = row.dataset.ghRanArch || '';
      if (!system || !arch) return;
      const key = `${system}|${arch}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });

    groups.forEach((rows) => {
      // A ranked group already highlights its #1 package. When a group has only
      // one format (Android APK, macOS DMG, ...), highlight the preferred
      // architecture instead so the best download is still obvious.
      const ranked = rows.some((row) => row.classList.contains('gh-ran-pkg-rank-1'));
      const system = rows[0].dataset.ghRanSystem || '';
      const preferredArch = PREFERRED_ARCH[system];
      rows.forEach((row) => {
        const best = !ranked && !!preferredArch && row.dataset.ghRanArch === preferredArch;
        row.classList.toggle('gh-ran-best', best);
      });
    });
  }

  function markPlatformGroups() {
    const desired = new Map();
    let previous = '';
    document.querySelectorAll('.gh-ran-asset').forEach((row) => {
      const system = row.dataset.ghRanSystem || '';
      if (!system) return;
      if (system !== previous) {
        desired.set(row, {
          system,
          device: row.classList.contains('gh-ran-mobile') ? 'mobile' : 'desktop',
        });
      }
      previous = system;
    });

    // Drop headers that are no longer right before their group's first row.
    document.querySelectorAll('.gh-ran-group-header').forEach((header) => {
      const next = header.nextElementSibling;
      const info = next && desired.get(next);
      if (
        !info ||
        header.dataset.ghRanHeaderFor !== info.system ||
        header.dataset.ghRanHeaderDevice !== info.device
      ) {
        header.remove();
      }
    });

    // One header per platform group, written only once.
    let index = 0;
    desired.forEach((info, row) => {
      let header = row.previousElementSibling;
      if (
        !header ||
        !header.classList.contains('gh-ran-group-header') ||
        header.dataset.ghRanHeaderFor !== info.system ||
        header.dataset.ghRanHeaderDevice !== info.device
      ) {
        header = document.createElement(row.tagName === 'LI' ? 'li' : 'div');
        header.className = 'gh-ran-group-header';
        header.dataset.ghRanHeaderFor = info.system;
        header.dataset.ghRanHeaderDevice = info.device;
        const badges = document.createElement('span');
        badges.className = 'gh-ran-badges gh-ran-badges--lead';
        badges.append(createBadge(info.system, `platform-${info.system.toLowerCase()}`));
        badges.append(createBadge(info.device === 'mobile' ? 'MOBILE' : 'DESKTOP', `device-${info.device}`));
        header.append(badges);
        row.parentElement?.insertBefore(header, row);
      }
      const separated = index > 0;
      if (header.classList.contains('gh-ran-group-header--sep') !== separated) {
        header.classList.toggle('gh-ran-group-header--sep', separated);
      }
      index++;
    });
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

      if (!checksumOrigins.has(checksumRow)) {
        checksumOrigins.set(checksumRow, {
          parent: checksumRow.parentElement,
          next: checksumRow.nextElementSibling,
        });
      }
      assetRow.insertAdjacentElement('afterend', checksumRow);
      checksumRow.dataset.ghRanGrouped = 'true';
    });
  }

  function restoreChecksums() {
    document.querySelectorAll('[data-gh-ran-checksum]').forEach((checksumRow) => {
      if (checksumRow.dataset.ghRanGrouped !== 'true') return;
      delete checksumRow.dataset.ghRanGrouped;
      const origin = checksumOrigins.get(checksumRow);
      if (!origin || !origin.parent || !origin.parent.isConnected) return;
      if (origin.next && origin.next.parentElement === origin.parent) {
        origin.parent.insertBefore(checksumRow, origin.next);
      } else {
        origin.parent.append(checksumRow);
      }
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

  function findAssetsSummary() {
    return [...document.querySelectorAll('details > summary')]
      .find((summary) => summary.textContent.replace(/\s+/g, ' ').trim().startsWith('Assets'));
  }

  function applyEnabled() {
    const mainStyle = document.getElementById(STYLE_ID);
    if (mainStyle) mainStyle.disabled = !enabled;
    document.documentElement.classList.toggle('gh-ran-off', !enabled);
    const button = document.getElementById(TOGGLE_ID);
    if (button) {
      button.classList.toggle('is-off', !enabled);
      button.setAttribute('aria-pressed', String(enabled));
      button.title = enabled ? 'Hide asset styling' : 'Show asset styling';
      button.setAttribute('aria-label', button.title);
    }
  }

  function addToggle() {
    const summary = findAssetsSummary();
    if (summary) {
      let button = document.getElementById(TOGGLE_ID);
      if (!button) {
        button = document.createElement('button');
        button.id = TOGGLE_ID;
        button.type = 'button';
        button.className = 'gh-ran-toggle';
        button.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.831.88 9.577.43 8.899a1.62 1.62 0 0 1 0-1.798c.45-.678 1.367-1.932 2.637-3.023C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"/></svg>';
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          enabled = !enabled;
          try {
            localStorage.setItem(ENABLED_KEY, String(enabled));
          } catch (error) {
            // Ignore storage failures (private mode, etc.).
          }
          applyEnabled();
          if (enabled) scheduleProcessing();
          else restoreChecksums();
        });
        summary.append(button);
      }
    }
    applyEnabled();
  }

  function addToggleStyles() {
    if (document.getElementById(TOGGLE_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = TOGGLE_STYLE_ID;
    style.textContent = `
      .gh-ran-toggle {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        margin-left: 8px;
        padding: 0;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        color: var(--fgColor-muted, #57606a);
        background: var(--bgColor-default, #ffffff);
        cursor: pointer;
        vertical-align: middle;
        line-height: 1;
      }
      .gh-ran-toggle:hover {
        color: var(--fgColor-default, #1f2328);
        background: var(--bgColor-muted, #f6f8fa);
      }
      .gh-ran-toggle:focus-visible {
        outline: 2px solid var(--focus-outlineColor, #0969da);
        outline-offset: 2px;
      }
      .gh-ran-toggle svg { display: block; width: 16px; height: 16px; }
      .gh-ran-toggle.is-off { opacity: .6; }
      .gh-ran-toggle.is-off::after {
        content: '';
        position: absolute;
        left: 5px;
        right: 5px;
        top: 50%;
        height: 1.5px;
        border-radius: 1px;
        background: currentColor;
        transform: rotate(-45deg);
      }
      html.gh-ran-off .gh-ran-badges,
      html.gh-ran-off .gh-ran-group-header,
      html.gh-ran-off #gh-ran-assets-jump { display: none !important; }
    `;
    document.head.append(style);
  }

  function addAssetsJump() {
    if (!/^\/[^/]+\/[^/]+\/releases\/tag\//.test(location.pathname)) return;

    const assetsSummary = findAssetsSummary();
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
    addToggleStyles();
    addToggle();
    findAssetRows().forEach(processAsset);
    rankPackages();
    markBestItems();
    markPlatformGroups();
    if (enabled) groupChecksums();
    else restoreChecksums();
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
        border-left-color: var(--group-edge, transparent);
      }
      /* Each platform owns one highlight hue. */
      .gh-ran-system-android {
        --group-edge: #7ee787;
        --pkg-1-bg: #116329; --pkg-1-fg: #fff; --pkg-1-border: #0a3622; --pkg-1-edge: #116329; --pkg-1-tint: rgb(17 99 41 / .18);
      }
      .gh-ran-system-ios {
        --group-edge: #d8b4fe;
        --pkg-1-bg: #8250df; --pkg-1-fg: #fff; --pkg-1-border: #6639ba; --pkg-1-edge: #8250df; --pkg-1-tint: rgb(130 80 223 / .16);
      }
      .gh-ran-system-macos {
        --group-edge: #8c959f;
        --pkg-1-bg: #24292f; --pkg-1-fg: #fff; --pkg-1-border: #1b1f24; --pkg-1-edge: #424a53; --pkg-1-tint: rgb(66 74 83 / .16);
      }
      .gh-ran-system-windows {
        --group-edge: #54aeff;
        --pkg-1-bg: #0550ae; --pkg-1-fg: #fff; --pkg-1-border: #033d8b; --pkg-1-edge: #0550ae; --pkg-1-tint: rgb(5 80 174 / .16);
      }
      .gh-ran-system-linux {
        --group-edge: #d4a72c;
        --pkg-1-bg: #7d4e00; --pkg-1-fg: #fff; --pkg-1-border: #5c3a00; --pkg-1-edge: #9a6700; --pkg-1-tint: rgb(154 103 0 / .16);
      }
      /* Package preference: only the best item gets the platform hue. */
      .gh-ran-pkg-rank-1,
      .gh-ran-best { border-left-color: var(--pkg-1-edge, #116329); background-image: linear-gradient(90deg, var(--pkg-1-tint, rgb(17 99 41 / .18)), transparent 50%); }
      .gh-ran-group-header {
        display: flex;
        align-items: center;
        padding: 8px 14px 4px;
        list-style: none;
        border-bottom: 0;
        border-left: 4px solid var(--group-edge, transparent);
      }
      .gh-ran-group-header--sep {
        margin-top: 8px;
        border-top: 1px solid var(--borderColor-muted, #d8dee4);
      }
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
        /* Badges stay together and start right after the icon: left aligned,
           natural width, no reserved column. */
        .gh-ran-asset .gh-ran-badges--trail {
          display: inline-flex;
          flex-wrap: nowrap;
          gap: 4px;
          align-items: center;
          margin: 0 10px 0 0;
          vertical-align: middle;
        }
      }
      .gh-ran-badges {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 4px;
        margin: 0 8px;
        vertical-align: middle;
      }
      .gh-ran-badges--lead {
        margin-left: 0;
        margin-right: 10px;
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
      .gh-ran-badge--platform-ios { color: #8250df; background: #fbefff; border-color: #d8b4fe; }
      .gh-ran-badge--platform-windows { color: #0969da; background: #ddf4ff; border-color: #54aeff; }
      .gh-ran-badge--platform-macos { color: #57606a; background: #f6f8fa; border-color: #8c959f; }
      .gh-ran-badge--platform-linux { color: #9a6700; background: #fff8c5; border-color: #d4a72c; }
      .gh-ran-badge--architecture { color: #8250df; background: #fbefff; border-color: #d8b4fe; }
      .gh-ran-badge--architecture.gh-ran-badge--preferred { color: #fff; background: #1a7f37; border-color: #116329; }
      .gh-ran-badge--package { color: #57606a; background: #f6f8fa; border-color: #d8dee4; }
      .gh-ran-badge--package.gh-ran-badge--package-tier-1 { color: var(--pkg-1-fg, #fff); background: var(--pkg-1-bg, #116329); border-color: var(--pkg-1-border, #0a3622); }
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
        .gh-ran-group-header--sep { border-top-color: var(--borderColor-muted, #30363d); }
        .gh-ran-system-android {
          --group-edge: #1a7f37;
          --pkg-1-bg: #2ea043; --pkg-1-fg: #fff; --pkg-1-border: #3fb950; --pkg-1-edge: #3fb950; --pkg-1-tint: rgb(63 185 80 / .26);
        }
        .gh-ran-system-ios {
          --group-edge: #6639ba;
          --pkg-1-bg: #a371f7; --pkg-1-fg: #fff; --pkg-1-border: #8957e5; --pkg-1-edge: #a371f7; --pkg-1-tint: rgb(163 113 247 / .26);
        }
        .gh-ran-system-macos {
          --group-edge: #484f58;
          --pkg-1-bg: #6e7681; --pkg-1-fg: #fff; --pkg-1-border: #8b949e; --pkg-1-edge: #8b949e; --pkg-1-tint: rgb(139 148 158 / .24);
        }
        .gh-ran-system-windows {
          --group-edge: #0d419d;
          --pkg-1-bg: #1f6feb; --pkg-1-fg: #fff; --pkg-1-border: #388bfd; --pkg-1-edge: #58a6ff; --pkg-1-tint: rgb(56 139 253 / .26);
        }
        .gh-ran-system-linux {
          --group-edge: #6e4c00;
          --pkg-1-bg: #9e6a03; --pkg-1-fg: #fff; --pkg-1-border: #d4a72c; --pkg-1-edge: #d4a72c; --pkg-1-tint: rgb(212 167 44 / .26);
        }
        .gh-ran-badge--device-mobile { color: #fff8c5; background: #6e4c00; border-color: #9e6a03; }
        .gh-ran-badge--device-desktop { color: #f0f6fc; background: #30363d; border-color: #484f58; }
        .gh-ran-badge--platform-android { color: #7ee787; background: #173c24; border-color: #2ea043; }
        .gh-ran-badge--platform-ios { color: #d2a8ff; background: #2d1f4e; border-color: #8957e5; }
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
        .gh-ran-pkg-rank-1,
        .gh-ran-best { border-left-color: var(--pkg-1-edge, #3fb950); background-image: linear-gradient(90deg, var(--pkg-1-tint, rgb(63 185 80 / .26)), transparent 50%); }
        .gh-ran-badge--package { color: #8b949e; background: #21262d; border-color: #30363d; }
        .gh-ran-badge--package.gh-ran-badge--package-tier-1 { color: var(--pkg-1-fg, #fff); background: var(--pkg-1-bg, #2ea043); border-color: var(--pkg-1-border, #3fb950); }
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
