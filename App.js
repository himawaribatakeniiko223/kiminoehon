import React, { useState, useEffect, useCallback } from "react";
import { 
  BookOpen, 
  Play, 
  Loader2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Volume2, 
  Sparkles,
  RotateCcw,
  Plus,
  Trash2,
  MapPin
} from "lucide-react";

// --- API Key (The environment provides the key at runtime) ---
const apiKey = ""; 

// --- Model Names ---
const TEXT_MODEL = "gemini-2.5-flash-preview-09-2025";
const IMAGE_MODEL = "imagen-4.0-generate-001";
const TTS_MODEL = "gemini-2.5-flash-preview-tts";

export default function App() {
  // App State
  const [step, setStep] = useState("setup"); 
  const [loadingStatus, setLoadingStatus] = useState("");
  const [error, setError] = useState("");
  
  // Settings
  const [pages, setPages] = useState(4);
  const [age, setAge] = useState("2");
  const [mainChar, setMainChar] = useState("こうあちゃん");
  const [subChars, setSubChars] = useState(["ペンペン"]);
  const [theme, setTheme] = useState("すいぞくかん");
  const [customTheme, setCustomTheme] = useState("");
  const [isCustomTheme, setIsCustomTheme] = useState(false);

  // Story Content
  const [story, setStory] = useState([]); 
  const [pageIndex, setPageIndex] = useState(0);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // --- Sub Character Management ---
  const addSubChar = () => {
    if (subChars.length < 5) {
      setSubChars([...subChars, ""]);
    }
  };

  const updateSubChar = (index, value) => {
    const newChars = [...subChars];
    newChars[index] = value;
    setSubChars(newChars);
  };

  const removeSubChar = (index) => {
    if (subChars.length > 1) {
      setSubChars(subChars.filter((_, i) => i !== index));
    }
  };

  // --- API Utilities ---
  const fetchWithRetry = async (url, options, retries = 5, backoff = 1000) => {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // 401エラーの場合、詳細なメッセージを構築
        if (response.status === 401) {
          throw new Error("APIキーが正しく設定されていないか、認証に失敗しました。システム管理者に確認してください。");
        }
        throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      if (retries > 0 && !err.message.includes("401")) {
        await new Promise(resolve => setTimeout(resolve, backoff));
        return fetchWithRetry(url, options, retries - 1, backoff * 2);
      }
      throw err;
    }
  };

  // --- Story Generation ---
  const generateStory = async () => {
    const finalTheme = isCustomTheme ? customTheme : theme;
    if (!finalTheme) {
      setError("ぼうけんの ばしょを 入力してください。");
      setStep("error");
      return;
    }

    setStep("loading");
    setLoadingStatus("おはなしを かんがえています...");
    setError("");

    const friendsList = subChars.filter(c => c.trim() !== "").join("と");
    const systemPrompt = `あなたはプロの絵本作家です。
対象：${age}さいの子ども。
ページ数：${pages}ページ。
主人公：${mainChar}
登場するお友達：${friendsList}

【ルール】
- ひらがな中心。
- 1ページは短い文で1〜2文。
- 優しい「〜しました」調。
- 主人公とお友達全員が物語に楽しく関わるようにしてください。
- 各ページに、画像生成用プロンプト（英語）も含めてください。

【出力形式】
JSONオブジェクトのみ。
{
  "title": "物語のタイトル",
  "pages": [
    { "text": "本文", "imagePrompt": "A cute digital illustration for a children's book, pastel colors, ${mainChar} and ${friendsList} in ${finalTheme}, high detail" }
  ]
}`;

    const userPrompt = `${finalTheme}での ${mainChar} たちの ぼうけん。さいごは「おしまい。${mainChar}たちの ぼうけんでした。」で終わる。`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL}:generateContent?key=${apiKey}`;
      const data = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const result = JSON.parse(data.candidates[0].content.parts[0].text);
      setStory(result.pages.map(p => ({ ...p, imageUrl: null, audioUrl: null })));
      setPageIndex(0);
      setStep("reader");
      
      generateImageForPage(0, result.pages[0].imagePrompt);
    } catch (err) {
      setError(err.message);
      setStep("error");
    }
  };

  // --- Image Generation ---
  const generateImageForPage = async (index, prompt) => {
    if (story[index]?.imageUrl || isGeneratingImage) return;

    setIsGeneratingImage(true);
    const enhancedPrompt = `${prompt}, soft lighting, adorable characters, clean lines, storybook art style`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict?key=${apiKey}`;
      const res = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: { prompt: enhancedPrompt }, // 修正: オブジェクト形式
          parameters: { sampleCount: 1 }
        })
      });

      const base64 = res.predictions[0].bytesBase64Encoded;
      const imageUrl = `data:image/png;base64,${base64}`;

      setStory(prev => {
        const newStory = [...prev];
        if (newStory[index]) {
          newStory[index] = { ...newStory[index], imageUrl };
        }
        return newStory;
      });
    } catch (err) {
      console.error("Image generation failed", err);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  // --- Text to Speech ---
  const playVoice = async (text, index) => {
    if (story[index]?.audioUrl) {
      const audio = new Audio(story[index].audioUrl);
      audio.play();
      return;
    }

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;
      const res = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Say gently: ${text}` }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }
            }
          }
        })
      });

      const audioBase64 = res.candidates[0].content.parts[0].inlineData.data;
      const wavUrl = pcmToWavUrl(audioBase64, 24000);
      
      setStory(prev => {
        const newStory = [...prev];
        if (newStory[index]) {
          newStory[index] = { ...newStory[index], audioUrl: wavUrl };
        }
        return newStory;
      });

      const audio = new Audio(wavUrl);
      audio.play();
    } catch (err) {
      console.error("TTS failed", err);
    }
  };

  const pcmToWavUrl = (base64Pcm, sampleRate) => {
    const binaryString = window.atob(base64Pcm);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + len, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, len, true);

    const blob = new Blob([wavHeader, bytes], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  };

  // --- Navigation ---
  const handleNext = () => {
    const nextIdx = pageIndex + 1;
    if (nextIdx < story.length) {
      setPageIndex(nextIdx);
      if (!story[nextIdx].imageUrl) {
        generateImageForPage(nextIdx, story[nextIdx].imagePrompt);
      }
    }
  };

  const handlePrev = () => {
    setPageIndex(p => Math.max(0, p - 1));
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] text-[#4A3F35] font-sans selection:bg-rose-100">
      <div className="max-w-4xl mx-auto p-4 md:p-8">
        
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-rose-100 ring-4 ring-white">
              <BookOpen size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">AIえほんメーカー</h1>
              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
                <Sparkles size={10} /> Powered by AI
              </p>
            </div>
          </div>
          {step === "reader" && (
            <button 
              onClick={() => setStep("setup")}
              className="px-4 py-2 bg-white hover:bg-rose-50 rounded-xl border-2 border-rose-100 transition-all text-rose-500 font-bold flex items-center gap-2 shadow-sm"
            >
              <RotateCcw size={18} />
              <span className="hidden md:inline">つくりなおす</span>
            </button>
          )}
        </header>

        <main>
          {step === "setup" && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-rose-200/20 p-6 md:p-10 border border-white animate-in zoom-in-95 duration-300">
              <div className="grid md:grid-cols-2 gap-10">
                
                {/* Character Settings */}
                <div className="space-y-6">
                  <section>
                    <label className="text-xs font-black mb-3 block text-slate-400 uppercase tracking-widest">しゅじんこう</label>
                    <div className="bg-rose-50 rounded-2xl p-4 border-2 border-transparent focus-within:border-rose-300 transition-all shadow-inner">
                      <input 
                        value={mainChar}
                        onChange={e => setMainChar(e.target.value)}
                        className="w-full bg-transparent outline-none font-bold text-lg"
                        placeholder="なまえ"
                      />
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-widest">おともだち</label>
                      <button 
                        onClick={addSubChar}
                        disabled={subChars.length >= 5}
                        className="text-rose-500 hover:text-rose-600 flex items-center gap-1 text-xs font-black disabled:opacity-30"
                      >
                        <Plus size={14} /> つぎの ともだち
                      </button>
                    </div>
                    <div className="space-y-3">
                      {subChars.map((name, idx) => (
                        <div key={idx} className="flex gap-2 animate-in slide-in-from-left-2 duration-300">
                          <div className="flex-1 bg-sky-50 rounded-xl p-3 border-2 border-transparent focus-within:border-sky-300 transition-all shadow-inner">
                            <input 
                              value={name}
                              onChange={e => updateSubChar(idx, e.target.value)}
                              className="w-full bg-transparent outline-none font-bold text-sm"
                              placeholder={`おともだち ${idx + 1}`}
                            />
                          </div>
                          {subChars.length > 1 && (
                            <button 
                              onClick={() => removeSubChar(idx)}
                              className="w-12 h-12 flex items-center justify-center text-slate-300 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                </div>

                {/* Adventure Settings */}
                <div className="space-y-6">
                  <section>
                    <label className="text-xs font-black mb-3 block text-slate-400 uppercase tracking-widest">どこで ぼうけんする？</label>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {["すいぞくかん", "うちゅう", "おかしのくに", "もりのなか"].map(t => (
                        <button
                          key={t}
                          onClick={() => { setTheme(t); setIsCustomTheme(false); }}
                          className={`px-4 py-2 rounded-xl font-bold text-sm transition-all border-2 ${(!isCustomTheme && theme === t) ? "bg-rose-500 border-rose-500 text-white shadow-lg shadow-rose-100" : "bg-white border-slate-100 text-slate-500 hover:border-rose-200"}`}
                        >
                          {t}
                        </button>
                      ))}
                      <button
                        onClick={() => setIsCustomTheme(true)}
                        className={`px-4 py-2 rounded-xl font-bold text-sm transition-all border-2 ${isCustomTheme ? "bg-indigo-500 border-indigo-500 text-white shadow-lg shadow-indigo-100" : "bg-white border-slate-100 text-slate-500 hover:border-indigo-200"}`}
                      >
                        じゆうに きめる
                      </button>
                    </div>

                    {isCustomTheme && (
                      <div className="bg-indigo-50 rounded-2xl p-4 border-2 border-indigo-200 animate-in slide-in-from-top-2 shadow-inner">
                        <div className="flex items-center gap-2 mb-2 text-indigo-400">
                          <MapPin size={16} />
                          <span className="text-[10px] font-black uppercase tracking-widest">好きなばしょ</span>
                        </div>
                        <input 
                          value={customTheme}
                          onChange={e => setCustomTheme(e.target.value)}
                          className="w-full bg-transparent outline-none font-bold text-lg placeholder:text-indigo-200"
                          placeholder="和歌山のおしろ、など"
                        />
                      </div>
                    )}
                  </section>

                  <div className="grid grid-cols-2 gap-4">
                    <section>
                      <label className="text-xs font-black mb-3 block text-slate-400 uppercase tracking-widest">なんさい？</label>
                      <div className="flex gap-2">
                        {["2", "3", "4"].map(v => (
                          <button
                            key={v}
                            onClick={() => setAge(v)}
                            className={`flex-1 py-3 rounded-xl font-black transition-all border-2 ${age === v ? "bg-amber-400 border-amber-400 text-white shadow-md" : "bg-slate-50 border-transparent text-slate-400"}`}
                          >
                            {v}歳
                          </button>
                        ))}
                      </div>
                    </section>
                    <section>
                      <label className="text-xs font-black mb-3 block text-slate-400 uppercase tracking-widest">ながさ</label>
                      <div className="flex gap-2">
                        {[4, 8].map(v => (
                          <button
                            key={v}
                            onClick={() => setPages(v)}
                            className={`flex-1 py-3 rounded-xl font-black transition-all border-2 ${pages === v ? "bg-slate-800 border-slate-800 text-white shadow-md" : "bg-slate-50 border-transparent text-slate-400"}`}
                          >
                            {v}P
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>

                  <button
                    onClick={generateStory}
                    className="w-full mt-6 bg-rose-500 hover:bg-rose-600 active:scale-[0.98] text-white font-black py-5 rounded-[2rem] flex items-center justify-center gap-3 text-xl shadow-2xl shadow-rose-200 transition-all group"
                  >
                    <Sparkles className="group-hover:animate-bounce" size={24} />
                    えほんを つくる！
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === "loading" && (
            <div className="bg-white rounded-[3rem] shadow-2xl p-16 text-center">
              <div className="relative w-24 h-24 mx-auto mb-8">
                <div className="absolute inset-0 border-[8px] border-rose-50 rounded-full"></div>
                <div className="absolute inset-0 border-[8px] border-rose-500 rounded-full border-t-transparent animate-spin"></div>
                <BookOpen className="absolute inset-0 m-auto text-rose-500" size={32} />
              </div>
              <h2 className="text-2xl font-black mb-2 text-slate-800">{loadingStatus}</h2>
              <p className="text-slate-400 font-bold">すてきな 物語が できますように</p>
            </div>
          )}

          {step === "error" && (
            <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 text-center border-t-[12px] border-rose-500">
              <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
              <h2 className="text-xl font-black mb-6">エラーが発生しました</h2>
              <p className="text-slate-500 mb-6 font-bold">認証エラーが出た場合は、数分待ってからお試しください。</p>
              <pre className="bg-rose-50 p-6 rounded-2xl text-xs font-mono text-rose-600 mb-8 overflow-auto max-h-40 text-left shadow-inner">
                {error}
              </pre>
              <button
                onClick={() => setStep("setup")}
                className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg"
              >
                やりなおす
              </button>
            </div>
          )}

          {step === "reader" && story.length > 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              {/* Picture Area */}
              <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden aspect-[4/3] relative group border-[12px] border-white ring-1 ring-slate-100 shadow-rose-100/50">
                {story[pageIndex]?.imageUrl ? (
                  <img 
                    src={story[pageIndex].imageUrl} 
                    alt="Illustration" 
                    className="w-full h-full object-cover animate-in fade-in duration-1000"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-50 flex flex-col items-center justify-center gap-6">
                    <div className="w-16 h-16 border-[6px] border-rose-100 border-t-rose-500 rounded-full animate-spin"></div>
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">Drawing...</p>
                  </div>
                )}
                
                <div className="absolute bottom-6 right-6">
                  <button 
                    onClick={() => playVoice(story[pageIndex].text, pageIndex)}
                    className="w-14 h-14 bg-white/90 hover:bg-white rounded-full shadow-xl flex items-center justify-center text-rose-500 transition-all active:scale-90 ring-4 ring-rose-500/10"
                  >
                    <Volume2 size={28} />
                  </button>
                </div>
              </div>

              {/* Text Area */}
              <div className="bg-white rounded-[2rem] shadow-xl p-8 md:p-12 text-center min-h-[160px] flex flex-col justify-center relative border border-slate-50">
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-rose-500 text-white px-6 py-1 rounded-full text-xs font-black shadow-lg">
                  {pageIndex + 1} / {story.length} P
                </div>
                <p className="text-2xl md:text-3xl font-black leading-relaxed text-slate-800">
                  {story[pageIndex].text}
                </p>
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between gap-4">
                <button
                  onClick={handlePrev}
                  disabled={pageIndex === 0}
                  className="w-16 h-16 bg-white hover:bg-slate-50 disabled:opacity-30 rounded-2xl shadow-md border-2 border-slate-100 flex items-center justify-center transition-all active:scale-95"
                >
                  <ChevronLeft size={32} />
                </button>
                
                <div className="flex gap-2">
                  {story.map((_, i) => (
                    <div 
                      key={i} 
                      className={`h-2 rounded-full transition-all duration-300 ${i === pageIndex ? "w-8 bg-rose-500" : "w-2 bg-slate-200"}`}
                    />
                  ))}
                </div>

                <button
                  onClick={handleNext}
                  disabled={pageIndex === story.length - 1}
                  className="w-16 h-16 bg-rose-500 hover:bg-rose-600 disabled:opacity-30 rounded-2xl shadow-lg text-white flex items-center justify-center transition-all active:scale-95 shadow-rose-200"
                >
                  <ChevronRight size={32} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
