const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// セキュリティミドルウェア
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "https://cdn.discordapp.com"],
            connectSrc: ["'self'", "https://discord.com", "https://www.google-analytics.com"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// Rate Limiting - API用
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 100, // 最大100リクエスト
    message: {
        error: 'Too many requests',
        message: 'リクエストが多すぎます。しばらく待ってから再試行してください。'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Rate Limiting - 一般ページ用
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分
    max: 1000, // 最大1000リクエスト
    message: 'Too many requests from this IP',
    standardHeaders: true,
    legacyHeaders: false
});

// 基本ミドルウェア
app.use(generalLimiter);
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? ['https://your-domain.com'] 
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 静的ファイルミドルウェア（セキュリティ強化）
app.use(express.static(path.join(__dirname, 'public'), {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

// ファイル存在チェック関数
function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch (error) {
        return false;
    }
}

// ログ記録関数
function logAccess(req, type = 'access') {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    console.log(`[${timestamp}] ${type.toUpperCase()} - IP: ${ip} - URL: ${req.originalUrl} - User-Agent: ${userAgent}`);
}

// セキュリティヘッダー追加
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'amber-blossom');
    res.setHeader('Server', 'amber-blossom/1.0');
    logAccess(req);
    next();
});

// Discord Bot設定（環境変数から読み込み）
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_SERVER_ID = process.env.DISCORD_SERVER_ID;

// HTML ページのルート設定（.html拡張子なし）
const htmlPages = [
    'index',
    'terms', 
    'privacy',
    'docs',
    'status',
    'servers',
    'akane',
    'koharu'
    'servers'
    '404'
];

// ルートページ
app.get('/', (req, res) => {
    const filePath = path.join(__dirname, 'public', 'index.html');
    if (fileExists(filePath)) {
        res.sendFile(filePath);
    } else {
        logAccess(req, 'error');
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    }
});

// 動的にHTMLページのルートを設定（404対応強化）
htmlPages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public', `${page}.html`);
        if (fileExists(filePath)) {
            res.sendFile(filePath);
        } else {
            logAccess(req, 'error');
            res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }
    });
});

// 不正なファイル拡張子アクセスを防ぐ
app.get('*.php', (req, res) => {
    logAccess(req, 'security');
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.get('*.asp', (req, res) => {
    logAccess(req, 'security'); 
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.get('*.jsp', (req, res) => {
    logAccess(req, 'security');
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// 管理者パネルなどの不正アクセス防止
const blockedPaths = ['/admin', '/wp-admin', '/administrator', '/phpmyadmin', '/cpanel', '/webmail'];
blockedPaths.forEach(blockedPath => {
    app.get(`${blockedPath}*`, (req, res) => {
        logAccess(req, 'blocked');
        res.status(403).sendFile(path.join(__dirname, 'public', '404.html'));
    });
});

// API用レート制限適用
app.use('/api', apiLimiter);

// Discord APIからサーバー統計を取得
app.get('/api/discord/stats', async (req, res) => {
    try {
        logAccess(req, 'api');
        
        if (!DISCORD_BOT_TOKEN || !DISCORD_SERVER_ID) {
            return res.status(200).json({
                memberCount: '設定なし',
                onlineCount: '設定なし',
                error: 'Discord設定が見つかりません'
            });
        }

        // Discord APIからギルド情報を取得
        const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_SERVER_ID}?with_counts=true`, {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000 // 10秒タイムアウト
        });

        if (!guildResponse.ok) {
            throw new Error(`Discord API Error: ${guildResponse.status}`);
        }

        const guildData = await guildResponse.json();

        // プレゼンス情報を取得（オンラインメンバー数）
        const presenceResponse = await fetch(`https://discord.com/api/v10/guilds/${DISCORD_SERVER_ID}/members?limit=1000`, {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        let onlineCount = '取得失敗';
        if (presenceResponse.ok) {
            const membersData = await presenceResponse.json();
            // 簡易的なオンライン数計算（実際はプレゼンス情報が必要）
            onlineCount = Math.floor(guildData.approximate_member_count * 0.3); // 概算値
        }

        res.json({
            memberCount: guildData.approximate_member_count || guildData.member_count || '取得失敗',
            onlineCount: onlineCount,
            serverName: guildData.name,
            success: true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Discord API Error:', error);
        logAccess(req, 'api-error');
        res.status(500).json({
            memberCount: '取得失敗',
            onlineCount: '取得失敗',
            error: 'サーバーエラーが発生しました',
            timestamp: new Date().toISOString()
        });
    }
});

// Bot稼働状況を確認するAPI
app.get('/api/bot/status', async (req, res) => {
    try {
        logAccess(req, 'api');
        
        if (!DISCORD_BOT_TOKEN) {
            return res.status(200).json({
                status: 'offline',
                message: 'Bot設定が見つかりません',
                timestamp: new Date().toISOString()
            });
        }

        const response = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.ok) {
            const botData = await response.json();
            res.json({
                status: 'online',
                username: botData.username,
                discriminator: botData.discriminator,
                id: botData.id,
                message: 'Bot is running normally',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(200).json({
                status: 'offline',
                message: 'Bot認証に失敗しました',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Bot Status Error:', error);
        logAccess(req, 'api-error');
        res.status(500).json({
            status: 'offline',
            message: 'サーバーエラーが発生しました',
            timestamp: new Date().toISOString()
        });
    }
});

// サーバー一覧API（連携サーバー）
app.get('/api/servers', async (req, res) => {
    try {
        logAccess(req, 'api');
        
        if (!DISCORD_BOT_TOKEN) {
            return res.status(200).json({
                servers: [],
                message: 'Bot設定が見つかりません',
                timestamp: new Date().toISOString()
            });
        }

        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 10000
        });

        if (response.ok) {
            const guilds = await response.json();
            const serverList = guilds.map(guild => ({
                id: guild.id,
                name: guild.name,
                icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png` : null,
                memberCount: guild.approximate_member_count || 'N/A'
            }));

            res.json({
                servers: serverList,
                count: serverList.length,
                success: true,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(200).json({
                servers: [],
                message: 'サーバー情報の取得に失敗しました',
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        console.error('Servers API Error:', error);
        logAccess(req, 'api-error');
        res.status(500).json({
            servers: [],
            message: 'サーバーエラーが発生しました',
            timestamp: new Date().toISOString()
        });
    }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    logAccess(req, 'health');
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// robots.txt
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: ${req.protocol}://${req.get('host')}/sitemap.xml`);
});

// sitemap.xml
app.get('/sitemap.xml', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pages = ['', '/terms', '/privacy', '/docs', '/status', '/servers', '/akane', '/koharu'];
    
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(page => `  <url>
    <loc>${baseUrl}${page}</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
    
    res.type('application/xml');
    res.send(sitemap);
});

// セキュリティ：疑わしいリクエストをブロック
app.use((req, res, next) => {
    const suspiciousPatterns = [
        /\.\./,
        /[<>\"'%;()&+]/,
        /union.*select/i,
        /script.*>/i,
        /javascript:/i,
        /vbscript:/i,
        /onload.*=/i,
        /onerror.*=/i
    ];

    const url = decodeURIComponent(req.url);
    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(url));

    if (isSuspicious) {
        logAccess(req, 'suspicious');
        return res.status(400).sendFile(path.join(__dirname, 'public', '404.html'));
    }

    next();
});

// 404エラーハンドリング（改良版）
app.use((req, res) => {
    logAccess(req, '404');
    
    // 404ページが存在するかチェック
    const notFoundPath = path.join(__dirname, 'public', '404.html');
    if (fileExists(notFoundPath)) {
        res.status(404).sendFile(notFoundPath);
    } else {
        // 404.htmlが存在しない場合のフォールバック
        res.status(404).json({
            error: 'Page Not Found',
            message: 'お探しのページは見つかりませんでした',
            timestamp: new Date().toISOString(),
            path: req.originalUrl
        });
    }
});

// エラーハンドリング（改良版）
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    logAccess(req, 'server-error');
    
    // セキュリティ：本番環境では詳細なエラー情報を隠す
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(err.status || 500);
    
    if (req.accepts('html')) {
        // HTMLリクエストの場合は404ページを表示
        const errorPath = path.join(__dirname, 'public', '404.html');
        if (fileExists(errorPath)) {
            res.sendFile(errorPath);
        } else {
            res.send('<h1>サーバーエラーが発生しました</h1>');
        }
    } else {
        // APIリクエストの場合はJSON形式でエラーを返す
        res.json({
            error: 'Internal Server Error',
            message: isDevelopment ? err.message : 'サーバーでエラーが発生しました',
            timestamp: new Date().toISOString(),
            ...(isDevelopment && { stack: err.stack })
        });
    }
});

// サーバー起動
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access the website at: http://localhost:${PORT}`);
    
    // 環境変数チェック
    if (!DISCORD_BOT_TOKEN) {
        console.warn('Warning: DISCORD_BOT_TOKEN is not set');
    }
    if (!DISCORD_SERVER_ID) {
        console.warn('Warning: DISCORD_SERVER_ID is not set');
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});
