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

    renderRegions() {
        const grid = document.getElementById('regions-grid');
        grid.innerHTML = '';

        if (!this.config || !this.config.regions || this.config.regions.length === 0) {
            grid.innerHTML = '<p class="empty-hint">暂无相册，请在管理页面添加</p>';
            return;
        }

        this.config.regions.forEach((region, index) => {
            const imageCount = region.images ? region.images.length : 0;
            let coverUrl = region.cover || `https://picsum.photos/800/500?random=${index}`;
            if (coverUrl.includes('raw.githubusercontent.com')) {
                coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=1200&q=70&output=webp`;
            }

            const isEven = index % 2 === 0;
            const section = document.createElement('div');
            section.className = 'album-row scroll-animate';
            section.dataset.regionId = region.id;

            section.innerHTML = `
                <div class="album-row-inner ${isEven ? '' : 'reverse'}">
                    <div class="album-cover">
                        <img src="${coverUrl}" alt="${region.name}" loading="lazy"
                             onerror="this.src='https://picsum.photos/800/500?random=${index}'">
                        ${region.protected ? '<div class="album-lock"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' : ''}
                    </div>
                    <div class="album-info">
                        <span class="album-tag">相册 ${String(index + 1).padStart(2, '0')}</span>
                        <h2 class="album-title">${region.name}</h2>
                        <p class="album-meta">${imageCount} 张照片</p>
                        <div class="album-arrow">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/></svg>
                        </div>
                    </div>
                </div>
            `;

            section.addEventListener('click', () => this.handleRegionClick(region));
            grid.appendChild(section);
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
            threshold: 0.15,
            rootMargin: '0px 0px -60px 0px'
        });

        setTimeout(() => {
            document.querySelectorAll('.scroll-animate').forEach(el => {
                observer.observe(el);
            });
        }, 100);
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
