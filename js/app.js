/**
 * 主页逻辑模块
 */
const App = {
    config: null,
    rotX: 25,
    rotY: -15,
    isDragging: false,
    lastX: 0,
    lastY: 0,

    async init() {
        GitHubAPI.init(null, 'hahahua-k', 'travel-photos');
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            if (token) GitHubAPI.init(token, owner, repo);
        }
        await this.loadData();
        this.initMapDrag();
        this.setupEventListeners();
    },

    async loadData() {
        const loading = document.getElementById('loading');
        try {
            this.config = await GitHubAPI.getConfig();
            if (loading) loading.style.display = 'none';

            if (this.config.regions && !this.config.sections) {
                this.config.sections = [{
                    id: 'section-migrated',
                    name: '我的旅行',
                    mapX: 60,
                    mapY: 45,
                    albums: this.config.regions.map(r => ({
                        id: r.id,
                        name: r.name,
                        cover: r.cover,
                        images: r.images || []
                    }))
                }];
            }

            if (!this.config.sections) this.config.sections = [];

            this.renderMarkers();
            this.renderSections();
        } catch (error) {
            console.error('加载数据失败:', error);
            if (loading) loading.style.display = 'none';
            this.config = { sections: [] };
        }
    },

    getImageUrl(img) {
        if (typeof img === 'string') return img;
        return img.thumbnail || img.url;
    },

    /* ========== 地图标记 ========== */
    renderMarkers() {
        const container = document.getElementById('map-markers');
        if (!container) return;
        container.innerHTML = '';

        if (!this.config || !this.config.sections) return;

        this.config.sections.forEach(section => {
            if (!section.mapX || !section.mapY) return;

            const marker = document.createElement('div');
            marker.className = 'map-marker';
            marker.dataset.sectionId = section.id;
            marker.style.left = section.mapX + '%';
            marker.style.top = section.mapY + '%';

            marker.innerHTML = `
                <div class="map-marker-pulse"></div>
                <div class="map-marker-dot"></div>
                <div class="map-marker-label">${section.name}</div>
            `;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.focusSection(section.id);
            });

            container.appendChild(marker);
        });
    },

    /* ========== 板块渲染 ========== */
    renderSections() {
        const track = document.getElementById('sections-track');
        if (!track) return;
        track.innerHTML = '';

        if (!this.config || !this.config.sections || this.config.sections.length === 0) {
            track.innerHTML = '<p class="empty-hint">暂无板块，请在管理页面添加</p>';
            return;
        }

        this.config.sections.forEach((section, index) => {
            const block = document.createElement('div');
            block.className = 'section-block';
            block.dataset.sectionId = section.id;

            let albumsHtml = '';
            if (section.albums && section.albums.length > 0) {
                section.albums.forEach((album, aIndex) => {
                    let coverUrl = album.cover || `https://picsum.photos/300/200?random=${aIndex}`;
                    if (coverUrl.includes('raw.githubusercontent.com')) {
                        coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=300&q=55&output=webp&fit=cover`;
                    }
                    const imgCount = album.images ? album.images.length : 0;

                    albumsHtml += `
                        <div class="album-row" data-album-id="${album.id}" data-section-id="${section.id}">
                            <div class="album-row-cover">
                                <img src="${coverUrl}" alt="${album.name}" loading="lazy"
                                     onerror="this.src='https://picsum.photos/300/200?random=${aIndex}'">
                            </div>
                            <div class="album-row-info">
                                <div class="album-row-name">${album.name}</div>
                                <div class="album-row-count">${imgCount} 张照片</div>
                            </div>
                            <div class="album-row-arrow">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
                            </div>
                        </div>
                    `;
                });
            } else {
                albumsHtml = '<p style="text-align: center; color: rgba(255,255,255,0.2); font-size: 0.85rem; padding: 30px 0;">暂无相册</p>';
            }

            block.innerHTML = `
                <div class="section-header">
                    <span class="section-header-tag">板块 ${String(index + 1).padStart(2, '0')}</span>
                    <h3 class="section-header-title">${section.name}</h3>
                </div>
                <div class="section-albums">
                    ${albumsHtml}
                </div>
            `;

            block.querySelectorAll('.album-row').forEach(el => {
                el.addEventListener('click', () => {
                    window.location.href = `gallery.html?section=${el.dataset.sectionId}&album=${el.dataset.albumId}`;
                });
            });

            block.querySelector('.section-header').addEventListener('click', () => {
                this.focusSection(section.id);
            });

            track.appendChild(block);
        });

        this.initSectionsDrag(track);
    },

    /* ========== 聚焦板块 ========== */
    focusSection(sectionId, scroll = true) {
        document.querySelectorAll('.map-marker').forEach(m => {
            m.classList.toggle('active', m.dataset.sectionId === sectionId);
        });

        if (!scroll) return;

        const track = document.getElementById('sections-track');
        if (!track) return;

        // 找到原始板块（非克隆）
        const block = track.querySelector(`.section-block[data-section-id="${sectionId}"]:not(.clone)`);
        if (!block) return;

        // 暂停自动滚动
        if (track._pauseAuto) track._pauseAuto();

        // 计算滚动位置，将板块居中
        const trackRect = track.getBoundingClientRect();
        const blockRect = block.getBoundingClientRect();
        const offset = blockRect.left - trackRect.left - (trackRect.width / 2) + (blockRect.width / 2);

        track.scrollTo({
            left: track.scrollLeft + offset,
            behavior: 'smooth'
        });

        // 5秒后恢复自动滚动
        if (track._resumeAuto) track._resumeAuto(5000);
    },

    /* ========== 板块拖拽滚动 ========== */
    initSectionsDrag(track) {
        let isDown = false;
        let startX = 0;
        let scrollLeftStart = 0;
        let lastX = 0;
        let lastTime = 0;
        let velocity = 0;
        let autoScrollPaused = false;
        let autoSpeed = 0.42;
        let originalWidth = 0;
        let hasMoved = false;

        const setupSeamless = () => {
            const items = track.querySelectorAll('.section-block');
            if (items.length === 0) return;
            const gap = 28;
            originalWidth = 0;
            items.forEach(item => { originalWidth += item.offsetWidth + gap; });
            items.forEach(item => {
                const clone = item.cloneNode(true);
                clone.classList.add('clone');
                clone.querySelectorAll('.album-row').forEach(el => {
                    el.addEventListener('click', () => {
                        window.location.href = `gallery.html?section=${el.dataset.sectionId}&album=${el.dataset.albumId}`;
                    });
                });
                track.appendChild(clone);
            });
        };

        requestAnimationFrame(() => setupSeamless());

        const autoScroll = () => {
            if (isDown || autoScrollPaused) {
                requestAnimationFrame(autoScroll);
                return;
            }
            track.scrollLeft += autoSpeed;
            if (originalWidth > 0 && track.scrollLeft >= originalWidth) {
                track.scrollLeft -= originalWidth;
            }
            requestAnimationFrame(autoScroll);
        };

        const pauseAuto = (duration) => {
            autoScrollPaused = true;
            if (duration) setTimeout(() => { autoScrollPaused = false; }, duration);
        };

        const resumeAuto = (delay) => {
            setTimeout(() => { autoScrollPaused = false; }, delay || 3000);
        };

        track._pauseAuto = pauseAuto;
        track._resumeAuto = resumeAuto;

        const onStart = (x) => {
            isDown = true;
            hasMoved = false;
            track.style.cursor = 'grabbing';
            startX = x;
            scrollLeftStart = track.scrollLeft;
            lastX = x;
            lastTime = Date.now();
            velocity = 0;
        };

        const onMove = (x) => {
            if (!isDown) return;
            const dx = x - startX;
            if (Math.abs(dx) > 3) hasMoved = true;
            track.scrollLeft = scrollLeftStart - dx;

            const now = Date.now();
            const dt = now - lastTime;
            if (dt > 20) {
                velocity = (x - lastX) / dt;
                lastX = x;
                lastTime = now;
            }
        };

        const onEnd = () => {
            if (!isDown) return;
            isDown = false;
            track.style.cursor = 'grab';

            let v = velocity * 100;
            v = Math.max(-30, Math.min(30, v));

            const decay = () => {
                if (Math.abs(v) < 0.3) {
                    resumeAuto(1500);
                    return;
                }
                track.scrollLeft -= v;
                if (originalWidth > 0 && track.scrollLeft >= originalWidth) {
                    track.scrollLeft -= originalWidth;
                }
                if (originalWidth > 0 && track.scrollLeft < 0) {
                    track.scrollLeft += originalWidth;
                }
                v *= 0.95;
                requestAnimationFrame(decay);
            };
            decay();
        };

        // 鼠标事件
        track.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(e.pageX); pauseAuto(); });
        window.addEventListener('mousemove', (e) => { if (isDown) onMove(e.pageX); });
        window.addEventListener('mouseup', () => { if (isDown) onEnd(); });

        // 触摸事件 - 关键修复
        track.addEventListener('touchstart', (e) => {
            onStart(e.touches[0].pageX);
            pauseAuto();
        }, { passive: true });

        track.addEventListener('touchmove', (e) => {
            if (!isDown) return;
            onMove(e.touches[0].pageX);
        }, { passive: true });

        track.addEventListener('touchend', () => {
            if (isDown) onEnd();
        }, { passive: true });

        // 悬停暂停（仅桌面）
        track.addEventListener('mouseenter', () => { autoScrollPaused = true; });
        track.addEventListener('mouseleave', () => { if (!isDown) autoScrollPaused = false; });

        requestAnimationFrame(autoScroll);
    },

    /* ========== 地图拖拽 ========== */
    initMapDrag() {
        const wrapper = document.getElementById('map-wrapper');
        const scene = document.getElementById('map-scene');
        if (!wrapper || !scene) return;

        const onStart = (x, y) => {
            this.isDragging = true;
            this.lastX = x;
            this.lastY = y;
            wrapper.style.cursor = 'grabbing';
        };

        const onMove = (x, y) => {
            if (!this.isDragging) return;
            const dx = x - this.lastX;
            const dy = y - this.lastY;
            this.rotY += dx * 0.3;
            this.rotX -= dy * 0.3;
            this.rotX = Math.max(-10, Math.min(60, this.rotX));
            this.rotY = Math.max(-60, Math.min(60, this.rotY));
            scene.style.transform = `rotateX(${this.rotX}deg) rotateY(${this.rotY}deg)`;
            this.lastX = x;
            this.lastY = y;
        };

        const onEnd = () => {
            this.isDragging = false;
            wrapper.style.cursor = 'grab';
        };

        wrapper.addEventListener('mousedown', (e) => onStart(e.clientX, e.clientY));
        window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onEnd);

        wrapper.addEventListener('touchstart', (e) => {
            onStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            onMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
        window.addEventListener('touchend', onEnd);
    },

    /* ========== 事件监听 ========== */
    setupEventListeners() {
        const passwordModal = document.getElementById('password-modal');
        const submitBtn = document.getElementById('password-submit');
        const input = document.getElementById('password-input');

        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.verifyPassword());
        }
        if (input) {
            input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.verifyPassword(); });
        }
        if (passwordModal) {
            passwordModal.addEventListener('click', (e) => { if (e.target === passwordModal) this.hidePasswordModal(); });
        }
    },

    showPasswordModal() {
        const modal = document.getElementById('password-modal');
        if (modal) modal.classList.add('active');
    },

    hidePasswordModal() {
        const modal = document.getElementById('password-modal');
        if (modal) modal.classList.remove('active');
    },

    async verifyPassword() {
        // 密码验证逻辑
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
