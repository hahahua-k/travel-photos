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

        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            GitHubAPI.init(token, owner, repo);
            await this.loadRegion(regionId);
        } else {
            this.showDemoData(regionId);
        }

        this.setupEventListeners();
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
                'https://picsum.photos/800/600?random=1',
                'https://picsum.photos/800/600?random=2',
                'https://picsum.photos/800/600?random=3',
                'https://picsum.photos/800/600?random=4',
                'https://picsum.photos/800/600?random=5',
                'https://picsum.photos/800/600?random=6'
            ]
        };

        document.getElementById('region-title').textContent = this.region.name;
        document.getElementById('loading').style.display = 'none';
        this.renderImages();
    },

    renderImages() {
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = '';

        if (!this.region.images || this.region.images.length === 0) {
            grid.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">暂无图片</p>';
            return;
        }

        this.region.images.forEach((imageUrl, index) => {
            const item = document.createElement('div');
            item.className = 'gallery-item scroll-animate';
            item.dataset.index = index;

            item.innerHTML = `
                <img src="${imageUrl}" 
                     alt="照片 ${index + 1}" 
                     class="img-loading"
                     onerror="this.parentElement.style.display='none'"
                     onload="this.classList.remove('img-loading'); this.classList.add('img-loaded')">
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

        image.src = this.region.images[index];
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';
        this.updateNavButtons();
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
            image.src = this.region.images[newIndex];
            this.updateNavButtons();
        }
    },

    updateNavButtons() {
        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');

        prevBtn.style.visibility = this.currentImageIndex === 0 ? 'hidden' : 'visible';
        nextBtn.style.visibility = this.currentImageIndex === this.region.images.length - 1 ? 'hidden' : 'visible';
    },

    showError(message) {
        const grid = document.getElementById('gallery-grid');
        grid.innerHTML = `<p style="text-align: center; color: #e74c3c; padding: 40px;">${message}</p>`;
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
            if (e.target === lightbox) this.closeLightbox();
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
