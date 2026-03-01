/* ============================================
   Kinoko Talk v2 - Main Application Logic
   Vanilla JS, Gemini 2.0 Flash, Push-to-Talk
   Dual Mode: Real Mushroom / Virtual Mushroom
   ============================================ */

(function () {
  'use strict';

  // ─── Config ───
  const CONFIG = {
    API_MODEL: 'gemini-2.0-flash',
    API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
    IMAGE_MAX_WIDTH: 512,
    IMAGE_QUALITY: 0.7,
    AUTO_SPEAK_DELAY: 5000,
    MAX_HISTORY: 4,
    VIBRATE_SHORT: 30,
    VIBRATE_LONG: 50,
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

  // ─── Demo Mode Responses ───
  const DEMO_RESPONSES = {
    found: [
      { type: 'シイタケ', color: '#8B6914', emotion: 'happy', status: '元気いっぱい', reply: 'おっ、やっと気づいてくれたか！俺、ここでずっと待ってたんだぞ。', environment: '薄暗い場所' },
      { type: 'エノキ', color: '#F5F5DC', emotion: 'scared', status: 'ちょっと不安', reply: 'う、うわっ！急にカメラ向けないでよ…恥ずかしいじゃん。', environment: '冷蔵庫の中' },
      { type: 'マイタケ', color: '#696969', emotion: 'excited', status: 'ノリノリ', reply: '見つけたな！俺を食べたら踊り出すほど美味いぜ！', environment: '木の根元' },
    ],
    notFound: [
      { type: '不明', suggested_type: 'シイタケ', suggested_color: '#8B6914', emotion: 'neutral', status: 'キノコ不在', reply: 'おーい、ここにキノコがいないぞ！俺を生やしてくれよ！', environment: '室内' },
      { type: '不明', suggested_type: 'ナメコ', suggested_color: '#DAA520', emotion: 'sad', status: 'キノコ不在', reply: 'さみしい場所だな…ヌルッとした俺がちょうどいいんじゃない？', environment: '湿った場所' },
      { type: '不明', suggested_type: 'エリンギ', suggested_color: '#F5DEB3', emotion: 'neutral', status: 'キノコ不在', reply: 'ここ、俺が生えたらいい感じになると思わない？', environment: '明るい場所' },
    ],
    virtual: [
      { emotion: 'happy', status: '生えたて新鮮', reply: 'やった！ここに生まれたぞ！なかなかいい場所じゃないか。' },
      { emotion: 'excited', status: '環境に満足', reply: 'ここ最高だな！日当たりも湿度もちょうどいいぜ！' },
      { emotion: 'neutral', status: 'まあまあ', reply: 'ふーん、まあ悪くないか。で、何か用？' },
    ],
    chat: [
      { emotion: 'happy', reply: 'へへ、褒められると傘が開いちゃうな！' },
      { emotion: 'angry', reply: 'おい、キノコだからって見下すなよ！こう見えてもすごいんだから。' },
      { emotion: 'sleepy', reply: 'ふぁ〜…ちょっと眠いな。胞子まき散らしちゃうぞ。' },
      { emotion: 'sad', reply: '最近、誰も話しかけてくれなくてさ…嬉しいよ、ありがとな。' },
      { emotion: 'excited', reply: 'もっと話そうぜ！キノコの世界、奥が深いんだから！' },
    ],
  };

  // ─── State ───
  const state = {
    proxyUrl: localStorage.getItem('kinoko_proxy_url') || '',
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

  // ─── Virtual Mushroom SVG Generator ───
  function generateMushroomSvg(color, type) {
    const capColor = color || '#8B6914';
    // Adjust stem and spot colors
    const stemColor = '#F5F0E0';
    const spotOpacity = 0.3;

    return `<svg width="100" height="120" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Shadow -->
      <ellipse cx="50" cy="115" rx="30" ry="5" fill="rgba(0,0,0,0.3)"/>
      <!-- Stem -->
      <rect x="38" y="60" width="24" height="50" rx="8" fill="${stemColor}" stroke="${capColor}" stroke-width="1" opacity="0.9"/>
      <!-- Cap -->
      <ellipse cx="50" cy="60" rx="42" ry="32" fill="${capColor}"/>
      <ellipse cx="50" cy="60" rx="42" ry="32" fill="url(#capShine)"/>
      <!-- Cap spots -->
      <circle cx="35" cy="50" r="5" fill="white" opacity="${spotOpacity}"/>
      <circle cx="58" cy="42" r="4" fill="white" opacity="${spotOpacity}"/>
      <circle cx="46" cy="62" r="3.5" fill="white" opacity="${spotOpacity}"/>
      <circle cx="67" cy="55" r="3" fill="white" opacity="${spotOpacity}"/>
      <!-- Eyes -->
      <circle cx="40" cy="55" r="3" fill="#333"/>
      <circle cx="60" cy="55" r="3" fill="#333"/>
      <circle cx="41" cy="54" r="1" fill="white"/>
      <circle cx="61" cy="54" r="1" fill="white"/>
      <!-- Mouth -->
      <path d="M44 64 Q50 69 56 64" stroke="#333" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <!-- Gradient -->
      <defs>
        <radialGradient id="capShine" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stop-color="white" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
    </svg>`;
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
    } else if (mode === 'proxy') {
      el.modeBadge.textContent = '';
      el.modeBadge.className = 'mode-badge';
    } else {
      el.modeBadge.textContent = '';
      el.modeBadge.className = 'mode-badge';
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

    if (apiMode === 'demo') {
      // Demo mode
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
    const mushroomFound = data.mushroom_found !== false;
    const type = data.type || '不明';
    const emotion = data.emotion || 'neutral';
    const status = data.status || '';
    const reply = data.reply || '...';
    const color = data.color || '#8B6914';

    // Update emotion icon
    state.currentEmotion = emotion;
    updateEmotionIcon(emotion);

    if (mushroomFound || state.mode === 'virtual') {
      // Mushroom is present (real or virtual)
      setMode(state.mode === 'virtual' ? 'virtual' : 'real');
      el.mushroomType.textContent = type;
      el.mushroomStatus.textContent = status;
      el.mushroomInfo.classList.add('visible');
      el.btnGrow.classList.remove('visible');

      if (state.mode === 'real') {
        // Hide virtual mushroom for real mode
        el.virtualLayer.classList.remove('visible');
        el.btnRemove.style.display = 'none';
      }
    } else {
      // No mushroom found
      setMode('no-mushroom');
      const sugType = data.suggested_type || 'シイタケ';
      const sugColor = data.suggested_color || '#8B6914';
      el.mushroomType.textContent = `${sugType}がオススメ`;
      el.mushroomStatus.textContent = data.environment || '分析中...';
      el.mushroomInfo.classList.add('visible');

      // Store suggestion for grow button
      state.virtualMushroomType = sugType;
      state.virtualMushroomColor = sugColor;

      // Show grow button
      el.btnGrow.classList.add('visible');
    }

    addChatBubble('mushroom', reply);

    // Update history
    if (userText) state.conversationHistory.push({ role: 'user', text: userText });
    state.conversationHistory.push({ role: 'mushroom', text: reply });
    while (state.conversationHistory.length > CONFIG.MAX_HISTORY * 2) state.conversationHistory.shift();

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

    // Render SVG mushroom
    el.virtualSvg.innerHTML = generateMushroomSvg(color, type);
    el.virtualLayer.classList.remove('removing');
    el.virtualLayer.classList.remove('visible');
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

  // ─── Init ───
  function init() {
    setupAccordions();
    setupSpeechRecognition();
    setupMicButton();

    el.btnStartApp.addEventListener('click', startApp);
    el.btnOpenSettingsInit.addEventListener('click', openSettings);
    el.btnSettings.addEventListener('click', openSettings);
    el.btnCloseSettings.addEventListener('click', closeSettings);
    el.settingsModal.addEventListener('click', (e) => { if (e.target === el.settingsModal) closeSettings(); });
    el.btnSave.addEventListener('click', saveSettings);
    el.btnGrow.addEventListener('click', growMushroom);
    el.btnRemove.addEventListener('click', removeMushroom);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
