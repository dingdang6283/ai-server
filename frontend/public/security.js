/**
 * 前端安全加固脚本 - 老韩の屎山防御层
 * 功能: 反调试、请求签名、运行时完整性检查
 */

(function() {
    'use strict';

    // ========== 配置 ==========
    const CONFIG = {
        DEBUG_CHECK_INTERVAL: 2000,
        FUNCTION_CHECK_INTERVAL: 5000,
        CONSOLE_CLEAR_INTERVAL: 30000,
        SIGNATURE_ENABLED: true,
        ANTI_DEBUG_ENABLED: true
    };

    // ========== 工具函数 ==========
    const utils = {
        // 生成随机字符串
        randomString: (length = 16) => {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            let result = '';
            for (let i = 0; i < length; i++) {
                result += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return result;
        },

        // 简单哈希
        simpleHash: (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                const char = str.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return Math.abs(hash).toString(16);
        },

        // 获取浏览器指纹
        getFingerprint: () => {
            const nav = navigator;
            const screen = window.screen;
            const fingerprint = [
                nav.userAgent,
                nav.language,
                screen.colorDepth,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                !!window.sessionStorage,
                !!window.localStorage,
                nav.hardwareConcurrency || 'unknown'
            ].join('|');
            return utils.simpleHash(fingerprint);
        },

        // 生成时间戳
        getTimestamp: () => Math.floor(Date.now() / 1000)
    };

    // ========== 反调试系统 ==========
    const AntiDebug = {
        init() {
            if (!CONFIG.ANTI_DEBUG_ENABLED) return;

            // 方法1: 检测开发者工具打开
            this.detectDevTools();

            // 方法2: debugger陷阱
            this.debuggerTrap();

            // 方法3: 检测窗口大小变化
            this.detectWindowSize();

            // 方法4: 控制台清空
            this.clearConsole();

            console.log('%c[安全] 反调试系统已启动', 'color: green;');
        },

        detectDevTools() {
            const threshold = 160;
            let check = () => {
                const widthThreshold = window.outerWidth - window.innerWidth > threshold;
                const heightThreshold = window.outerHeight - window.innerHeight > threshold;

                if (widthThreshold || heightThreshold) {
                    this.onDevToolsDetected();
                }
            };

            setInterval(check, CONFIG.DEBUG_CHECK_INTERVAL);
        },

        debuggerTrap() {
            setInterval(() => {
                const start = performance.now();
                debugger;
                const end = performance.now();

                if (end - start > 100) {
                    this.onDevToolsDetected();
                }
            }, CONFIG.DEBUG_CHECK_INTERVAL);
        },

        detectWindowSize() {
            let lastWidth = window.innerWidth;
            let lastHeight = window.innerHeight;

            window.addEventListener('resize', () => {
                const newWidth = window.innerWidth;
                const newHeight = window.innerHeight;

                // 检测突然的大小变化
                if (Math.abs(newWidth - lastWidth) > 200 || Math.abs(newHeight - lastHeight) > 200) {
                    // 可能是开发者工具导致的
                }

                lastWidth = newWidth;
                lastHeight = newHeight;
            });
        },

        clearConsole() {
            setInterval(() => {
                console.clear();
                console.log('%c⚠️ 安全警告: 请勿在此控制台执行任何代码', 'color: red; font-size: 16px; font-weight: bold;');
                console.log('%c所有操作均被记录并监控', 'color: orange;');
            }, CONFIG.CONSOLE_CLEAR_INTERVAL);
        },

        onDevToolsDetected() {
            console.warn('[安全] 检测到开发者工具');

            // 发送警告到服务器
            this.reportToServer('devtools_detected');

            // 可选: 刷新页面或显示警告
            // location.reload();
        },

        reportToServer(eventType) {
            try {
                fetch('/api/security/event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: eventType,
                        fingerprint: utils.getFingerprint(),
                        timestamp: utils.getTimestamp(),
                        url: location.href
                    })
                }).catch(() => {});
            } catch (e) {}
        }
    };

    // ========== 请求签名系统 ==========
    const RequestSigner = {
        apiKey: null,
        userId: null,

        init(apiKey, userId) {
            this.apiKey = apiKey;
            this.userId = userId;

            // 拦截原生fetch
            this.interceptFetch();

            console.log('%c[安全] 请求签名系统已启动', 'color: green;');
        },

        interceptFetch() {
            const originalFetch = window.fetch;
            const self = this;

            window.fetch = function(...args) {
                let [url, options = {}] = args;

                // 只处理API请求
                if (typeof url === 'string' && url.includes('/api/') || url.includes('/v1/')) {
                    options.headers = options.headers || {};

                    // 添加签名头
                    const signature = self.generateSignature(options.body);
                    Object.assign(options.headers, signature);
                }

                return originalFetch.apply(this, [url, options]);
            };
        },

        generateSignature(body) {
            const timestamp = utils.getTimestamp();
            const nonce = utils.randomString(16);
            const fingerprint = utils.getFingerprint();

            // 构建签名字符串
            const payload = typeof body === 'string' ? body : JSON.stringify(body || {});
            const signString = `${this.userId}:${timestamp}:${nonce}:${payload}`;

            // 使用API Key生成签名 (简化版)
            const signature = this.hmacSimple(signString, this.apiKey);

            return {
                'X-User-ID': this.userId,
                'X-Timestamp': timestamp,
                'X-Nonce': nonce,
                'X-Signature': signature,
                'X-Fingerprint': fingerprint
            };
        },

        hmacSimple(message, key) {
            // 简化的HMAC实现
            let hash = 0;
            const combined = message + key;
            for (let i = 0; i < combined.length; i++) {
                const char = combined.charCodeAt(i);
                hash = ((hash << 5) - hash) + char + (i * 31);
                hash = hash & hash;
            }
            return Math.abs(hash).toString(16).padStart(32, '0');
        }
    };

    // ========== 运行时完整性检查 ==========
    const IntegrityChecker = {
        criticalFunctions: {},

        init() {
            // 保存关键函数的原始哈希
            this.saveFunctionHashes();

            // 定期检查
            setInterval(() => this.checkIntegrity(), CONFIG.FUNCTION_CHECK_INTERVAL);

            console.log('%c[安全] 完整性检查系统已启动', 'color: green;');
        },

        saveFunctionHashes() {
            const critical = ['fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage.setItem', 'localStorage.getItem'];

            critical.forEach(name => {
                try {
                    const parts = name.split('.');
                    let obj = window;
                    for (let i = 0; i < parts.length - 1; i++) {
                        obj = obj[parts[i]];
                    }
                    const fn = obj[parts[parts.length - 1]];
                    if (fn) {
                        this.criticalFunctions[name] = utils.simpleHash(fn.toString());
                    }
                } catch (e) {}
            });
        },

        checkIntegrity() {
            for (const [name, originalHash] of Object.entries(this.criticalFunctions)) {
                try {
                    const parts = name.split('.');
                    let obj = window;
                    for (let i = 0; i < parts.length - 1; i++) {
                        obj = obj[parts[i]];
                    }
                    const fn = obj[parts[parts.length - 1]];
                    if (fn) {
                        const currentHash = utils.simpleHash(fn.toString());
                        if (currentHash !== originalHash) {
                            console.error(`[安全警告] 函数 ${name} 可能被篡改!`);
                            this.onTamperingDetected(name);
                        }
                    }
                } catch (e) {}
            }
        },

        onTamperingDetected(functionName) {
            // 报告到服务器
            try {
                fetch('/api/security/event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'function_tampering',
                        function: functionName,
                        fingerprint: utils.getFingerprint(),
                        timestamp: utils.getTimestamp()
                    })
                }).catch(() => {});
            } catch (e) {}

            // 可选: 刷新页面
            // setTimeout(() => location.reload(), 1000);
        }
    };

    // ========== 安全监控API ==========
    window.SecurityMonitor = {
        // 初始化安全系统
        init: function(apiKey, userId) {
            AntiDebug.init();
            RequestSigner.init(apiKey, userId);
            IntegrityChecker.init();

            console.log('%c🔒 安全系统初始化完成', 'color: green; font-size: 14px; font-weight: bold;');
        },

        // 获取当前指纹
        getFingerprint: utils.getFingerprint,

        // 手动报告事件
        reportEvent: function(eventType, details = {}) {
            try {
                fetch('/api/security/event', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: eventType,
                        details: details,
                        fingerprint: utils.getFingerprint(),
                        timestamp: utils.getTimestamp()
                    })
                }).catch(() => {});
            } catch (e) {}
        }
    };

    // 自动初始化 (如果配置了API Key)
    if (window.SECURITY_CONFIG) {
        window.SecurityMonitor.init(
            window.SECURITY_CONFIG.apiKey,
            window.SECURITY_CONFIG.userId
        );
    }

})();
