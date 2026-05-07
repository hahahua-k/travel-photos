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
            this.migrateImageFormat();
            this.renderRegions();
        } catch (error) {
            console.error('加载配置失败:', error);
            this.config = { regions: [] };
            this.renderRegions();
        }
    },

    migrateImageFormat() {
        if (!this.config.regions) return;
        this.config.regions.forEach(region => {
            if (region.images) {
                region.images = region.images.map(img => {
                    if (typeof img === 'string') {
                        return { url: img, compressed: false };
                    }
                    return img;
                });
            }
        });
    },

    getImageUrl(img) {
        return typeof img === 'string' ? img : img.url;
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
            const imageCount = region.images ? region.images.length : 0;
            const compressedCount = region.images ? region.images.filter(img => img.compressed).length : 0;
            li.innerHTML = `
                <div class="region-info">
                    <div class="region-name">${region.name} ${region.protected ? '🔒' : ''}</div>
                    <div class="region-meta">${imageCount} 张照片${compressedCount > 0 ? ` · ${compressedCount} 张已压缩` : ''}</div>
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

        grid.innerHTML = region.images.map((img, index) => {
            const url = this.getImageUrl(img);
            const thumbUrl = (typeof img === 'object' && img.thumbnail) ? img.thumbnail : url;
            const compressed = img.compressed;
            return `
                <div class="image-item">
                    <img src="${thumbUrl}" alt="图片 ${index + 1}" onerror="this.src='https://picsum.photos/150/120?random=${index}'">
                    ${compressed ? '<span class="image-badge">已压缩</span>' : ''}
                    <button class="image-delete" onclick="Admin.deleteImage(${index})">&times;</button>
                </div>
            `;
        }).join('');
    },

    async handleFileUpload(files) {
        const region = this.config.regions.find(r => r.id === this.currentRegionId);
        if (!region) return;

        this.showLoading();

        const maxSize = 50 * 1024 * 1024;
        let uploadedCount = 0;
        let failedCount = 0;
        let compressedCount = 0;
        const failedFiles = [];

        const totalFiles = files.length;
        let currentFileIndex = 0;

        for (const file of files) {
            currentFileIndex++;
            let uploadFile = file;
            let wasCompressed = false;
            const fileSizeMB = file.size / 1024 / 1024;

            if (file.size > maxSize) {
                failedCount++;
                failedFiles.push(`${file.name} (文件过大: ${fileSizeMB.toFixed(1)}MB)`);
                continue;
            }

            if (fileSizeMB > 30 && file.type.startsWith('image/')) {
                try {
                    this.updateLoading(`正在压缩 (${currentFileIndex}/${totalFiles})`, `${file.name} ${fileSizeMB.toFixed(1)}MB`, false);
                    uploadFile = await ImageCompressor.compress(file, 30, 0.85);
                    wasCompressed = true;
                    compressedCount++;
                } catch (error) {
                    console.error('压缩失败:', error);
                }
            }

            let thumbFile = null;
            try {
                this.updateLoading(`正在生成缩略图 (${currentFileIndex}/${totalFiles})`, file.name, false);
                thumbFile = await ImageCompressor.generateThumbnail(file, 800, 0.6);
            } catch (error) {
                console.error('缩略图生成失败:', error);
            }

            const timestamp = Date.now();
            const mainPath = `images/${this.currentRegionId}/${timestamp}-${file.name}`;
            const thumbPath = `images/${this.currentRegionId}/${timestamp}-thumb-${file.name.replace(/\.[^.]+$/, '.jpg')}`;

            const mainSize = uploadFile.size;
            const thumbSize = thumbFile ? thumbFile.size : 0;

            this.updateLoading(`正在上传 (${currentFileIndex}/${totalFiles})`, file.name, true);
            this.updateProgress(0);

            const url = await GitHubAPI.uploadImage(mainPath, uploadFile, (loaded, total) => {
                const fraction = loaded / total;
                const percent = Math.min(Math.floor(fraction * 95), 95);
                this.updateProgress(percent);
                this.updateLoadingDetail(`${this.formatSize(loaded)} / ${this.formatSize(total)}`);
            }, (status) => {
                if (status === 'waiting') this.updateLoadingDetail('等待服务器确认...');
                if (status === 'timeout') this.updateLoadingDetail('确认超时');
            });

            let thumbUrl = null;
            if (thumbFile) {
                this.updateLoading(`正在上传缩略图 (${currentFileIndex}/${totalFiles})`, file.name, true);
                thumbUrl = await GitHubAPI.uploadImage(thumbPath, thumbFile, (loaded, total) => {
                    const fraction = loaded / total;
                    const percent = Math.min(95 + Math.floor(fraction * 5), 100);
                    this.updateProgress(percent);
                    this.updateLoadingDetail(`${this.formatSize(loaded)} / ${this.formatSize(total)}`);
                }, (status) => {
                    if (status === 'waiting') this.updateLoadingDetail('等待服务器确认...');
                    if (status === 'timeout') this.updateLoadingDetail('确认超时');
                });
            } else {
                this.updateProgress(100);
            }

            if (url) {
                if (!region.images) region.images = [];
                region.images.push({
                    url: url,
                    thumbnail: thumbUrl || url,
                    compressed: wasCompressed
                });

                if (!region.cover) {
                    region.cover = thumbUrl || url;
                }
                uploadedCount++;

                this.updateLoading(`正在保存配置 (${currentFileIndex}/${totalFiles})`, file.name, false);
                await this.saveConfigToGitHub();
                this.renderImages();
                this.renderRegions();
            } else {
                failedCount++;
                failedFiles.push(file.name);
            }
        }

        this.hideLoading();

        if (uploadedCount > 0) {
            let message = `${uploadedCount} 张图片上传成功`;
            if (compressedCount > 0) {
                message += `（${compressedCount} 张已压缩）`;
            }
            if (failedCount > 0) {
                message += `，${failedCount} 张失败`;
                if (failedFiles.length > 0) {
                    message += `: ${failedFiles.join(', ')}`;
                }
            }
            this.showMessage(message, failedCount > 0 ? 'error' : 'success');
        } else {
            this.showMessage(`图片上传失败: ${failedFiles.join(', ')}`, 'error');
        }
    },

    async deleteImage(index) {
        if (!confirm('确定要删除这张图片吗？')) return;

        const region = this.config.regions.find(r => r.id === this.currentRegionId);
        if (!region) return;

        const deletedImage = region.images[index];
        region.images.splice(index, 1);

        if (region.cover && !region.images.some(img => this.getImageUrl(img) === region.cover)) {
            region.cover = region.images[0] ? this.getImageUrl(region.images[0]) : null;
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
        }, 5000);
    },

    showLoading() {
        document.getElementById('loading-overlay').classList.add('active');
        document.getElementById('loading-status').textContent = '处理中...';
        document.getElementById('loading-detail').textContent = '';
        this.hideProgress();
    },

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    },

    updateLoading(status, detail, showProgress) {
        document.getElementById('loading-status').textContent = status;
        document.getElementById('loading-detail').textContent = detail || '';
        if (showProgress) {
            document.getElementById('progress-wrapper').style.display = 'block';
        }
    },

    updateLoadingDetail(detail) {
        document.getElementById('loading-detail').textContent = detail;
    },

    updateProgress(percent) {
        document.getElementById('progress-wrapper').style.display = 'block';
        document.getElementById('progress-fill').style.width = percent + '%';
        document.getElementById('progress-text').textContent = percent + '%';
    },

    hideProgress() {
        document.getElementById('progress-wrapper').style.display = 'none';
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('progress-text').textContent = '0%';
    },

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
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
