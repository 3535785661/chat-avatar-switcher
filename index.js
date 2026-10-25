// Chat Avatar Switcher for SillyTavern
// Per-chat avatar override. Does not write to character-card data.
(() => {
  'use strict';

  const KEY = 'chat_avatar_switcher_v1';
  const PANEL_ID = 'cas-panel';
  const BUTTON_ID = 'cas-open';
  let observer = null;
  let applying = false;
  let lastChatToken = '';

  function ctx() {
    try { return window.SillyTavern?.getContext?.() || null; } catch (_) { return null; }
  }

  function currentChatToken(c) {
    // chatId is not consistently exposed in all versions; combine character/group + chat name.
    const chatName = c?.chatMetadata?.chat_name || c?.chatMetadata?.name || '';
    const character = c?.characters?.[c?.characterId];
    const group = c?.groups?.find?.(g => g.id === c?.groupId);
    return [c?.groupId || '', group?.name || '', character?.avatar || '', character?.name || '', chatName].join('|');
  }

  function getSavedAvatar() {
    const c = ctx();
    return c?.chatMetadata?.[KEY]?.dataUrl || '';
  }

  async function saveAvatar(dataUrl) {
    const c = ctx();
    if (!c?.chatMetadata || typeof c.saveMetadata !== 'function') {
      alert('读取不到当前聊天的元数据。请确认这是官方 SillyTavern 的聊天页面。');
      return;
    }
    if (dataUrl) c.chatMetadata[KEY] = { dataUrl, updatedAt: Date.now() };
    else delete c.chatMetadata[KEY];
    await c.saveMetadata();
    applyAvatar();
    updatePreview();
  }

  function characterAvatarUrl() {
    const c = ctx();
    const character = c?.characters?.[c?.characterId];
    const avatar = character?.avatar;
    if (!avatar) return '';
    // SillyTavern serves character portraits from /characters/<avatar>.
    return `/characters/${encodeURIComponent(avatar)}`;
  }

  function imageNodes() {
    const nodes = [];
    // Message avatars for the active single-character chat.
    document.querySelectorAll('.mes .avatar img, .mes .mesAvatar img, .mes .avatar').forEach(el => {
      const message = el.closest('.mes');
      if (!message) return;
      // Do not override user messages or group-chat member avatars.
      const isUser = message.classList.contains('is_user') ||
        message.getAttribute('is_user') === 'true' ||
        message.dataset?.isUser === 'true';
      if (!isUser) nodes.push(el);
    });
    // Current character portrait in the chat top/header area.
    document.querySelectorAll('#avatar img, #avatar .avatar img, #character_avatar img, .character_avatar img').forEach(el => nodes.push(el));
    return [...new Set(nodes)];
  }

  function setImage(el, url) {
    if (!el || !url) return;
    if (el.tagName === 'IMG') {
      if (el.src !== new URL(url, location.href).href) el.src = url;
    } else {
      const img = el.querySelector?.('img');
      if (img) setImage(img, url);
      else el.style.backgroundImage = `url("${url.replaceAll('"', '%22')}")`;
    }
  }

  function applyAvatar() {
    if (applying) return;
    applying = true;
    try {
      const custom = getSavedAvatar();
      const fallback = characterAvatarUrl();
      const url = custom || fallback;
      if (!url) return;
      imageNodes().forEach(el => setImage(el, url));
    } finally {
      applying = false;
    }
  }

  function updatePreview() {
    const preview = document.querySelector('#cas-preview');
    const saved = getSavedAvatar();
    if (!preview) return;
    preview.src = saved || characterAvatarUrl() || '';
    preview.style.display = preview.src ? 'block' : 'none';
    const status = document.querySelector('#cas-status');
    if (status) status.textContent = saved ? '当前档案：已设置独立头像' : '当前档案：使用角色卡默认头像';
  }

  function ensurePanel() {
    if (document.getElementById(PANEL_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '头像';
    button.title = '设置当前聊天档案的独立头像';
    document.body.appendChild(button);

    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="cas-head">
        <strong>聊天档案独立头像</strong>
        <button type="button" id="cas-close" aria-label="关闭">×</button>
      </div>
      <p class="cas-note">只作用于当前聊天档案，不修改角色卡原图。</p>
      <img id="cas-preview" alt="当前档案头像预览">
      <p id="cas-status">当前档案：使用角色卡默认头像</p>
      <label class="cas-upload">选择头像图片
        <input id="cas-file" type="file" accept="image/*">
      </label>
      <button type="button" id="cas-reset">恢复角色卡默认头像</button>
      <p class="cas-small">建议使用正方形图片。图片会压缩后保存到当前聊天元数据中。</p>
    `;
    document.body.appendChild(panel);

    button.addEventListener('click', () => {
      panel.classList.toggle('cas-open');
      updatePreview();
    });
    panel.querySelector('#cas-close').addEventListener('click', () => panel.classList.remove('cas-open'));
    panel.querySelector('#cas-reset').addEventListener('click', async () => {
      if (confirm('恢复当前聊天档案的默认角色头像？')) await saveAvatar('');
    });
    panel.querySelector('#cas-file').addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件。');
        event.target.value = '';
        return;
      }
      try {
        const dataUrl = await compressImage(file);
        await saveAvatar(dataUrl);
      } catch (e) {
        console.error('[Chat Avatar Switcher]', e);
        alert('图片处理失败，请换一张图片再试。');
      } finally {
        event.target.value = '';
      }
    });
  }

  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('File read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.onload = () => {
          const max = 320;
          const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const g = canvas.getContext('2d');
          g.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function boot() {
    ensurePanel();
    applyAvatar();
    updatePreview();

    const c = ctx();
    if (c?.eventSource?.on && c?.event_types) {
      const refresh = () => setTimeout(() => {
        const current = ctx();
        const token = currentChatToken(current);
        lastChatToken = token;
        applyAvatar();
        updatePreview();
      }, 250);
      for (const name of ['CHAT_CHANGED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_RECEIVED', 'APP_READY']) {
        const eventName = c.event_types[name];
        if (eventName) c.eventSource.on(eventName, refresh);
      }
    }

    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      if (!applying) applyAvatar();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    lastChatToken = currentChatToken(ctx());
  }

  // Wait until the ST context and chat DOM exist.
  let attempts = 0;
  const wait = setInterval(() => {
    attempts++;
    if (ctx() && document.body) {
      clearInterval(wait);
      boot();
    } else if (attempts > 80) {
      clearInterval(wait);
      console.warn('[Chat Avatar Switcher] SillyTavern context was not found.');
    }
  }, 500);
})();
