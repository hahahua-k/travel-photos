/**
 * GitHub API 封装模块
 * 用于与 GitHub 仓库交互，管理配置和图片
 */
const GitHubAPI = {
    token: null,
    owner: null,
    repo: null,
    branch: 'main',

    /**
     * 初始化 API 配置
     * @param {string} token - GitHub Personal Access Token
     * @param {string} owner - 仓库所有者用户名
     * @param {string} repo - 仓库名称
     */
    init(token, owner, repo) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
    },

    /**
     * 获取请求头
     * @returns {Object} - 包含认证信息的请求头
     */
    getHeaders() {
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
    },

    /**
     * 将字符串编码为 Base64
     * @param {string} str - 原始字符串
     * @returns {string} - Base64 编码后的字符串
     */
    encodeBase64(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        let binary = '';
        for (let i = 0; i < data.length; i++) {
            binary += String.fromCharCode(data[i]);
        }
        return btoa(binary);
    },

    /**
     * 将 Base64 解码为字符串
     * @param {string} base64 - Base64 编码的字符串
     * @returns {string} - 解码后的字符串
     */
    decodeBase64(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        const decoder = new TextDecoder();
        return decoder.decode(bytes);
    },

    /**
     * 读取配置文件
     * @returns {Promise<Object>} - 配置对象
     */
    async getConfig() {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/config.json`,
                { headers: this.getHeaders() }
            );

            if (response.status === 404) {
                return { regions: [] };
            }

            const data = await response.json();
            const content = this.decodeBase64(data.content);
            return JSON.parse(content);
        } catch (error) {
            console.error('读取配置失败:', error);
            return { regions: [] };
        }
    },

    /**
     * 保存配置文件
     * @param {Object} config - 配置对象
     * @returns {Promise<boolean>} - 是否成功
     */
    async saveConfig(config) {
        try {
            let sha = null;

            try {
                const response = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/config.json`,
                    { headers: this.getHeaders() }
                );
                if (response.ok) {
                    const data = await response.json();
                    sha = data.sha;
                }
            } catch (e) {}

            const content = this.encodeBase64(JSON.stringify(config, null, 2));
            const body = {
                message: '更新配置文件',
                content: content,
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/config.json`,
                {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(body)
                }
            );

            return response.ok;
        } catch (error) {
            console.error('保存配置失败:', error);
            return false;
        }
    },

    /**
     * 上传图片
     * @param {string} path - 图片路径
     * @param {File} file - 图片文件
     * @returns {Promise<string|null>} - 图片 URL 或 null
     */
    async uploadImage(path, file) {
        try {
            const reader = new FileReader();
            const base64 = await new Promise((resolve) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(file);
            });

            let sha = null;
            try {
                const response = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
                    { headers: this.getHeaders() }
                );
                if (response.ok) {
                    const data = await response.json();
                    sha = data.sha;
                }
            } catch (e) {}

            const body = {
                message: `上传图片: ${path}`,
                content: base64,
                branch: this.branch
            };

            if (sha) {
                body.sha = sha;
            }

            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
                {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify(body)
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data.content.download_url;
            }
            return null;
        } catch (error) {
            console.error('上传图片失败:', error);
            return null;
        }
    },

    /**
     * 删除文件
     * @param {string} path - 文件路径
     * @returns {Promise<boolean>} - 是否成功
     */
    async deleteFile(path) {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
                { headers: this.getHeaders() }
            );

            if (!response.ok) return false;

            const data = await response.json();
            const deleteResponse = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`,
                {
                    method: 'DELETE',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        message: `删除文件: ${path}`,
                        sha: data.sha,
                        branch: this.branch
                    })
                }
            );

            return deleteResponse.ok;
        } catch (error) {
            console.error('删除文件失败:', error);
            return false;
        }
    },

    /**
     * 获取仓库信息
     * @returns {Promise<Object>} - 仓库信息
     */
    async getRepoInfo() {
        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}`,
                { headers: this.getHeaders() }
            );
            return await response.json();
        } catch (error) {
            console.error('获取仓库信息失败:', error);
            return null;
        }
    }
};

window.GitHubAPI = GitHubAPI;
