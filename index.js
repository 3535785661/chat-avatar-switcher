(() => {
    'use strict';
    const MODULE = 'chat_avatar_switcher', CHAT_KEY = 'chat_avatar_switcher_v1', USER_KEY = 'chat_avatar_switcher_user_v1';
    const PANEL = 'cas-panel', BUTTON = 'cas-open', SETTINGS = 'cas-extension-settings';
    let applying = false, observer;
    let currentMode = 'char'; // 'char' 或 'user'
    let cropperInstance = null;

    const ctx = () => { try { return window.SillyTavern?.getContext?.() || null } catch (e) { return null } };

    // 动态加载 Cropper.js
    function loadCropper(callback) {
        if (window.Cropper) return callback();
        
        if (!document.getElementById('cas-cropper-css')) {
            const link = document.createElement('link');
            link.id = 'cas-cropper-css';
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.1/dist/cropper.min.css';
            document.head.appendChild(link);
        }

        if (!document.getElementById('cas-cropper-js')) {
            const script = document.createElement('script');
            script.id = 'cas-cropper-js';
            script.src = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.1/dist/cropper.min.js';
            script.onload = callback;
            document.head.appendChild(script);
        } else {
            // 如果标签已存在但未加载完，加个轮询
            const t = setInterval(() => { if (window.Cropper) { clearInterval(t); callback(); } }, 100);
        }
    }

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
            const firstUserImg = document.querySelector('.mes.is_user .avatar img');
            if (firstUserImg) return firstUserImg.src;
            return c?.user_avatar ? `/User Avatars/${encodeURIComponent(c.user_avatar)}` : '';
        }
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

            // 应用User头像
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
        
        // 如果正在裁剪，就不更新预览，防止闪动
        if (cropperInstance) return;

        document.querySelector('#cas-mode-char').classList.toggle('cas-active', currentMode === 'char');
        document.querySelector('#cas-mode-user').classList.toggle('cas-active', currentMode === 'user');

        const url = saved() || defaultAvatar();
        if (p) { p.src = url; p.style.display = url ? 'block' : 'none'; }
        if (status) status.textContent = saved() ? `当前${currentMode==='char'?'角色':'User'}：已设置独立头像` : `当前${currentMode==='char'?'角色':'User'}：使用默认头像`;
    }

    // 弹窗面板
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
        
        // 增加裁剪界面容器
        p.innerHTML = `
            <div class="cas-head">
                <strong>聊天档案独立头像</strong>
                <button id="cas-close" type="button">×</button>
            </div>
            
            <!-- 预览/操作界面 -->
            <div id="cas-main-view">
                <p class="cas-note">只作用于当前聊天档案，不修改原角色卡/User配置。</p>
                <div class="cas-tabs" style="display:flex; gap:10px; margin-bottom:15px; border-bottom:1px solid #555; padding-bottom:10px;">
                    <button id="cas-mode-char" class="menu_button interactable" style="flex:1;">修改角色</button>
                    <button id="cas-mode-user" class="menu_button interactable" style="flex:1;">修改 User</button>
                </div>
                <div style="text-align: center; min-height: 80px;">
                    <img id="cas-preview" alt="头像预览" style="max-width: 80px; max-height: 80px; border-radius: 8px; object-fit: cover; margin: 0 auto; display: none;">
                </div>
                <p id="cas-status" style="text-align:center; font-size:12px; margin: 10px 0;"></p>
                <label class="cas-upload">选择头像图片<input id="cas-file" type="file" accept="image/*"></label>
                <button id="cas-reset" type="button">恢复当前对象默认头像</button>
                <p class="cas-small">建议使用正方形图片；图片会压缩后保存到当前聊天元数据。</p>
            </div>

            <!-- 裁剪界面 (默认隐藏) -->
            <div id="cas-crop-view" style="display: none;">
                <p class="cas-note" style="margin-bottom:5px;">拖拽移动 / 双指缩放 / 滚轮缩放</p>
                <div style="width: 100%; height: 300px; background: #222; border-radius: 8px; overflow: hidden; margin-bottom: 10px;">
                    <img id="cas-crop-image" style="max-width: 100%; display: block;">
                </div>
                <div style="display: flex; gap: 5px; margin-bottom: 10px; justify-content: center;">
                    <button id="cas-btn-zoom-in" class="menu_button" title="放大"><i class="fa-solid fa-search-plus"></i></button>
                    <button id="cas-btn-zoom-out" class="menu_button" title="缩小"><i class="fa-solid fa-search-minus"></i></button>
                    <button id="cas-btn-rotate-left" class="menu_button" title="向左旋转"><i class="fa-solid fa-rotate-left"></i></button>
                    <button id="cas-btn-rotate-right" class="menu_button" title="向右旋转"><i class="fa-solid fa-rotate-right"></i></button>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button id="cas-crop-confirm" class="menu_button" style="flex:1; background: #4caf50; color: white;">确认裁剪</button>
                    <button id="cas-crop-cancel" class="menu_button" style="flex:1;">取消</button>
                </div>
            </div>
            
            <!-- 内联样式用于修正按钮激活状态 -->
            <style>
                .cas-active { background-color: var(--interactable-bg-hover) !important; border-color: var(--interactable-border) !important; color: var(--text-color) !important; font-weight: bold; }
                .cropper-view-box { outline: 2px solid #4caf50; outline-color: rgba(76, 175, 80, 0.75); }
            </style>`;
        document.body.appendChild(p);

        const mainView = p.querySelector('#cas-main-view');
        const cropView = p.querySelector('#cas-crop-view');
        const cropImg = p.querySelector('#cas-crop-image');

        // 切换逻辑
        p.querySelector('#cas-mode-char').addEventListener('click', () => { currentMode = 'char'; updatePreview(); });
        p.querySelector('#cas-mode-user').addEventListener('click', () => { currentMode = 'user'; updatePreview(); });

        b.addEventListener('click', () => {
            p.classList.add('cas-open', 'cas-forced-open');
            updatePreview();
        });

        p.querySelector('#cas-close').addEventListener('click', () => {
            p.classList.remove('cas-open', 'cas-forced-open');
            if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; cropView.style.display = 'none'; mainView.style.display = 'block'; }
        });

        p.querySelector('#cas-reset').addEventListener('click', () => {
            const targetName = currentMode === 'char' ? '角色' : 'User';
            if (confirm(`恢复当前聊天档案的${targetName}默认头像？`)) saveAvatar('');
        });

        // 选文件 -> 进入裁剪模式
        p.querySelector('#cas-file').addEventListener('change', async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
                if (!f.type.startsWith('image/')) throw Error('not image');
                const reader = new FileReader();
                reader.onload = (ev) => {
                    loadCropper(() => {
                        mainView.style.display = 'none';
                        cropView.style.display = 'block';
                        cropImg.src = ev.target.result;
                        
                        if (cropperInstance) cropperInstance.destroy();
                        
                        // 延迟一点初始化，确保 DOM 已经显示出来，防止尺寸计算错误
                        setTimeout(() => {
                            cropperInstance = new Cropper(cropImg, {
                                aspectRatio: 1, // 强制正方形
                                viewMode: 1,    // 限制裁剪框不能超出图片
                                dragMode: 'move',
                                autoCropArea: 0.8,
                                restore: false,
                                guides: false,
                                center: false,
                                highlight: false,
                                background: false
                            });
                        }, 100);
                    });
                };
                reader.readAsDataURL(f);
            } catch (err) {
                alert('图片读取失败，请换一张图片再试。');
            } finally { e.target.value = ''; }
        });

        // 裁剪控制器按钮
        p.querySelector('#cas-btn-zoom-in').addEventListener('click', () => cropperInstance?.zoom(0.1));
        p.querySelector('#cas-btn-zoom-out').addEventListener('click', () => cropperInstance?.zoom(-0.1));
        p.querySelector('#cas-btn-rotate-left').addEventListener('click', () => cropperInstance?.rotate(-90));
        p.querySelector('#cas-btn-rotate-right').addEventListener('click', () => cropperInstance?.rotate(90));

        // 确认裁剪
        p.querySelector('#cas-crop-confirm').addEventListener('click', () => {
            if (!cropperInstance) return;
            // 获取裁剪后的 canvas，并缩放到最大 320x320
            const canvas = cropperInstance.getCroppedCanvas({ maxWidth: 320, maxHeight: 320 });
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
            
            saveAvatar(dataUrl).then(() => {
                cropperInstance.destroy();
                cropperInstance = null;
                cropView.style.display = 'none';
                mainView.style.display = 'block';
                updatePreview();
            });
        });

        // 取消裁剪
        p.querySelector('#cas-crop-cancel').addEventListener('click', () => {
            if (cropperInstance) { cropperInstance.destroy(); cropperInstance = null; }
            cropView.style.display = 'none';
            mainView.style.display = 'block';
            updatePreview();
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
