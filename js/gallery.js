/**
 * 图片画廊逻辑模块
 */
const Gallery = {
    config: null,
    region: null,
    currentImageIndex: 0,

    async init() {
        const urlParams = new URLSearchParams(window.location.search);
        const regionId = urlParams.get('id');

        if (!regionId) {
            this.showError('未指定相册ID');
            return;
        }

        GitHubAPI.init(null, 'hahahua-k', 'travel-photos');
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            if (token) GitHubAPI.init(token, owner, repo);
        }
        await this.loadRegion(regionId);
        this.setupEventListeners();
    },

    getImageUrl(img) {
        return typeof img === 'string' ? img : img.url;
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

    showDemoData(regionId) {
        this.region = {
            id: regionId,
            name: '示例相册',
            images: [
                { url: 'https://picsum.photos/800/600?random=1', compressed: false },
                { url: 'https://picsum.photos/800/600?random=2', compressed: true },
                { url: 'https://picsum.photos/800/600?random=3', compressed: false },
                { url: 'https://picsum.photos/800/600?random=4', compressed: true },
                { url: 'https://picsum.photos/800/600?random=5', compressed: false },
                { url: 'https://picsum.photos/800/600?random=6', compressed: false }
            ]
        };

        document.getElementById('region-title').textContent = this.region.name;
        document.getElementById('region-count').textContent = `${this.region.images.length} 张照片`;
        document.getElementById('loading').style.display = 'none';
        this.renderImages();
    },

    renderImages() {
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = '';

        if (!this.region.images || this.region.images.length === 0) {
            grid.innerHTML = '<p class="gallery-empty">暂无图片</p>';
            return;
        }

        this.region.images.forEach((img, index) => {
            const url = this.getImageUrl(img);
            const item = document.createElement('div');
            item.className = 'gallery-item scroll-animate';
            item.dataset.index = index;

            item.innerHTML = `
                <img src="${url}"
                     alt="照片 ${index + 1}"
                     class="img-loading"
                     onerror="this.parentElement.style.display='none'"
                     onload="this.classList.remove('img-loading'); this.classList.add('img-loaded')">
                <div class="gallery-item-overlay">
                    <span class="gallery-item-index">${index + 1}</span>
                </div>
            `;

            item.addEventListener('click', () => this.openLightbox(index));
            grid.appendChild(item);
        });

        this.setupScrollAnimations();
    },

    openLightbox(index) {
        this.currentImageIndex = index;
        const lightbox = document.getElementById('lightbox');
        const image = document.getElementById('lightbox-image');
        const url = this.getImageUrl(this.region.images[index]);

        image.src = url;
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
            const url = this.getImageUrl(this.region.images[newIndex]);

            image.style.opacity = '0';
            image.style.transform = direction > 0 ? 'translateX(30px)' : 'translateX(-30px)';

            setTimeout(() => {
                image.src = url;
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

        closeBtn.addEventListener('click', () => this.closeLightbox());
        prevBtn.addEventListener('click', () => this.navigateLightbox(-1));
        nextBtn.addEventListener('click', () => this.navigateLightbox(1));

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
