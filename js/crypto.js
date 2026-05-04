/**
 * 密码加密工具模块
 * 使用 SHA-256 算法对密码进行哈希处理
 */
const CryptoUtils = {
    /**
     * 计算字符串的 SHA-256 哈希值
     * @param {string} message - 要加密的字符串
     * @returns {Promise<string>} - 十六进制哈希字符串
     */
    async sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    },

    /**
     * 验证密码是否匹配
     * @param {string} password - 用户输入的密码
     * @param {string} hash - 存储的哈希值
     * @returns {Promise<boolean>} - 是否匹配
     */
    async verifyPassword(password, hash) {
        const passwordHash = await this.sha256(password);
        return passwordHash === hash;
    },

    /**
     * 生成密码哈希（用于存储）
     * @param {string} password - 原始密码
     * @returns {Promise<string>} - 哈希后的密码
     */
    async hashPassword(password) {
        return await this.sha256(password);
    }
};

window.CryptoUtils = CryptoUtils;
