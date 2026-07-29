// WeCom AI Bot Service - manages WebSocket connection to WeCom aibot
// Receives notifications from sync-server.js and proactively pushes to a group
const AiBot = require('@wecom/aibot-node-sdk');

const BOT_ID = process.env.WECOM_BOT_ID || 'aibAyCsZCdFVRJXIMYKtC0HxhJSRSdoTTFG';
const BOT_SECRET = process.env.WECOM_BOT_SECRET || 'ET185mpuG4jmdnoejSfE9vAiRJrvGVF72eaS5sPBTOj';
const TARGET_CHATID = process.env.WECOM_TARGET_CHATID || ''; // Group chatid, auto-discovered if empty

let wsClient = null;
let discoveredChatIds = new Set();
let connected = false;
let authenticated = false;

function init() {
  if (wsClient) return wsClient;
  wsClient = new AiBot.WSClient({
    botId: BOT_ID,
    secret: BOT_SECRET,
  });

  wsClient.on('connected', () => {
    console.log('✅ [WeCom Bot] WebSocket connected');
    connected = true;
  });

  wsClient.on('authenticated', () => {
    console.log('🔐 [WeCom Bot] Authenticated, ready to send/receive');
    authenticated = true;
  });

  wsClient.on('disconnected', () => {
    console.log('⚠️  [WeCom Bot] Disconnected, will auto-reconnect');
    connected = false;
    authenticated = false;
  });

  wsClient.on('error', (err) => {
    console.error('❌ [WeCom Bot] Error:', err.message || err);
  });

  // Capture ALL incoming frames to debug
  wsClient.on('message', (frame) => {
    console.log('📨 [WeCom Bot] message event:', JSON.stringify({ chatid: frame?.chatid, type: frame?.body?.msgtype, text: frame?.body?.text?.content?.substring(0, 50) }));
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
    }
  });

  // Handle text messages - reply and capture chatid
  wsClient.on('message.text', async (frame) => {
    console.log('💬 [WeCom Bot] Text received:', JSON.stringify({ chatid: frame?.chatid, content: frame?.body?.text?.content }));
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
      // Reply immediately so user knows bot is alive
      try {
        await wsClient.reply(frame, {
          msgtype: 'markdown',
          markdown: { content: '👋 **厦门店开业助手已就绪！**\n\n我会在这里推送项目进度更新。\n\n> 📍 已连接群聊' }
        });
        console.log('✅ [WeCom Bot] Replied to', frame.chatid);
      } catch(e) {
        console.error('❌ [WeCom Bot] Reply failed:', e.message);
      }
    }
  });

  wsClient.on('event.enter_chat', (frame) => {
    console.log('👋 [WeCom Bot] Enter chat event:', JSON.stringify({ chatid: frame?.chatid }));
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
    }
  });

  // Catch any other events
  wsClient.on('event', (frame) => {
    console.log('📡 [WeCom Bot] Generic event:', JSON.stringify({ chatid: frame?.chatid, event: frame?.body?.event_type }));
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
    }
  });

  wsClient.connect();
  return wsClient;
}

async function sendNotification({ who, action, detail, tasks }) {
  if (!wsClient) init();
  if (!authenticated) {
    console.log('⏳ [WeCom Bot] Not authenticated yet, skipping');
    return { ok: false, reason: 'not_authenticated' };
  }

  const chatid = TARGET_CHATID || [...discoveredChatIds][0];
  if (!chatid) {
    console.log('⏳ [WeCom Bot] No chatid known yet, waiting for first message');
    return { ok: false, reason: 'no_chatid' };
  }

  const taskList = (tasks && tasks.length > 0)
    ? tasks.map(t => `> - ${t.title}${t.completed ? ' ✅' : ''}`).join('\n')
    : '';
  const time = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const content = `## 🏪 厦门店进度更新\n**${who || '未署名'}** ${action || '更新了进度'}\n${detail || ''}\n${taskList}\n\n<font color="comment">${time}</font>`;

  try {
    await wsClient.sendMessage(chatid, {
      msgtype: 'markdown',
      markdown: { content },
    });
    console.log('📤 [WeCom Bot] Message sent to', chatid);
    return { ok: true, chatid };
  } catch (e) {
    console.error('❌ [WeCom Bot] Send failed:', e.message || e);
    return { ok: false, reason: 'send_failed', error: e.message };
  }
}

function getStatus() {
  return {
    connected,
    authenticated,
    discoveredChatIds: [...discoveredChatIds],
    targetChatId: TARGET_CHATID || null,
  };
}

module.exports = { init, sendNotification, getStatus };
