/**
 * 图片画廊逻辑模块
 */
const Gallery = {
    config: null,
    region: null,
    currentImageIndex: 0,
    viewMode: 'thumbnail',

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const regionId = urlParams.get('id');

        if (!regionId) {
            this.showError('未指定相册ID');
            return;
        }

        this.viewMode = localStorage.getItem('gallery_view_mode') || 'thumbnail';
        this.updateToggleUI();

        GitHubAPI.init(null, 'hahahua-k', 'travel-photos');
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            if (token) GitHubAPI.init(token, owner, repo);
        }
        await this.loadRegion(regionId);
        this.setupEventListeners();
    },

    getImageUrl(img, mode) {
        const url = typeof img === 'string' ? img : (img.url || img);
        if (!url) return url;
        if (mode === 'thumbnail' && url.includes('raw.githubusercontent.com')) {
            const thumb = (typeof img === 'object' && img.thumbnail) ? img.thumbnail : url;
            return `https://wsrv.nl/?url=${encodeURIComponent(thumb)}&w=600&q=60&output=webp`;
        }
        if (mode === 'full' && url.includes('raw.githubusercontent.com')) {
            return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=2000&q=85`;
        }
        return url;
    },

    getThumbUrl(img) {
        return this.getImageUrl(img, 'thumbnail');
    },

    getFullUrl(img) {
        return this.getImageUrl(img, 'full');
    },

    toggleViewMode(mode) {
        this.viewMode = mode;
        localStorage.setItem('gallery_view_mode', mode);
        this.updateToggleUI();
        this.renderImages();
    },

    updateToggleUI() {
        const toggle = document.getElementById('view-toggle');
        if (!toggle) return;
        toggle.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.viewMode);
        });
        const slider = toggle.querySelector('.toggle-slider');
        if (slider) {
            slider.style.transform = this.viewMode === 'full' ? 'translateX(100%)' : 'translateX(0)';
        }
    },

    async loadRegion(regionId) {
        const loading = document.getElementById('loading');
        try {
            this.config = await GitHubAPI.getConfig();
            this.region = this.config.regions.find(r => r.id === regionId);

            if (!this.region) {
                this.showError('未找到指定相册');
                return;
            }

            document.title = `${this.region.name} - 旅行相册`;
            document.getElementById('region-title').textContent = this.region.name;
            const count = this.region.images ? this.region.images.length : 0;
            document.getElementById('region-count').textContent = `${count} 张照片`;
            loading.style.display = 'none';
            this.renderImages();
        } catch (error) {
            console.error('加载数据失败:', error);
            loading.style.display = 'none';
            this.showError('加载数据失败');
        }
    },

    renderImages() {
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = '';

        if (!this.region.images || this.region.images.length === 0) {
            grid.innerHTML = '<p class="gallery-empty">暂无图片</p>';
            return;
        }

        const isThumbnail = this.viewMode === 'thumbnail';
        grid.classList.toggle('gallery-grid-compact', isThumbnail);

        this.region.images.forEach((img, index) => {
            const thumbUrl = this.getThumbUrl(img);
            const item = document.createElement('div');
            item.className = 'gallery-item scroll-animate';
            item.dataset.index = index;

            if (isThumbnail) {
                item.innerHTML = `
                    <img src="${thumbUrl}"
                         alt="照片 ${index + 1}"
                         class="img-loading"
                         loading="lazy"
                         onerror="this.parentElement.style.display='none'"
                         onload="this.classList.remove('img-loading'); this.classList.add('img-loaded')">
                    <div class="gallery-item-overlay">
                        <span class="gallery-item-index">${index + 1}</span>
                    </div>
                `;
            } else {
                const fullUrl = this.getFullUrl(img);
                item.innerHTML = `
                    <img src="${fullUrl}"
                         alt="照片 ${index + 1}"
                         class="img-loading"
                         loading="lazy"
                         onerror="this.parentElement.style.display='none'"
                         onload="this.classList.remove('img-loading'); this.classList.add('img-loaded')">
                    <div class="gallery-item-overlay">
                        <span class="gallery-item-index">${index + 1}</span>
                    </div>
                `;
            }

            item.addEventListener('click', () => this.openLightbox(index));
            grid.appendChild(item);
        });

        this.setupScrollAnimations();
    },

    openLightbox(index) {
        this.currentImageIndex = index;
        const lightbox = document.getElementById('lightbox');
        const image = document.getElementById('lightbox-image');
        const fullUrl = this.getFullUrl(this.region.images[index]);

        image.src = fullUrl;
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.updateLightboxInfo();
    },

    closeLightbox() {
        const lightbox = document.getElementById('lightbox');
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    },

    navigateLightbox(direction) {
        const newIndex = this.currentImageIndex + direction;
        if (newIndex >= 0 && newIndex < this.region.images.length) {
            this.currentImageIndex = newIndex;
            const image = document.getElementById('lightbox-image');
            const fullUrl = this.getFullUrl(this.region.images[newIndex]);

            image.style.opacity = '0';
            image.style.transform = direction > 0 ? 'translateX(30px)' : 'translateX(-30px)';

            setTimeout(() => {
                image.src = fullUrl;
                this.updateLightboxInfo();
                requestAnimationFrame(() => {
                    image.style.opacity = '1';
                    image.style.transform = 'translateX(0)';
                });
            }, 150);
        }
    },

    updateLightboxInfo() {
        const counter = document.getElementById('lightbox-counter');
        const total = this.region.images.length;
        counter.textContent = `${this.currentImageIndex + 1} / ${total}`;

        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');
        prevBtn.style.opacity = this.currentImageIndex === 0 ? '0.3' : '1';
        prevBtn.style.pointerEvents = this.currentImageIndex === 0 ? 'none' : 'auto';
        nextBtn.style.opacity = this.currentImageIndex === total - 1 ? '0.3' : '1';
        nextBtn.style.pointerEvents = this.currentImageIndex === total - 1 ? 'none' : 'auto';
    },

    showError(message) {
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = `<p class="gallery-empty" style="color: var(--accent-color);">${message}</p>`;
        document.getElementById('loading').style.display = 'none';
    },

    setupEventListeners() {
        const lightbox = document.getElementById('lightbox');
        const closeBtn = document.getElementById('lightbox-close');
        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');
        const toggle = document.getElementById('view-toggle');

        closeBtn.addEventListener('click', () => this.closeLightbox());
        prevBtn.addEventListener('click', () => this.navigateLightbox(-1));
        nextBtn.addEventListener('click', () => this.navigateLightbox(1));

        if (toggle) {
            toggle.querySelectorAll('.toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => this.toggleViewMode(btn.dataset.mode));
            });
        }

        lightbox.addEventListener('click', (e) => {
            if (e.target.classList.contains('lightbox-overlay') || e.target.classList.contains('lightbox-container')) {
                this.closeLightbox();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('active')) return;

            switch (e.key) {
                case 'Escape':
                    this.closeLightbox();
                    break;
                case 'ArrowLeft':
                    this.navigateLightbox(-1);
                    break;
                case 'ArrowRight':
                    this.navigateLightbox(1);
                    break;
            }
        });
    },

    setupScrollAnimations() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        });

        document.querySelectorAll('.scroll-animate').forEach(el => {
            observer.observe(el);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Gallery.init());
