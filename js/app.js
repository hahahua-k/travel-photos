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
        const area = document.getElementById('sections-area');
        if (!area) return;
        area.innerHTML = '';

        if (!this.config || !this.config.sections || this.config.sections.length === 0) {
            area.innerHTML = '<p class="empty-hint">暂无板块，请在管理页面添加</p>';
            return;
        }

        this.config.sections.forEach((section, index) => {
            const block = document.createElement('div');
            block.className = 'section-block';
            block.dataset.sectionId = section.id;

            // 标题栏
            const header = document.createElement('div');
            header.className = 'section-header';
            header.innerHTML = `
                <span class="section-header-tag">板块 ${String(index + 1).padStart(2, '0')}</span>
                <h2 class="section-header-title">${section.name}</h2>
                <div class="section-header-line"></div>
            `;

            // 相册轨道
            const track = document.createElement('div');
            track.className = 'section-albums-track';

            if (section.albums && section.albums.length > 0) {
                section.albums.forEach((album, aIndex) => {
                    let coverUrl = album.cover || `https://picsum.photos/400/300?random=${aIndex}`;
                    if (coverUrl.includes('raw.githubusercontent.com')) {
                        coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=500&q=60&output=webp`;
                    }
                    const imgCount = album.images ? album.images.length : 0;

                    const albumEl = document.createElement('div');
                    albumEl.className = 'album-item';
                    albumEl.innerHTML = `
                        <div class="album-item-cover">
                            <img src="${coverUrl}" alt="${album.name}" loading="lazy"
                                 onerror="this.src='https://picsum.photos/400/300?random=${aIndex}'">
                        </div>
                        <div class="album-item-info">
                            <div class="album-item-name">${album.name}</div>
                            <div class="album-item-count">${imgCount} 张照片</div>
                        </div>
                    `;

                    albumEl.addEventListener('click', () => {
                        window.location.href = `gallery.html?section=${section.id}&album=${album.id}`;
                    });

                    track.appendChild(albumEl);
                });
            } else {
                track.innerHTML = '<p style="color: rgba(255,255,255,0.2); font-size: 0.85rem; padding: 20px 0;">暂无相册</p>';
            }

            // 拖拽滚动
            this.initDragScroll(track);

            block.appendChild(header);
            block.appendChild(track);
            area.appendChild(block);
        });

        // 滚动动画观察
        this.setupScrollAnimations();
    },

    initDragScroll(track) {
        let isDown = false;
        let startX;
        let scrollLeft;
        let velocity = 0;
        let lastX = 0;
        let lastTime = 0;
        let rafId = null;

        const onMouseDown = (e) => {
            isDown = true;
            track.style.cursor = 'grabbing';
            startX = e.pageX - track.offsetLeft;
            scrollLeft = track.scrollLeft;
            lastX = e.pageX;
            lastTime = Date.now();
            velocity = 0;
            if (rafId) cancelAnimationFrame(rafId);
        };

        const onMouseMove = (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - track.offsetLeft;
            const walk = (x - startX) * 1.5;
            track.scrollLeft = scrollLeft - walk;

            const now = Date.now();
            const dt = now - lastTime;
            if (dt > 0) {
                velocity = (e.pageX - lastX) / dt;
            }
            lastX = e.pageX;
            lastTime = now;
        };

        const onMouseUp = () => {
            isDown = false;
            track.style.cursor = 'grab';

            // 惯性滚动
            let currentVelocity = velocity * 150;
            const decelerate = () => {
                if (Math.abs(currentVelocity) < 0.5) return;
                track.scrollLeft -= currentVelocity;
                currentVelocity *= 0.95; // 摩擦系数
                rafId = requestAnimationFrame(decelerate);
            };
            decelerate();
        };

        track.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // 触摸支持
        let touchStartX = 0;
        let touchScrollLeft = 0;
        let touchLastX = 0;
        let touchLastTime = 0;

        track.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].pageX;
            touchScrollLeft = track.scrollLeft;
            touchLastX = touchStartX;
            touchLastTime = Date.now();
            velocity = 0;
            if (rafId) cancelAnimationFrame(rafId);
        }, { passive: true });

        track.addEventListener('touchmove', (e) => {
            const x = e.touches[0].pageX;
            const walk = (touchStartX - x) * 1.2;
            track.scrollLeft = touchScrollLeft + walk;

            const now = Date.now();
            const dt = now - touchLastTime;
            if (dt > 0) {
                velocity = (x - touchLastX) / dt;
            }
            touchLastX = x;
            touchLastTime = now;
        }, { passive: true });

        track.addEventListener('touchend', () => {
            let currentVelocity = velocity * 150;
            const decelerate = () => {
                if (Math.abs(currentVelocity) < 0.5) return;
                track.scrollLeft -= currentVelocity;
                currentVelocity *= 0.95;
                rafId = requestAnimationFrame(decelerate);
            };
            decelerate();
        });
    },

    setupScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                } else {
                    entry.target.classList.remove('visible');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        document.querySelectorAll('.section-block').forEach(el => {
            observer.observe(el);
        });
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
