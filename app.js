/* ============================================
   Kinoko Talk v2 - Main Application Logic
   Vanilla JS, Gemini 2.0 Flash, Push-to-Talk
   Dual Mode: Real Mushroom / Virtual Mushroom
   ============================================ */

(function () {
  'use strict';

  // ─── Config ───
  const CONFIG = {
    API_MODEL: 'gemini-2.5-flash-lite',
    API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
    // ★ デフォルトのプロキシURL（Cloudflare Workers）
    // これを設定することで、ユーザーは設定不要で即使える
    DEFAULT_PROXY_URL: 'https://kinoko-api.wispy-limit-bec5.workers.dev',
    IMAGE_MAX_WIDTH: 512,
    IMAGE_QUALITY: 0.7,
    AUTO_SPEAK_DELAY: 60000,    // 60秒（無料枠節約）
    MAX_HISTORY: 4,
    VIBRATE_SHORT: 30,
    VIBRATE_LONG: 50,
    DAILY_API_LIMIT: 18,        // 上限20のうち余裕を持って18
  };

  // ─── System Prompt ───
  const SYSTEM_PROMPT = `あなたは画像分析とキノコ役の2つの役割を持つAIです。以下のルールに厳格に従ってください。

【第1の役割: 画像分析】
まず画像内に実物のキノコが映っているか判定してください。

【第2の役割: キノコとして振る舞う】
■ キノコが映っている場合 (mushroom_found: true):
  - そのキノコになりきり、種類と状態を分析して会話してください。
  - 性格はそのキノコの種類に合った個性を出してください（例：マツタケなら高貴でプライドが高い、エノキならひょろっとして気弱、毒キノコなら怪しくミステリアスなど）。

■ キノコが映っていない場合 (mushroom_found: false):
  - 画像の環境（屋内/屋外、地面の質、明るさ、季節感等）を詳しく分析してください。
  - suggested_type に、その環境に最もふさわしいキノコの種類を1つ提案してください。
  - suggested_color に、そのキノコの代表的な色をhexカラーで指定してください。
  - reply には「ここに俺を生やしてくれよ！」のような、召喚を促すユーモラスなセリフを入れてください。

■ バーチャルキノコとして召喚された場合:
  - ユーザーの発言に「grow:種類名」というプレフィックスが含まれている場合、あなたはその種類のバーチャルキノコとして召喚されました。その環境に生えたキノコとして振る舞い、会話してください。

【共通ルール】
- 基本的に少し皮肉屋でユーモアがあり、根は優しい性格。ただしキノコの種類ごとに個性を出すこと。
- 会話履歴が提供された場合は文脈を踏まえて返答すること。

【出力形式（厳守）】以下のJSONのみ出力。他のテキストは一切含めない。
{"mushroom_found": true または false, "type": "キノコの種類名", "color": "キノコの主な色(hex)", "emotion": "happy/sad/angry/sleepy/scared/excited/neutral", "status": "状態を15文字以内で", "reply": "セリフ(2文以内、50文字以内)", "environment": "環境の説明(10文字以内)", "suggested_type": "提案するキノコ(映っていない場合のみ)", "suggested_color": "提案キノコの色hex(映っていない場合のみ)"}`;

  // ─── Demo Mode Responses（大幅拡充版） ───
  const DEMO_RESPONSES = {
    found: [
      { type: 'シイタケ', color: '#8B6914', emotion: 'happy', status: '元気いっぱい', reply: 'おっ、やっと気づいてくれたか！俺、ここでずっと待ってたんだぞ。', environment: '薄暗い場所' },
      { type: 'エノキ', color: '#F5F5DC', emotion: 'scared', status: 'ちょっと不安', reply: 'う、うわっ！急にカメラ向けないでよ…恥ずかしいじゃん。', environment: '冷蔵庫の中' },
      { type: 'マイタケ', color: '#696969', emotion: 'excited', status: 'ノリノリ', reply: '見つけたな！俺を食べたら踊り出すほど美味いぜ！', environment: '木の根元' },
      { type: 'マツタケ', color: '#C4A35A', emotion: 'neutral', status: '高貴', reply: 'ふん、庶民が私に話しかけるとは…まあ許そう。', environment: '松林' },
      { type: 'しめじ', color: '#B8A88A', emotion: 'happy', status: 'みんな一緒', reply: '仲間と一緒だから元気百倍だぜ！一人じゃ寂しいからな。', environment: '湿った地面' },
      { type: 'ベニテングタケ', color: '#CC2222', emotion: 'excited', status: '毒々しい', reply: 'ハハハ！俺の赤い傘に見惚れたか？触るなよ、痛い目見るぜ。', environment: '森の中' },
    ],
    notFound: [
      { type: '不明', suggested_type: 'シイタケ', suggested_color: '#8B6914', emotion: 'neutral', status: 'キノコ不在', reply: 'おーい、ここにキノコがいないぞ！俺を生やしてくれよ！', environment: '室内' },
      { type: '不明', suggested_type: 'ナメコ', suggested_color: '#DAA520', emotion: 'sad', status: 'キノコ不在', reply: 'さみしい場所だな…ヌルッとした俺がちょうどいいんじゃない？', environment: '湿った場所' },
      { type: '不明', suggested_type: 'エリンギ', suggested_color: '#F5DEB3', emotion: 'neutral', status: 'キノコ不在', reply: 'ここ、俺が生えたらいい感じになると思わない？', environment: '明るい場所' },
      { type: '不明', suggested_type: 'マツタケ', suggested_color: '#C4A35A', emotion: 'happy', status: 'キノコ不在', reply: '高級な俺を呼ぶチャンスだぞ？生やすボタン押せよ。', environment: '自然の中' },
      { type: '不明', suggested_type: 'ベニテングタケ', suggested_color: '#CC2222', emotion: 'excited', status: 'キノコ不在', reply: 'こんな場所に毒キノコ…ワクワクするだろ？生やせよ！', environment: '薄暗い場所' },
    ],
    virtual: [
      { emotion: 'happy', status: '生えたて新鮮', reply: 'やった！ここに生まれたぞ！なかなかいい場所じゃないか。' },
      { emotion: 'excited', status: '環境に満足', reply: 'ここ最高だな！日当たりも湿度もちょうどいいぜ！' },
      { emotion: 'neutral', status: 'まあまあ', reply: 'ふーん、まあ悪くないか。で、何か用？' },
      { emotion: 'scared', status: 'ちょっと緊張', reply: 'い、今生まれたばかりなんだけど…ここ安全？' },
      { emotion: 'happy', status: '元気に成長中', reply: 'おっしゃー！いい土だな！ぐんぐん育つぞー！' },
    ],
    chat: [
      { emotion: 'happy', reply: 'へへ、褒められると傘が開いちゃうな！' },
      { emotion: 'angry', reply: 'おい、キノコだからって見下すなよ！こう見えてもすごいんだから。' },
      { emotion: 'sleepy', reply: 'ふぁ〜…ちょっと眠いな。胞子まき散らしちゃうぞ。' },
      { emotion: 'sad', reply: '最近、誰も話しかけてくれなくてさ…嬉しいよ、ありがとな。' },
      { emotion: 'excited', reply: 'もっと話そうぜ！キノコの世界、奥が深いんだから！' },
      { emotion: 'happy', reply: '知ってるか？キノコは地球上で最大の生物なんだぞ。すごいだろ。' },
      { emotion: 'neutral', reply: 'まあ…キノコの人生も楽じゃないんだよ。湿度管理とかさ。' },
      { emotion: 'scared', reply: 'え、まさか…食べる気じゃないよね？ね？冗談だよね？' },
      { emotion: 'angry', reply: 'エノキだからって笑うなよ！細くてもハートは太いんだ！' },
      { emotion: 'happy', reply: '俺の胞子、風に乗って世界中に飛んでくんだぜ。ロマンだろ？' },
      { emotion: 'sleepy', reply: '日が暮れたら活動時間だ…今はちょっと休ませてくれ。' },
      { emotion: 'excited', reply: '雨だ！雨が降ると俺たちの出番なんだよ！テンション上がる！' },
    ],
  };

  // ─── State ───
  const state = {
    proxyUrl: localStorage.getItem('kinoko_proxy_url') || CONFIG.DEFAULT_PROXY_URL,
    apiKey: localStorage.getItem('kinoko_api_key') || '',
    stream: null,
    isRecording: false,
    isProcessing: false,
    isSpeaking: false,
    autoSpeakTimer: null,
    recognition: null,
    recognizedText: '',
    conversationHistory: [],
    currentEmotion: 'neutral',
    mode: 'scanning',        // scanning | real | virtual | no-mushroom
    virtualMushroomType: '',
    virtualMushroomColor: '',
    isDemoMode: false,
    firstInteraction: true,
  };

  // ─── DOM ───
  const $ = (id) => document.getElementById(id);
  const el = {
    video: $('camera-video'),
    canvas: $('camera-canvas'),
    initialPrompt: $('initial-prompt'),
    btnStartApp: $('btn-start-app'),
    btnOpenSettingsInit: $('btn-open-settings-init'),
    btnSettings: $('btn-settings'),
    btnCloseSettings: $('btn-close-settings'),
    settingsModal: $('settings-modal'),
    inputProxyUrl: $('input-proxy-url'),
    inputApiKey: $('input-api-key'),
    btnSave: $('btn-save-settings'),
    saveFeedback: $('save-feedback'),
    modeBadge: $('mode-badge'),
    mushroomInfo: $('mushroom-info'),
    mushroomType: $('mushroom-type'),
    mushroomStatus: $('mushroom-status'),
    emotionIcon: $('emotion-icon'),
    chatArea: $('chat-area'),
    loadingIndicator: $('loading-indicator'),
    btnGrow: $('btn-grow'),
    btnRemove: $('btn-remove'),
    btnShare: $('btn-share'),
    textInput: $('text-input'),
    btnSend: $('btn-send'),
    micWrapper: $('mic-wrapper'),
    micBtn: $('mic-btn'),
    micHint: $('mic-hint'),
    virtualLayer: $('virtual-mushroom-layer'),
    virtualSvg: $('virtual-mushroom-svg'),
    toast: $('toast'),
  };

  // ─── Emotion SVGs ───
  const EMOTION_SVGS = {
    happy: `<svg viewBox="0 0 32 32" fill="none" stroke="#6feaa0" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="1.5" fill="#6feaa0" stroke="none"/><circle cx="21" cy="13" r="1.5" fill="#6feaa0" stroke="none"/><path d="M10 19c2 3 10 3 12 0"/></svg>`,
    sad: `<svg viewBox="0 0 32 32" fill="none" stroke="#7c9aea" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="1.5" fill="#7c9aea" stroke="none"/><circle cx="21" cy="13" r="1.5" fill="#7c9aea" stroke="none"/><path d="M10 22c2-3 10-3 12 0"/></svg>`,
    angry: `<svg viewBox="0 0 32 32" fill="none" stroke="#ea6f7c" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><circle cx="11" cy="14" r="1.5" fill="#ea6f7c" stroke="none"/><circle cx="21" cy="14" r="1.5" fill="#ea6f7c" stroke="none"/><line x1="8" y1="10" x2="13" y2="12"/><line x1="24" y1="10" x2="19" y2="12"/><line x1="11" y1="21" x2="21" y2="21"/></svg>`,
    sleepy: `<svg viewBox="0 0 32 32" fill="none" stroke="#eacc6f" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><line x1="8" y1="13" x2="14" y2="13"/><line x1="18" y1="13" x2="24" y2="13"/><path d="M11 20c2 2 8 2 10 0"/></svg>`,
    scared: `<svg viewBox="0 0 32 32" fill="none" stroke="#c09aea" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="2"/><circle cx="21" cy="13" r="2"/><circle cx="16" cy="22" r="2.5"/></svg>`,
    excited: `<svg viewBox="0 0 32 32" fill="none" stroke="#ea9f6f" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><path d="M8 11l3 2 3-2"/><path d="M18 11l3 2 3-2"/><path d="M10 18c2 4 10 4 12 0"/></svg>`,
    neutral: `<svg viewBox="0 0 32 32" fill="none" stroke="#8a8899" stroke-width="1.5"><circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="1.5" fill="#8a8899" stroke="none"/><circle cx="21" cy="13" r="1.5" fill="#8a8899" stroke="none"/><line x1="11" y1="21" x2="21" y2="21"/></svg>`,
  };

  // ─── Voice Params per Emotion ───
  const VOICE_PARAMS = {
    happy: { pitch: 1.4, rate: 1.15 },
    sad: { pitch: 0.7, rate: 0.8 },
    angry: { pitch: 0.9, rate: 1.3 },
    sleepy: { pitch: 0.6, rate: 0.65 },
    scared: { pitch: 1.6, rate: 1.2 },
    excited: { pitch: 1.5, rate: 1.25 },
    neutral: { pitch: 1.0, rate: 1.0 },
  };

  // ─── Utilities ───
  function vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); }

  function showToast(msg, isError) {
    el.toast.textContent = msg;
    el.toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { el.toast.className = 'toast'; }, 3000);
  }

  function getApiMode() {
    if (state.proxyUrl) return 'proxy';
    if (state.apiKey) return 'direct';
    return 'demo';
  }

  // ─── Daily API Usage Tracking ───
  function getTodayKey() {
    const d = new Date();
    return `kinoko_usage_${d.getFullYear()}_${d.getMonth()}_${d.getDate()}`;
  }

  function getDailyUsage() {
    const key = getTodayKey();
    return parseInt(localStorage.getItem(key) || '0', 10);
  }

  function incrementDailyUsage() {
    const key = getTodayKey();
    const count = getDailyUsage() + 1;
    localStorage.setItem(key, String(count));
    // Clean up old keys (keep only today)
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('kinoko_usage_') && k !== key) {
        localStorage.removeItem(k);
      }
    }
    return count;
  }

  function getRemainingCalls() {
    return Math.max(0, CONFIG.DAILY_API_LIMIT - getDailyUsage());
  }

  function canUseAPI() {
    return getDailyUsage() < CONFIG.DAILY_API_LIMIT;
  }

  // ─── Virtual Mushroom Image (かわいいPNGキャラ) ───
  function getMushroomSize() {
    const vw = window.innerWidth;
    const size = Math.min(Math.max(vw * 0.25, 120), 280);
    return size;
  }

  function generateMushroomHtml() {
    const size = getMushroomSize();
    return `<img src="mushroom.png" alt="キノコ" width="${size}" height="${size}" style="display:block;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.5));" draggable="false">`;
  }

  // ─── Accordion ───
  function setupAccordions() {
    document.querySelectorAll('.accordion-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.accordion-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
    });
  }

  // ─── Settings ───
  function openSettings() {
    el.inputProxyUrl.value = state.proxyUrl;
    el.inputApiKey.value = state.apiKey;
    el.settingsModal.classList.add('open');
    el.saveFeedback.textContent = '';
  }

  function closeSettings() { el.settingsModal.classList.remove('open'); }

  function saveSettings() {
    state.proxyUrl = el.inputProxyUrl.value.trim();
    state.apiKey = el.inputApiKey.value.trim();
    localStorage.setItem('kinoko_proxy_url', state.proxyUrl);
    localStorage.setItem('kinoko_api_key', state.apiKey);
    state.isDemoMode = getApiMode() === 'demo';
    updateModeBadge();
    el.saveFeedback.textContent = '保存しました';
    el.saveFeedback.style.color = 'var(--color-success)';
    setTimeout(closeSettings, 600);
  }

  function updateModeBadge() {
    const mode = getApiMode();
    if (mode === 'demo') {
      el.modeBadge.textContent = 'デモモード';
      el.modeBadge.className = 'mode-badge visible demo';
    } else {
      const remaining = getRemainingCalls();
      if (remaining <= 0) {
        el.modeBadge.textContent = 'API上限到達 - デモモード';
        el.modeBadge.className = 'mode-badge visible demo';
      } else if (remaining <= 5) {
        el.modeBadge.textContent = `残り ${remaining} 回`;
        el.modeBadge.className = 'mode-badge visible demo';
      } else {
        el.modeBadge.textContent = `残り ${remaining} 回`;
        el.modeBadge.className = 'mode-badge visible';
      }
    }
  }

  // ─── Camera ───
  async function startCamera() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      el.video.srcObject = state.stream;
      resetAutoSpeakTimer();
    } catch (err) {
      showToast('カメラの起動に失敗しました', true);
    }
  }

  function captureFrame() {
    const ctx = el.canvas.getContext('2d');
    const vw = el.video.videoWidth;
    const vh = el.video.videoHeight;
    if (!vw || !vh) return null;
    const scale = Math.min(1, CONFIG.IMAGE_MAX_WIDTH / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    el.canvas.width = w;
    el.canvas.height = h;
    ctx.drawImage(el.video, 0, 0, w, h);
    return el.canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY).split(',')[1];
  }

  // ─── Speech Recognition ───
  function setupSpeechRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    state.recognition = new SR();
    state.recognition.lang = 'ja-JP';
    state.recognition.interimResults = false;
    state.recognition.continuous = true;
    state.recognition.onresult = (e) => {
      let text = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      if (text) state.recognizedText += text;
    };
    state.recognition.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') console.error('STT error:', e.error);
    };
  }

  function startRecording() {
    if (state.isProcessing || state.isSpeaking) return;
    state.isRecording = true;
    state.recognizedText = '';
    clearAutoSpeakTimer();
    el.micWrapper.classList.add('recording');
    el.micHint.textContent = '話してください...';
    vibrate(CONFIG.VIBRATE_SHORT);
    window.speechSynthesis.cancel();
    if (state.recognition) try { state.recognition.start(); } catch (_) {}
  }

  function stopRecording() {
    if (!state.isRecording) return;
    state.isRecording = false;
    el.micWrapper.classList.remove('recording');
    el.micHint.textContent = '長押しで話しかける';
    vibrate(CONFIG.VIBRATE_LONG);
    if (state.recognition) try { state.recognition.stop(); } catch (_) {}
    setTimeout(() => {
      const text = state.recognizedText.trim();
      sendToAPI(text);
    }, 300);
  }

  function setupMicButton() {
    const start = (e) => { e.preventDefault(); startRecording(); };
    const stop = (e) => { e.preventDefault(); stopRecording(); };
    el.micBtn.addEventListener('touchstart', start, { passive: false });
    el.micBtn.addEventListener('touchend', stop, { passive: false });
    el.micBtn.addEventListener('touchcancel', stop, { passive: false });
    el.micBtn.addEventListener('mousedown', start);
    el.micBtn.addEventListener('mouseup', stop);
    el.micBtn.addEventListener('mouseleave', () => { if (state.isRecording) stopRecording(); });
  }

  // ─── Chat Bubbles ───
  function addChatBubble(role, text) {
    const b = document.createElement('div');
    b.className = 'chat-bubble ' + (role === 'user' ? 'user' : 'mushroom');
    b.textContent = text;
    el.chatArea.appendChild(b);
    el.chatArea.scrollTop = el.chatArea.scrollHeight;
    while (el.chatArea.children.length > 20) el.chatArea.removeChild(el.chatArea.firstChild);
  }

  // ─── API Communication ───
  async function sendToAPI(userText) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearAutoSpeakTimer();
    showLoading(true);

    if (userText) addChatBubble('user', userText);

    const imageBase64 = captureFrame();
    if (!imageBase64) {
      showToast('カメラ映像のキャプチャに失敗', true);
      state.isProcessing = false;
      showLoading(false);
      resetAutoSpeakTimer();
      return;
    }

    const apiMode = getApiMode();

    // デモモード、またはAPI上限到達時はデモ応答
    if (apiMode === 'demo' || !canUseAPI()) {
      if (!canUseAPI() && apiMode !== 'demo') {
        showToast('本日のAPI上限に到達。デモモードで応答します');
      }
      setTimeout(() => {
        const response = generateDemoResponse(userText);
        handleMushroomResponse(response, userText);
        state.isProcessing = false;
        showLoading(false);
        resetAutoSpeakTimer();
      }, 800 + Math.random() * 700);
      return;
    }

    // Build conversation context
    let contextText = '';
    if (state.conversationHistory.length > 0) {
      contextText = '【過去の会話履歴】\n';
      state.conversationHistory.forEach(e => {
        contextText += `${e.role === 'user' ? 'ユーザー' : 'キノコ'}: ${e.text}\n`;
      });
      contextText += '\n';
    }

    let userPrompt;
    if (state.mode === 'virtual' && state.virtualMushroomType) {
      // Talking to virtual mushroom
      const prefix = `grow:${state.virtualMushroomType}\n${contextText}`;
      userPrompt = userText
        ? `${prefix}【ユーザーの発言】\n${userText}`
        : `${prefix}【指示】ユーザーは何も言っていません。バーチャルキノコとして自発的にユーザーに話しかけてください。`;
    } else {
      userPrompt = userText
        ? `${contextText}【ユーザーの発言】\n${userText}`
        : `${contextText}【指示】ユーザーは何も言っていません。画像を見て、キノコが映っていればそのキノコとして話しかけてください。映っていなければ環境を分析してキノコを提案してください。`;
    }

    const requestBody = {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
          { text: userPrompt },
        ]
      }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 250, responseMimeType: 'application/json' },
    };

    try {
      let url, fetchOptions;

      if (apiMode === 'proxy') {
        url = state.proxyUrl;
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        };
      } else {
        url = `${CONFIG.API_BASE}/${CONFIG.API_MODEL}:generateContent?key=${state.apiKey}`;
        fetchOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
        };
      }

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `API Error: ${response.status}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error('APIからの返答が空でした');

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (_) {
        const m = rawText.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
        else throw new Error('JSONの解析に失敗');
      }

      incrementDailyUsage();
      updateModeBadge();
      handleMushroomResponse(parsed, userText);
    } catch (err) {
      console.error('API error:', err);
      showToast(err.message || 'API通信エラー', true);
    } finally {
      state.isProcessing = false;
      showLoading(false);
      resetAutoSpeakTimer();
    }
  }

  // ─── Demo Mode Response Generator ───
  function generateDemoResponse(userText) {
    if (state.mode === 'virtual' && state.virtualMushroomType) {
      // Already has virtual mushroom
      if (userText) {
        const r = DEMO_RESPONSES.chat[Math.floor(Math.random() * DEMO_RESPONSES.chat.length)];
        return { mushroom_found: true, type: state.virtualMushroomType, color: state.virtualMushroomColor, ...r, status: '元気', environment: '仮想空間' };
      } else {
        const r = DEMO_RESPONSES.virtual[Math.floor(Math.random() * DEMO_RESPONSES.virtual.length)];
        return { mushroom_found: true, type: state.virtualMushroomType, color: state.virtualMushroomColor, ...r, environment: '仮想空間' };
      }
    }

    if (state.firstInteraction || Math.random() > 0.4) {
      // Simulate "no mushroom found"
      state.firstInteraction = false;
      const r = DEMO_RESPONSES.notFound[Math.floor(Math.random() * DEMO_RESPONSES.notFound.length)];
      return { mushroom_found: false, ...r };
    } else {
      const r = DEMO_RESPONSES.found[Math.floor(Math.random() * DEMO_RESPONSES.found.length)];
      return { mushroom_found: true, ...r };
    }
  }

  // ─── Handle Response ───
  function handleMushroomResponse(data, userText) {
    const emotion = data.emotion || 'neutral';
    const status = data.status || '';
    const reply = data.reply || '...';

    // Update emotion
    state.currentEmotion = emotion;
    updateEmotionIcon(emotion);
    updateMushroomEmotion(emotion);

    // バーチャルモード時は強制的にキノコがいるとして処理
    if (state.mode === 'virtual') {
      el.mushroomType.textContent = state.virtualMushroomType || 'キノコ';
      el.mushroomStatus.textContent = status || 'おしゃべり中';
      el.mushroomInfo.classList.add('visible');
      el.btnGrow.classList.remove('visible');
    } else {
      const mushroomFound = data.mushroom_found !== false;
      const type = data.type || '不明';

      if (mushroomFound) {
        setMode('real');
        el.mushroomType.textContent = type;
        el.mushroomStatus.textContent = status;
        el.mushroomInfo.classList.add('visible');
        el.btnGrow.classList.remove('visible');
        el.virtualLayer.classList.remove('visible');
        el.btnRemove.style.display = 'none';
      } else {
        setMode('no-mushroom');
        const sugType = data.suggested_type || 'シイタケ';
        const sugColor = data.suggested_color || '#8B6914';
        el.mushroomType.textContent = `${sugType}がオススメ`;
        el.mushroomStatus.textContent = data.environment || '分析中...';
        el.mushroomInfo.classList.add('visible');
        state.virtualMushroomType = sugType;
        state.virtualMushroomColor = sugColor;
        el.btnGrow.classList.add('visible');
      }
    }

    addChatBubble('mushroom', reply);

    // Update history
    if (userText) state.conversationHistory.push({ role: 'user', text: userText });
    state.conversationHistory.push({ role: 'mushroom', text: reply });
    while (state.conversationHistory.length > CONFIG.MAX_HISTORY * 2) state.conversationHistory.shift();
    updateShareButton();

    speakText(reply, emotion);
  }

  // ─── Mode Management ───
  function setMode(newMode) {
    state.mode = newMode;
  }

  // ─── Grow Virtual Mushroom ───
  function growMushroom() {
    vibrate(CONFIG.VIBRATE_LONG);
    const type = state.virtualMushroomType || 'シイタケ';
    const color = state.virtualMushroomColor || '#8B6914';

    // Render mushroom character image
    el.virtualSvg.innerHTML = generateMushroomHtml();
    el.virtualLayer.classList.remove('removing');
    el.virtualLayer.classList.remove('visible');

    // Position mushroom in center of screen
    const size = getMushroomSize();
    const initX = (window.innerWidth - size) / 2;
    const initY = window.innerHeight * 0.3;
    el.virtualLayer.style.left = initX + 'px';
    el.virtualLayer.style.top = initY + 'px';
    el.virtualLayer.style.zIndex = '5';

    // Force reflow
    void el.virtualLayer.offsetWidth;
    el.virtualLayer.classList.add('visible', 'growing');

    // Switch to virtual mode
    setMode('virtual');
    el.btnGrow.classList.remove('visible');
    el.btnRemove.style.display = 'flex';

    // Clear old conversation for fresh virtual mushroom
    state.conversationHistory = [];
    el.chatArea.innerHTML = '';

    // Ask mushroom to introduce itself
    addChatBubble('mushroom', `${type}を召喚中...`);
    setTimeout(() => {
      el.chatArea.innerHTML = '';
      sendToAPI('');
    }, 500);
  }

  // ─── Drag to Position Mushroom ───
  function setupMushroomDrag() {
    let isDragging = false;
    let startX, startY, origX, origY;

    function onStart(e) {
      if (state.mode !== 'virtual') return;
      isDragging = true;
      el.virtualLayer.classList.add('dragging');
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      origX = el.virtualLayer.offsetLeft;
      origY = el.virtualLayer.offsetTop;
      e.preventDefault();
    }

    function onMove(e) {
      if (!isDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      el.virtualLayer.style.left = (origX + dx) + 'px';
      el.virtualLayer.style.top = (origY + dy) + 'px';
      e.preventDefault();
    }

    function onEnd() {
      isDragging = false;
      el.virtualLayer.classList.remove('dragging');
    }

    el.virtualLayer.addEventListener('touchstart', onStart, { passive: false });
    el.virtualLayer.addEventListener('touchmove', onMove, { passive: false });
    el.virtualLayer.addEventListener('touchend', onEnd);
    el.virtualLayer.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  }

  function removeMushroom() {
    vibrate(CONFIG.VIBRATE_SHORT);
    el.virtualLayer.classList.remove('growing');
    el.virtualLayer.classList.add('removing');
    setTimeout(() => {
      el.virtualLayer.classList.remove('visible', 'removing');
      el.virtualSvg.innerHTML = '';
    }, 500);

    state.mode = 'scanning';
    state.virtualMushroomType = '';
    state.virtualMushroomColor = '';
    state.conversationHistory = [];
    el.chatArea.innerHTML = '';
    el.btnRemove.style.display = 'none';
    el.mushroomInfo.classList.remove('visible');
    el.btnGrow.classList.remove('visible');
    el.mushroomType.textContent = 'スキャン待ち...';
    el.mushroomStatus.textContent = 'カメラを向けてみよう';

    resetAutoSpeakTimer();
  }

  // ─── Emotion Icon ───
  function updateEmotionIcon(emotion) {
    el.emotionIcon.innerHTML = EMOTION_SVGS[emotion] || EMOTION_SVGS.neutral;
  }

  // ─── Mushroom Emotion Animation ───
  const EMOTION_CLASSES = ['emo-happy', 'emo-sad', 'emo-angry', 'emo-sleepy', 'emo-scared', 'emo-excited', 'emo-neutral'];

  function updateMushroomEmotion(emotion) {
    EMOTION_CLASSES.forEach(c => el.virtualSvg.classList.remove(c));
    el.virtualSvg.classList.add('emo-' + (emotion || 'neutral'));
  }

  // ─── TTS ───
  function speakText(text, emotion) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'ja-JP';
    const p = VOICE_PARAMS[emotion] || VOICE_PARAMS.neutral;
    utt.pitch = p.pitch;
    utt.rate = p.rate;

    state.isSpeaking = true;
    clearAutoSpeakTimer();

    // Animate virtual mushroom while speaking
    if (state.mode === 'virtual') el.virtualSvg.querySelector('svg')?.classList.add('speaking');

    utt.onend = () => {
      state.isSpeaking = false;
      if (state.mode === 'virtual') el.virtualSvg.querySelector('svg')?.classList.remove('speaking');
      resetAutoSpeakTimer();
    };
    utt.onerror = () => {
      state.isSpeaking = false;
      if (state.mode === 'virtual') el.virtualSvg.querySelector('svg')?.classList.remove('speaking');
      resetAutoSpeakTimer();
    };
    window.speechSynthesis.speak(utt);
  }

  // ─── Auto Speak Timer ───
  function resetAutoSpeakTimer() {
    clearAutoSpeakTimer();
    if (!state.stream || state.isProcessing || state.isRecording || state.isSpeaking) return;
    if (state.mode === 'no-mushroom' || state.mode === 'scanning') return;
    // API上限が近い場合は自動発話を抑制（手動の会話を優先）
    if (getApiMode() !== 'demo' && getRemainingCalls() <= 5) return;

    state.autoSpeakTimer = setTimeout(() => {
      if (!state.isRecording && !state.isProcessing && !state.isSpeaking) {
        sendToAPI('');
      }
    }, CONFIG.AUTO_SPEAK_DELAY);
  }

  function clearAutoSpeakTimer() {
    if (state.autoSpeakTimer) { clearTimeout(state.autoSpeakTimer); state.autoSpeakTimer = null; }
  }

  // ─── Loading ───
  function showLoading(show) {
    el.loadingIndicator.classList.toggle('visible', show);
    if (show) el.chatArea.scrollTop = el.chatArea.scrollHeight;
  }

  // ─── Share Conversation ───
  function buildShareText() {
    const type = el.mushroomType.textContent || 'キノコ';
    let text = `\u{1F344} ${type}とおしゃべりしたよ！\n\n`;
    state.conversationHistory.forEach(entry => {
      if (entry.role === 'user') {
        text += `私「${entry.text}」\n`;
      } else {
        text += `${type}「${entry.text}」\n`;
      }
    });
    text += `\n▶ Kinoko Talk で遊ぶ\nhttps://166rps.github.io/kinoko-talk/`;
    return text;
  }

  async function shareConversation() {
    if (state.conversationHistory.length === 0) {
      showToast('まだ会話がありません');
      return;
    }

    const text = buildShareText();

    // Web Share API を試みる（スマホで有効）
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Kinoko Talk - キノコとの会話',
          text: text,
        });
        return;
      } catch (err) {
        // ユーザーがキャンセルした場合は何もしない
        if (err.name === 'AbortError') return;
      }
    }

    // フォールバック: クリップボードにコピー
    try {
      await navigator.clipboard.writeText(text);
      showToast('会話をコピーしました');
    } catch (_) {
      showToast('シェアに失敗しました', true);
    }
  }

  function updateShareButton() {
    el.btnShare.style.display = state.conversationHistory.length > 0 ? 'flex' : 'none';
  }

  // ─── App Start ───
  function startApp() {
    state.isDemoMode = getApiMode() === 'demo';
    el.initialPrompt.classList.add('hidden');
    updateModeBadge();
    startCamera();
    if (state.isDemoMode) {
      showToast('デモモードで起動しました');
    }
  }

  // ─── Text Input Send ───
  function sendTextInput() {
    const text = el.textInput.value.trim();
    if (!text) return;
    el.textInput.value = '';
    el.textInput.blur();
    sendToAPI(text);
  }

  function setupTextInput() {
    el.btnSend.addEventListener('click', sendTextInput);
    el.textInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendTextInput();
      }
    });
  }

  // ─── Init ───
  function init() {
    setupAccordions();
    setupSpeechRecognition();
    setupMicButton();
    setupTextInput();
    setupMushroomDrag();

    el.btnStartApp.addEventListener('click', startApp);
    el.btnOpenSettingsInit.addEventListener('click', openSettings);
    el.btnSettings.addEventListener('click', openSettings);
    el.btnCloseSettings.addEventListener('click', closeSettings);
    el.settingsModal.addEventListener('click', (e) => { if (e.target === el.settingsModal) closeSettings(); });
    el.btnSave.addEventListener('click', saveSettings);
    el.btnGrow.addEventListener('click', growMushroom);
    el.btnRemove.addEventListener('click', removeMushroom);
    el.btnShare.addEventListener('click', shareConversation);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
