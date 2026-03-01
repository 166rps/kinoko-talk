/*
  ============================================
  Kinoko Talk - Cloudflare Workers API Proxy
  ============================================

  【このファイルの使い方】

  1. Cloudflare にアカウントを作成（無料）
     https://dash.cloudflare.com/sign-up

  2. ダッシュボードの左メニューから「Workers & Pages」→「Create」をクリック

  3. 「Create Worker」を選択し、適当な名前をつける（例: kinoko-api）

  4. エディタが開くので、デフォルトのコードを全部消して、
     このファイルの内容をまるごとコピー&ペーストする

  5.★ 下の YOUR_GEMINI_API_KEY_HERE を、あなたの Google AI Studio の
     APIキーに書き換える

  6. 「Deploy」ボタンを押す

  7. 表示されるURL（例: https://kinoko-api.xxxxx.workers.dev）を
     Kinoko Talk アプリの設定画面の「プロキシURL」にペーストする

  以上で、ユーザーはAPIキーなしでアプリが使えるようになります！
  無料枠: 1日10万リクエスト
  ============================================
*/

const GEMINI_API_KEY = 'YOUR_GEMINI_API_KEY_HERE';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Rate limiting: simple per-IP limit using in-memory map
// Note: resets when worker is redeployed or after ~30s of inactivity
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 60;           // Maximum requests per window
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour window

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // Only allow POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Rate limit check
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!checkRateLimit(clientIP)) {
      return new Response(JSON.stringify({ error: 'レート制限に達しました。しばらく待ってからお試しください。' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    try {
      // Forward request body to Gemini API
      const body = await request.text();

      const geminiResponse = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
      });

      const geminiData = await geminiResponse.text();

      return new Response(geminiData, {
        status: geminiResponse.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Proxy error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
  },
};
