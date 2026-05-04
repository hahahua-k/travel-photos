/**
 * 图片压缩工具模块
 */
const ImageCompressor = {
    /**
     * 压缩图片
     * @param {File} file - 原始图片文件
     * @param {number} maxSizeMB - 最大文件大小（MB）
     * @param {number} quality - 压缩质量 0-1
     * @returns {Promise<File>} - 压缩后的文件
     */
    async compress(file, maxSizeMB = 30, quality = 0.85) {
        const fileSizeMB = file.size / 1024 / 1024;
        
        if (fileSizeMB <= maxSizeMB) {
            return file;
        }

        console.log(`开始压缩图片: ${file.name} (${fileSizeMB.toFixed(1)}MB)`);

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    let width = img.width;
                    let height = img.height;

                    const maxDimension = 4096;
                    if (width > maxDimension || height > maxDimension) {
                        const ratio = Math.min(maxDimension / width, maxDimension / height);
                        width = Math.floor(width * ratio);
                        height = Math.floor(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    const tryCompress = (q) => {
                        canvas.toBlob((blob) => {
                            if (!blob) {
                                reject(new Error('压缩失败'));
                                return;
                            }

                            const blobSizeMB = blob.size / 1024 / 1024;
                            console.log(`压缩质量 ${q}: ${blobSizeMB.toFixed(1)}MB`);

                            if (blobSizeMB <= maxSizeMB || q <= 0.3) {
                                const compressedFile = new File([blob], file.name, {
                                    type: 'image/jpeg',
                                    lastModified: Date.now()
                                });
                                console.log(`压缩完成: ${fileSizeMB.toFixed(1)}MB -> ${blobSizeMB.toFixed(1)}MB`);
                                resolve(compressedFile);
                            } else {
                                tryCompress(q - 0.1);
                            }
                        }, 'image/jpeg', q);
                    };

                    tryCompress(quality);
                };
                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * 批量压缩图片
     * @param {FileList} files - 文件列表
     * @param {number} maxSizeMB - 最大文件大小（MB）
     * @returns {Promise<File[]>} - 压缩后的文件数组
     */
    async compressBatch(files, maxSizeMB = 30) {
        const compressedFiles = [];
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const compressed = await this.compress(file, maxSizeMB);
                compressedFiles.push(compressed);
            } else {
                compressedFiles.push(file);
            }
        }
        return compressedFiles;
    }
};

window.ImageCompressor = ImageCompressor;
