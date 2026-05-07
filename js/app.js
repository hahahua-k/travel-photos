/**
 * 主页逻辑模块 - 地图 + 自动滚动相册
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
    activeRegionId: null,

    async init() {
        GitHubAPI.init(null, 'hahahua-k', 'travel-photos');
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            if (token) GitHubAPI.init(token, owner, repo);
        }
        await this.loadRegions();
        this.initMapDrag();
        this.initAutoScroll();
        this.setupEventListeners();
    },

    async loadRegions() {
        const loading = document.getElementById('loading');
        try {
            this.config = await GitHubAPI.getConfig();
            if (loading) loading.style.display = 'none';
            this.renderMarkers();
            this.renderAlbums();
        } catch (error) {
            console.error('加载数据失败:', error);
            if (loading) loading.style.display = 'none';
            this.config = { regions: [] };
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

        if (!this.config || !this.config.regions) return;

        this.config.regions.forEach((region, index) => {
            if (!region.mapX || !region.mapY) return;

            const marker = document.createElement('div');
            marker.className = 'map-marker';
            marker.dataset.regionId = region.id;
            marker.style.left = region.mapX + '%';
            marker.style.top = region.mapY + '%';

            marker.innerHTML = `
                <div class="map-marker-pulse"></div>
                <div class="map-marker-dot"></div>
                <div class="map-marker-label">${region.name}</div>
            `;

            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.focusRegion(region.id);
            });

            container.appendChild(marker);
        });
    },

    renderAlbums() {
        const track = document.getElementById('albums-track');
        if (!track) return;
        track.innerHTML = '';

        if (!this.config || !this.config.regions || this.config.regions.length === 0) {
            track.innerHTML = '<p class="empty-hint">暂无相册，请在管理页面添加</p>';
            return;
        }

        this.config.regions.forEach((region, index) => {
            const imageCount = region.images ? region.images.length : 0;
            let coverUrl = region.cover || `https://picsum.photos/640/400?random=${index}`;
            if (coverUrl.includes('raw.githubusercontent.com')) {
                coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=800&q=70&output=webp`;
            }

            const card = document.createElement('div');
            card.className = 'album-card';
            card.dataset.regionId = region.id;

            card.innerHTML = `
                <div class="album-card-cover">
                    <img src="${coverUrl}" alt="${region.name}" loading="lazy"
                         onerror="this.src='https://picsum.photos/640/400?random=${index}'">
                </div>
                <div class="album-card-info">
                    <span class="album-card-tag">相册 ${String(index + 1).padStart(2, '0')}</span>
                    <h3 class="album-card-title">${region.name}</h3>
                    <p class="album-card-meta">${imageCount} 张照片</p>
                </div>
            `;

            card.addEventListener('click', () => this.handleRegionClick(region));
            track.appendChild(card);
        });

        if (this.config.regions.length > 0) {
            this.focusRegion(this.config.regions[0].id, false);
        }
    },

    focusRegion(regionId, scroll = true) {
        this.activeRegionId = regionId;

        document.querySelectorAll('.map-marker').forEach(m => {
            m.classList.toggle('active', m.dataset.regionId === regionId);
        });

        document.querySelectorAll('.album-card').forEach(c => {
            c.classList.toggle('active', c.dataset.regionId === regionId);
        });

        if (scroll) {
            const card = document.querySelector(`.album-card[data-region-id="${regionId}"]`);
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

    handleRegionClick(region) {
        if (region.protected) {
            this.currentRegion = region;
            this.showPasswordModal();
        } else {
            window.location.href = `gallery.html?id=${region.id}`;
        }
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
        this.currentRegion = null;
    },

    async verifyPassword() {
        const input = document.getElementById('password-input');
        const error = document.getElementById('password-error');
        if (!this.currentRegion) return;

        const isValid = await CryptoUtils.verifyPassword(input.value, this.currentRegion.passwordHash);
        if (isValid) {
            this.hidePasswordModal();
            window.location.href = `gallery.html?id=${this.currentRegion.id}`;
        } else {
            error.style.display = 'block';
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
        }
    },

    setupEventListeners() {
        const modal = document.getElementById('password-modal');
        const submitBtn = document.getElementById('password-submit');
        const input = document.getElementById('password-input');

        submitBtn.addEventListener('click', () => this.verifyPassword());
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.verifyPassword(); });
        modal.addEventListener('click', (e) => { if (e.target === modal) this.hidePasswordModal(); });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
