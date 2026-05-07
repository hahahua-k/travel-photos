/**
 * 主页逻辑模块 - 地图 + 流动板块
 */
const App = {
    config: null,
    currentRegion: null,
    rotX: 25,
    rotY: -15,
    isDragging: false,
    lastX: 0,
    lastY: 0,
    autoScrollTimer: null,
    autoScrollPaused: false,
    activeSectionId: null,

    async init() {
        GitHubAPI.init(null, 'hahahua-k', 'travel-photos');
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            if (token) GitHubAPI.init(token, owner, repo);
        }
        await this.loadData();
        this.initMapDrag();
        this.initAutoScroll();
        this.setupEventListeners();
    },

    async loadData() {
        const loading = document.getElementById('loading');
        try {
            this.config = await GitHubAPI.getConfig();
            if (loading) loading.style.display = 'none';
            
            // 兼容旧数据
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
            
            if (!this.config.sections) {
                this.config.sections = [];
            }
            
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
                    let coverUrl = album.cover || `https://picsum.photos/100/100?random=${aIndex}`;
                    if (coverUrl.includes('raw.githubusercontent.com')) {
                        coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=120&q=50&output=webp`;
                    }
                    const imgCount = album.images ? album.images.length : 0;

                    albumsHtml += `
                        <div class="album-row" data-album-id="${album.id}" data-section-id="${section.id}">
                            <div class="album-row-cover">
                                <img src="${coverUrl}" alt="${album.name}" loading="lazy"
                                     onerror="this.src='https://picsum.photos/100/100?random=${aIndex}'">
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

            // 相册点击
            block.querySelectorAll('.album-row').forEach(el => {
                el.addEventListener('click', () => {
                    window.location.href = `gallery.html?section=${el.dataset.sectionId}&album=${el.dataset.albumId}`;
                });
            });

            // 标记点击聚焦
            block.querySelector('.section-header').addEventListener('click', () => {
                this.focusSection(section.id);
            });

            track.appendChild(block);
        });

        // 初始化板块拖拽滚动（带惯性）
        this.initSectionsDrag(track);

        if (this.config.sections.length > 0) {
            this.focusSection(this.config.sections[0].id, false);
        }
    },

    focusSection(sectionId, scroll = true) {
        document.querySelectorAll('.map-marker').forEach(m => {
            m.classList.toggle('active', m.dataset.sectionId === sectionId);
        });

        if (scroll) {
            const block = document.querySelector(`.section-block[data-section-id="${sectionId}"]`);
            if (block) {
                const track = document.getElementById('sections-track');
                const trackRect = track.getBoundingClientRect();
                const blockRect = block.getBoundingClientRect();
                const offset = blockRect.left - trackRect.left - (trackRect.width / 2) + (blockRect.width / 2);
                track.scrollBy({ left: offset, behavior: 'smooth' });
            }
        }
    },

    initSectionsDrag(track) {
        let isDown = false;
        let startX;
        let scrollLeft;
        let velocity = 0;
        let lastX = 0;
        let lastTime = 0;
        let rafId = null;

        const onStart = (x) => {
            isDown = true;
            track.style.cursor = 'grabbing';
            startX = x - track.offsetLeft;
            scrollLeft = track.scrollLeft;
            lastX = x;
            lastTime = Date.now();
            velocity = 0;
            if (rafId) cancelAnimationFrame(rafId);
        };

        const onMove = (x) => {
            if (!isDown) return;
            const walk = (x - startX - track.offsetLeft + scrollLeft);
            track.scrollLeft = scrollLeft - (x - startX);

            const now = Date.now();
            const dt = now - lastTime;
            if (dt > 0) {
                velocity = (x - lastX) / dt;
            }
            lastX = x;
            lastTime = now;
        };

        const onEnd = () => {
            isDown = false;
            track.style.cursor = 'grab';
            let v = velocity * 200;
            const decay = () => {
                if (Math.abs(v) < 0.5) return;
                track.scrollLeft -= v;
                v *= 0.94;
                rafId = requestAnimationFrame(decay);
            };
            decay();
        };

        track.addEventListener('mousedown', (e) => onStart(e.pageX));
        window.addEventListener('mousemove', (e) => onMove(e.pageX));
        window.addEventListener('mouseup', onEnd);

        track.addEventListener('touchstart', (e) => onStart(e.touches[0].pageX), { passive: true });
        track.addEventListener('touchmove', (e) => onMove(e.touches[0].pageX), { passive: true });
        track.addEventListener('touchend', onEnd);
    },

    focusSection(sectionId, scroll = true) {
        this.activeSectionId = sectionId;

        document.querySelectorAll('.map-marker').forEach(m => {
            m.classList.toggle('active', m.dataset.sectionId === sectionId);
        });

        document.querySelectorAll('.album-card').forEach(c => {
            c.classList.toggle('active', c.dataset.sectionId === sectionId);
        });

        if (scroll) {
            const card = document.querySelector(`.album-card[data-section-id="${sectionId}"]`);
            if (card) {
                const track = document.getElementById('albums-track');
                const trackRect = track.getBoundingClientRect();
                const cardRect = card.getBoundingClientRect();
                const offset = cardRect.left - trackRect.left - (trackRect.width / 2) + (cardRect.width / 2);
                track.scrollBy({ left: offset, behavior: 'smooth' });
            }

            this.pauseAutoScroll(5000);
        }
    },

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
            const t = e.touches[0];
            onStart(t.clientX, t.clientY);
        }, { passive: true });
        window.addEventListener('touchmove', (e) => {
            const t = e.touches[0];
            onMove(t.clientX, t.clientY);
        }, { passive: true });
        window.addEventListener('touchend', onEnd);
    },

    initAutoScroll() {
        const track = document.getElementById('albums-track');
        if (!track) return;

        let direction = 1;
        let speed = 0.5;

        const scroll = () => {
            if (this.autoScrollPaused || this.isDragging) {
                requestAnimationFrame(scroll);
                return;
            }

            track.scrollLeft += speed * direction;

            if (track.scrollLeft >= track.scrollWidth - track.clientWidth) {
                direction = -1;
            } else if (track.scrollLeft <= 0) {
                direction = 1;
            }

            requestAnimationFrame(scroll);
        };

        track.addEventListener('mouseenter', () => this.pauseAutoScroll());
        track.addEventListener('mouseleave', () => this.resumeAutoScroll());
        track.addEventListener('touchstart', () => this.pauseAutoScroll(), { passive: true });
        track.addEventListener('touchend', () => setTimeout(() => this.resumeAutoScroll(), 2000));

        requestAnimationFrame(scroll);
    },

    pauseAutoScroll(duration) {
        this.autoScrollPaused = true;
        if (this.autoScrollTimer) clearTimeout(this.autoScrollTimer);
        if (duration) {
            this.autoScrollTimer = setTimeout(() => this.resumeAutoScroll(), duration);
        }
    },

    resumeAutoScroll() {
        this.autoScrollPaused = false;
    },

    handleSectionClick(section) {
        if (section.protected) {
            this.currentSection = section;
            this.showPasswordModal();
        } else {
            this.showSectionDetail(section);
        }
    },

    showSectionDetail(section) {
        const modal = document.getElementById('section-modal');
        const title = document.getElementById('section-modal-title');
        const content = document.getElementById('section-modal-content');

        title.textContent = section.name;

        let html = '';
        if (section.albums && section.albums.length > 0) {
            section.albums.forEach(album => {
                let coverUrl = album.cover || 'https://picsum.photos/200/150?random=1';
                if (coverUrl.includes('raw.githubusercontent.com')) {
                    coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=400&q=60&output=webp`;
                }
                const imgCount = album.images ? album.images.length : 0;
                html += `
                    <div class="section-modal-album" onclick="window.location.href='gallery.html?section=${section.id}&album=${album.id}'">
                        <img src="${coverUrl}" alt="${album.name}" onerror="this.src='https://picsum.photos/200/150?random=1'">
                        <div class="section-modal-album-info">
                            <div class="section-modal-album-name">${album.name}</div>
                            <div class="section-modal-album-count">${imgCount} 张照片</div>
                        </div>
                    </div>
                `;
            });
        } else {
            html = '<p style="text-align: center; color: rgba(255,255,255,0.3); padding: 40px;">暂无相册</p>';
        }

        content.innerHTML = html;
        modal.classList.add('active');
        this.pauseAutoScroll();
    },

    hideSectionDetail() {
        document.getElementById('section-modal').classList.remove('active');
        this.resumeAutoScroll();
    },

    showPasswordModal() {
        const modal = document.getElementById('password-modal');
        const input = document.getElementById('password-input');
        const error = document.getElementById('password-error');
        modal.classList.add('active');
        input.value = '';
        error.style.display = 'none';
        input.focus();
    },

    hidePasswordModal() {
        document.getElementById('password-modal').classList.remove('active');
        this.currentSection = null;
    },

    async verifyPassword() {
        const input = document.getElementById('password-input');
        const error = document.getElementById('password-error');
        if (!this.currentSection) return;

        const isValid = await CryptoUtils.verifyPassword(input.value, this.currentSection.passwordHash);
        if (isValid) {
            this.hidePasswordModal();
            this.showSectionDetail(this.currentSection);
        } else {
            error.style.display = 'block';
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
        }
    },

    setupEventListeners() {
        const passwordModal = document.getElementById('password-modal');
        const submitBtn = document.getElementById('password-submit');
        const input = document.getElementById('password-input');

        submitBtn.addEventListener('click', () => this.verifyPassword());
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.verifyPassword(); });
        passwordModal.addEventListener('click', (e) => { if (e.target === passwordModal) this.hidePasswordModal(); });

        const sectionModal = document.getElementById('section-modal');
        const sectionClose = document.getElementById('section-modal-close');
        if (sectionClose) sectionClose.addEventListener('click', () => this.hideSectionDetail());
        if (sectionModal) sectionModal.addEventListener('click', (e) => { if (e.target === sectionModal) this.hideSectionDetail(); });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
