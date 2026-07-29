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

  // Capture chatid whenever any message comes in
  wsClient.on('message', (frame) => {
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
      console.log('📨 [WeCom Bot] Discovered chatid:', frame.chatid);
    }
  });
  wsClient.on('message.text', (frame) => {
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
    }
  });
  wsClient.on('event.enter_chat', (frame) => {
    if (frame && frame.chatid) {
      discoveredChatIds.add(frame.chatid);
      console.log('👋 [WeCom Bot] Enter chat:', frame.chatid);
    }
  });
  wsClient.on('event', (frame) => {
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
