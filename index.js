(() => {
    'use strict';
    const MODULE = 'chat_avatar_switcher', CHAT_KEY = 'chat_avatar_switcher_v1', USER_KEY = 'chat_avatar_switcher_user_v1';
    const PANEL = 'cas-panel', BUTTON = 'cas-open', SETTINGS = 'cas-extension-settings';
    let applying = false, observer;
    let currentMode = 'char'; // 'char' 或 'user'

    const ctx = () => { try { return window.SillyTavern?.getContext?.() || null } catch (e) { return null } };

    function settings() {
        const c = ctx();
        if (!c?.extensionSettings) return { showFloatingButton: false };
        c.extensionSettings[MODULE] ??= {};
        if (typeof c.extensionSettings[MODULE].showFloatingButton !== 'boolean') c.extensionSettings[MODULE].showFloatingButton = false;
        return c.extensionSettings[MODULE];
    }

    function applyVisibility() {
        const show = settings().showFloatingButton;
        const b = document.getElementById(BUTTON), p = document.getElementById(PANEL);
        if (b) b.style.display = show ? 'flex' : 'none';
        if (p && !show && !p.classList.contains('cas-forced-open')) p.classList.remove('cas-open');
    }

    // 1. 添加到图1的扩展设置面板
    function addSettings() {
        if (document.getElementById(SETTINGS)) return;
        const host = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
        if (!host) return;
        const el = document.createElement('div');
        el.id = SETTINGS;
        el.className = 'extension_container';
        el.innerHTML = `
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>聊天档案独立头像</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content">
                    <label class="checkbox_label" for="cas-show-floating">
                        <input id="cas-show-floating" type="checkbox">
                        <span>显示右下角悬浮按钮</span>
                    </label>
                    <small class="cas-settings-hint">关闭后只隐藏右下角按钮，可以随时在魔法棒菜单或这里打开头像设置。</small>
                    <div class="flex-container flexGap5" style="margin-top: 10px;">
                        <button id="cas-open-settings-btn" class="menu_button">打开头像设置面板</button>
                    </div>
                </div>
            </div>`;
        host.appendChild(el);
        
        const toggle = el.querySelector('#cas-show-floating');
        toggle.checked = settings().showFloatingButton;
        toggle.addEventListener('change', () => {
            settings().showFloatingButton = toggle.checked;
            ctx()?.saveSettingsDebounced?.();
            applyVisibility();
        });

        el.querySelector('#cas-open-settings-btn').addEventListener('click', () => {
            document.getElementById(PANEL)?.classList.add('cas-open', 'cas-forced-open');
            updatePreview();
        });

        el.querySelector('.inline-drawer-toggle').addEventListener('click', () => {
            const content = el.querySelector('.inline-drawer-content'), icon = el.querySelector('.inline-drawer-icon');
            const open = content.style.display === 'none' || content.style.display === '';
            content.style.display = open ? '' : 'none';
            icon?.classList.toggle('down', open);
            icon?.classList.toggle('up', !open);
        });
    }

    // 2. 添加到图3的魔法棒菜单
    function addMenuButton() {
        if (document.getElementById('cas-menu-item')) return;
        const menu = document.getElementById('extensionsMenu');
        if (!menu) return;
        const item = document.createElement('div');
        item.id = 'cas-menu-item';
        item.className = 'list-group-item flex-container flexGap5 interactable';
        item.tabIndex = 0;
        item.innerHTML = '<div class="fa-solid fa-image-portrait fa-fw"></div><span>聊天档案独立头像</span>';
        item.addEventListener('click', () => {
            const p = document.getElementById(PANEL);
            if (p) {
                p.classList.add('cas-open', 'cas-forced-open');
                updatePreview();
            }
        });
        menu.appendChild(item);
    }

    function saved() {
        const c = ctx();
        if (!c?.chatMetadata) return '';
        const key = currentMode === 'char' ? CHAT_KEY : USER_KEY;
        return c.chatMetadata[key]?.dataUrl || '';
    }

    async function saveAvatar(data) {
        const c = ctx();
        if (!c?.chatMetadata || typeof c.saveMetadata !== 'function') {
            alert('读取不到当前聊天元数据，请确认酒馆已打开聊天。');
            return;
        }
        const key = currentMode === 'char' ? CHAT_KEY : USER_KEY;
        if (data) c.chatMetadata[key] = { dataUrl: data, updatedAt: Date.now() };
        else delete c.chatMetadata[key];
        await c.saveMetadata();
        applyAvatar();
        updatePreview();
    }

    function defaultAvatar() {
        const c = ctx();
        if (currentMode === 'char') {
            const ch = c?.characters?.[c?.characterId];
            return ch?.avatar ? `/characters/${encodeURIComponent(ch.avatar)}` : '';
        } else {
            // 获取 User 的默认头像
            const firstUserImg = document.querySelector('.mes.is_user .avatar img');
            if (firstUserImg) return firstUserImg.src;
            return c?.user_avatar ? `/User Avatars/${encodeURIComponent(c.user_avatar)}` : '';
        }
    }

    function getTargetImageNodes() {
        const out = [];
        document.querySelectorAll('.mes .avatar img,.mes .mesAvatar img,.mes .avatar').forEach(el => {
            const m = el.closest('.mes');
            const isUserMsg = m && (m.classList.contains('is_user') || m.getAttribute('is_user') === 'true');
            
            if (currentMode === 'char' && m && !isUserMsg) {
                out.push(el);
            } else if (currentMode === 'user' && isUserMsg) {
                out.push(el);
            }
        });
        
        // 顶部角色头像（只针对角色修改）
        if (currentMode === 'char') {
            document.querySelectorAll('#avatar img,#avatar .avatar img,#character_avatar img,.character_avatar img').forEach(el => out.push(el));
        }
        return [...new Set(out)];
    }

    function setImg(el, url) {
        if (el.tagName === 'IMG') {
            if (el.src !== new URL(url, location.href).href) el.src = url;
        } else {
            const img = el.querySelector?.('img');
            if (img) setImg(img, url);
            else el.style.backgroundImage = `url("${url.replaceAll('"','%22')}")`;
        }
    }

    function applyAvatar() {
        if (applying) return;
        applying = true;
        try {
            const c = ctx();
            if (!c?.chatMetadata) return;

            // 应用角色头像
            const charUrl = c.chatMetadata[CHAT_KEY]?.dataUrl || (c.characters?.[c.characterId]?.avatar ? `/characters/${encodeURIComponent(c.characters[c.characterId].avatar)}` : '');
            if (charUrl) {
                document.querySelectorAll('.mes .avatar img,.mes .mesAvatar img,.mes .avatar').forEach(el => {
                    const m = el.closest('.mes');
                    if (m && !m.classList.contains('is_user') && m.getAttribute('is_user') !== 'true') setImg(el, charUrl);
                });
                document.querySelectorAll('#avatar img,#avatar .avatar img,#character_avatar img,.character_avatar img').forEach(el => setImg(el, charUrl));
            }

            // 应用User头像（如果不设置，就不覆盖，让原生渲染）
            const userUrl = c.chatMetadata[USER_KEY]?.dataUrl;
            if (userUrl) {
                document.querySelectorAll('.mes .avatar img,.mes .mesAvatar img,.mes .avatar').forEach(el => {
                    const m = el.closest('.mes');
                    if (m && (m.classList.contains('is_user') || m.getAttribute('is_user') === 'true')) setImg(el, userUrl);
                });
            }
        } finally { applying = false; }
    }

    function updatePreview() {
        const p = document.querySelector('#cas-preview');
        const status = document.querySelector('#cas-status');
        
        if (currentMode === 'char') {
            document.querySelector('#cas-mode-char').classList.add('cas-active');
            document.querySelector('#cas-mode-user').classList.remove('cas-active');
            const url = saved() || defaultAvatar();
            if (p) { p.src = url; p.style.display = url ? 'block' : 'none'; }
            if (status) status.textContent = saved() ? '当前角色：已设置独立头像' : '当前角色：使用角色卡默认头像';
        } else {
            document.querySelector('#cas-mode-user').classList.add('cas-active');
            document.querySelector('#cas-mode-char').classList.remove('cas-active');
            const url = saved() || defaultAvatar();
            if (p) { p.src = url; p.style.display = url ? 'block' : 'none'; }
            if (status) status.textContent = saved() ? '当前User：已设置独立头像' : '当前User：使用系统默认头像';
        }
    }

    function compress(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onerror = reject;
            r.onload = () => {
                const im = new Image();
                im.onerror = reject;
                im.onload = () => {
                    const max = 320, scale = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), cv = document.createElement('canvas');
                    cv.width = Math.max(1, Math.round(im.naturalWidth * scale));
                    cv.height = Math.max(1, Math.round(im.naturalHeight * scale));
                    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
                    resolve(cv.toDataURL('image/jpeg', .82));
                };
                im.src = r.result;
            };
            r.readAsDataURL(file);
        });
    }

    // 3. 创建悬浮窗和弹窗面板（增加了切换Tab）
    function addPanel() {
        if (document.getElementById(PANEL)) return;
        const b = document.createElement('button');
        b.id = BUTTON;
        b.type = 'button';
        b.textContent = '头像';
        b.title = '设置当前聊天档案的独立头像';
        b.className = 'interactable';
        document.body.appendChild(b);

        const p = document.createElement('section');
        p.id = PANEL;
        
        // 增加了切换按钮的UI
        p.innerHTML = `
            <div class="cas-head">
                <strong>聊天档案独立头像</strong>
                <button id="cas-close" type="button">×</button>
            </div>
            <p class="cas-note">只作用于当前聊天档案，不修改原角色卡/User配置。</p >
            
            <div class="cas-tabs" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #555; padding-bottom:10px;">
                <button id="cas-mode-char" class="menu_button interactable" style="flex:1;">修改角色</button>
                <button id="cas-mode-user" class="menu_button interactable" style="flex:1;">修改 User</button>
            </div>

            <div style="text-align: center; min-height: 80px;">
                < img id="cas-preview" alt="头像预览" style="max-width: 80px; max-height: 80px; border-radius: 8px; object-fit: cover; margin: 0 auto; display: none;">
            </div>
            
            <p id="cas-status" style="text-align:center; font-size:12px; margin: 10px 0;"></p >
            
            <label class="cas-upload">选择头像图片<input id="cas-file" type="file" accept="image/*"></label>
            <button id="cas-reset" type="button">恢复当前对象默认头像</button>
            <p class="cas-small">建议使用正方形图片；图片会压缩后保存到当前聊天元数据。</p >`;
        document.body.appendChild(p);

        // 切换逻辑
        p.querySelector('#cas-mode-char').addEventListener('click', () => { currentMode = 'char'; updatePreview(); });
        p.querySelector('#cas-mode-user').addEventListener('click', () => { currentMode = 'user'; updatePreview(); });

        b.addEventListener('click', () => {
            p.classList.add('cas-open', 'cas-forced-open');
            updatePreview();
        });

        p.querySelector('#cas-close').addEventListener('click', () => {
            p.classList.remove('cas-open', 'cas-forced-open');
        });

        p.querySelector('#cas-reset').addEventListener('click', () => {
            const targetName = currentMode === 'char' ? '角色' : 'User';
            if (confirm(`恢复当前聊天档案的${targetName}默认头像？`)) saveAvatar('');
        });

        p.querySelector('#cas-file').addEventListener('change', async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
                if (!f.type.startsWith('image/')) throw Error('not image');
                await saveAvatar(await compress(f));
            } catch (err) {
                alert('图片处理失败，请换一张图片再试。');
            } finally { e.target.value = ''; }
        });
        
        applyVisibility();
    }

    function boot() {
        addPanel();
        addSettings();
        addMenuButton();
        applyAvatar();
        updatePreview();
        applyVisibility();
        
        const c = ctx();
        if (c?.eventSource?.on && c?.event_types) {
            const refresh = () => setTimeout(() => { applyAvatar(); updatePreview(); }, 250);
            for (const n of ['CHAT_CHANGED', 'CHARACTER_MESSAGE_RENDERED', 'MESSAGE_RECEIVED', 'APP_READY']) {
                if (c.event_types[n]) c.eventSource.on(c.event_types[n], refresh);
            }
        }
        observer = new MutationObserver(() => { if (!applying) applyAvatar(); });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    let tries = 0;
    const timer = setInterval(() => {
        if (ctx() && document.body) { clearInterval(timer); boot(); }
        else if (++tries > 80) clearInterval(timer);
    }, 500);
})();
