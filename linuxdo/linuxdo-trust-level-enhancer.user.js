// ==UserScript==
// @name         LinuxDo Trust Level Enhancer
// @namespace    https://linux.do/
// @version      0.69.0
// @description  Strengthen trust level display on linux.do topic lists by turning the LvN portion of category badges into prominent colored chips, accenting rows by trust level, de-emphasizing promotional topics, surfacing the post creation date inside the activity column, highlighting the original poster's avatar, emphasizing the original poster (楼主) on topic pages, marking topics with no replies, and dimming topics older than a week. Customizable user-mark categories override all other row/post effects and can be imported, exported, merged, and deduplicated from a manage panel. Keyword rules can each toggle whether letter case is ignored (on by default). An advanced master switch can temporarily suspend every page effect without touching saved data.
// @match        https://linux.do/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '0.69.0';
  const STYLE_ID = 'ld-tle-style';
  const CHIP_CLASS = 'ld-tle-chip';
  const ROW_CLASS = 'ld-tle-row';
  const PROMO_CLASS = 'ld-tle-promo';
  const LOTTERY_CLASS = 'ld-tle-lottery';
  const LONELY_CLASS = 'ld-tle-lonely';
  const STALE_CLASS = 'ld-tle-stale';
  const WELFARE_BADGE_CLASS = 'ld-tle-welfare';
  const TIME_CLASS = 'ld-tle-time';
  const OP_POST_CLASS = 'ld-tle-op-post';
  const JUMP_CLASS = 'ld-tle-jump';
  const MARK_KEY = 'ld-tle-marks';
  const CATS_KEY = 'ld-tle-mark-cats';
  const TAGS_KEY = 'ld-tle-mark-tags';
  const KEYWORDS_KEY = 'ld-tle-keyword-rules';
  const EFFECTS_KEY = 'ld-tle-topic-effects';
  const DEBUG_KEY = 'ld-tle-debug';
  const SUSPEND_KEY = 'ld-tle-suspended';
  const SUSPEND_CLASS = 'ld-tle-suspended';
  const MARK_STYLE_ID = 'ld-tle-mark-dyn';
  const MARK_CLASS = 'ld-tle-mark';
  const EFFECT_CLASS = 'ld-tle-effect';
  const MARK_BADGE = 'ld-tle-mark-badge';
  const MARK_ADD = 'ld-tle-mark-add';
  const MARK_ROW = 'ld-tle-mark-row';
  const BOOST_MARK_CLASS = 'ld-tle-boost-mark';
  const DEFAULT_CATS = [
    { id: 'block', label: '屏蔽', effectIds: ['fade-light'], color: '#6e7681', priority: 10000, hint: '弱化显示' },
    { id: 'caution', label: '注意', effectIds: ['left-highlight'], color: '#d4a72c', priority: 10000, hint: '黄色警示' },
    { id: 'watch', label: '关注', effectIds: ['left-highlight'], color: '#0969da', priority: 10000, hint: '蓝色高亮' },
    { id: 'friend', label: '友好', effectIds: ['left-highlight'], color: '#1a7f37', priority: 10000, hint: '绿色高亮' },
    { id: 'vip', label: '重要', effectIds: ['left-highlight'], color: '#d4a72c', priority: 10000, hint: '金色强调' },
  ];
  const DEFAULT_EFFECTS = [
    { id: 'left-highlight', label: '左侧高亮', color: '#0969da', mode: 'normal', kind: 'color', priority: 30, hint: '为话题增加左侧颜色线' },
    { id: 'tag-highlight', label: '关键词/tag 高亮', color: '#0969da', mode: 'normal', kind: 'tag', priority: 30, hint: '高亮匹配话题中的标签' },
    { id: 'normal', label: '无额外效果', color: '#6e7681', mode: 'normal', kind: 'none', priority: 0, hint: '只显示标记' },
    { id: 'lv1', label: 'Lv1颜色', color: '#0969da', mode: 'normal', kind: 'color', priority: 10, hint: '沿用 Lv1 左侧颜色线' },
    { id: 'lv2', label: 'Lv2颜色', color: '#1a7f37', mode: 'normal', kind: 'color', priority: 10, hint: '沿用 Lv2 左侧颜色线' },
    { id: 'lv3', label: 'Lv3颜色', color: '#d4a72c', mode: 'normal', kind: 'color', priority: 10, hint: '沿用 Lv3 左侧颜色线' },
    { id: 'lv4', label: 'Lv4颜色', color: '#8250df', mode: 'normal', kind: 'color', priority: 10, hint: '沿用 Lv4 左侧颜色线' },
    { id: 'rich', label: '富可敌国颜色', color: '#d4a72c', mode: 'normal', kind: 'color', priority: 30, hint: '金色左侧颜色线' },
    { id: 'welfare', label: '福利羊毛颜色', color: '#e45735', mode: 'normal', kind: 'color', priority: 30, hint: '福利内容颜色线' },
    { id: 'fade-light', label: '淡化（浅）', color: '#9aa4af', mode: 'dim', kind: 'fade', opacity: 0.58, priority: 20, hint: '轻度降低透明度和饱和度' },
    { id: 'fade-deep', label: '淡化（深）', color: '#6e7681', mode: 'dim', kind: 'fade', opacity: 0.28, priority: 20, hint: '明显降低透明度和饱和度' },
    { id: 'strike', label: '删除线', color: '#6e7681', mode: 'normal', kind: 'strike', priority: 20, hint: '为内容增加删除线' },
    { id: 'mosaic', label: '马赛克模糊', color: '#6e7681', mode: 'normal', kind: 'mosaic', priority: 20, hint: '模糊内容，悬停时恢复查看' },
    { id: 'lonely', label: '待回复', color: '#9a6700', mode: 'normal', kind: 'badge', priority: 20, hint: '标记待回复主题' },
  ].map((effect) => ({ ...effect, builtin: true, enabled: true }));
  const BUILTIN_EFFECT_IDS = new Set(DEFAULT_EFFECTS.map((effect) => effect.id));
  const EFFECT_LIBRARY_IDS = new Set(['left-highlight', 'tag-highlight', 'normal', 'fade-light', 'fade-deep', 'strike', 'mosaic']);
  const NAME_SEL = '.badge-category__name';
  const PROMO_TAGS = ['高级推广'];
  const LOTTERY_TAGS = ['抽奖'];

  function libraryEffectIds(ids) {
    return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => EFFECT_LIBRARY_IDS.has(id)))];
  }

  let opUserId = null;
  let cachedTopicId = null;
  let cats = loadCats();
  let tags = loadTags();
  let effects = loadEffects();
  let keywordRules = loadKeywordRules();
  let marks = loadMarks();
  let pickerEl = null;
  let panelEl = null;
  let suspendCleared = false;

  cats.forEach((group) => {
    group.effectIds = libraryEffectIds(group.effectIds).filter((id) => getEffect(id));
    if (!group.effectIds.length) group.effectIds = ['left-highlight'];
  });

  function normalizeCat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = String(raw.label || '').trim();
    const hint = String(raw.hint || '').trim();
    if (!id || !label) return null;
    const effectIds = libraryEffectIds(raw.effectIds);
    const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color || '') ? raw.color : '';
    const priority = Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 10000;
    return { id, label, effectIds, color, priority, hint };
  }

  function loadCats() {
    try {
      const stored = localStorage.getItem(CATS_KEY);
      if (stored == null) return DEFAULT_CATS.map((c) => ({ ...c }));
      const raw = JSON.parse(stored);
      return Array.isArray(raw) ? raw.map(normalizeCat).filter(Boolean) : DEFAULT_CATS.map((c) => ({ ...c }));
    } catch (e) {
      return DEFAULT_CATS.map((c) => ({ ...c }));
    }
  }

  function saveCats() {
    localStorage.setItem(CATS_KEY, JSON.stringify(cats));
  }

  function getCat(id) {
    return cats.find((c) => c.id === id) || null;
  }

  function normalizeEffect(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = String(raw.label || '').trim();
    const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color || '') ? raw.color : '#6e7681';
    const mode = ['normal', 'tint', 'dim'].includes(raw.mode) ? raw.mode : 'normal';
    if (!id || !label) return null;
    return {
      id, label, color, mode,
      kind: ['none', 'color', 'tag', 'fade', 'strike', 'mosaic', 'badge'].includes(raw.kind) ? raw.kind : 'color',
      priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 0,
      opacity: Number.isFinite(Number(raw.opacity)) ? Math.max(0.1, Math.min(1, Number(raw.opacity))) : undefined,
      hint: String(raw.hint || '').trim(),
      builtin: !!raw.builtin,
      enabled: raw.enabled !== false,
    };
  }

  function loadEffects() {
    try {
      const raw = JSON.parse(localStorage.getItem(EFFECTS_KEY) || 'null');
      const saved = Array.isArray(raw) ? raw.map(normalizeEffect).filter(Boolean) : [];
      const byId = new Map(DEFAULT_EFFECTS.map((effect) => [effect.id, { ...effect }]));
      saved.forEach((effect) => {
        byId.set(effect.id, { ...(byId.get(effect.id) || {}), ...effect });
      });
      return [...byId.values()];
    } catch (e) {
      return DEFAULT_EFFECTS.map((effect) => ({ ...effect }));
    }
  }

  function saveEffects() {
    localStorage.setItem(EFFECTS_KEY, JSON.stringify(effects));
  }

  function getEffect(id) {
    return effects.find((effect) => effect.id === id) || null;
  }

  function isBuiltinEffect(id) {
    return BUILTIN_EFFECT_IDS.has(id);
  }

  function boundEffects(value, colorOverride) {
    const ids = Array.isArray(value) ? value : [value];
    return ids.flatMap((id) => {
      const effect = getEffect(id);
      return effect ? [colorOverride && (effect.kind === 'color' || effect.kind === 'tag') ? { ...effect, color: colorOverride } : effect] : [];
    }).filter((effect) => effect && effect.enabled !== false);
  }

  function markEffects(mark) {
    if (!mark) return [];
    const groupIds = (mark.groups || []).map((group) => group.id);
    return groupIds.flatMap((id) => {
      const group = getCat(id);
      return group ? boundEffects(group.effectIds).map((effect) => ({ ...effect, priority: group.priority, source: group.label })) : [];
    });
  }

  function normalizeTag(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const label = String(raw.label || '').trim();
    const color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw.color || '') ? raw.color : '#8250df';
    if (!id || !label) return null;
    return { id, label, color };
  }

  function loadTags() {
    try {
      const raw = JSON.parse(localStorage.getItem(TAGS_KEY) || 'null');
      return Array.isArray(raw) ? raw.map(normalizeTag).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTags() {
    localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
  }

  function getTag(id) {
    return tags.find((t) => t.id === id) || null;
  }

  function loadKeywordRules() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEYWORDS_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter((r) => r && r.keyword && Array.isArray(r.effectIds)).map((r, index) => ({
        id: String(r.id || `rule-${index + 1}`),
        keyword: String(r.keyword).trim(),
        effectIds: libraryEffectIds(r.effectIds).filter((id) => getEffect(id)),
        color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(r.color || '') ? r.color : '#0969da',
        priority: Number.isFinite(Number(r.priority)) ? Number(r.priority) : 5000,
        ignoreCase: r.ignoreCase !== false,
        enabled: r.enabled !== false,
      })) : [];
    } catch (e) {
      return [];
    }
  }

  function saveKeywordRules() {
    localStorage.setItem(KEYWORDS_KEY, JSON.stringify(keywordRules));
  }

  function keywordCategory(row) {
    const title = row.querySelector('.raw-topic-link, .title, .link-top-line')?.textContent || '';
    const tagElements = [...row.querySelectorAll('a.discourse-tag, .discourse-tag')];
    const categoryElements = [...row.querySelectorAll('.badge-category')];
    const tagsText = tagElements.map((el) => el.textContent).join(' ');
    const categoriesText = categoryElements.map((el) => el.textContent).join(' ');
    const rawHaystack = `${title} ${tagsText} ${categoriesText}`;
    const lowerHaystack = rawHaystack.toLowerCase();
    const lowerTitle = title.toLowerCase();
    const matchableElements = [...tagElements, ...categoryElements];
    const matches = [];
    keywordRules.forEach((r) => {
      // ignoreCase is on by default; turn it off to require an exact case match.
      const ignoreCase = r.ignoreCase !== false;
      const haystack = ignoreCase ? lowerHaystack : rawHaystack;
      const keyword = ignoreCase ? r.keyword.toLowerCase() : r.keyword;
      if (!r.enabled || !r.keyword || !haystack.includes(keyword) || !boundEffects(r.effectIds).length) return;
      const titleMatch = (ignoreCase ? lowerTitle : title).includes(keyword);
      matches.push({
        rule: r,
        effects: boundEffects(r.effectIds, r.color),
        titleMatch,
        matchingTags: matchableElements.filter((el) => {
          const text = el.textContent || '';
          return (ignoreCase ? text.toLowerCase() : text).includes(keyword);
        }),
      });
    });
    return matches.length ? { matches } : null;
  }

  function keywordTagColor(match) {
    const effect = (match.effects || []).find((item) => item.kind === 'tag');
    return effect ? effect.color : '';
  }

  // Each matched tag/category keeps its own rule color instead of sharing one
  // row color. When several rules match the same element, a rule that also hit
  // the topic title wins (标题规则可以覆盖), otherwise the higher priority wins.
  function resolveKeywordColors(keywordMatch) {
    const result = new Map();
    if (!keywordMatch) return result;
    keywordMatch.matches.forEach((match) => {
      const color = keywordTagColor(match);
      if (!color) return;
      const priority = match.rule.priority ?? 5000;
      match.matchingTags.forEach((el) => {
        const prev = result.get(el);
        const wins = !prev
          || (match.titleMatch && !prev.titleMatch)
          || (match.titleMatch === prev.titleMatch && priority >= prev.priority);
        if (wins) result.set(el, { color, priority, titleMatch: match.titleMatch });
      });
    });
    return result;
  }

  function moveKeywordRule(id, direction) {
    const index = keywordRules.findIndex((rule) => rule.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= keywordRules.length) return;
    [keywordRules[index], keywordRules[next]] = [keywordRules[next], keywordRules[index]];
    saveKeywordRules();
    renderKeywords();
    applyMarks();
  }

  function moveCategory(id, direction) {
    const index = cats.findIndex((cat) => cat.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= cats.length) return;
    [cats[index], cats[next]] = [cats[next], cats[index]];
    saveCats();
    renderCats();
    fillCatSelects();
    applyMarks();
  }

  function duplicateCategory(id) {
    const index = cats.findIndex((cat) => cat.id === id);
    if (index < 0) return;
    const src = cats[index];
    const cat = normalizeCat({
      id: uniqueId(src.id, (value) => !!getCat(value)),
      label: `${src.label} 副本`,
      color: src.color,
      priority: src.priority,
      hint: src.hint,
      effectIds: [...(src.effectIds || [])],
    });
    if (!cat) return;
    cats.splice(index + 1, 0, cat);
    saveCats();
    renderCats();
    fillCatSelects();
    applyMarks();
  }

  function duplicateKeywordRule(id) {
    const index = keywordRules.findIndex((rule) => rule.id === id);
    if (index < 0) return;
    const src = keywordRules[index];
    keywordRules.splice(index + 1, 0, {
      id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      keyword: src.keyword,
      effectIds: [...(src.effectIds || [])],
      color: src.color,
      priority: src.priority,
      ignoreCase: src.ignoreCase !== false,
      enabled: src.enabled,
    });
    saveKeywordRules();
    renderKeywords();
    applyMarks();
  }

  function normalizeTagIds(list) {
    const seen = new Set();
    const out = [];
    (Array.isArray(list) ? list : []).forEach((id) => {
      const t = getTag(id);
      if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t.id); }
    });
    return out;
  }

  function loadMarks() {
    try {
      const raw = JSON.parse(localStorage.getItem(MARK_KEY) || '{}');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        const user = String(k).trim().toLowerCase();
        const groups = normalizeMarkGroups(v && v.groups);
        if (user && groups.length) {
          out[user] = {
            groups,
            note: (v && v.note) || '',
            at: (v && v.at) || Date.now(),
          };
        }
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function saveMarks() {
    localStorage.setItem(MARK_KEY, JSON.stringify(marks));
  }

  function getMark(username) {
    if (!username) return null;
    return marks[String(username).trim().toLowerCase()] || null;
  }

  function setMark(username, level, note, opts) {
    const user = String(username || '').trim().toLowerCase();
    if (!user) return;
    if (!level) {
      delete marks[user];
      } else if (getCat(level)) {
        const prev = marks[user] || {};
        const previousGroups = prev.groups || [{ id: prev.level }];
        const groupIds = opts && opts.groupIds ? opts.groupIds : previousGroups.map((group) => group.id);
        const reasons = opts && opts.groupReasons ? opts.groupReasons : Object.fromEntries(previousGroups.map((group) => [group.id, group.reason || '']));
        const groups = normalizeMarkGroups([
          { id: level, reason: reasons[level] || '' },
          ...groupIds.filter((id) => id !== level).map((id) => ({ id, reason: reasons[id] || '' })),
        ]);
        marks[user] = {
          groups,
          note: note != null ? String(note) : (prev.note || ''),
          at: Date.now(),
      };
    }
    saveMarks();
    applyMarks();
    fillCatSelects();
    if (!opts || !opts.keepPanel) {
      if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
    }
  }

  function setMarkGroups(username, groups, note) {
    const user = String(username || '').trim().toLowerCase();
    const normalized = normalizeMarkGroups(groups);
    if (!user || !normalized.length) return;
    marks[user] = { groups: normalized, note: String(note || ''), at: Date.now() };
    saveMarks();
    applyMarks();
    fillCatSelects();
  }

  function normalizeTagReasons(reasons, tagIds) {
    const allowed = new Set(normalizeTagIds(tagIds));
    return Object.fromEntries(Object.entries(reasons && typeof reasons === 'object' ? reasons : {})
      .filter(([id, reason]) => allowed.has(id) && String(reason).trim())
      .map(([id, reason]) => [id, String(reason).trim()]));
  }

  function normalizeGroupTagIds(list) {
    const seen = new Set();
    return (Array.isArray(list) ? list : []).map(String).filter((id) => {
      if (!getCat(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  function normalizeGroupTagReasons(reasons, groupIds) {
    const allowed = new Set(normalizeGroupTagIds(groupIds));
    return Object.fromEntries(Object.entries(reasons && typeof reasons === 'object' ? reasons : {})
      .filter(([id, reason]) => allowed.has(id) && String(reason).trim())
      .map(([id, reason]) => [id, String(reason).trim()]));
  }

  function normalizeMarkGroups(groups, availableCatIds) {
    const seen = new Set();
    const available = availableCatIds ? new Set(availableCatIds) : null;
    return (Array.isArray(groups) ? groups : []).map((group) => {
      const id = typeof group === 'string' ? group : group && group.id;
      const reason = typeof group === 'object' && group ? group.reason : '';
      return { id: String(id || ''), reason: String(reason || '').trim() };
    }).filter((group) => {
      if ((available ? !available.has(group.id) : !getCat(group.id)) || seen.has(group.id)) return false;
      seen.add(group.id);
      return true;
    });
  }

  function usernameFromEl(el) {
    if (!el) return '';
    const raw = el.getAttribute('data-user-card')
      || el.getAttribute('data-username')
      || ((el.getAttribute('href') || '').match(/\/u\/([^/?#]+)/) || [])[1]
      || '';
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  }

  function cardUsername(card) {
    const dataName = card.getAttribute('data-username');
    if (dataName) return dataName.trim();
    const link = card.querySelector('.names a[href*="/u/"], [data-user-card], [data-username], a[href*="/u/"]');
    if (link) {
      const name = usernameFromEl(link);
      if (name) return name;
    }
    const secondary = card.querySelector('.names__secondary.username, .username');
    return secondary ? secondary.textContent.trim() : '';
  }

  function markClassList(el) {
    [...el.classList].filter((c) => c.startsWith(MARK_CLASS + '--') || c.startsWith(EFFECT_CLASS + '--')).forEach((c) => el.classList.remove(c));
  }

  function applyMarks() {
    mutationObserver?.disconnect();
    try {
      document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      row.querySelectorAll('.ld-tle-keyword-match').forEach((el) => {
        el.classList.remove('ld-tle-keyword-match');
        el.style.removeProperty('--ld-tle-tag-color');
      });
      const posters = row.querySelector('td.posters');
      const opLink = posters && (
        [...posters.querySelectorAll('a[data-user-card]')].find((a) => {
          const img = a.querySelector('img.avatar');
          return img && /原始发帖人/.test(img.getAttribute('title') || '');
        }) || posters.querySelector('a[data-user-card]')
      );
      const user = opLink && opLink.getAttribute('data-user-card');
      const mark = getMark(user);
      const keywordMatch = keywordCategory(row);
      keywordMatch?.matches.forEach((match) => match.matchingTags.forEach((el) => el.classList.add('ld-tle-keyword-match')));
      resolveKeywordColors(keywordMatch).forEach((info, el) => {
        el.style.setProperty('--ld-tle-tag-color', info.color);
      });
      const candidates = [];
      if (mark) {
        markEffects(mark).forEach((effect) => candidates.push(effect));
      }
      keywordMatch?.matches.forEach((match) => match.effects.forEach((effect) => candidates.push({ ...effect, priority: match.rule.priority ?? 5000, source: `关键词·${match.rule.keyword}` })));
      reusableEffectForRow(row).forEach((effect) => {
        if (effect) candidates.push({ ...effect, priority: effect.priority || 0 });
      });
      const result = applyTopicEffects(row, candidates);
      row.__ldTleDebug = { candidates, applied: result.applied, colorWinner: result.colorWinner, tagWinner: result.tagWinner };
      const title = row.querySelector('.link-top-line, td.main-link');
      paintBadges(title, mark, null);
      setEffectBadge(title, keywordMatch?.matches.length && !mark
        ? keywordMatch.matches.flatMap((match) => match.effects)
        : [], keywordMatch?.matches.map((match) => match.rule.keyword).join('、') || '');
      });

      document.querySelectorAll('article[id^="post_"]').forEach((post) => {
        markClassList(post);
        const names = post.querySelector('.names .first, .names');
        const userEl = post.querySelector('.names [data-user-card], .names a[href^="/u/"]');
        const user = userEl && usernameFromEl(userEl);
        paintBadges(names, getMark(user), null);
      });

      document.querySelectorAll('#user-card, .user-card, .d-user-card').forEach((card) => {
        const name = cardUsername(card);
        decorateUserCard(card, name, getMark(name));
      });

      decorateBoosts();
    } finally {
      observeDocument();
    }
  }

  function decorateBoosts() {
    document.querySelectorAll('.discourse-boosts__list .discourse-boosts__bubble').forEach((bubble) => {
      const avatar = bubble.querySelector('a[data-user-card] img.avatar');
      if (!avatar) return;
      const username = usernameFromEl(avatar.closest('a[data-user-card]'));
      const mark = getMark(username);
      const groups = (mark?.groups || []).map((binding) => ({ binding, group: getCat(binding.id) })).filter((item) => item.group);
      bubble.classList.remove(BOOST_MARK_CLASS);
      avatar.classList.remove(BOOST_MARK_CLASS);
      avatar.style.removeProperty('--ld-tle-boost-color');
      if (!groups.length) {
        if (avatar.dataset.ldTleBoostTitle) avatar.title = avatar.dataset.ldTleBoostTitle;
        else avatar.removeAttribute('title');
        delete avatar.dataset.ldTleBoostTitle;
        bubble.removeAttribute('data-ld-tle-boost-title');
        return;
      }

      const first = groups[0].group;
      const labels = groups.map(({ binding, group }) => binding.reason ? `${group.label}: ${binding.reason}` : group.label);
      const description = `@${username} · ${labels.join('、')}`;
      bubble.classList.add(BOOST_MARK_CLASS);
      avatar.classList.add(BOOST_MARK_CLASS);
      avatar.style.setProperty('--ld-tle-boost-color', first.color || '#0969da');
      if (avatar.dataset.ldTleBoostTitle == null) avatar.dataset.ldTleBoostTitle = avatar.getAttribute('title') || '';
      avatar.title = description;
      bubble.dataset.ldTleBoostTitle = description;
    });
  }

  function reusableEffectForRow(row) {
    const result = [];
    const pushReuse = (effect, source) => {
      if (effect) result.push({ ...effect, source });
    };
    if (row.classList.contains(PROMO_CLASS)) { pushReuse(getEffect('fade-light'), '内置·推广'); pushReuse(getEffect('strike'), '内置·推广'); }
    if (row.classList.contains(LOTTERY_CLASS)) { pushReuse(getEffect('fade-light'), '内置·抽奖'); pushReuse(getEffect('strike'), '内置·抽奖'); }
    if (row.classList.contains(STALE_CLASS)) pushReuse(getEffect('fade-light'), '内置·陈旧');
    if (row.classList.contains(LONELY_CLASS)) {
      const lonely = getEffect('lonely');
      if (lonely) result.push({ ...lonely, priority: lonely.priority, source: '内置·待回复' });
    }
      if (row.querySelector('.' + WELFARE_BADGE_CLASS)) {
        const welfare = getEffect('welfare');
        const tagHighlight = getEffect('tag-highlight');
      if (welfare?.enabled !== false && tagHighlight) result.push({ ...tagHighlight, color: welfare.color, priority: welfare.priority, welfareOnly: true, source: '内置·福利' });
    }
    const categoryText = row.querySelector('.badge-category__name')?.textContent || '';
    if (/富可敌国/.test(categoryText)) {
      const rich = getEffect('rich');
      if (rich?.enabled !== false) {
        const fadeDeep = getEffect('fade-deep');
        const strikeEffect = getEffect('strike');
        if (fadeDeep) result.push({ ...fadeDeep, priority: rich.priority, source: '内置·富可敌国' });
        if (strikeEffect) result.push({ ...strikeEffect, priority: rich.priority, source: '内置·富可敌国' });
      }
    }
    const levelClass = [...row.querySelectorAll('td.main-link')].flatMap((td) => [...td.classList]).find((name) => /^ld-tle-row--[1-4]$/.test(name));
    if (levelClass) pushReuse(getEffect(levelClass.replace('ld-tle-row--', 'lv')), '内置·等级');
    return result.filter(Boolean);
  }

  // Shared effect layer: user marks and future rules can use the same topic-row behavior.
  function applyTopicEffects(row, effectsToApply) {
    const seen = new Set();
    const activeEffects = effectsToApply.filter((effect) => effect && effect.enabled !== false)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0)
        || String(a.id).localeCompare(String(b.id))
        || String(a.source || '').localeCompare(String(b.source || '')));
    const exclusiveKinds = new Set(['color', 'tag', 'fade']);
    const selectedKinds = new Set();
    let colorWinner = null;
    let tagWinner = null;
    const selectedEffects = activeEffects.filter((effect) => !exclusiveKinds.has(effect.kind) || !selectedKinds.has(effect.kind)).filter((effect) => {
      if (exclusiveKinds.has(effect.kind)) selectedKinds.add(effect.kind);
      if (effect.kind === 'color' && !colorWinner) colorWinner = effect;
      if (effect.kind === 'tag') {
        if (!tagWinner) tagWinner = effect;
      }
      return !seen.has(effect.id) && seen.add(effect.id);
    });
    const nextClasses = new Set(selectedEffects.map((effect) => `${EFFECT_CLASS}--${effect.id}`));
    if (tagWinner) nextClasses.add(`${EFFECT_CLASS}--tag-highlight`);
    [...row.classList].filter((name) => name.startsWith(EFFECT_CLASS + '--') && !nextClasses.has(name)).forEach((name) => row.classList.remove(name));
    nextClasses.forEach((name) => row.classList.add(name));
    row.classList.toggle('ld-tle-welfare-only', !!tagWinner?.welfareOnly);
    const color = colorWinner?.color || '';
    const tagColor = tagWinner?.color || '';
    if (row.style.getPropertyValue('--ld-tle-effect-color') !== color) {
      if (color) row.style.setProperty('--ld-tle-effect-color', color);
      else row.style.removeProperty('--ld-tle-effect-color');
    }
    if (row.style.getPropertyValue('--ld-tle-tag-color') !== tagColor) {
      if (tagColor) row.style.setProperty('--ld-tle-tag-color', tagColor);
      else row.style.removeProperty('--ld-tle-tag-color');
    }
    return { applied: activeEffects, colorWinner, tagWinner };
  }

  function setEffectBadge(host, effect, keyword) {
    const selected = (Array.isArray(effect) ? effect : [effect]).filter((item) => item && item.kind === 'badge');
    if (!host) return;
    let badge = host.querySelector(':scope > .ld-tle-keyword-badge');
    if (!selected.length) {
      badge?.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ld-tle-keyword-badge';
      host.append(badge);
    }
    badge.className = `ld-tle-keyword-badge ${MARK_BADGE} ${selected.map((item) => `${MARK_BADGE}--effect-${item.id}`).join(' ')}`;
    badge.textContent = selected.map((item) => item.label).join(' + ');
    badge.title = `关键词：${keyword}`;
  }

  function decorateUserCard(card, username, mark) {
    if (!username) return;
    const anchor = card.querySelector('.card-row.first-row .names, .names, h2.username, .full-name, .user-card-metadata');
    let row = card.querySelector('.' + MARK_ROW);
    if (!row) {
      row = document.createElement('div');
      row.className = MARK_ROW;
    }
    if (anchor) {
      if (row.parentElement !== anchor) anchor.append(row);
    } else {
      if (!row.parentElement) {
        const content = card.querySelector('.card-content, .d-user-card__container') || card;
        content.append(row);
      }
    }
    paintBadges(row, mark, null);
    attachCardMarkButton(card, username);
  }

  function attachCardMarkButton(card, username) {
    const controls = card.querySelector('.usercard-controls');
    if (!controls || !username || controls.querySelector('.' + MARK_ADD)) return;
    const item = document.createElement('li');
    item.className = 'ld-tle-mark-control';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-icon-text btn-default ' + MARK_ADD;
    button.title = '标记用户';
    button.textContent = '标记';
    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPicker(username, button);
    });
    item.append(button);
    controls.append(item);
  }

  function paintBadges(host, mark, username) {
    if (!host) return;
    const effects = mark ? markEffects(mark) : [];
    const groupIds = mark ? (mark.groups || []).map((group) => group.id) : [];
    const wanted = [];
    effects.filter((effect) => effect.kind === 'badge').forEach((effect) => {
      wanted.push({ kind: 'effect', id: effect.id, label: effect.label, title: (mark && mark.note) || effect.hint || effect.label });
    });
    groupIds.forEach((id) => {
      const group = getCat(id);
      const binding = mark.groups.find((item) => item.id === id) || { reason: '' };
      if (group) wanted.push({ kind: 'group-tag', id: group.id, label: group.label, title: binding.reason || group.label, color: group.color || '#0969da' });
    });
    [...host.children].forEach((el) => {
      if (el.classList.contains(MARK_BADGE) || el.classList.contains(MARK_ADD)) return;
    });
    const existing = [...host.querySelectorAll(':scope > .' + MARK_BADGE + ':not(.ld-tle-keyword-badge)')];
    const used = new Set();
    wanted.forEach((item) => {
      const cls = `${MARK_BADGE} ${MARK_BADGE}--${item.kind}-${item.id}`;
      let badge = existing.find((el) => !used.has(el) && el.className === cls);
      if (!badge) {
        badge = document.createElement('span');
        const btn = host.querySelector(':scope > .' + MARK_ADD);
        if (btn) host.insertBefore(badge, btn);
        else host.append(badge);
      }
      used.add(badge);
      if (badge.className !== cls) badge.className = cls;
      if (badge.textContent !== item.label) badge.textContent = item.label;
      if (badge.title !== item.title) badge.title = item.title;
    });
    existing.filter((el) => !used.has(el)).forEach((el) => el.remove());
    if (username) attachMarkButton(host, username);
    else host.querySelectorAll(':scope > .' + MARK_ADD).forEach((el) => el.remove());
  }

  function closePicker() {
    if (pickerEl) pickerEl.remove();
    pickerEl = null;
  }

  function openPicker(username, anchor) {
    closePicker();
    const current = getMark(username);
    pickerEl = document.createElement('div');
    pickerEl.className = 'ld-tle-picker';
    const head = document.createElement('div');
    head.className = 'ld-tle-picker__head';
    head.textContent = '标记 @' + username;
    const levels = document.createElement('select');
    levels.className = 'ld-tle-picker__levels';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '选择分组';
    levels.append(empty);
    const note = document.createElement('textarea');
    note.className = 'ld-tle-picker__note';
    note.rows = 2;
    note.placeholder = '备注（可选）';
    note.value = (current && current.note) || '';
    const actions = document.createElement('div');
    actions.className = 'ld-tle-picker__actions';
    actions.innerHTML = `
      <button type="button" data-act="save">保存</button>
      <button type="button" data-act="clear"${current ? '' : ' disabled'}>清除</button>
    `;
    const tagBox = document.createElement('div');
    tagBox.className = 'ld-tle-picker__tags';
    pickerEl.append(head, levels, note, actions);
    const currentGroups = current?.groups || [];
    cats.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.label;
       option.selected = !!current && current.groups?.[0]?.id === group.id;
      levels.append(option);
    });
    pickerEl.querySelector('[data-act="save"]').addEventListener('click', () => {
      const selectedGroup = levels.value;
      setMark(username, selectedGroup || null, note.value.trim());
      closePicker();
    });
    pickerEl.querySelector('[data-act="clear"]').addEventListener('click', () => {
      setMark(username, null);
      closePicker();
    });
    document.body.append(pickerEl);
    const r = anchor.getBoundingClientRect();
    const top = Math.min(r.bottom + 6, window.innerHeight - pickerEl.offsetHeight - 8);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - pickerEl.offsetWidth - 8);
    pickerEl.style.top = `${top + window.scrollY}px`;
    pickerEl.style.left = `${left + window.scrollX}px`;
  }

  function exportMarks() {
    return JSON.stringify({
      version: 8,
      exportedAt: new Date().toISOString(),
      effects,
      cats,
      tags,
      keywordRules,
      marks,
    }, null, 2);
  }

  function parseImport(text) {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object') throw new Error('Invalid export');
    const importedEffects = Array.isArray(data.effects) ? data.effects.map(normalizeEffect).filter(Boolean) : [];
    const importedCats = Array.isArray(data.cats) ? data.cats.map(normalizeCat).filter(Boolean) : [];
    const importedTags = Array.isArray(data.tags) ? data.tags.map(normalizeTag).filter(Boolean) : [];
    const importedEffectIds = new Set([...effects, ...importedEffects].map((effect) => effect.id));
    const importedRules = Array.isArray(data.keywordRules) ? data.keywordRules.filter((r) => r && r.keyword && Array.isArray(r.effectIds)).map((r) => ({
       id: String(r.id || `rule-${Date.now()}-${Math.random()}`),
       keyword: String(r.keyword).trim(),
       effectIds: libraryEffectIds(r.effectIds).filter((id) => importedEffectIds.has(id)),
       color: /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(r.color || '') ? r.color : '#0969da',
       priority: Number.isFinite(Number(r.priority)) ? Number(r.priority) : 5000,
       ignoreCase: r.ignoreCase !== false,
       enabled: r.enabled !== false,
     })) : [];
    let source = data;
    if (!Array.isArray(data) && data.marks && typeof data.marks === 'object' && !Array.isArray(data.marks)) source = data.marks;
    if (!source || typeof source !== 'object') throw new Error('Invalid export');
    const entries = Array.isArray(source)
      ? source
      : Object.entries(source).map(([username, value]) => ({
        username,
        ...(value && typeof value === 'object' ? value : { level: value }),
      }));
    const availableCatIds = new Set([...cats, ...importedCats].map((cat) => cat.id));
    const parsed = [];
    for (const item of entries) {
      const record = item && typeof item === 'object' ? item : {};
      const username = String(record.username || record.user || record.name || '').trim().toLowerCase();
      const legacyLevel = record.level || record.effect || record.mark || record.tag;
      const rawGroups = Array.isArray(record.groups)
        ? record.groups
        : legacyLevel ? [{ id: legacyLevel, reason: '' }] : [];
      const groups = normalizeMarkGroups(rawGroups, availableCatIds);
      if (!username || !groups.length) continue;
      parsed.push({
        username,
        groups,
        note: record.note || '',
        at: record.at || Date.now(),
      });
    }
    return { parsed, importedEffects, importedCats, importedTags, importedRules };
  }

  function mergeImported(parsed, importedEffects, importedCats, importedTags, importedRules, mode) {
    let added = 0;
    let updated = 0;
    let skipped = 0;
    importedEffects.forEach((effect) => {
      const current = getEffect(effect.id);
      if (current) Object.assign(current, effect);
      else effects.push(effect);
    });
    importedCats.forEach((cat) => {
      if (!getCat(cat.id)) cats.push(cat);
    });
    importedTags.forEach((tag) => {
      if (!getTag(tag.id)) tags.push(tag);
    });
    importedRules.forEach((rule) => {
      if (!keywordRules.some((r) => r.keyword.toLowerCase() === rule.keyword.toLowerCase())) keywordRules.push(rule);
    });
    for (const item of parsed) {
      const prev = marks[item.username];
      if (!prev) {
        marks[item.username] = { groups: item.groups, note: item.note, at: item.at };
        added++;
        continue;
      }
      if (mode === 'skip') { skipped++; continue; }
      if (mode === 'replace') {
        marks[item.username] = { groups: item.groups, note: item.note, at: item.at };
        updated++;
        continue;
      }
      const note = item.note && item.note !== prev.note
        ? (prev.note ? `${prev.note} | ${item.note}` : item.note)
        : prev.note;
      marks[item.username] = { groups: normalizeMarkGroups([...(prev.groups || []), ...(item.groups || [])]), note, at: Math.max(prev.at || 0, item.at || 0) };
      updated++;
    }
    saveCats();
    saveEffects();
    fillCatSelects();
    saveTags();
    saveKeywordRules();
    saveMarks();
    updateMarkStyles();
    applyMarks();
    return { added, updated, skipped };
  }

  function resetAllData() {
    [MARK_KEY, CATS_KEY, TAGS_KEY, KEYWORDS_KEY, EFFECTS_KEY, DEBUG_KEY].forEach((key) => localStorage.removeItem(key));
    cats = [];
    tags = loadTags();
    effects = loadEffects();
    keywordRules = [];
    marks = loadMarks();
    saveCats();
    saveTags();
    saveEffects();
    saveKeywordRules();
    saveMarks();
    updateMarkStyles();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) {
      fillCatSelects();
      renderEffects();
      renderCats();
      renderTags();
      renderKeywords();
      renderPanelList();
    }
  }

  function dedupMarks() {
    const seen = new Map();
    let dropped = 0;
    for (const [user, info] of Object.entries(marks)) {
      const key = user.trim().toLowerCase();
      const prev = seen.get(key);
      if (!prev) { seen.set(key, info); continue; }
      dropped++;
      const newer = (info.at || 0) >= (prev.at || 0) ? info : prev;
      const older = newer === info ? prev : info;
      if (older.note && older.note !== newer.note) {
        newer.note = newer.note ? `${newer.note} | ${older.note}` : older.note;
      }
      newer.groups = normalizeMarkGroups([...(newer.groups || []), ...(older.groups || [])]);
      seen.set(key, newer);
    }
    marks = Object.fromEntries([...seen.entries()]);
    saveMarks();
    updateMarkStyles();
    applyMarks();
    return dropped;
  }

  function updateFabState() {
    const fab = document.querySelector('.ld-tle-fab');
    if (!fab) return;
    const suspended = isSuspended();
    fab.classList.toggle('ld-tle-fab--suspended', suspended);
    fab.textContent = suspended ? '已暂停' : '标记';
    fab.title = suspended ? '效果已临时关闭 · 点击打开面板' : '用户标记';
  }

  function ensureFab() {
    let fab = document.querySelector('.ld-tle-fab');
    if (!fab) {
      fab = document.createElement('button');
      fab.type = 'button';
      fab.className = 'ld-tle-fab';
      fab.addEventListener('click', togglePanel);
      document.body.append(fab);
    }
    updateFabState();
  }

  function togglePanel() {
    if (panelEl && panelEl.classList.contains('is-open')) {
      panelEl.classList.remove('is-open');
      return;
    }
    ensurePanel();
    panelEl.classList.add('is-open');
    const suspendToggle = panelEl.querySelector('.ld-tle-panel__suspend');
    if (suspendToggle) suspendToggle.checked = isSuspended();
    fillCatSelects();
    renderEffects();
    renderBuiltinRules();
    renderCats();
    renderTags();
    renderPanelList();
  }

  function setPanelPane(name) {
    if (!panelEl) return;
    panelEl.querySelectorAll('.ld-tle-panel__nav button').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.pane === name);
    });
    panelEl.querySelectorAll('.ld-tle-panel__pane').forEach((pane) => {
      pane.classList.toggle('is-active', pane.dataset.pane === name);
    });
  }

  function ensurePanel() {
    if (panelEl) return;
    panelEl = document.createElement('div');
    panelEl.className = 'ld-tle-panel';
    panelEl.innerHTML = `
      <div class="ld-tle-panel__bar">
        <div><strong>用户标记</strong><span class="ld-tle-panel__subtitle">本地保存，仅你可见 · v${SCRIPT_VERSION}</span></div>
        <button type="button" data-act="close" aria-label="关闭">关闭</button>
      </div>
      <div class="ld-tle-panel__nav" role="tablist">
        <button type="button" class="is-active" data-pane="users">用户 <span class="ld-tle-panel__count"></span></button>
        <button type="button" data-pane="effects">效果库</button>
        <button type="button" data-pane="builtin">内置规则</button>
        <button type="button" data-pane="groups">分组</button>
        <button type="button" data-pane="keywords">关键词匹配</button>
        <button type="button" data-pane="data">数据</button>
        <button type="button" data-pane="advanced">高级</button>
      </div>
      <section class="ld-tle-panel__pane is-active" data-pane="users">
        <div class="ld-tle-panel__overview">
          <div class="ld-tle-panel__stat"><strong class="ld-tle-panel__stat-users">0</strong><span>已标记用户</span></div>
          <div class="ld-tle-panel__stat"><strong class="ld-tle-panel__stat-cats">0</strong><span>可复用效果</span></div>
          <div class="ld-tle-panel__stat"><strong class="ld-tle-panel__stat-tags">0</strong><span>子标签</span></div>
        </div>
        <div class="ld-tle-panel__add ld-tle-panel__card">
          <input type="text" class="ld-tle-panel__user" placeholder="输入用户名">
          <select class="ld-tle-panel__lv"></select>
          <button type="button" data-act="add">添加标记</button>
        </div>
        <div class="ld-tle-panel__tools">
          <input type="search" class="ld-tle-panel__q" placeholder="搜索用户名或备注">
          <select class="ld-tle-panel__filter"></select>
        </div>
        <div class="ld-tle-panel__list"></div>
      </section>
      <section class="ld-tle-panel__pane" data-pane="builtin">
        <div class="ld-tle-panel__section-head"><div><strong>内置规则</strong><span>脚本根据话题状态自动应用，开关仅控制是否启用</span></div></div>
        <div class="ld-tle-panel__builtin"></div>
      </section>
      <section class="ld-tle-panel__pane" data-pane="groups">
        <div class="ld-tle-panel__section-head"><div><strong>分组</strong><span>分组只负责组织用户，可叠加多个效果</span></div></div>
        <div class="ld-tle-panel__cats"></div>
        <div class="ld-tle-panel__cat-add ld-tle-panel__card">
          <input type="text" class="ld-tle-panel__cat-label" placeholder="新分组名">
          <div class="ld-tle-panel__cat-effect ld-tle-panel__effect-choices"></div>
          <input type="color" class="ld-tle-panel__cat-color" value="#0969da" title="分组颜色">
          <input type="number" class="ld-tle-panel__cat-priority" value="10000" title="分组优先级">
          <button type="button" data-act="add-cat">添加分组</button>
        </div>
        <div class="ld-tle-panel__section-head"><div><strong>子标签</strong><span>只显示在用户名旁，可多选</span></div></div>
        <div class="ld-tle-panel__tags"></div>
        <div class="ld-tle-panel__tag-add ld-tle-panel__card">
          <input type="text" class="ld-tle-panel__tag-label" placeholder="新标签名">
          <input type="color" class="ld-tle-panel__tag-color" value="#8250df" title="颜色">
          <button type="button" data-act="add-tag">添加</button>
        </div>
      </section>
      <section class="ld-tle-panel__pane" data-pane="effects">
        <div class="ld-tle-panel__section-head"><div><strong>效果库</strong><span>独立管理，可被分组和关键词重复使用</span></div></div>
        <div class="ld-tle-panel__effects"></div>
      </section>
      <section class="ld-tle-panel__pane" data-pane="keywords">
        <div class="ld-tle-panel__section-head"><div><strong>关键词规则</strong><span>命中话题标题或主题标签后应用指定效果 · 可切换是否忽略大小写</span></div></div>
        <div class="ld-tle-panel__keywords"></div>
        <div class="ld-tle-panel__keyword-add ld-tle-panel__card">
          <input type="text" class="ld-tle-panel__keyword" placeholder="关键词，例如：抽奖">
          <div class="ld-tle-panel__keyword-cat ld-tle-panel__effect-choices"></div>
          <input type="color" class="ld-tle-panel__keyword-color" value="#0969da" title="颜色标记颜色">
          <input type="number" class="ld-tle-panel__keyword-priority" value="5000" title="关键词优先级">
          <label class="ld-tle-panel__keyword-ignorecase" title="忽略大小写：关闭后需大小写完全一致">
            <input type="checkbox" class="ld-tle-panel__keyword-ignorecase-input" checked> 忽略大小写
          </label>
          <button type="button" data-act="add-keyword">添加规则</button>
        </div>
      </section>
      <section class="ld-tle-panel__pane" data-pane="data">
        <div class="ld-tle-panel__section-head"><div><strong>备份与迁移</strong><span>导出包含分类、子标签和用户标记</span></div></div>
        <textarea class="ld-tle-panel__json" rows="10" placeholder="粘贴导出的 JSON 数据"></textarea>
        <div class="ld-tle-panel__btns">
          <button type="button" data-act="export">导出 JSON</button>
          <button type="button" data-act="import-merge">合并导入</button>
          <button type="button" data-act="import-skip">跳过已有</button>
          <button type="button" data-act="import-replace">覆盖导入</button>
          <button type="button" data-act="dedup">去重</button>
          <button type="button" data-act="reset-all" class="ld-tle-panel__danger">彻底清理数据</button>
        </div>
        <div class="ld-tle-panel__section-head"><div><strong>调试</strong><span>开启后悬浮时间标签可查看优先级应用关系</span></div></div>
        <label class="ld-tle-panel__debug-toggle"><input type="checkbox" class="ld-tle-panel__debug"> 启用调试模式</label>
      </section>
      <section class="ld-tle-panel__pane" data-pane="advanced">
        <div class="ld-tle-panel__section-head"><div><strong>高级</strong><span>全局开关，暂停脚本的全部页面效果，标记与设置数据不受影响</span></div></div>
        <div class="ld-tle-panel__card">
          <label class="ld-tle-panel__debug-toggle"><input type="checkbox" class="ld-tle-panel__suspend"> 临时关闭所有效果</label>
          <div class="ld-tle-panel__suspend-hint">开启后：等级标签、时间标签、推广/抽奖淡化、陈旧淡化、待回复标记、楼主高亮、回复跳转、用户标记徽章与行效果、关键词效果全部停止。悬浮按钮和本面板保持可用，关闭开关即可原样恢复。</div>
        </div>
      </section>
      <div class="ld-tle-panel__msg" aria-live="polite"></div>
    `;
    panelEl.querySelector('[data-act="close"]').addEventListener('click', () => panelEl.classList.remove('is-open'));
    panelEl.querySelectorAll('.ld-tle-panel__nav button').forEach((button) => {
      button.addEventListener('click', () => setPanelPane(button.dataset.pane));
    });
    panelEl.querySelector('.ld-tle-panel__q').addEventListener('input', renderPanelList);
    panelEl.querySelector('.ld-tle-panel__filter').addEventListener('change', renderPanelList);
    panelEl.querySelector('[data-act="export"]').addEventListener('click', () => {
      const ta = panelEl.querySelector('.ld-tle-panel__json');
      ta.value = exportMarks();
      ta.select();
      try { navigator.clipboard.writeText(ta.value); showPanelMsg('已导出到文本框（并尝试复制）'); }
      catch (e) { showPanelMsg('已导出到文本框'); }
    });
    panelEl.querySelector('[data-act="import-merge"]').addEventListener('click', () => runImport('merge'));
    panelEl.querySelector('[data-act="import-skip"]').addEventListener('click', () => runImport('skip'));
    panelEl.querySelector('[data-act="import-replace"]').addEventListener('click', () => runImport('replace'));
    panelEl.querySelector('[data-act="dedup"]').addEventListener('click', () => {
      const n = dedupMarks();
      renderPanelList();
      showPanelMsg(n ? `合并了 ${n} 条重复` : '没有重复项');
    });
    panelEl.querySelector('[data-act="reset-all"]').addEventListener('click', () => {
      if (!confirm('彻底清理将删除全部效果、分组、关键词规则和用户标记。分组和关键词将保持为空，此操作不可撤销。建议先导出备份。确定继续？')) return;
      resetAllData();
      const ta = panelEl.querySelector('.ld-tle-panel__json');
      if (ta) ta.value = '';
      showPanelMsg('已彻底清理，恢复默认配置');
    });
    const debugToggle = panelEl.querySelector('.ld-tle-panel__debug');
    debugToggle.checked = isDebugMode();
    debugToggle.addEventListener('change', () => {
      setDebugMode(debugToggle.checked);
      processWithRetries();
    });
    const suspendToggle = panelEl.querySelector('.ld-tle-panel__suspend');
    if (suspendToggle) {
      suspendToggle.checked = isSuspended();
      suspendToggle.addEventListener('change', () => {
        setSuspended(suspendToggle.checked);
        showPanelMsg(suspendToggle.checked ? '已临时关闭所有效果（设置与标记数据已保留）' : '已恢复所有效果');
        processWithRetries();
      });
    }
    panelEl.querySelector('[data-act="add"]').addEventListener('click', () => {
      const input = panelEl.querySelector('.ld-tle-panel__user');
      const user = (input.value || '').trim();
      const level = panelEl.querySelector('.ld-tle-panel__lv').value;
      if (!user) { showPanelMsg('请输入用户名'); return; }
      setMark(user, level);
      input.value = '';
      showPanelMsg(`已标记 @${user.trim().toLowerCase()}`);
    });
    panelEl.querySelector('[data-act="add-cat"]').addEventListener('click', () => {
      const label = (panelEl.querySelector('.ld-tle-panel__cat-label').value || '').trim();
       const effectIds = [...panelEl.querySelectorAll('.ld-tle-panel__cat-effect input:checked')].map((input) => input.value);
       const color = panelEl.querySelector('.ld-tle-panel__cat-color').value;
       const priority = Number(panelEl.querySelector('.ld-tle-panel__cat-priority').value);
       const cat = addCategory(label, effectIds, color, priority);
      if (!cat) { showPanelMsg('效果名无效或已存在'); return; }
      panelEl.querySelector('.ld-tle-panel__cat-label').value = '';
      showPanelMsg(`已添加分类「${cat.label}」`);
    });
    panelEl.querySelector('[data-act="add-tag"]').addEventListener('click', () => {
      const label = (panelEl.querySelector('.ld-tle-panel__tag-label').value || '').trim();
      const color = panelEl.querySelector('.ld-tle-panel__tag-color').value;
      const tag = addTag(label, color);
      if (!tag) { showPanelMsg('标签名无效或已存在'); return; }
      panelEl.querySelector('.ld-tle-panel__tag-label').value = '';
      showPanelMsg(`已添加标签「${tag.label}」`);
    });
    panelEl.querySelector('[data-act="add-keyword"]').addEventListener('click', () => {
      const input = panelEl.querySelector('.ld-tle-panel__keyword');
      const keyword = input.value.trim();
       const effectIds = [...panelEl.querySelectorAll('.ld-tle-panel__keyword-cat input:checked')].map((input) => input.value);
       const color = panelEl.querySelector('.ld-tle-panel__keyword-color').value;
       const priority = Number(panelEl.querySelector('.ld-tle-panel__keyword-priority').value);
       const ignoreCase = panelEl.querySelector('.ld-tle-panel__keyword-ignorecase-input')?.checked !== false;
       if (!keyword || !effectIds.length) { showPanelMsg('请输入关键词并选择效果'); return; }
      if (keywordRules.some((r) => r.keyword.toLowerCase() === keyword.toLowerCase())) {
        showPanelMsg('关键词已存在');
        return;
      }
       keywordRules.push({ id: `rule-${Date.now()}`, keyword, effectIds, color, priority: Number.isFinite(priority) ? priority : 5000, ignoreCase, enabled: true });
      saveKeywordRules();
      input.value = '';
      renderKeywords();
      applyMarks();
      showPanelMsg(`已添加关键词「${keyword}」`);
    });
    document.body.append(panelEl);
     fillCatSelects();
     renderBuiltinRules();
    fillEffectSelects();
    renderCats();
    renderEffects();
    renderTags();
    renderKeywords();
  }

  function renderBuiltinRules() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__builtin');
    if (!box) return;
    box.innerHTML = '';
    DEFAULT_EFFECTS.filter((effect) => !EFFECT_LIBRARY_IDS.has(effect.id)).forEach((effect) => {
      const savedEffect = getEffect(effect.id) || effect;
      const row = document.createElement('label');
      row.className = 'ld-tle-panel__builtin-row';
       const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = getEffect(effect.id)?.enabled !== false;
      enabled.addEventListener('change', () => toggleEffect(effect.id, enabled.checked));
      const name = document.createElement('span');
      name.textContent = effect.label;
      const hint = document.createElement('small');
      hint.textContent = effect.hint;
      const priority = document.createElement('input');
      priority.type = 'number';
       priority.value = savedEffect.priority ?? effect.priority ?? 0;
      priority.title = '规则优先级';
      priority.addEventListener('change', () => {
        const value = Number(priority.value);
        const saved = getEffect(effect.id);
        if (saved && Number.isFinite(value)) saved.priority = value;
        saveEffects();
        applyMarks();
      });
      row.append(enabled, name, hint, priority);
      box.append(row);
    });
  }

  function slugify(label) {
    const ascii = String(label || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (ascii) return ascii.slice(0, 24);
    let h = 0;
    for (let i = 0; i < label.length; i++) h = ((h << 5) - h + label.charCodeAt(i)) | 0;
    return 'cat-' + (h >>> 0).toString(36);
  }

  function updateGroup(id, patch) {
    const group = cats.find((cat) => cat.id === id);
    if (!group) return;
    if (patch.label != null && String(patch.label).trim()) group.label = String(patch.label).trim();
    if (patch.effectIds) group.effectIds = libraryEffectIds(patch.effectIds).filter((effectId) => getEffect(effectId));
    if (patch.color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(patch.color)) group.color = patch.color;
    if (patch.priority != null && Number.isFinite(Number(patch.priority))) group.priority = Number(patch.priority);
    saveCats();
    fillCatSelects();
    renderCats();
    applyMarks();
  }

  function addCategory(label, effectIds, color, priority) {
    const name = String(label || '').trim();
    if (!name) return null;
    if (cats.some((c) => c.label === name)) return null;
    let id = slugify(name);
    if (getCat(id)) {
      let n = 2;
      while (getCat(id + '-' + n)) n++;
      id = id + '-' + n;
    }
    const ids = libraryEffectIds(effectIds).filter((effectId) => getEffect(effectId));
    const cat = normalizeCat({ id, label: name, color, priority, effectIds: ids.length ? ids : ['left-highlight'] });
    if (!cat) return null;
    cats.push(cat);
    saveCats();
    fillCatSelects();
    renderCats();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
    return cat;
  }

  function removeCategory(id) {
    cats = cats.filter((group) => group.id !== id);
    saveCats();
    renderCats();
  }

  function fillCatSelects() {
    if (!panelEl) return;
    const filter = panelEl.querySelector('.ld-tle-panel__filter');
    const addSel = panelEl.querySelector('.ld-tle-panel__lv');
    const keywordSel = panelEl.querySelector('.ld-tle-panel__keyword-cat');
    const groupSel = panelEl.querySelector('.ld-tle-panel__cat-effect');
    const keepFilter = filter.value;
    const markValues = Object.values(marks);
    const groupCounts = new Map(cats.map((c) => [c.id, markValues.filter((mark) => (mark.groups || []).some((group) => group.id === c.id)).length]));
    filter.innerHTML = `<option value="">全部效果（${markValues.length}）</option>`;
    addSel.innerHTML = '';
    if (keywordSel) keywordSel.innerHTML = '';
    if (groupSel) groupSel.innerHTML = '';
    cats.forEach((c) => {
      const a = document.createElement('option');
      a.value = c.id;
      a.textContent = c.label;
      const f = document.createElement('option');
      f.value = c.id;
      f.textContent = `${c.label}（${groupCounts.get(c.id) || 0}）`;
      filter.append(f);
      addSel.append(a);
    });
    effects.filter((c) => EFFECT_LIBRARY_IDS.has(c.id)).forEach((c) => {
      const a = document.createElement('option');
      a.value = c.id;
      a.textContent = c.label;
      [keywordSel, groupSel].forEach((container) => {
        if (!container) return;
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = c.id;
        label.append(input, document.createTextNode(c.label));
        container.append(label);
      });
    });
    if ([...filter.options].some((o) => o.value === keepFilter)) filter.value = keepFilter;
  }

  function fillEffectSelects() {
    fillCatSelects();
  }

  function renderEffects() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__effects');
    if (!box) return;
    box.innerHTML = '';
    effects.filter((effect) => EFFECT_LIBRARY_IDS.has(effect.id)).forEach((effect) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__effect-row';
      const swatch = document.createElement('span');
      swatch.className = 'ld-tle-panel__effect-swatch';
      swatch.style.background = effect.color;
      const label = document.createElement('strong');
      label.textContent = effect.label;
      const kind = document.createElement('span');
       kind.textContent = effect.kind === 'color' ? '左侧高亮' : effect.kind === 'tag' ? '关键词/tag 高亮' : effect.kind === 'fade' ? '淡化' : effect.kind === 'strike' ? '删除线' : effect.kind === 'mosaic' ? '马赛克模糊' : effect.kind === 'badge' ? '提示标记' : '无';
       const hint = document.createElement('small');
      hint.textContent = effect.hint;
      row.append(swatch, label, kind, hint);
      box.append(row);
    });
  }

  function toggleEffect(id, enabled) {
    const effect = getEffect(id);
    if (!effect) return;
    effect.enabled = enabled;
    saveEffects();
    updateMarkStyles();
    applyMarks();
    renderBuiltinRules();
  }

  function renderKeywords() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__keywords');
    if (!box) return;
    box.innerHTML = '';
    if (!keywordRules.length) {
      box.innerHTML = '<div class="ld-tle-panel__empty">暂无关键词规则</div>';
      return;
    }
    keywordRules.forEach((rule) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__keyword-row';
       const word = document.createElement('input');
       word.type = 'text';
       word.className = 'ld-tle-panel__keyword-word';
       word.value = rule.keyword;
       const select = document.createElement('div');
       select.className = 'ld-tle-panel__effect-choices';
       effects.filter((cat) => EFFECT_LIBRARY_IDS.has(cat.id)).forEach((cat) => {
         const choice = document.createElement('label');
         const option = document.createElement('input');
         option.type = 'checkbox';
         option.value = cat.id;
         option.checked = (rule.effectIds || []).includes(cat.id);
         choice.append(option, document.createTextNode(cat.label));
         select.append(choice);
       });
       const enabled = document.createElement('input');
       enabled.type = 'checkbox';
       enabled.className = 'ld-tle-panel__keyword-enabled';
      enabled.checked = rule.enabled;
      enabled.title = '启用规则';
       const up = document.createElement('button');
       up.type = 'button';
       up.className = 'ld-tle-panel__keyword-up';
      up.textContent = '↑';
      up.title = '提高优先级';
       const down = document.createElement('button');
       down.type = 'button';
       down.className = 'ld-tle-panel__keyword-down';
      down.textContent = '↓';
      down.title = '降低优先级';
       const del = document.createElement('button');
       del.type = 'button';
       del.className = 'ld-tle-panel__keyword-delete';
      del.textContent = '删';
      word.addEventListener('change', () => {
        const value = word.value.trim();
        if (!value) {
          keywordRules = keywordRules.filter((r) => r.id !== rule.id);
          saveKeywordRules();
          renderKeywords();
        } else if (!keywordRules.some((r) => r.id !== rule.id && r.keyword.toLowerCase() === value.toLowerCase())) {
          rule.keyword = value;
          saveKeywordRules();
          applyMarks();
        } else {
          word.value = rule.keyword;
        }
      });
       select.addEventListener('change', () => { rule.effectIds = [...select.querySelectorAll('input:checked')].map((option) => option.value); saveKeywordRules(); applyMarks(); });
       const color = document.createElement('input');
       color.type = 'color';
       color.className = 'ld-tle-panel__keyword-color-input';
       color.value = rule.color || '#0969da';
       color.title = '颜色标记颜色';
       color.addEventListener('change', () => { rule.color = color.value; saveKeywordRules(); applyMarks(); });
       const priority = document.createElement('input');
       priority.type = 'number';
       priority.className = 'ld-tle-panel__keyword-priority-input';
       priority.value = rule.priority ?? 5000;
       priority.title = '关键词优先级';
       priority.addEventListener('change', () => { rule.priority = Number(priority.value) || 0; saveKeywordRules(); applyMarks(); });
      enabled.addEventListener('change', () => { rule.enabled = enabled.checked; saveKeywordRules(); applyMarks(); });
       const ignoreCase = document.createElement('label');
       ignoreCase.className = 'ld-tle-panel__keyword-ignorecase';
       ignoreCase.title = '忽略大小写：关闭后需大小写完全一致';
       const ignoreCaseInput = document.createElement('input');
       ignoreCaseInput.type = 'checkbox';
       ignoreCaseInput.className = 'ld-tle-panel__keyword-ignorecase-input';
       ignoreCaseInput.checked = rule.ignoreCase !== false;
       ignoreCaseInput.addEventListener('change', () => { rule.ignoreCase = ignoreCaseInput.checked; saveKeywordRules(); applyMarks(); });
       ignoreCase.append(ignoreCaseInput, document.createTextNode('Aa'));
       up.addEventListener('click', () => moveKeywordRule(rule.id, -1));
       down.addEventListener('click', () => moveKeywordRule(rule.id, 1));
       const dup = document.createElement('button');
       dup.type = 'button';
       dup.className = 'ld-tle-panel__keyword-copy';
       dup.textContent = '复';
       dup.title = '复制规则';
       dup.addEventListener('click', () => duplicateKeywordRule(rule.id));
       del.addEventListener('click', () => { keywordRules = keywordRules.filter((r) => r.id !== rule.id); saveKeywordRules(); renderKeywords(); applyMarks(); });
        row.append(word, ignoreCase, select, color, priority, enabled, up, down, dup, del);
      box.append(row);
    });
  }

  function uniqueId(label, exists) {
    let id = slugify(label);
    if (!exists(id)) return id;
    let n = 2;
    while (exists(id + '-' + n)) n++;
    return id + '-' + n;
  }

  function addTag(label, color) {
    const name = String(label || '').trim();
    if (!name) return null;
    if (tags.some((t) => t.label === name)) return null;
    const tag = normalizeTag({ id: uniqueId(name, (id) => !!getTag(id)), label: name, color });
    if (!tag) return null;
    tags.push(tag);
    saveTags();
    updateMarkStyles();
    renderTags();
    applyMarks();
    return tag;
  }

  function updateTag(id, patch) {
    const tag = getTag(id);
    if (!tag) return;
    if (patch.label != null) {
      const label = String(patch.label).trim();
      if (label) tag.label = label;
    }
    if (patch.color) tag.color = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(patch.color) ? patch.color : tag.color;
    saveTags();
    updateMarkStyles();
    renderTags();
    applyMarks();
  }

  function removeTag(id) {
    tags = tags.filter((t) => t.id !== id);
    Object.keys(marks).forEach((user) => {
      if (marks[user].tags) marks[user].tags = marks[user].tags.filter((t) => t !== id);
    });
    saveTags();
    saveMarks();
    updateMarkStyles();
    renderTags();
    applyMarks();
    if (panelEl && panelEl.classList.contains('is-open')) renderPanelList();
  }

  function renderTags() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__tags');
    if (!box) return;
     box.innerHTML = '';
    if (!tags.length) {
      box.innerHTML = '<div class="ld-tle-panel__empty">暂无子标签</div>';
      return;
    }
    tags.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__cat';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = /^#([0-9a-f]{6})$/i.test(t.color) ? t.color : '#8250df';
      const label = document.createElement('input');
      label.type = 'text';
      label.value = t.label;
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '删';
      color.addEventListener('change', () => updateTag(t.id, { color: color.value }));
      label.addEventListener('change', () => updateTag(t.id, { label: label.value }));
      del.addEventListener('click', () => removeTag(t.id));
      row.append(color, label, del);
      box.append(row);
    });
  }

  function renderCats() {
    if (!panelEl) return;
    const box = panelEl.querySelector('.ld-tle-panel__cats');
    box.innerHTML = '';
    cats.forEach((c) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__cat';
       const label = document.createElement('input');
       label.type = 'text';
       label.className = 'ld-tle-panel__cat-label-input';
       label.value = c.label;
       const effect = document.createElement('div');
       effect.className = 'ld-tle-panel__effect-choices';
       effects.filter((item) => EFFECT_LIBRARY_IDS.has(item.id)).forEach((item) => {
         const choice = document.createElement('label');
         const option = document.createElement('input');
         option.type = 'checkbox';
         option.value = item.id;
         option.checked = (c.effectIds || []).includes(item.id);
         choice.append(option, document.createTextNode(item.label));
         effect.append(choice);
       });
       const color = document.createElement('input');
       color.type = 'color';
       color.className = 'ld-tle-panel__cat-color-input';
       color.value = c.color || (boundEffects(c.effectIds)[0] || {}).color || '#0969da';
       color.title = '分组颜色';
       const priority = document.createElement('input');
       priority.type = 'number';
       priority.className = 'ld-tle-panel__cat-priority-input';
       priority.value = c.priority ?? 10000;
       priority.title = '分组优先级';
        const up = document.createElement('button');
        up.type = 'button';
        up.className = 'ld-tle-panel__cat-up';
        up.textContent = '↑';
        up.title = '上移';
        const down = document.createElement('button');
        down.type = 'button';
        down.className = 'ld-tle-panel__cat-down';
        down.textContent = '↓';
        down.title = '下移';
        const dup = document.createElement('button');
        dup.type = 'button';
        dup.className = 'ld-tle-panel__cat-copy';
        dup.textContent = '复';
        dup.title = '复制分组';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'ld-tle-panel__cat-delete';
       del.textContent = '删';
       label.addEventListener('change', () => updateGroup(c.id, { label: label.value }));
        effect.addEventListener('change', () => updateGroup(c.id, { effectIds: [...effect.querySelectorAll('input:checked')].map((option) => option.value) }));
        color.addEventListener('change', () => updateGroup(c.id, { color: color.value }));
        priority.addEventListener('change', () => updateGroup(c.id, { priority: priority.value }));
        up.addEventListener('click', () => moveCategory(c.id, -1));
        down.addEventListener('click', () => moveCategory(c.id, 1));
        dup.addEventListener('click', () => duplicateCategory(c.id));
       del.addEventListener('click', () => removeCategory(c.id));
        row.append(label, effect, color, priority, up, down, dup, del);
      box.append(row);
    });
  }

  function runImport(mode) {
    const ta = panelEl.querySelector('.ld-tle-panel__json');
    try {
      const { parsed, importedEffects, importedCats, importedTags, importedRules } = parseImport(ta.value);
      if (!parsed.length && !importedEffects.length && !importedCats.length && !importedTags.length && !importedRules.length) {
        showPanelMsg('没有可导入的数据');
        return;
      }
      const r = mergeImported(parsed, importedEffects, importedCats, importedTags, importedRules, mode);
      renderPanelList();
      showPanelMsg(`新增 ${r.added}，更新 ${r.updated}，跳过 ${r.skipped}`);
    } catch (e) {
      showPanelMsg(e && e.message === 'Invalid export' ? '不是有效的脚本备份数据' : 'JSON 无法解析');
    }
  }

  function showPanelMsg(text) {
    const el = panelEl.querySelector('.ld-tle-panel__msg');
    el.textContent = text;
  }

  function renderPanelList() {
    if (!panelEl) return;
    const q = (panelEl.querySelector('.ld-tle-panel__q').value || '').trim().toLowerCase();
      const filter = panelEl.querySelector('.ld-tle-panel__filter').value;
    const list = panelEl.querySelector('.ld-tle-panel__list');
    panelEl.scrollLeft = 0;
    list.scrollLeft = 0;
    panelEl.querySelector('.ld-tle-panel__stat-users').textContent = Object.keys(marks).length;
    panelEl.querySelector('.ld-tle-panel__stat-cats').textContent = effects.length;
    panelEl.querySelector('.ld-tle-panel__stat-tags').textContent = tags.length;
    const entries = Object.entries(marks)
      .filter(([user, info]) => {
          if (filter && !(info.groups || []).some((group) => group.id === filter)) return false;
        if (!q) return true;
        return user.includes(q) || (info.note || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    panelEl.querySelector('.ld-tle-panel__count').textContent = `${entries.length} / ${Object.keys(marks).length}`;
    list.innerHTML = '';
    if (!entries.length) {
      list.innerHTML = '<div class="ld-tle-panel__empty">暂无标记</div>';
      return;
    }
    entries.forEach(([user, info]) => {
      const row = document.createElement('div');
      row.className = 'ld-tle-panel__row';
      row.innerHTML = `
        <a href="/u/${encodeURIComponent(user)}" target="_blank" rel="noopener">@${user}</a>
        <div class="ld-tle-panel__row-tags"></div>
        <button type="button" data-act="del">删</button>
      `;
       const tagBox = row.querySelector('.ld-tle-panel__row-tags');
       const noteValue = info.note || '';
       const selectedGroups = info.groups || [];
       const selectedGroupIds = new Set(selectedGroups.map((group) => group.id));
       selectedGroups.forEach((binding) => {
         const group = getCat(binding.id);
         if (!group) return;
         const tagWrap = document.createElement('span');
         tagWrap.className = 'ld-tle-panel__row-group-tag-wrap';
         const tagButton = document.createElement('button');
         tagButton.type = 'button';
         tagButton.className = 'ld-tle-panel__row-tag is-on ld-tle-panel__row-group-tag';
         tagButton.textContent = group.label;
          tagButton.title = binding.reason || '点击编辑绑定原因';
          tagButton.addEventListener('click', () => {
            const reason = window.prompt(`编辑「${group.label}」的绑定原因`, binding.reason || '');
           if (reason == null) return;
           const nextGroups = selectedGroups.map((item) => item.id === group.id ? { ...item, reason } : item);
             setMarkGroups(user, nextGroups, noteValue);
            renderPanelList();
          });
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'ld-tle-panel__row-group-remove';
          remove.textContent = '×';
          remove.title = `移除「${group.label}」分组标签`;
          remove.setAttribute('aria-label', remove.title);
          remove.addEventListener('click', () => {
            const nextGroups = selectedGroups.filter((item) => item.id !== group.id);
            if (!nextGroups.length) {
              setMark(user, null);
            } else {
              setMarkGroups(user, nextGroups, noteValue);
            }
            renderPanelList();
          });
          tagWrap.append(tagButton, remove);
          tagBox.append(tagWrap);
        });
        if (selectedGroups.length) {
          const pickerBreak = document.createElement('span');
          pickerBreak.className = 'ld-tle-panel__row-tag-picker-break';
          tagBox.append(pickerBreak);
        }
        const picker = document.createElement('select');
       picker.className = 'ld-tle-panel__row-tag-picker';
       const empty = document.createElement('option');
       empty.value = '';
       empty.textContent = '添加已有分组标签';
       picker.append(empty);
       cats.filter((group) => !selectedGroupIds.has(group.id)).forEach((group) => {
         const option = document.createElement('option');
         option.value = group.id;
         option.textContent = group.label;
         picker.append(option);
       });
       picker.addEventListener('change', () => {
           const group = getCat(picker.value);
           if (!group) return;
             const reason = window.prompt(`请输入「${group.label}」的绑定备注`, '');
             const nextGroups = [...selectedGroups, { id: group.id, reason: reason || '' }];
             setMarkGroups(user, nextGroups, noteValue);
            renderPanelList();
        });
        tagBox.append(picker);
       row.querySelector('[data-act="del"]').addEventListener('click', () => {
        setMark(user, null);
        renderPanelList();
      });
      list.append(row);
    });
  }

  function parseLevel(text) {
    text = (text || '').trim();
    if (!text) return null;
    let m = text.match(/^(.+?)[,，]\s*Lv\s*(\d+)\s*$/i);
    if (m && m[1].trim()) return { name: m[1].trim(), level: Number(m[2]) };
    m = text.match(/\bLv\s*(\d+)\b/i);
    if (m) {
      const level = Number(m[1]);
      const name = text.replace(/\s*[,，]?\s*Lv\s*\d+\s*/i, '').trim();
      if (name && level >= 0 && level <= 4) return { name, level };
    }
    return null;
  }

  function enhanceBadge(nameEl) {
    const chip = nameEl.querySelector(':scope > .' + CHIP_CLASS);
    const sourceText = [...nameEl.childNodes]
      .filter((node) => node !== chip)
      .map((node) => node.textContent || '')
      .join(' ')
      .trim();
    const chipLevel = chip && [...chip.classList]
      .map((className) => className.match(new RegExp(`^${CHIP_CLASS}--(\\d)$`)))
      .find(Boolean)?.[1];
    const parsed = parseLevel(sourceText) || (chipLevel != null
      ? { name: sourceText, level: Number(chipLevel) }
      : null);
    const row = nameEl.closest('tr.topic-list-item');
    const td = row && row.querySelector('td.main-link');
    if (td) {
      td.classList.remove(ROW_CLASS, `${ROW_CLASS}--0`, `${ROW_CLASS}--1`, `${ROW_CLASS}--2`, `${ROW_CLASS}--3`, `${ROW_CLASS}--4`);
    }
    if (td && parsed) {
      td.classList.add(ROW_CLASS, `${ROW_CLASS}--${parsed.level}`);
    }
    if (!parsed) {
      chip?.remove();
      return;
    }

    const { name, level } = parsed;
    const currentName = [...nameEl.childNodes]
      .filter((node) => node !== chip)
      .map((node) => node.textContent || '')
      .join(' ')
      .trim();
    let nextChip = chip;
    if (currentName !== name) {
      nameEl.textContent = name;
      nextChip = null;
    }
    if (!nextChip) {
      nextChip = document.createElement('span');
      nameEl.append(nextChip);
    }
    const chipClass = `${CHIP_CLASS} ${CHIP_CLASS}--${level}`;
    if (nextChip.className !== chipClass) nextChip.className = chipClass;
    if (nextChip.textContent !== `Lv${level}`) nextChip.textContent = `Lv${level}`;
    if (nextChip.title !== `信任等级 ${level}`) nextChip.title = `信任等级 ${level}`;
  }

  function enhanceWelfareBadge() {
    document.querySelectorAll('a.badge-category__wrapper[href*="/c/welfare/"]').forEach((wrapper) => {
      const badge = wrapper.querySelector('.badge-category');
      if (badge && !badge.classList.contains(WELFARE_BADGE_CLASS)) {
        badge.classList.add(WELFARE_BADGE_CLASS);
      }
    });
    document.querySelectorAll('.' + WELFARE_BADGE_CLASS).forEach((badge) => {
      if (!badge.closest('a.badge-category__wrapper[href*="/c/welfare/"]')) badge.classList.remove(WELFARE_BADGE_CLASS);
    });
  }

  function weakenPromoRows() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const tagNames = [...row.querySelectorAll('a.discourse-tag[data-tag-name]')]
        .map((a) => a.getAttribute('data-tag-name'));
      const isPromo = PROMO_TAGS.some((t) => tagNames.includes(t));
      const isLottery = LOTTERY_TAGS.some((t) => tagNames.includes(t));
      row.classList.toggle(PROMO_CLASS, isPromo);
      row.classList.toggle(LOTTERY_CLASS, isLottery && !isPromo);
    });
  }

  function markLonelyTopics() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const postersTd = row.querySelector('td.posters');
      if (!postersTd) {
        row.classList.remove(LONELY_CLASS);
        return;
      }
      const usernames = [...postersTd.querySelectorAll('a[data-user-card]')]
        .map((a) => a.getAttribute('data-user-card'));
      const unique = [...new Set(usernames)].filter(Boolean);
      if (unique.length === 0) {
        row.classList.remove(LONELY_CLASS);
        return;
      }
      const isLonely = unique.length === 1;
      if (isLonely) {
        if (!row.classList.contains(LONELY_CLASS)) row.classList.add(LONELY_CLASS);
      } else {
        if (row.classList.contains(LONELY_CLASS)) row.classList.remove(LONELY_CLASS);
      }
    });
  }

  function markStaleTopics() {
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const activityTd = row.querySelector('td.activity');
      if (!activityTd) {
        row.classList.remove(STALE_CLASS);
        return;
      }
      const created = parseCreatedDate(activityTd.getAttribute('title') || '');
      if (!created) {
        row.classList.remove(STALE_CLASS);
        return;
      }
      const m = created.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
      if (!m) {
        row.classList.remove(STALE_CLASS);
        return;
      }
      const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0).getTime();
      if (isNaN(ts)) {
        row.classList.remove(STALE_CLASS);
        return;
      }
      const isStale = now - ts > WEEK_MS;
      if (isStale) {
        if (!row.classList.contains(STALE_CLASS)) row.classList.add(STALE_CLASS);
      } else {
        if (row.classList.contains(STALE_CLASS)) row.classList.remove(STALE_CLASS);
      }
    });
  }

  function parseCreatedDate(title) {
    if (!title) return null;
    const m = title.match(/创建日期[：:]\s*(.+?)(?:\n|$)/);
    return m ? m[1].trim() : null;
  }

  function formatCreated(raw) {
    const m = raw.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return { text: raw, tier: 'old' };
    const ts = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m[4] ? Number(m[4]) : 0, m[5] ? Number(m[5]) : 0).getTime();
    if (isNaN(ts)) return { text: raw, tier: 'old' };
    const now = Date.now();
    const diff = now - ts;
    const DAY = 24 * 60 * 60 * 1000;
    const WEEK = 7 * DAY;
    if (diff < DAY) {
      const hours = Math.max(1, Math.floor(diff / (60 * 60 * 1000)));
      return { text: `${hours}小时内`, tier: 'fresh' };
    }
    if (diff < WEEK) {
      const days = Math.floor(diff / DAY);
      return { text: `${days}天内`, tier: 'week' };
    }
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    const md = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return d.getFullYear() === new Date().getFullYear()
      ? { text: md, tier: 'old' }
      : { text: `${d.getFullYear()}-${md}`, tier: 'old' };
  }

  function isDebugMode() {
    try { return localStorage.getItem(DEBUG_KEY) === '1'; } catch (e) { return false; }
  }

  function setDebugMode(on) {
    try {
      if (on) localStorage.setItem(DEBUG_KEY, '1');
      else localStorage.removeItem(DEBUG_KEY);
    } catch (e) { /* ignore */ }
  }

  function isSuspended() {
    try { return localStorage.getItem(SUSPEND_KEY) === '1'; } catch (e) { return false; }
  }

  function setSuspended(on) {
    try {
      if (on) localStorage.setItem(SUSPEND_KEY, '1');
      else localStorage.removeItem(SUSPEND_KEY);
    } catch (e) { /* ignore */ }
    document.documentElement.classList.toggle(SUSPEND_CLASS, !!on);
    updateFabState();
    if (on) {
      clearEffectState();
      suspendCleared = true;
    } else {
      suspendCleared = false;
    }
  }

  // Remove every class/inline-style based effect. Injected nodes (chips, time
  // labels, badges, jump links, mark buttons) are preserved and hidden by CSS so
  // that re-enabling restores them without losing parsed data such as levels.
  function clearEffectState() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      row.classList.remove(PROMO_CLASS, LOTTERY_CLASS, LONELY_CLASS, STALE_CLASS, 'ld-tle-welfare-only');
      [...row.classList].filter((name) => name.startsWith(EFFECT_CLASS + '--')).forEach((name) => row.classList.remove(name));
      row.style.removeProperty('--ld-tle-effect-color');
      row.style.removeProperty('--ld-tle-tag-color');
      row.querySelectorAll('.ld-tle-keyword-match').forEach((el) => {
        el.classList.remove('ld-tle-keyword-match');
        el.style.removeProperty('--ld-tle-tag-color');
      });
      delete row.__ldTleDebug;
    });
    document.querySelectorAll('td.' + ROW_CLASS).forEach((td) => {
      [...td.classList].filter((name) => name === ROW_CLASS || name.startsWith(ROW_CLASS + '--')).forEach((name) => td.classList.remove(name));
    });
    document.querySelectorAll('img.ld-tle-op, img.ld-tle-other').forEach((img) => {
      [...img.classList].filter((name) => name === 'ld-tle-op' || name === 'ld-tle-other' || /^ld-tle-op--\d$/.test(name)).forEach((name) => img.classList.remove(name));
    });
    document.querySelectorAll('article.' + OP_POST_CLASS).forEach((el) => el.classList.remove(OP_POST_CLASS));
    document.querySelectorAll('.discourse-boosts__list .discourse-boosts__bubble').forEach((bubble) => {
      bubble.classList.remove(BOOST_MARK_CLASS);
      bubble.removeAttribute('data-ld-tle-boost-title');
      const avatar = bubble.querySelector('a[data-user-card] img.avatar');
      if (!avatar) return;
      avatar.classList.remove(BOOST_MARK_CLASS);
      avatar.style.removeProperty('--ld-tle-boost-color');
      if (avatar.dataset.ldTleBoostTitle) {
        avatar.title = avatar.dataset.ldTleBoostTitle;
        delete avatar.dataset.ldTleBoostTitle;
      }
    });
  }

  function debugPriorityTitle(row, created) {
    const lines = [`发帖于 ${created}`, '── 优先级应用关系 ──'];
    const info = row && row.__ldTleDebug;
    const candidates = (info && info.candidates) || [];
    if (!candidates.length) return `${lines[0]}\n无候选效果`;
    const colorWinnerId = info.colorWinner ? `${info.colorWinner.id}:${info.colorWinner.kind}` : null;
    const tagWinnerId = info.tagWinner ? `${info.tagWinner.id}:${info.tagWinner.kind}` : null;
    (info.applied || []).forEach((effect) => {
      const notes = [];
      if (`${effect.id}:${effect.kind}` === colorWinnerId) notes.push('行颜色');
      if (`${effect.id}:${effect.kind}` === tagWinnerId) notes.push('tag颜色');
      lines.push(`[${effect.priority ?? 0}] ${effect.source || '未知来源'} → ${effect.label}（${effect.kind}）${notes.length ? ` ★${notes.join('+')}` : ''}`);
    });
    candidates.filter((effect) => effect && effect.enabled === false).forEach((effect) => {
      lines.push(`[${effect.priority ?? 0}] ${effect.source || '未知来源'} → ${effect.label}（${effect.kind}）✗已禁用`);
    });
    return lines.join('\n');
  }

  function injectTimes() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const activityTd = row.querySelector('td.activity');
      if (!activityTd) return;
      const created = parseCreatedDate(activityTd.getAttribute('title') || '');
      const existing = activityTd.querySelector(':scope > .' + TIME_CLASS);
      if (!created) {
        existing?.remove();
        return;
      }
      const link = activityTd.querySelector('.post-activity');
      if (!link) {
        existing?.remove();
        return;
      }
      const { text, tier } = formatCreated(created);
      let chip = existing;
      if (!chip) {
        chip = document.createElement('span');
      }
      if (chip.previousElementSibling !== link) link.insertAdjacentElement('afterend', chip);
      chip.className = tier === 'old' ? TIME_CLASS : `${TIME_CLASS} ${TIME_CLASS}--${tier}`;
      chip.textContent = text;
      chip.title = isDebugMode() ? debugPriorityTitle(row, created) : `发帖于 ${created}`;
    });
  }

  function enhancePosters() {
    document.querySelectorAll('tr.topic-list-item').forEach((row) => {
      const postersTd = row.querySelector('td.posters');
      if (!postersTd) return;
      const imgs = [...postersTd.querySelectorAll('a > img.avatar')];
      imgs.forEach((img) => {
        img.classList.remove('ld-tle-op', 'ld-tle-other', 'ld-tle-op--0', 'ld-tle-op--1', 'ld-tle-op--2', 'ld-tle-op--3', 'ld-tle-op--4');
      });
      if (!imgs.length) return;
      const opImg = imgs.find((img) => /原始发帖人/.test(img.getAttribute('title') || '')) || imgs[0];
      opImg.classList.add('ld-tle-op');
      imgs.forEach((img) => { if (img !== opImg) img.classList.add('ld-tle-other'); });
      const mainTd = row.querySelector('td.main-link');
      const levelClass = mainTd && [...mainTd.classList].find((c) => /^ld-tle-row--\d$/.test(c));
      if (levelClass) opImg.classList.add(levelClass.replace('ld-tle-row', 'ld-tle-op'));
    });
  }

  function currentTopicId() {
    const m = location.pathname.match(/^\/t\/[^/]+\/(\d+)/);
    return m ? m[1] : null;
  }

  function getOpUserId() {
    const tid = currentTopicId();
    if (tid !== null && tid === cachedTopicId && opUserId !== null) return opUserId;
    cachedTopicId = tid;
    opUserId = null;
    if (tid) {
      const preloaded = document.getElementById('data-preloaded');
      if (preloaded) {
        try {
          const data = JSON.parse(preloaded.textContent);
          const key = `topic_${tid}`;
          if (data[key]) {
            const t = JSON.parse(data[key]);
            if (t && t.user_id != null) { opUserId = String(t.user_id); return opUserId; }
          }
        } catch (e) { /* fall through */ }
      }
    }
    const post1 = document.querySelector('article#post_1[data-user-id]');
    if (post1) opUserId = post1.getAttribute('data-user-id');
    return opUserId;
  }

  function enhanceOpPosts() {
    document.querySelectorAll('article[id^="post_"]').forEach((post) => post.classList.remove(OP_POST_CLASS));
    const opId = getOpUserId();
    if (!opId) return;
    document.querySelectorAll('article[id^="post_"]').forEach((post) => {
      if (post.getAttribute('data-user-id') !== opId) return;
      post.classList.add(OP_POST_CLASS);
    });
  }

  function addReplyJumpLinks() {
    document.querySelectorAll('article[id^="post_"]').forEach((post) => {
      const replyToTab = post.querySelector('.post-infos .reply-to-tab');
      if (!replyToTab || replyToTab.previousElementSibling?.classList.contains(JUMP_CLASS)) return;
      const btn = document.createElement('a');
      btn.className = `${JUMP_CLASS} post-info arrow`;
      btn.href = '#';
      btn.title = '跳到被回复的帖子';
      btn.innerHTML = '<svg class="fa d-icon d-icon-arrow-up svg-icon fa-width-auto svg-string" width="1em" height="1em" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><use href="#arrow-up"></use></svg> 跳转';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.dataset.ldTleJumping === '1') return;
        btn.dataset.ldTleJumping = '1';
        const jump = () => {
          const link = post.querySelector('.post__embedded-posts--top .post-link-arrow a');
          if (link) { link.click(); return true; }
          return false;
        };
        if (jump()) return;
        replyToTab.setAttribute('aria-expanded', 'true');
        replyToTab.click();
        let tries = 0;
        const check = setInterval(() => {
          tries++;
          if (jump()) { clearInterval(check); btn.dataset.ldTleJumping = '0'; }
          else if (tries > 25) { clearInterval(check); btn.dataset.ldTleJumping = '0'; }
        }, 200);
      }, true);
      replyToTab.insertAdjacentElement('beforebegin', btn);
    });
  }

  function processPage() {
    mutationObserver?.disconnect();
    try {
      const suspended = isSuspended();
      document.documentElement.classList.toggle(SUSPEND_CLASS, suspended);
      addStyles();
      ensureFab();
      if (suspended) {
        if (!suspendCleared) {
          clearEffectState();
          suspendCleared = true;
        }
        return;
      }
      suspendCleared = false;
      document.querySelectorAll(NAME_SEL).forEach(enhanceBadge);
      enhanceWelfareBadge();
      weakenPromoRows();
      markLonelyTopics();
      markStaleTopics();
      injectTimes();
      enhancePosters();
      enhanceOpPosts();
      addReplyJumpLinks();
      applyMarks();
    } finally {
      if (!isSuspended()) observeDocument();
    }
  }

  let processingScheduled = false;
  let retryTimer;
  let scrollRefreshTimer;
  let mutationRefreshTimer;
  let mutationObserver;

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
    const delays = [150, 600, 2000, 5000];
    let index = 0;
    const retry = () => {
      scheduleProcessing();
      if (index < delays.length) retryTimer = setTimeout(retry, delays[index++]);
    };
    retryTimer = setTimeout(retry, delays[index++]);
  }

  function scheduleScrollRefresh() {
    clearTimeout(scrollRefreshTimer);
    scrollRefreshTimer = setTimeout(processWithRetries, 80);
    scheduleProcessing();
  }

  function scheduleMutationRefresh() {
    scheduleProcessing();
    clearTimeout(mutationRefreshTimer);
    mutationRefreshTimer = setTimeout(processWithRetries, 120);
  }

  function observeDocument() {
    mutationObserver?.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'href', 'title', 'data-user-card', 'data-username', 'data-tag-name', 'aria-expanded'],
    });
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .${CHIP_CLASS} {
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        padding: 0 6px;
        border-radius: 999px;
        font: 700 10px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        letter-spacing: .03em;
        vertical-align: 1px;
      }
      .${CHIP_CLASS}--0 { color: #fff; background: #8a9199; }
      .${CHIP_CLASS}--1 { color: #fff; background: #0969da; }
      .${CHIP_CLASS}--2 { color: #fff; background: #1a7f37; }
      .${CHIP_CLASS}--3 { color: #24292f; background: #d4a72c; }
      .${CHIP_CLASS}--4 { color: #fff; background: #8250df; }
      td.${ROW_CLASS} { --ld-tle-lv: transparent; box-shadow: inset 3px 0 0 0 var(--ld-tle-lv) !important; }
      td.${ROW_CLASS}--0 { --ld-tle-lv: #8a9199; }
      td.${ROW_CLASS}--1 { --ld-tle-lv: #0969da; }
      td.${ROW_CLASS}--2 { --ld-tle-lv: #1a7f37; }
      td.${ROW_CLASS}--3 { --ld-tle-lv: #d4a72c; }
      td.${ROW_CLASS}--4 { --ld-tle-lv: #8250df; }
      tr.topic-list-item td {
        transition: opacity .15s ease, filter .15s ease, background .15s ease;
      }
      tr.${STALE_CLASS} td {
        opacity: .62;
        filter: grayscale(.35);
      }
      tr.${STALE_CLASS}:hover td {
        opacity: .92;
        filter: none;
      }
      img.ld-tle-op {
        box-shadow: 0 0 0 2px #8a9199 !important;
        transition: box-shadow .15s ease;
      }
      img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #0969da !important; }
      img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #1a7f37 !important; }
      img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #d4a72c !important; }
      img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8250df !important; }
      img.ld-tle-other {
        opacity: .4 !important;
        filter: grayscale(.6) !important;
        transition: opacity .15s ease, filter .15s ease;
      }
      tr.topic-list-item:hover img.ld-tle-other {
        opacity: .85 !important;
        filter: none !important;
      }
      article.${OP_POST_CLASS} .post__body > .topic-meta-data .names .first::after {
        content: '楼主';
        display: inline-flex;
        align-items: center;
        margin: 0 0 0 6px;
        padding: 0 6px;
        border-radius: 3px;
        color: #fff;
        background: #8250df;
        font: 600 11px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        vertical-align: middle;
      }
      article.${OP_POST_CLASS} {
        box-shadow: inset 2px 0 0 #8250df !important;
        padding-left: 6px !important;
      }
      .${JUMP_CLASS} {
        margin-right: 4px;
        opacity: .7;
        font-size: .85em;
      }
      .${JUMP_CLASS}:hover { opacity: 1; }
      .${TIME_CLASS} {
        display: block;
        margin-top: 3px;
        padding: 1px 6px;
        border: 1px solid #d0d7de;
        border-radius: 5px;
        color: #57606a;
        background: #f6f8fa;
        font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        white-space: nowrap;
        text-align: center;
      }
      .${TIME_CLASS}--fresh {
        color: #fff;
        background: #1a7f37;
        border-color: #1a7f37;
        font-weight: 700;
      }
      .${TIME_CLASS}--week {
        color: #0969da;
        background: #ddf4ff;
        border-color: #54aeff;
        font-weight: 600;
      }
      tr.${PROMO_CLASS} .${TIME_CLASS} { opacity: .7; }
      .discourse-boosts__bubble.${BOOST_MARK_CLASS} { position: relative; }
      .discourse-boosts__bubble .${BOOST_MARK_CLASS} {
        box-shadow: 0 0 0 2px var(--ld-tle-boost-color), 0 0 0 3px rgba(255,255,255,.9);
        transition: box-shadow .15s ease;
      }
      .discourse-boosts__bubble.${BOOST_MARK_CLASS}::after {
        content: attr(data-ld-tle-boost-title);
        position: absolute;
        z-index: 5;
        left: 50%;
        bottom: calc(100% + 7px);
        width: max-content;
        max-width: min(280px, calc(100vw - 24px));
        padding: 5px 8px;
        border: 1px solid #d0d7de;
        border-radius: 5px;
        color: #24292f;
        background: #fff;
        box-shadow: 0 3px 12px rgba(31,35,40,.18);
        font: 500 12px/17px ui-sans-serif, system-ui, sans-serif;
        white-space: normal;
        overflow-wrap: anywhere;
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, 4px);
        transition: opacity .12s ease, transform .12s ease;
      }
      .discourse-boosts__bubble.${BOOST_MARK_CLASS}:hover::after,
      .discourse-boosts__bubble.${BOOST_MARK_CLASS}:focus-within::after {
        opacity: 1;
        transform: translate(-50%, 0);
      }
      .${MARK_ROW} {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-top: 6px;
        width: max-content;
        max-width: 100%;
      }
      .names .${MARK_BADGE} { margin-left: 6px; }
      .${MARK_BADGE} {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: max-content;
        max-width: 100%;
        margin: 0 0 0 6px;
        padding: 0 8px;
        height: 20px;
        border-radius: 4px;
        color: #fff;
        font: 600 11px/20px ui-sans-serif, system-ui, sans-serif;
        vertical-align: middle;
        box-sizing: border-box;
      }
      .${MARK_ROW} > .${MARK_BADGE} { margin: 0; }
      #user-card .${MARK_ROW}, .user-card .${MARK_ROW}, .d-user-card .${MARK_ROW} {
        margin-top: 10px;
        gap: 8px;
      }
      #user-card .${MARK_BADGE}, .user-card .${MARK_BADGE}, .d-user-card .${MARK_BADGE} {
        min-height: 28px;
        padding: 3px 12px;
        border-radius: 6px;
        font-size: 14px;
        line-height: 20px;
      }
      .${MARK_ADD} {
        display: inline-flex;
        align-items: center;
        margin: 0;
        padding: 0 8px;
        height: 20px;
        border: 1px solid #d0d7de;
        border-radius: 4px;
        background: transparent;
        color: #57606a;
        font: 600 11px/20px ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        width: max-content;
      }
      .${MARK_ADD}:hover { background: #f6f8fa; }
      .usercard-controls .ld-tle-mark-control .${MARK_ADD} {
        margin: 0;
        min-height: 34px;
      }
      .ld-tle-picker {
        position: absolute;
        z-index: 99999;
        width: 240px;
        padding: 10px;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        background: #fff;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        color: #24292f;
        font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-picker__head { font-weight: 700; margin-bottom: 8px; word-break: break-all; }
      .ld-tle-picker__levels, .ld-tle-picker__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
      .ld-tle-picker__levels {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 8px;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        background: #fff;
        color: #24292f;
        font: inherit;
      }
      .ld-tle-picker__sub { width: 100%; font-size: 11px; color: #57606a; }
      .ld-tle-picker__tag {
        padding: 2px 8px;
        border: 1px dashed #d0d7de;
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
        font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-picker__tag.is-on { color: #fff; }
      .ld-tle-picker__tag-reasons { display: flex; flex-direction: column; gap: 5px; margin: 0 0 8px; }
      .ld-tle-picker__tag-reasons input { width: 100%; box-sizing: border-box; padding: 5px 7px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; color: inherit; font: inherit; }
      .ld-tle-picker__lv {
        padding: 2px 8px;
        border: 1px solid #d0d7de;
        border-radius: 999px;
        background: #fff;
        cursor: pointer;
        font: 600 11px/18px ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-picker__lv.is-on { color: #fff; }
      .ld-tle-picker__note {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 6px;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        resize: vertical;
      }
      .ld-tle-picker__actions { display: flex; gap: 6px; }
      .ld-tle-picker__actions button {
        flex: 1;
        padding: 4px 0;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        background: #f6f8fa;
        cursor: pointer;
      }
      .ld-tle-fab {
        position: fixed;
        right: 18px;
        bottom: 18px;
        z-index: 99990;
        padding: 8px 12px;
        border: 0;
        border-radius: 999px;
        background: #24292f;
        color: #fff;
        font: 600 12px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(0,0,0,.2);
      }
      .ld-tle-panel {
        display: none;
        position: fixed;
        right: 18px;
        bottom: 58px;
        z-index: 99991;
        width: min(560px, calc(100vw - 24px));
        max-height: min(82vh, 800px);
        overflow-x: hidden;
        overflow-y: auto;
        box-sizing: border-box;
        padding: 18px;
        border: 1px solid #d8dee4;
        border-radius: 14px;
        background: #fff;
        color: #24292f;
        box-shadow: 0 16px 48px rgba(31,35,40,.2);
        font: 13px/1.4 ui-sans-serif, system-ui, sans-serif;
      }
      .ld-tle-panel.is-open { display: block; }
      .ld-tle-panel__bar { position: sticky; top: -18px; z-index: 2; display: flex; align-items: center; justify-content: space-between; padding: 14px 0 13px; margin-bottom: 0; border-bottom: 1px solid #eaeef2; background: #fff; }
      .ld-tle-panel__bar strong { display: block; font-size: 16px; letter-spacing: -.01em; }
      .ld-tle-panel__subtitle { display: block; margin-top: 2px; color: #8b949e; font-size: 11px; }
      .ld-tle-panel__bar button { padding: 5px 10px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; color: #57606a; cursor: pointer; }
      .ld-tle-panel__nav { display: flex; gap: 3px; padding: 10px 0 2px; border-bottom: 1px solid #eaeef2; }
      .ld-tle-panel__nav button { flex: 1; padding: 8px 6px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #57606a; font-weight: 600; cursor: pointer; }
      .ld-tle-panel__nav button.is-active { border-color: #0969da; color: #0969da; }
      .ld-tle-panel__count { display: inline-flex; min-width: 20px; justify-content: center; margin-left: 4px; padding: 1px 5px; border-radius: 999px; background: #eef2f6; color: #57606a; font-size: 11px; }
      .ld-tle-panel__overview { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
      .ld-tle-panel__stat { padding: 10px 12px; border: 1px solid #e1e6eb; border-radius: 9px; background: #f8fafc; }
      .ld-tle-panel__stat strong { display: block; color: #24292f; font-size: 19px; line-height: 1.1; }
      .ld-tle-panel__stat span { display: block; margin-top: 4px; color: #8b949e; font-size: 11px; }
      .ld-tle-panel__pane { display: none; padding-top: 14px; }
      .ld-tle-panel__pane.is-active { display: block; }
      .ld-tle-panel__tools, .ld-tle-panel__btns, .ld-tle-panel__add, .ld-tle-panel__cat-add, .ld-tle-panel__tag-add { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
      .ld-tle-panel__card { padding: 12px; border: 1px solid #e1e6eb; border-radius: 9px; background: #f8fafc; box-shadow: 0 1px 2px rgba(31,35,40,.04); }
      .ld-tle-panel__section-head { display: flex; align-items: center; justify-content: space-between; margin: 6px 0 8px; }
      .ld-tle-panel__section-head strong { display: block; font-size: 13px; }
      .ld-tle-panel__section-head span { display: block; margin-top: 2px; color: #8b949e; font-size: 11px; }
      .ld-tle-panel__add .ld-tle-panel__user, .ld-tle-panel__cat-add .ld-tle-panel__cat-label, .ld-tle-panel__tag-add .ld-tle-panel__tag-label { flex: 1 1 140px; padding: 7px 10px; }
      .ld-tle-panel__sec { padding: 9px 10px 7px; margin: 14px 0 8px; border-bottom: 1px solid #eaeef2; color: #24292f; font-size: 12px; font-weight: 700; }
      .ld-tle-panel__cats, .ld-tle-panel__tags { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; padding: 4px 10px; border: 1px solid #eaeef2; border-radius: 9px; background: #fff; }
      .ld-tle-panel__effects, .ld-tle-panel__builtin { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; padding: 4px 10px; border: 1px solid #eaeef2; border-radius: 9px; background: #fff; }
      .ld-tle-panel__effect-row { display: grid; grid-template-columns: 30px minmax(0, 1fr) 82px minmax(0, 1.5fr); gap: 7px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f2f4; }
      .ld-tle-panel__effect-row:last-child { border-bottom: 0; }
      .ld-tle-panel__effect-swatch { width: 24px; height: 24px; border-radius: 5px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.12); }
      .ld-tle-panel__effect-row small, .ld-tle-panel__builtin-row small { color: #8b949e; }
      .ld-tle-panel__builtin-row { display: grid; grid-template-columns: 28px minmax(100px, 1fr) minmax(100px, 1.5fr) 68px; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f2f4; }
      .ld-tle-panel__builtin-row:last-child { border-bottom: 0; }
      .ld-tle-panel__effect-choices { display: flex; flex-wrap: wrap; gap: 5px; min-width: 0; }
      .ld-tle-panel__effect-choices label { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border: 1px solid #d0d7de; border-radius: 6px; background: #f8fafc; cursor: pointer; }
      .ld-tle-panel__effect-choices label:has(input:checked) { border-color: #0969da; background: #eaf3ff; color: #0969da; }
      .ld-tle-panel__cat-effect, .ld-tle-panel__keyword-cat { min-height: 34px; }
        .ld-tle-panel__cat { display: grid; grid-template-columns: minmax(100px, 1fr) 32px 68px 30px 30px 30px 38px; grid-template-rows: auto auto; gap: 7px; align-items: center; padding: 7px 0; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-label-input { grid-column: 1; grid-row: 1; min-width: 0; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-color-input { grid-column: 2; grid-row: 1; width: 32px; height: 28px; padding: 0; border: 0; background: transparent; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-priority-input { grid-column: 3; grid-row: 1; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-up { grid-column: 4; grid-row: 1; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-down { grid-column: 5; grid-row: 1; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-copy { grid-column: 6; grid-row: 1; }
        .ld-tle-panel__cat > .ld-tle-panel__cat-delete { grid-column: 7; grid-row: 1; }
       .ld-tle-panel__cat > .ld-tle-panel__effect-choices { grid-column: 1 / -1; grid-row: 2; width: 100%; }
      .ld-tle-panel__cat input[type="number"], .ld-tle-panel__builtin-row input[type="number"], .ld-tle-panel__keyword-row input[type="number"] { width: 68px; box-sizing: border-box; padding: 5px 6px; }
      .ld-tle-panel__tags .ld-tle-panel__cat { grid-template-columns: 32px 1fr auto; }
      .ld-tle-panel__cat input[type="number"] { width: 56px; padding: 5px 6px; }
      .ld-tle-panel__cat input[type="color"] { width: 32px; height: 28px; padding: 0; border: 0; background: transparent; cursor: pointer; }
      .ld-tle-panel__effect-row input[type="color"] { width: 30px; height: 28px; padding: 0; border: 0; background: transparent; cursor: pointer; }
      .ld-tle-panel__q, .ld-tle-panel__filter, .ld-tle-panel__json, .ld-tle-panel button, .ld-tle-panel select, .ld-tle-panel input {
        font: inherit;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        background: #fff;
        color: inherit;
      }
      .ld-tle-panel__q { flex: 1; padding: 7px 10px; }
      .ld-tle-panel__tools select { min-width: 112px; padding: 7px 8px; }
      .ld-tle-panel__add select { min-width: 82px; padding: 7px 8px; }
      .ld-tle-panel__cat-add { align-items: center; }
      .ld-tle-panel__cat-add .ld-tle-panel__effect-choices { flex: 2 1 220px; }
      .ld-tle-panel__cat-add .ld-tle-panel__cat-color { width: 32px; height: 30px; padding: 0; }
      .ld-tle-panel__add button, .ld-tle-panel__cat-add button, .ld-tle-panel__tag-add button { padding: 7px 12px; border: 0 !important; border-radius: 6px !important; background: #0969da !important; color: #fff !important; font-weight: 700; cursor: pointer; }
      .ld-tle-panel__add button:hover, .ld-tle-panel__cat-add button:hover, .ld-tle-panel__tag-add button:hover { background: #0757b8 !important; }
      .ld-tle-panel input:focus, .ld-tle-panel select:focus, .ld-tle-panel textarea:focus { outline: 2px solid rgba(9,105,218,.25); border-color: #0969da; }
       .ld-tle-panel__list { max-height: 390px; min-width: 0; overflow-x: hidden; overflow-y: auto; margin: 10px 0 12px; padding: 2px 4px; border-top: 1px solid #eaeef2; }
       .ld-tle-panel__row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) 38px; gap: 7px; align-items: center; width: 100%; max-width: 100%; min-width: 0; box-sizing: border-box; padding: 9px 5px; border-bottom: 1px solid #f0f2f4; }
      .ld-tle-panel__row:hover { border-radius: 6px; background: #f8fafc; }
      .ld-tle-panel__row a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
       .ld-tle-panel__row > select { width: 100%; min-width: 0; box-sizing: border-box; }
        .ld-tle-panel__row-tags { display: flex; flex-wrap: wrap; align-items: center; align-content: flex-start; gap: 5px; width: 100%; max-width: 100%; min-width: 0; overflow: visible; box-sizing: border-box; }
       .ld-tle-panel__row-tags-label, .ld-tle-panel__row-tags-empty { color: #8b949e; font-size: 11px; }
       .ld-tle-panel__row-tags-label { margin-right: 2px; }
       .ld-tle-panel__row-tag { padding: 2px 6px; border: 1px solid #d0d7de; border-radius: 999px; background: #fff; color: #57606a; font: 11px/16px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
       .ld-tle-panel__row-tag.is-on { border-color: #8250df; background: #f3efff; color: #6639b5; }
       .ld-tle-panel__row-group-tag { border-color: #0969da; background: #eaf3ff; color: #0969da; }
       .ld-tle-panel__row-group-tag-wrap { display: inline-flex; align-items: stretch; }
       .ld-tle-panel__row-group-tag-wrap .ld-tle-panel__row-group-tag { border-radius: 6px 0 0 6px; }
       .ld-tle-panel__row-group-remove { width: 24px !important; min-width: 24px; height: 100%; padding: 0 !important; border: 1px solid #d0d7de; border-left: 0; border-radius: 0 6px 6px 0; background: #f6f8fa; color: #8b949e; font: 600 16px/20px ui-sans-serif, system-ui, sans-serif; cursor: pointer; }
       .ld-tle-panel__row-group-remove:hover { background: #ffebe9; border-color: #cf222e; color: #cf222e; }
       .ld-tle-panel__row-tag-picker-break { flex-basis: 100%; width: 0; height: 0; }
       .ld-tle-panel__row-tag-add { border-style: dashed; color: #0969da; }
        .ld-tle-panel__row-tag-picker { width: min(240px, 100%); max-width: 100%; min-width: 0; padding: 3px 5px; box-sizing: border-box; }
        .ld-tle-panel__keyword-row { display: grid; grid-template-columns: minmax(100px, 1fr) 34px 32px 68px 28px 30px 30px 30px 38px; grid-template-rows: auto auto; gap: 6px; align-items: center; padding: 8px 5px; border-bottom: 1px solid #f0f2f4; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-word { grid-column: 1; grid-row: 1; min-width: 0; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-ignorecase { grid-column: 2; grid-row: 1; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-color-input { grid-column: 3; grid-row: 1; width: 32px; height: 28px; padding: 0; border: 0; background: transparent; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-priority-input { grid-column: 4; grid-row: 1; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-enabled { grid-column: 5; grid-row: 1; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-up { grid-column: 6; grid-row: 1; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-down { grid-column: 7; grid-row: 1; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-copy { grid-column: 8; grid-row: 1; }
        .ld-tle-panel__keyword-row > .ld-tle-panel__keyword-delete { grid-column: 9; grid-row: 1; }
       .ld-tle-panel__keyword-row > .ld-tle-panel__effect-choices { grid-column: 1 / -1; grid-row: 2; width: 100%; }
       .ld-tle-panel__keyword-ignorecase { display: inline-flex; align-items: center; gap: 3px; width: max-content; color: #57606a; font: 600 11px/16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; cursor: pointer; }
       .ld-tle-panel__keyword-ignorecase-input { width: auto; margin: 0; }
      .ld-tle-panel__keywords { margin-bottom: 10px; border-top: 1px solid #eaeef2; }
      .ld-tle-panel__json { width: 100%; box-sizing: border-box; margin-bottom: 10px; padding: 10px; border-radius: 8px !important; line-height: 1.5; resize: vertical; }
      .ld-tle-panel__btns { padding-top: 8px; border-top: 1px solid #eaeef2; }
       .ld-tle-panel__btns button, .ld-tle-panel__row button { padding: 6px 9px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; color: #57606a; cursor: pointer; }
       .ld-tle-panel__btns button:first-child { border-color: #0969da; color: #0969da; font-weight: 700; }
        .ld-tle-panel__btns button:hover, .ld-tle-panel__row button:hover { background: #f6f8fa; }
        .ld-tle-panel__btns button.ld-tle-panel__danger { border-color: #cf222e; color: #cf222e; font-weight: 700; }
        .ld-tle-panel__btns button.ld-tle-panel__danger:hover { background: #ffebe9; }
        .ld-tle-panel__debug-toggle { display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; color: #57606a; cursor: pointer; }
       .ld-tle-panel__row .ld-tle-panel__row-group-tag { padding: 3px 9px; border: 1px solid #8250df; border-radius: 6px 0 0 6px; background: #f3efff; color: #6639b5; font: 600 12px/18px ui-sans-serif, system-ui, sans-serif; }
       .ld-tle-panel__row .ld-tle-panel__row-group-remove { padding: 0 !important; border: 1px solid #d0d7de; border-left: 0; border-radius: 0 6px 6px 0; background: #f6f8fa; color: #8b949e; }
      .ld-tle-panel__msg { min-height: 1.2em; color: #57606a; font-size: 12px; }
      .ld-tle-panel__empty { color: #8b949e; padding: 12px 0; text-align: center; }
      .ld-tle-panel__msg { padding-top: 8px; color: #57606a; }
      @media (max-width: 900px) {
        .ld-tle-panel { right: 10px; bottom: 54px; width: calc(100vw - 20px); padding: 12px; }
        .ld-tle-panel__bar { top: -12px; }
        .ld-tle-panel__overview { gap: 5px; }
        .ld-tle-panel__stat { padding: 8px; }
          .ld-tle-panel__row { grid-template-columns: minmax(0, 1fr) 38px; gap: 5px; }
          .ld-tle-panel__row > a { grid-column: 1; min-width: 0; }
          .ld-tle-panel__row > [data-act="del"] { grid-column: 2; grid-row: 1; }
          .ld-tle-panel__row-tags { grid-column: 1 / -1; width: 100%; }
          .ld-tle-panel__row-tags { grid-row: 2; }
          .ld-tle-panel__cat { grid-template-columns: minmax(0, 1fr) 32px 68px 30px 30px 30px 38px; gap: 4px; }
         .ld-tle-panel__cat .ld-tle-panel__effect-choices { grid-column: 1 / -1; grid-row: 2; }
          .ld-tle-panel__keyword-row { grid-template-columns: minmax(0, 1fr) 34px 32px 68px 28px 30px 30px 30px 38px; gap: 4px; }
      }
      @media (prefers-color-scheme: dark) {
        .${CHIP_CLASS}--0 { color: #f0f6fc; background: #6e7681; }
        .${CHIP_CLASS}--1 { color: #f0f6fc; background: #1f6feb; }
        .${CHIP_CLASS}--2 { color: #f0f6fc; background: #2ea043; }
        .${CHIP_CLASS}--3 { color: #3d2e00; background: #e3b341; }
        .${CHIP_CLASS}--4 { color: #f0f6fc; background: #8957e5; }
        td.${ROW_CLASS}--0 { --ld-tle-lv: #6e7681; }
        td.${ROW_CLASS}--1 { --ld-tle-lv: #1f6feb; }
        td.${ROW_CLASS}--2 { --ld-tle-lv: #2ea043; }
        td.${ROW_CLASS}--3 { --ld-tle-lv: #e3b341; }
        td.${ROW_CLASS}--4 { --ld-tle-lv: #8957e5; }
        .${TIME_CLASS} { color: #8b949e; background: #21262d; border-color: #30363d; }
        .${TIME_CLASS}--fresh { color: #f0f6fc; background: #2ea043; border-color: #2ea043; }
        .${TIME_CLASS}--week { color: #79c0ff; background: #0d2847; border-color: #1f6feb; }
        article.${OP_POST_CLASS} .post__body > .topic-meta-data .names .first::after { background: #8957e5; }
        img.ld-tle-op { box-shadow: 0 0 0 2px #6e7681 !important; }
        img.ld-tle-op.ld-tle-op--1 { box-shadow: 0 0 0 2px #1f6feb !important; }
        img.ld-tle-op.ld-tle-op--2 { box-shadow: 0 0 0 2px #2ea043 !important; }
        img.ld-tle-op.ld-tle-op--3 { box-shadow: 0 0 0 2px #e3b341 !important; }
        img.ld-tle-op.ld-tle-op--4 { box-shadow: 0 0 0 2px #8957e5 !important; }
        .${MARK_ADD} { border-color: #30363d; color: #8b949e; }
        .${MARK_ADD}:hover { background: #21262d; }
        .ld-tle-picker, .ld-tle-panel { background: #161b22; border-color: #30363d; color: #c9d1d9; }
        .ld-tle-picker__levels, .ld-tle-picker__lv, .ld-tle-picker__note, .ld-tle-picker__actions button,
        .ld-tle-panel__q, .ld-tle-panel__filter, .ld-tle-panel__json, .ld-tle-panel button, .ld-tle-panel select, .ld-tle-panel input {
          background: #0d1117; border-color: #30363d; color: #c9d1d9;
        }
        .ld-tle-fab { background: #c9d1d9; color: #0d1117; }
        .ld-tle-panel__bar { background: #161b22; border-color: #30363d; }
        .ld-tle-panel__nav { border-color: #30363d; }
        .ld-tle-panel__nav button { color: #8b949e; }
        .ld-tle-panel__nav button.is-active { color: #58a6ff; border-color: #58a6ff; }
        .ld-tle-panel__card { border-color: #30363d; background: #0d1117; }
         .ld-tle-panel__stat, .ld-tle-panel__cats, .ld-tle-panel__tags, .ld-tle-panel__effects, .ld-tle-panel__builtin { border-color: #30363d; background: #0d1117; }
        .ld-tle-panel__stat strong { color: #f0f6fc; }
        .ld-tle-panel__section-head span, .ld-tle-panel__subtitle { color: #8b949e; }
        .ld-tle-panel__list { border-color: #30363d; }
        .ld-tle-panel__row { border-color: #30363d; }
        .ld-tle-panel__row:hover { background: #21262d; }
        .ld-tle-panel__keywords, .ld-tle-panel__keyword-row { border-color: #30363d; }
        .ld-tle-panel__bar button, .ld-tle-panel__btns button, .ld-tle-panel__row button { background: #0d1117; border-color: #30363d; color: #c9d1d9; }
        .ld-tle-panel__sec, .ld-tle-panel__btns { border-color: #30363d; }
      }

      /* Advanced: master switch that temporarily suspends every page effect */
      .ld-tle-panel__suspend-hint { margin-top: 7px; color: #8b949e; font-size: 11px; line-height: 1.6; }
      .ld-tle-fab--suspended { background: #cf222e; color: #fff; }
      html.${SUSPEND_CLASS} .${CHIP_CLASS},
      html.${SUSPEND_CLASS} .${TIME_CLASS},
      html.${SUSPEND_CLASS} .${MARK_BADGE},
      html.${SUSPEND_CLASS} .${MARK_ROW},
      html.${SUSPEND_CLASS} .${MARK_ADD},
      html.${SUSPEND_CLASS} .ld-tle-mark-control,
      html.${SUSPEND_CLASS} .${JUMP_CLASS},
      html.${SUSPEND_CLASS} .ld-tle-keyword-badge {
        display: none !important;
      }
    `;
    document.head.append(style);
    updateMarkStyles();
  }

  function hexToRgb(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function contrastColor(hex) {
    const [r, g, b] = hexToRgb(hex);
    return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#24292f' : '#fff';
  }

  function updateMarkStyles() {
    let el = document.getElementById(MARK_STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = MARK_STYLE_ID;
      document.head.append(el);
    }
    el.textContent = effects.map((effect) => {
      const [r, g, b] = hexToRgb(effect.color);
      const fg = contrastColor(effect.color);
      const dim = effect.kind === 'fade' || effect.mode === 'dim';
       const opacity = effect.opacity || 0.28;
      const tint = effect.kind === 'color' && effect.mode === 'tint';
       const colorLine = effect.kind === 'color' ? `box-shadow: inset 3px 0 0 var(--ld-tle-effect-color, ${effect.color}) !important;` : '';
       const strike = effect.kind === 'strike' ? 'text-decoration: line-through !important; text-decoration-color: currentColor !important;' : '';
       const mosaic = effect.kind === 'mosaic' ? 'filter: blur(5px) !important;' : '';
      return `
        tr.${EFFECT_CLASS}--${effect.id} td {
           ${dim ? `opacity: ${opacity} !important; filter: grayscale(.75) !important;` : ''}
           ${tint ? `background: rgba(${r},${g},${b},.14) !important;` : ''}
         }
        tr.${EFFECT_CLASS}--${effect.id} td:first-child,
        tr.${EFFECT_CLASS}--${effect.id} td.main-link { ${colorLine} }
          tr.${EFFECT_CLASS}--${effect.id} .link-top-line { ${strike} }
          tr.${EFFECT_CLASS}--${effect.id} .link-top-line > a,
          tr.${EFFECT_CLASS}--${effect.id} .link-top-line .raw-topic-link { ${mosaic} }
          tr.${EFFECT_CLASS}--tag-highlight:not(.ld-tle-welfare-only) .ld-tle-keyword-match { color: var(--ld-tle-tag-color) !important; background: color-mix(in srgb, var(--ld-tle-tag-color) 18%, transparent) !important; border-color: var(--ld-tle-tag-color) !important; }
          tr.${EFFECT_CLASS}--tag-highlight:not(.ld-tle-welfare-only) .ld-tle-keyword-match .badge-category__name { color: var(--ld-tle-tag-color) !important; }
         tr.${EFFECT_CLASS}--tag-highlight.ld-tle-welfare-only .badge-category { color: var(--ld-tle-tag-color) !important; background: color-mix(in srgb, var(--ld-tle-tag-color) 18%, transparent) !important; border-color: var(--ld-tle-tag-color) !important; }
         tr.${EFFECT_CLASS}--${effect.id} .link-top-line::after {
          ${effect.kind === 'badge' ? `content: '${effect.label.replace(/['\\]/g, '\\$&')}'; display: inline-flex; margin-left: 6px; padding: 0 6px; border-radius: 3px; color: ${fg}; background: ${effect.color}; font-size: 10px; line-height: 16px;` : ''}
        }
          tr.${EFFECT_CLASS}--${effect.id}:hover td { ${dim ? `opacity: ${Math.min(1, opacity + 0.25)} !important; filter: grayscale(.35) !important;` : ''} }
          tr.${EFFECT_CLASS}--${effect.id}:hover .link-top-line > a,
          tr.${EFFECT_CLASS}--${effect.id}:hover .link-top-line .raw-topic-link { ${mosaic ? 'filter: none !important;' : ''} }
        .${MARK_BADGE}--effect-${effect.id} { color: ${fg}; background: ${effect.color}; }
      `;
    }).concat(cats.map((group) => {
      const color = group.color || '#0969da';
      return `.${MARK_BADGE}--group-tag-${group.id} { color: ${contrastColor(color)}; background: ${color}; }`;
    })).concat(tags.map((t) => {
      const fg = contrastColor(t.color);
      return `
         .${MARK_BADGE}--effect-tag-${t.id} { color: ${fg}; background: ${t.color}; }
         .${MARK_BADGE}--tag-${t.id} { color: ${fg}; background: ${t.color}; }
        .ld-tle-picker__tag--${t.id}.is-on { color: ${fg}; background: ${t.color}; border-color: ${t.color}; }
       `;
    })).join('\n');
  }

  addStyles();
  document.documentElement.classList.toggle(SUSPEND_CLASS, isSuspended());
  processWithRetries();

  mutationObserver = new MutationObserver(scheduleMutationRefresh);
  if (!isSuspended()) observeDocument();
  window.addEventListener('scroll', scheduleScrollRefresh, { passive: true });
  window.addEventListener('resize', scheduleProcessing, { passive: true });
  window.addEventListener('popstate', processWithRetries);
  window.addEventListener('hashchange', processWithRetries);
  document.addEventListener('page:change', processWithRetries);
  document.addEventListener('page:changed', processWithRetries);
  document.addEventListener('turbo:load', processWithRetries);
  window.addEventListener('pageshow', processWithRetries);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') processWithRetries();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') scheduleProcessing();
  }, 3000);
  document.addEventListener('click', (e) => {
    if (pickerEl && !pickerEl.contains(e.target) && !e.target.closest('.' + MARK_ADD)) closePicker();
  });
})();
