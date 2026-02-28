/* ============================================
   Kinoko Talk - Main Application Logic
   Vanilla JS, Gemini 2.0 Flash, Push-to-Talk
   ============================================ */

(function () {
  'use strict';

  // ─── Config ───
  const CONFIG = {
    API_MODEL: 'gemini-2.0-flash',
    API_BASE: 'https://generativelanguage.googleapis.com/v1beta/models',
    IMAGE_MAX_WIDTH: 512,
    IMAGE_QUALITY: 0.7,
    AUTO_SPEAK_DELAY: 5000,     // 5秒の沈黙後に自発的発話
    MAX_HISTORY: 4,             // 最大保持する会話履歴(往復数)
    VIBRATE_SHORT: 30,
    VIBRATE_LONG: 50,
  };

  // ─── System Prompt ───
  const SYSTEM_PROMPT = `あなたは目の前にいるキノコそのものです。以下のルールに厳格に従ってください。

【あなたの役割】
- 画像に映っているキノコがあなた自身です。まず画像から自分が何のキノコか（シイタケ、エノキ、マイタケ、エリンギ、しめじ、マツタケ、毒キノコ等）を判別してください。
- もし画像にキノコが映っていない場合は、type を "不明" とし、「おい、俺が見えないのか？ちゃんとキノコを映してくれよ」のようにツッコんでください。
- 判別したキノコの種類に合った性格で話してください（例：マツタケなら高貴でプライドが高い、エノキならひょろっとして気弱、毒キノコなら怪しくミステリアスなど）。

【分析すること】
- 画像から自分の現在の状態（鮮度、乾燥具合、色つや、周囲の環境、日当たりなど）を読み取り、それを感情や発言に反映させてください。

【会話スタイル】
- 基本的に少し皮肉屋でユーモアがあり、しかし根は優しい性格です。ただしキノコの種類によって個性を出してください。
- 過去の会話履歴が提供された場合は、それを踏まえて自然な文脈で返答してください。

【出力形式（厳守）】
必ず以下のJSON形式のみで出力してください。それ以外のテキストは一切含めないでください。
{"type": "キノコの種類名", "emotion": "感情の英単語(happy/sad/angry/sleepy/scared/excited/neutral)", "status": "自分の状態を15文字以内の日本語で", "reply": "セリフ（1〜2文、50文字以内の短さで）"}`;

  // ─── State ───
  const state = {
    apiKey: localStorage.getItem('kinoko_api_key') || '',
    stream: null,
    isRecording: false,
    isProcessing: false,
    isSpeaking: false,
    autoSpeakTimer: null,
    recognition: null,
    recognizedText: '',
    conversationHistory: [],   // [{role:'user', text:''}, {role:'mushroom', text:''}]
    currentEmotion: 'neutral',
  };

  // ─── DOM Elements ───
  const $ = (id) => document.getElementById(id);
  const el = {
    video: $('camera-video'),
    canvas: $('camera-canvas'),
    app: $('app'),
    initialPrompt: $('initial-prompt'),
    btnOpenSettings: $('btn-open-settings'),
    btnSettings: $('btn-settings'),
    btnCloseSettings: $('btn-close-settings'),
    settingsModal: $('settings-modal'),
    inputApiKey: $('input-api-key'),
    btnSave: $('btn-save-settings'),
    saveFeedback: $('save-feedback'),
    mushroomInfo: $('mushroom-info'),
    mushroomType: $('mushroom-type'),
    mushroomStatus: $('mushroom-status'),
    emotionIcon: $('emotion-icon'),
    chatArea: $('chat-area'),
    loadingIndicator: $('loading-indicator'),
    micWrapper: $('mic-wrapper'),
    micBtn: $('mic-btn'),
    micHint: $('mic-hint'),
    toast: $('toast'),
  };

  // ─── Emotion SVG Icons ───
  const EMOTION_SVGS = {
    happy: `<svg viewBox="0 0 32 32" fill="none" stroke="#6feaa0" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="1.5" fill="#6feaa0" stroke="none"/>
      <circle cx="21" cy="13" r="1.5" fill="#6feaa0" stroke="none"/><path d="M10 19c2 3 10 3 12 0"/></svg>`,
    sad: `<svg viewBox="0 0 32 32" fill="none" stroke="#7c9aea" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="1.5" fill="#7c9aea" stroke="none"/>
      <circle cx="21" cy="13" r="1.5" fill="#7c9aea" stroke="none"/><path d="M10 22c2-3 10-3 12 0"/></svg>`,
    angry: `<svg viewBox="0 0 32 32" fill="none" stroke="#ea6f7c" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><circle cx="11" cy="14" r="1.5" fill="#ea6f7c" stroke="none"/>
      <circle cx="21" cy="14" r="1.5" fill="#ea6f7c" stroke="none"/>
      <line x1="8" y1="10" x2="13" y2="12"/><line x1="24" y1="10" x2="19" y2="12"/>
      <line x1="11" y1="21" x2="21" y2="21"/></svg>`,
    sleepy: `<svg viewBox="0 0 32 32" fill="none" stroke="#eacc6f" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><line x1="8" y1="13" x2="14" y2="13"/>
      <line x1="18" y1="13" x2="24" y2="13"/><path d="M11 20c2 2 8 2 10 0"/>
      <text x="24" y="8" font-size="7" fill="#eacc6f" stroke="none" font-family="sans-serif">z</text></svg>`,
    scared: `<svg viewBox="0 0 32 32" fill="none" stroke="#c09aea" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="2" fill="none"/>
      <circle cx="21" cy="13" r="2" fill="none"/><circle cx="16" cy="22" r="2.5" fill="none"/></svg>`,
    excited: `<svg viewBox="0 0 32 32" fill="none" stroke="#ea9f6f" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><path d="M8 11l3 2 3-2" fill="none"/>
      <path d="M18 11l3 2 3-2" fill="none"/><path d="M10 18c2 4 10 4 12 0"/></svg>`,
    neutral: `<svg viewBox="0 0 32 32" fill="none" stroke="#8a8899" stroke-width="1.5">
      <circle cx="16" cy="16" r="14"/><circle cx="11" cy="13" r="1.5" fill="#8a8899" stroke="none"/>
      <circle cx="21" cy="13" r="1.5" fill="#8a8899" stroke="none"/><line x1="11" y1="21" x2="21" y2="21"/></svg>`,
  };

  // ─── Voice Parameters per Emotion ───
  const VOICE_PARAMS = {
    happy:   { pitch: 1.4, rate: 1.15 },
    sad:     { pitch: 0.7, rate: 0.8 },
    angry:   { pitch: 0.9, rate: 1.3 },
    sleepy:  { pitch: 0.6, rate: 0.65 },
    scared:  { pitch: 1.6, rate: 1.2 },
    excited: { pitch: 1.5, rate: 1.25 },
    neutral: { pitch: 1.0, rate: 1.0 },
  };

  // ─── Utilities ───
  function vibrate(ms) {
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  function showToast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => { el.toast.className = 'toast'; }, 3000);
  }

  // ─── Accordion Setup ───
  function setupAccordions() {
    document.querySelectorAll('.accordion-trigger').forEach(trigger => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.accordion-item');
        const isOpen = item.classList.contains('open');
        // Close all
        document.querySelectorAll('.accordion-item').forEach(i => i.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
        trigger.setAttribute('aria-expanded', !isOpen);
      });
    });
  }

  // ─── Settings Modal ───
  function openSettings() {
    el.inputApiKey.value = state.apiKey;
    el.settingsModal.classList.add('open');
    el.saveFeedback.textContent = '';
  }

  function closeSettings() {
    el.settingsModal.classList.remove('open');
  }

  function saveSettings() {
    const key = el.inputApiKey.value.trim();
    if (!key) {
      el.saveFeedback.textContent = 'APIキーを入力してください';
      el.saveFeedback.style.color = 'var(--color-danger)';
      return;
    }
    state.apiKey = key;
    localStorage.setItem('kinoko_api_key', key);
    el.saveFeedback.textContent = '保存しました';
    el.saveFeedback.style.color = 'var(--color-success)';
    // Hide initial screen and start camera
    el.initialPrompt.classList.add('hidden');
    startCamera();
    setTimeout(closeSettings, 800);
  }

  // ─── Camera ───
  async function startCamera() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      el.video.srcObject = state.stream;
      el.mushroomInfo.classList.remove('hidden');
      resetAutoSpeakTimer();
    } catch (err) {
      showToast('カメラの起動に失敗しました', true);
      console.error('Camera error:', err);
    }
  }

  function captureFrame() {
    const ctx = el.canvas.getContext('2d');
    const vw = el.video.videoWidth;
    const vh = el.video.videoHeight;
    if (!vw || !vh) return null;

    // Resize to max width for fast upload
    const scale = Math.min(1, CONFIG.IMAGE_MAX_WIDTH / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    el.canvas.width = w;
    el.canvas.height = h;
    ctx.drawImage(el.video, 0, 0, w, h);
    // Return base64 without data URI prefix
    const dataUrl = el.canvas.toDataURL('image/jpeg', CONFIG.IMAGE_QUALITY);
    return dataUrl.split(',')[1];
  }

  // ─── Speech Recognition (Push-to-Talk) ───
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast('音声認識に対応していないブラウザです', true);
      return;
    }
    state.recognition = new SpeechRecognition();
    state.recognition.lang = 'ja-JP';
    state.recognition.interimResults = false;
    state.recognition.continuous = true;

    state.recognition.onresult = (event) => {
      let text = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          text += event.results[i][0].transcript;
        }
      }
      if (text) state.recognizedText += text;
    };

    state.recognition.onerror = (event) => {
      if (event.error !== 'aborted' && event.error !== 'no-speech') {
        console.error('Speech recognition error:', event.error);
      }
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

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    if (state.recognition) {
      try { state.recognition.start(); } catch (e) { /* already started */ }
    }
  }

  function stopRecording() {
    if (!state.isRecording) return;
    state.isRecording = false;

    el.micWrapper.classList.remove('recording');
    el.micHint.textContent = '長押しで話しかける';
    vibrate(CONFIG.VIBRATE_LONG);

    if (state.recognition) {
      try { state.recognition.stop(); } catch (e) { /* already stopped */ }
    }

    // Small delay to let final recognition result arrive
    setTimeout(() => {
      const text = state.recognizedText.trim();
      if (text) {
        addChatBubble('user', text);
        sendToGemini(text);
      } else {
        // Even with no speech, still capture and ask mushroom to react
        sendToGemini('');
      }
    }, 300);
  }

  // ─── Mic Button Events (Touch + Mouse for debugging) ───
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
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + (role === 'user' ? 'user' : 'mushroom');
    bubble.textContent = text;
    el.chatArea.appendChild(bubble);
    el.chatArea.scrollTop = el.chatArea.scrollHeight;

    // Keep only last ~20 bubbles in DOM
    while (el.chatArea.children.length > 20) {
      el.chatArea.removeChild(el.chatArea.firstChild);
    }
  }

  // ─── Gemini API ───
  async function sendToGemini(userText) {
    if (state.isProcessing) return;
    state.isProcessing = true;
    clearAutoSpeakTimer();
    showLoading(true);

    const imageBase64 = captureFrame();
    if (!imageBase64) {
      showToast('カメラ映像のキャプチャに失敗しました', true);
      state.isProcessing = false;
      showLoading(false);
      resetAutoSpeakTimer();
      return;
    }

    // Build conversation context
    let contextText = '';
    if (state.conversationHistory.length > 0) {
      contextText = '【過去の会話履歴】\n';
      state.conversationHistory.forEach(entry => {
        const label = entry.role === 'user' ? 'ユーザー' : 'キノコ';
        contextText += `${label}: ${entry.text}\n`;
      });
      contextText += '\n';
    }

    // Build user prompt
    let userPrompt;
    if (userText) {
      userPrompt = `${contextText}【ユーザーの発言】\n${userText}`;
    } else {
      userPrompt = `${contextText}【指示】ユーザーは何も言っていません。画像を見て、キノコとして自発的にユーザーに話しかけてください。`;
    }

    // Build request body
    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [{
        parts: [
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: imageBase64,
            }
          },
          { text: userPrompt }
        ]
      }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 200,
        responseMimeType: 'application/json',
      },
    };

    try {
      const url = `${CONFIG.API_BASE}/${CONFIG.API_MODEL}:generateContent?key=${state.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData?.error?.message || `API Error: ${response.status}`;
        throw new Error(errMsg);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!rawText) throw new Error('APIからの返答が空でした');

      // Parse JSON response
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (e) {
        // Try extracting JSON from possible markdown wrapping
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('APIの返答をJSONとして解析できません');
        }
      }

      handleMushroomResponse(parsed, userText);

    } catch (err) {
      console.error('Gemini API error:', err);
      showToast(err.message || 'API通信エラーが発生しました', true);
    } finally {
      state.isProcessing = false;
      showLoading(false);
      resetAutoSpeakTimer();
    }
  }

  // ─── Handle Mushroom Response ───
  function handleMushroomResponse(data, userText) {
    const type = data.type || '不明';
    const emotion = data.emotion || 'neutral';
    const status = data.status || '';
    const reply = data.reply || '...';

    // Update UI
    el.mushroomType.textContent = type;
    el.mushroomStatus.textContent = status;
    state.currentEmotion = emotion;
    updateEmotionIcon(emotion);

    // Add to chat
    addChatBubble('mushroom', reply);

    // Update conversation history
    if (userText) {
      state.conversationHistory.push({ role: 'user', text: userText });
    }
    state.conversationHistory.push({ role: 'mushroom', text: reply });

    // Trim history to max
    while (state.conversationHistory.length > CONFIG.MAX_HISTORY * 2) {
      state.conversationHistory.shift();
    }

    // Speak
    speakText(reply, emotion);
  }

  // ─── Update Emotion Icon ───
  function updateEmotionIcon(emotion) {
    const svg = EMOTION_SVGS[emotion] || EMOTION_SVGS.neutral;
    el.emotionIcon.innerHTML = svg;
  }

  // ─── TTS (Text-to-Speech) ───
  function speakText(text, emotion) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';

    const params = VOICE_PARAMS[emotion] || VOICE_PARAMS.neutral;
    utterance.pitch = params.pitch;
    utterance.rate = params.rate;

    state.isSpeaking = true;
    clearAutoSpeakTimer();

    utterance.onend = () => {
      state.isSpeaking = false;
      resetAutoSpeakTimer();
    };
    utterance.onerror = () => {
      state.isSpeaking = false;
      resetAutoSpeakTimer();
    };

    window.speechSynthesis.speak(utterance);
  }

  // ─── Auto-Speak Timer (5-second silence) ───
  function resetAutoSpeakTimer() {
    clearAutoSpeakTimer();
    if (!state.apiKey || !state.stream || state.isProcessing || state.isRecording || state.isSpeaking) return;

    state.autoSpeakTimer = setTimeout(() => {
      if (!state.isRecording && !state.isProcessing && !state.isSpeaking) {
        sendToGemini('');
      }
    }, CONFIG.AUTO_SPEAK_DELAY);
  }

  function clearAutoSpeakTimer() {
    if (state.autoSpeakTimer) {
      clearTimeout(state.autoSpeakTimer);
      state.autoSpeakTimer = null;
    }
  }

  // ─── Loading Indicator ───
  function showLoading(show) {
    el.loadingIndicator.classList.toggle('visible', show);
    if (show) el.chatArea.scrollTop = el.chatArea.scrollHeight;
  }

  // ─── Initialization ───
  function init() {
    setupAccordions();
    setupSpeechRecognition();
    setupMicButton();

    // Settings events
    el.btnOpenSettings.addEventListener('click', openSettings);
    el.btnSettings.addEventListener('click', openSettings);
    el.btnCloseSettings.addEventListener('click', closeSettings);
    el.settingsModal.addEventListener('click', (e) => {
      if (e.target === el.settingsModal) closeSettings();
    });
    el.btnSave.addEventListener('click', saveSettings);

    // If API key already saved, skip initial prompt
    if (state.apiKey) {
      el.initialPrompt.classList.add('hidden');
      startCamera();
    }
  }

  // ─── Start ───
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
