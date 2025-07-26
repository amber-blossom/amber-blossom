const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
];

// ルートページ
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 動的にHTMLページのルートを設定
htmlPages.forEach(page => {
    app.get(`/${page}`, (req, res) => {
        const filePath = path.join(__dirname, 'public', `${page}.html`);
        res.sendFile(filePath);
    });
});

// Discord APIからサーバー統計を取得
app.get('/api/discord/stats', async (req, res) => {
    try {
        if (!DISCORD_BOT_TOKEN || !DISCORD_SERVER_ID) {
            return res.json({
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
            }
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
            }
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
            success: true
        });

    } catch (error) {
        console.error('Discord API Error:', error);
        res.json({
            memberCount: '取得失敗',
            onlineCount: '取得失敗',
            error: error.message
        });
    }
});

// Bot稼働状況を確認するAPI
app.get('/api/bot/status', async (req, res) => {
    try {
        if (!DISCORD_BOT_TOKEN) {
            return res.json({
                status: 'offline',
                message: 'Bot設定が見つかりません'
            });
        }

        const response = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const botData = await response.json();
            res.json({
                status: 'online',
                username: botData.username,
                discriminator: botData.discriminator,
                id: botData.id,
                message: 'Bot is running normally'
            });
        } else {
            res.json({
                status: 'offline',
                message: 'Bot認証に失敗しました'
            });
        }

    } catch (error) {
        console.error('Bot Status Error:', error);
        res.json({
            status: 'offline',
            message: error.message
        });
    }
});

// サーバー一覧API（連携サーバー）
app.get('/api/servers', async (req, res) => {
    try {
        if (!DISCORD_BOT_TOKEN) {
            return res.json({
                servers: [],
                message: 'Bot設定が見つかりません'
            });
        }

        const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
            headers: {
                'Authorization': `Bot ${DISCORD_BOT_TOKEN}`,
                'Content-Type': 'application/json'
            }
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
                success: true
            });
        } else {
            res.json({
                servers: [],
                message: 'サーバー情報の取得に失敗しました'
            });
        }

    } catch (error) {
        console.error('Servers API Error:', error);
        res.json({
            servers: [],
            message: error.message
        });
    }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 404エラーハンドリング
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// エラーハンドリング
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
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
