/**
 * 管理后台逻辑模块
 */
const Admin = {
    config: null,
    currentSectionId: null,
    currentAlbumId: null,

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
            this.loadSections();
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
        this.loadSections();
    },

    async loadSections() {
        try {
            this.config = await GitHubAPI.getConfig();
            
            // 兼容旧数据：如果只有regions没有sections，自动迁移
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
                        images: r.images || [],
                        protected: r.protected || false
                    }))
                }];
                // 保留旧regions以防万一
                await this.saveConfigToGitHub();
                this.showMessage('已自动迁移旧数据到板块系统', 'success');
            }
            
            if (!this.config.sections) {
                this.config.sections = [];
            }
            this.renderSections();
        } catch (error) {
            console.error('加载配置失败:', error);
            this.config = { sections: [] };
            this.renderSections();
        }
    },

    renderSections() {
        const list = document.getElementById('section-list');
        list.innerHTML = '';

        if (!this.config.sections || this.config.sections.length === 0) {
            list.innerHTML = '<li style="text-align: center; color: rgba(255,255,255,0.25); padding: 20px;">暂无板块</li>';
            return;
        }

        this.config.sections.forEach(section => {
            const li = document.createElement('li');
            li.className = 'section-item';
            const albumCount = section.albums ? section.albums.length : 0;
            const hasCoords = section.mapX && section.mapY;
            li.innerHTML = `
                <div class="section-info">
                    <div class="section-name">${section.name} ${hasCoords ? '📍' : ''}</div>
                    <div class="section-meta">${albumCount} 个相册${hasCoords ? ` · 坐标(${section.mapX},${section.mapY})` : ''}</div>
                </div>
                <div class="section-actions">
                    <button class="btn btn-primary btn-sm" onclick="Admin.editSection('${section.id}')">编辑</button>
                    <button class="btn btn-primary btn-sm" onclick="Admin.manageAlbums('${section.id}')">相册</button>
                    <button class="btn btn-danger btn-sm" onclick="Admin.deleteSection('${section.id}')">删除</button>
                </div>
            `;
            list.appendChild(li);
        });
    },

    showAddSectionForm() {
        const name = prompt('请输入板块名称:');
        if (!name) return;

        const coordsInput = prompt('设置地图坐标 (X,Y 百分比 0-100，如 60,40):', '');
        let mapX = 0, mapY = 0;
        if (coordsInput && coordsInput.includes(',')) {
            const parts = coordsInput.split(',').map(s => parseFloat(s.trim()));
            if (!isNaN(parts[0]) && !isNaN(parts[1])) {
                mapX = Math.max(0, Math.min(100, parts[0]));
                mapY = Math.max(0, Math.min(100, parts[1]));
            }
        }

        this.createSection(name, mapX, mapY);
    },

    async createSection(name, mapX, mapY) {
        const id = 'section-' + Date.now();
        const newSection = {
            id: id,
            name: name,
            mapX: mapX,
            mapY: mapY,
            albums: []
        };

        this.config.sections.push(newSection);
        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderSections();
            this.showMessage('板块"' + name + '"创建成功！', 'success');
        } else {
            // 回滚
            this.config.sections = this.config.sections.filter(s => s.id !== id);
            this.showMessage('创建失败，请检查网络和 Token 权限', 'error');
        }
    },

    async editSection(sectionId) {
        const section = this.config.sections.find(s => s.id === sectionId);
        if (!section) return;

        const newName = prompt('请输入板块名称:', section.name);
        if (!newName) return;

        const currentCoords = (section.mapX && section.mapY) ? `${section.mapX},${section.mapY}` : '';
        const coordsInput = prompt('设置地图坐标 (X,Y 百分比 0-100):', currentCoords);

        let mapX = section.mapX || 0;
        let mapY = section.mapY || 0;

        if (coordsInput && coordsInput.includes(',')) {
            const parts = coordsInput.split(',').map(s => parseFloat(s.trim()));
            if (!isNaN(parts[0]) && !isNaN(parts[1])) {
                mapX = Math.max(0, Math.min(100, parts[0]));
                mapY = Math.max(0, Math.min(100, parts[1]));
            }
        }

        const oldName = section.name;
        const oldMapX = section.mapX;
        const oldMapY = section.mapY;

        section.name = newName;
        section.mapX = mapX;
        section.mapY = mapY;

        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderSections();
            this.showMessage('板块信息已更新', 'success');
        } else {
            section.name = oldName;
            section.mapX = oldMapX;
            section.mapY = oldMapY;
            this.showMessage('更新失败', 'error');
        }
    },

    async deleteSection(sectionId) {
        if (!confirm('确定要删除这个板块吗？')) return;

        const deleted = this.config.sections.find(s => s.id === sectionId);
        this.config.sections = this.config.sections.filter(s => s.id !== sectionId);
        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderSections();
            this.showMessage('板块已删除', 'success');
        } else {
            this.config.sections.push(deleted);
            this.showMessage('删除失败', 'error');
        }
    },

    manageAlbums(sectionId) {
        this.currentSectionId = sectionId;
        const section = this.config.sections.find(s => s.id === sectionId);
        if (!section) return;

        document.getElementById('current-section-name').textContent = section.name;
        document.getElementById('album-section').style.display = 'block';
        document.getElementById('upload-section').style.display = 'block';
        this.renderAlbums();
    },

    renderAlbums() {
        const list = document.getElementById('album-list');
        const section = this.config.sections.find(s => s.id === this.currentSectionId);

        if (!section || !section.albums || section.albums.length === 0) {
            list.innerHTML = '<p style="text-align: center; color: rgba(255,255,255,0.25); grid-column: 1 / -1;">暂无相册，请先创建相册</p>';
            return;
        }

        list.innerHTML = section.albums.map((album, index) => {
            let coverUrl = album.cover || `https://picsum.photos/150/120?random=${index}`;
            if (coverUrl.includes('raw.githubusercontent.com')) {
                coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}&w=200&q=60&output=webp`;
            }
            const imgCount = album.images ? album.images.length : 0;
            return `
                <div class="album-item">
                    <img src="${coverUrl}" alt="${album.name}" onerror="this.src='https://picsum.photos/150/120?random=${index}'">
                    <div class="album-item-name">${album.name}</div>
                    <div class="album-item-count">${imgCount} 张</div>
                    <div class="album-item-buttons">
                        <button class="btn btn-primary btn-sm" onclick="Admin.triggerUpload('${album.id}')">上传图片</button>
                        <button class="btn btn-sm" style="background:rgba(255,255,255,0.1);color:rgba(255,255,255,0.7)" onclick="Admin.editAlbum('${album.id}')">编辑</button>
                        <button class="btn btn-danger btn-sm" onclick="Admin.deleteAlbum('${album.id}')">删除</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    triggerUpload(albumId) {
        const section = this.config.sections.find(s => s.id === this.currentSectionId);
        if (!section) return;
        const album = section.albums.find(a => a.id === albumId);
        if (!album) return;

        this.pendingAlbum = album;
        document.getElementById('album-file-input').click();
    },

    showAddAlbumForm() {
        const name = prompt('请输入相册名称:');
        if (!name) return;

        this.createAlbum(name);
    },

    async createAlbum(name) {
        const section = this.config.sections.find(s => s.id === this.currentSectionId);
        if (!section) return;

        const id = 'album-' + Date.now();
        const newAlbum = {
            id: id,
            name: name,
            cover: null,
            images: []
        };

        if (!section.albums) section.albums = [];
        section.albums.push(newAlbum);

        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderAlbums();
            this.showMessage(`相册"${name}"创建成功`, 'success');
        } else {
            section.albums.pop();
            this.showMessage('创建失败', 'error');
        }
    },

    async editAlbum(albumId) {
        const section = this.config.sections.find(s => s.id === this.currentSectionId);
        if (!section) return;

        const album = section.albums.find(a => a.id === albumId);
        if (!album) return;

        const newName = prompt('请输入相册名称:', album.name);
        if (!newName) return;

        const oldName = album.name;
        album.name = newName;

        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderAlbums();
            this.showMessage('相册名称已更新', 'success');
        } else {
            album.name = oldName;
            this.showMessage('更新失败', 'error');
        }
    },

    async deleteAlbum(albumId) {
        if (!confirm('确定要删除这个相册吗？')) return;

        const section = this.config.sections.find(s => s.id === this.currentSectionId);
        if (!section) return;

        const deleted = section.albums.find(a => a.id === albumId);
        section.albums = section.albums.filter(a => a.id !== albumId);

        const success = await this.saveConfigToGitHub();
        if (success) {
            this.renderAlbums();
            this.showMessage('相册已删除', 'success');
        } else {
            section.albums.push(deleted);
            this.showMessage('删除失败', 'error');
        }
    },

    async uploadImages() {
        if (!this.currentSectionId) {
            this.showMessage('请先选择一个板块', 'error');
            return;
        }
        const section = this.config.sections.find(s => s.id === this.currentSectionId);
        if (!section || !section.albums || section.albums.length === 0) {
            this.showMessage('请先创建相册', 'error');
            return;
        }
        // 直接上传到第一个相册
        this.pendingAlbum = section.albums[0];
        document.getElementById('album-file-input').click();
    },

    triggerUpload(albumId) {
        const section = this.config.sections.find(s => s.id === this.currentSectionId);
        if (!section) return;
        const album = section.albums.find(a => a.id === albumId);
        if (!album) return;
        this.pendingAlbum = album;
        document.getElementById('album-file-input').click();
    },

    async handleSelectedFiles(files) {
        if (!files || files.length === 0) return;
        if (!this.pendingAlbum) {
            this.showMessage('请先选择相册', 'error');
            return;
        }
        await this.handleFileUpload(files, this.pendingAlbum);
        this.pendingAlbum = null;
    },

    async handleFileUpload(files, album) {
        this.showLoading();

        let uploadedCount = 0;
        let failedCount = 0;
        const totalFiles = files.length;
        const fileArray = Array.from(files);

        for (let i = 0; i < fileArray.length; i++) {
            const file = fileArray[i];
            
            if (file.size > 50 * 1024 * 1024) {
                failedCount++;
                continue;
            }

            try {
                let uploadFile = file;
                let wasCompressed = false;

                if (file.size > 30 * 1024 * 1024 && file.type.startsWith('image/')) {
                    this.updateLoading(`正在压缩 (${i + 1}/${totalFiles})`, file.name);
                    uploadFile = await ImageCompressor.compress(file, 30, 0.85);
                    wasCompressed = true;
                }

                let thumbFile = null;
                try {
                    this.updateLoading(`生成缩略图 (${i + 1}/${totalFiles})`, file.name);
                    thumbFile = await ImageCompressor.generateThumbnail(file, 800, 0.6);
                } catch (e) {
                    console.warn('缩略图生成失败:', e);
                }

                const timestamp = Date.now() + i;
                const mainPath = `images/${album.id}/${timestamp}-${file.name}`;
                const thumbPath = `images/${album.id}/${timestamp}-thumb-${file.name.replace(/\.[^.]+$/, '.jpg')}`;

                this.updateLoading(`上传中 (${i + 1}/${totalFiles})`, file.name);
                this.updateProgress(0);

                const url = await GitHubAPI.uploadImage(mainPath, uploadFile, (loaded, total) => {
                    const percent = Math.min(Math.floor((loaded / total) * 95), 95);
                    this.updateProgress(percent);
                    this.updateLoadingDetail(`${this.formatSize(loaded)} / ${this.formatSize(total)}`);
                }, (status) => {
                    if (status === 'waiting') this.updateLoadingDetail('等待服务器确认...');
                });

                if (!url) {
                    failedCount++;
                    console.error('上传失败:', file.name);
                    continue;
                }

                let thumbUrl = null;
                if (thumbFile) {
                    thumbUrl = await GitHubAPI.uploadImage(thumbPath, thumbFile);
                }

                if (!album.images) album.images = [];
                album.images.push({
                    url: url,
                    thumbnail: thumbUrl || url,
                    compressed: wasCompressed
                });

                if (!album.cover) {
                    album.cover = thumbUrl || url;
                }
                uploadedCount++;

                this.updateLoading(`保存配置 (${i + 1}/${totalFiles})`, file.name);
                try {
                    await this.saveConfigToGitHub();
                } catch (e) {
                    console.warn('保存配置失败，继续上传:', e);
                }

            } catch (error) {
                failedCount++;
                console.error('处理文件失败:', file.name, error);
            }
        }

        this.renderAlbums();
        this.hideLoading();

        if (uploadedCount > 0) {
            let msg = `${uploadedCount} 张图片上传成功`;
            if (failedCount > 0) msg += `，${failedCount} 张失败`;
            this.showMessage(msg, failedCount > 0 ? 'error' : 'success');
        } else {
            this.showMessage('图片上传失败', 'error');
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
        setTimeout(() => { message.style.display = 'none'; }, 5000);
    },

    showLoading() {
        document.getElementById('loading-overlay').classList.add('active');
    },

    hideLoading() {
        document.getElementById('loading-overlay').classList.remove('active');
    },

    updateLoading(status, detail) {
        document.getElementById('loading-status').textContent = status;
        document.getElementById('loading-detail').textContent = detail || '';
    },

    updateLoadingDetail(detail) {
        document.getElementById('loading-detail').textContent = detail;
    },

    updateProgress(percent) {
        document.getElementById('progress-wrapper').style.display = 'block';
        document.getElementById('progress-fill').style.width = percent + '%';
        document.getElementById('progress-text').textContent = percent + '%';
    },

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    },

    setupEventListeners() {
        document.getElementById('save-config').addEventListener('click', () => this.saveConfig());
        document.getElementById('add-section').addEventListener('click', () => this.showAddSectionForm());
        document.getElementById('add-album').addEventListener('click', () => this.showAddAlbumForm());
        document.getElementById('upload-images').addEventListener('click', () => this.uploadImages());
        
        // 文件选择事件
        document.getElementById('album-file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleSelectedFiles(e.target.files);
                e.target.value = '';
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
