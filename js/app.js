/**
 * 主页逻辑模块
 */
const App = {
    config: null,
    currentRegion: null,

    async init() {
        GitHubAPI.init(null, 'hahahua-k', 'travel-photos');
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            if (token) GitHubAPI.init(token, owner, repo);
        }
        await this.loadRegions();
        this.setupEventListeners();
        this.setupScrollAnimations();
    },

    async loadRegions() {
        const loading = document.getElementById('loading');
        try {
            this.config = await GitHubAPI.getConfig();
            loading.style.display = 'none';
            this.renderRegions();
        } catch (error) {
            console.error('加载数据失败:', error);
            loading.style.display = 'none';
            this.config = { regions: [] };
            this.renderRegions();
        }
    },

    showDemoData() {
        this.config = {
            regions: [
                {
                    id: 'demo-1',
                    name: '示例相册',
                    cover: 'https://picsum.photos/400/300?random=1',
                    images: [
                        'https://picsum.photos/800/600?random=1',
                        'https://picsum.photos/800/600?random=2',
                        'https://picsum.photos/800/600?random=3'
                    ],
                    protected: false
                }
            ]
        };
        this.renderRegions();
    },

    renderRegions() {
        const grid = document.getElementById('regions-grid');
        grid.innerHTML = '';

        if (!this.config || !this.config.regions || this.config.regions.length === 0) {
            grid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">暂无相册，请在管理页面添加</p>';
            return;
        }

        this.config.regions.forEach((region, index) => {
            const card = document.createElement('div');
            card.className = `card scroll-animate delay-${(index % 6) + 1}`;
            card.dataset.regionId = region.id;

            const imageCount = region.images ? region.images.length : 0;
            let coverUrl = region.cover || `https://picsum.photos/400/300?random=${index}`;
            if (coverUrl.includes('raw.githubusercontent.com')) {
                coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=600&q=60&output=webp`;
            }

            card.innerHTML = `
                <div class="card-image-wrapper">
                    <img src="${coverUrl}" 
                         alt="${region.name}" 
                         class="card-image img-loading"
                         onerror="this.src='https://picsum.photos/400/300?random=${index}'"
                         onload="this.classList.remove('img-loading'); this.classList.add('img-loaded')">
                </div>
                <div class="card-content">
                    <h3 class="card-title">${region.name}</h3>
                    <p class="card-count">${imageCount} 张照片</p>
                </div>
                ${region.protected ? '<div class="card-lock">🔒</div>' : ''}
            `;

            card.addEventListener('click', () => this.handleRegionClick(region));
            grid.appendChild(card);
        });
    },

    handleRegionClick(region) {
        if (region.protected) {
            this.currentRegion = region;
            this.showPasswordModal();
        } else {
            this.navigateToGallery(region.id);
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
        const modal = document.getElementById('password-modal');
        modal.classList.remove('active');
        this.currentRegion = null;
    },

    async verifyPassword() {
        const input = document.getElementById('password-input');
        const error = document.getElementById('password-error');

        if (!this.currentRegion) return;

        const isValid = await CryptoUtils.verifyPassword(input.value, this.currentRegion.passwordHash);

        if (isValid) {
            this.hidePasswordModal();
            this.navigateToGallery(this.currentRegion.id);
        } else {
            error.style.display = 'block';
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
        }
    },

    navigateToGallery(regionId) {
        window.location.href = `gallery.html?id=${regionId}`;
    },

    setupEventListeners() {
        const modal = document.getElementById('password-modal');
        const submitBtn = document.getElementById('password-submit');
        const input = document.getElementById('password-input');

        submitBtn.addEventListener('click', () => this.verifyPassword());

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.verifyPassword();
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.hidePasswordModal();
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

        setTimeout(() => {
            document.querySelectorAll('.scroll-animate').forEach(el => {
                observer.observe(el);
            });
        }, 100);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
