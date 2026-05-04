/**
 * 管理后台逻辑模块
 */
const Admin = {
    config: null,
    currentRegionId: null,

    init() {
        this.loadConfig();
        this.setupEventListeners();
    },

    loadConfig() {
        const savedConfig = localStorage.getItem('github_config');
        if (savedConfig) {
            const { token, owner, repo } = JSON.parse(savedConfig);
            document.getElementById('token-input').value = token;
            document.getElementById('owner-input').value = owner;
            document.getElementById('repo-input').value = repo;
            GitHubAPI.init(token, owner, repo);
            this.loadRegions();
        }
    },

    saveConfig() {
        const token = document.getElementById('token-input').value.trim();
        const owner = document.getElementById('owner-input').value.trim();
        const repo = document.getElementById('repo-input').value.trim();

        if (!token || !owner || !repo) {
            this.showMessage('请填写所有配置项', 'error');
            return;
        }

        localStorage.setItem('github_config', JSON.stringify({ token, owner, repo }));
        GitHubAPI.init(token, owner, repo);
        this.showMessage('配置已保存', 'success');
        this.loadRegions();
    },

    async loadRegions() {
        try {
            this.config = await GitHubAPI.getConfig();
            if (!this.config.regions) {
                this.config.regions = [];
            }
            this.renderRegions();
        } catch (error) {
            console.error('加载配置失败:', error);
            this.config = { regions: [] };
            this.renderRegions();
        }
    },

    renderRegions() {
        const list = document.getElementById('region-list');
        list.innerHTML = '';

        if (!this.config.regions || this.config.regions.length === 0) {
            list.innerHTML = '<li style="text-align: center; color: #666; padding: 20px;">暂无相册</li>';
            return;
        }

        this.config.regions.forEach(region => {
            const li = document.createElement('li');
            li.className = 'region-item';
            li.innerHTML = `
                <div class="region-info">
                    <div class="region-name">${region.name} ${region.protected ? '🔒' : ''}</div>
                    <div class="region-meta">${region.images ? region.images.length : 0} 张照片</div>
                </div>
                <div class="region-actions">
                    <button class="btn btn-primary btn-sm" onclick="Admin.editRegion('${region.id}')">编辑</button>
                    <button class="btn btn-primary btn-sm" onclick="Admin.manageImages('${region.id}')">图片</button>
                    <button class="btn btn-danger btn-sm" onclick="Admin.deleteRegion('${region.id}')">删除</button>
                </div>
            `;
            list.appendChild(li);
        });
    },

    showAddRegionForm() {
        const name = prompt('请输入相册名称:');
        if (!name) return;

        const protect = confirm('是否设置为加密相册？');
        let passwordHash = null;

        if (protect) {
            const password = prompt('请设置访问密码:');
            if (!password) return;
            passwordHash = CryptoUtils.sha256(password);
        }

        this.createRegion(name, protect, passwordHash);
    },

    async createRegion(name, isProtected, passwordHash) {
        const id = 'region-' + Date.now();
        const newRegion = {
            id: id,
            name: name,
            cover: null,
            images: [],
            protected: isProtected
        };

        if (isProtected && passwordHash) {
            newRegion.passwordHash = await passwordHash;
        }

        this.config.regions.push(newRegion);
        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderRegions();
            this.showMessage(`相册"${name}"创建成功`, 'success');
        } else {
            this.config.regions.pop();
            this.showMessage('创建失败，请检查网络和 Token 权限', 'error');
        }
    },

    async editRegion(regionId) {
        const region = this.config.regions.find(r => r.id === regionId);
        if (!region) return;

        const newName = prompt('请输入新的相册名称:', region.name);
        if (!newName || newName === region.name) return;

        const oldName = region.name;
        region.name = newName;
        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderRegions();
            this.showMessage('相册名称已更新', 'success');
        } else {
            region.name = oldName;
            this.showMessage('更新失败，请检查网络和 Token 权限', 'error');
        }
    },

    async deleteRegion(regionId) {
        if (!confirm('确定要删除这个相册吗？此操作不可撤销。')) return;

        const deletedRegion = this.config.regions.find(r => r.id === regionId);
        this.config.regions = this.config.regions.filter(r => r.id !== regionId);
        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderRegions();
            this.showMessage('相册已删除', 'success');
        } else {
            this.config.regions.push(deletedRegion);
            this.showMessage('删除失败，请检查网络和 Token 权限', 'error');
        }
    },

    manageImages(regionId) {
        this.currentRegionId = regionId;
        const region = this.config.regions.find(r => r.id === regionId);
        if (!region) return;

        document.getElementById('current-region-name').textContent = region.name;
        document.getElementById('image-section').style.display = 'block';
        this.renderImages();
    },

    renderImages() {
        const grid = document.getElementById('image-grid');
        const region = this.config.regions.find(r => r.id === this.currentRegionId);
        
        if (!region || !region.images || region.images.length === 0) {
            grid.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">暂无图片</p>';
            return;
        }

        grid.innerHTML = region.images.map((url, index) => `
            <div class="image-item">
                <img src="${url}" alt="图片 ${index + 1}" onerror="this.src='https://picsum.photos/150/120?random=${index}'">
                <button class="image-delete" onclick="Admin.deleteImage(${index})">&times;</button>
            </div>
        `).join('');
    },

    async handleFileUpload(files) {
        const region = this.config.regions.find(r => r.id === this.currentRegionId);
        if (!region) return;

        this.showLoading();

        let uploadedCount = 0;
        for (const file of files) {
            const path = `images/${this.currentRegionId}/${Date.now()}-${file.name}`;
            const url = await GitHubAPI.uploadImage(path, file);
            
            if (url) {
                if (!region.images) region.images = [];
                region.images.push(url);
                
                if (!region.cover) {
                    region.cover = url;
                }
                uploadedCount++;
            }
        }

        const success = await this.saveConfigToGitHub();
        this.renderImages();
        this.renderRegions();
        this.hideLoading();
        
        if (success && uploadedCount > 0) {
            this.showMessage(`${uploadedCount} 张图片上传成功`, 'success');
        } else if (!success) {
            this.showMessage('保存配置失败，请检查网络和 Token 权限', 'error');
        } else {
            this.showMessage('图片上传失败', 'error');
        }
    },

    async deleteImage(index) {
        if (!confirm('确定要删除这张图片吗？')) return;

        const region = this.config.regions.find(r => r.id === this.currentRegionId);
        if (!region) return;

        const deletedImage = region.images[index];
        region.images.splice(index, 1);
        
        if (region.cover && !region.images.includes(region.cover)) {
            region.cover = region.images[0] || null;
        }

        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderImages();
            this.renderRegions();
            this.showMessage('图片已删除', 'success');
        } else {
            region.images.splice(index, 0, deletedImage);
            this.showMessage('删除失败，请检查网络和 Token 权限', 'error');
        }
    },

    async saveConfigToGitHub() {
        try {
            const success = await GitHubAPI.saveConfig(this.config);
            if (!success) {
                this.showMessage('保存到 GitHub 失败', 'error');
                return false;
            }
            return true;
        } catch (error) {
            console.error('保存配置失败:', error);
            this.showMessage('保存到 GitHub 失败: ' + error.message, 'error');
            return false;
        }
    },

    showMessage(text, type) {
        const message = document.getElementById('message');
        message.textContent = text;
        message.className = `message ${type}`;
        message.style.display = 'block';
        
        setTimeout(() => {
            message.style.display = 'none';
        }, 3000);
    },

    showLoading() {
        document.getElementById('loading-overlay').classList.add('active');
    },

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    },

    setupEventListeners() {
        document.getElementById('save-config').addEventListener('click', () => this.saveConfig());
        document.getElementById('add-region').addEventListener('click', () => this.showAddRegionForm());
        
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');

        uploadArea.addEventListener('click', () => fileInput.click());
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#3498db';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = '#ddd';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#ddd';
            if (e.dataTransfer.files.length > 0) {
                this.handleFileUpload(e.dataTransfer.files);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files);
                e.target.value = '';
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
