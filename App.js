// --- アイコンの設定 (CDN経由) ---
const { 
  BookOpen, Play, Loader2, AlertCircle, ChevronLeft, ChevronRight, 
  Volume2, Sparkles, RotateCcw, Plus, Trash2, MapPin, Key 
} = lucide;

function App() {
  // App State
  const [step, setStep] = React.useState("setup"); 
  const [loadingStatus, setLoadingStatus] = React.useState("");
  const [error, setError] = React.useState("");
  const [apiKey, setApiKey] = React.useState(""); // APIキーをステートで管理
  
  // Settings
  const [pages, setPages] = React.useState(4);
  const [age, setAge] = React.useState("2");
  const [mainChar, setMainChar] = React.useState("こうあちゃん");
  const [subChars, setSubChars] = React.useState(["ペンペン"]);
  const [theme, setTheme] = React.useState("すいぞくかん");
  const [customTheme, setCustomTheme] = React.useState("");
  const [isCustomTheme, setIsCustomTheme] = React.useState(false);

  // Story Content
  const [story, setStory] = React.useState([]); 
  const [pageIndex, setPageIndex] = React.useState(0);
  const [isGeneratingImage, setIsGeneratingImage] = React.useState(false);

  // モデル名の定義
  const TEXT_MODEL = "gemini-2.0-flash";
  const IMAGE_MODEL = "imagen-3.0-generate-001";
  const TTS_MODEL = "gemini-2.0-flash-tts";

  // サブキャラ管理
  const addSubChar = () => subChars.length < 5 && setSubChars([...subChars, ""]);
  const updateSubChar = (index, value) => {
    const newChars = [...subChars];
    newChars[index] = value;
    setSubChars(newChars);
  };
  const removeSubChar = (index) => subChars.length > 1 && setSubChars(subChars.filter((_, i) => i !== index));

  const fetchWithRetry = async (url, options, retries = 3) => {
    const response = await fetch(url, options);
    if (!response.ok) {
      if (response.status === 401) throw new Error("APIキーが無効です。");
      throw new Error(`エラーが発生しました: ${response.status}`);
    }
    return await response.json();
  };

  const generateStory = async () => {
    if (!apiKey) {
      alert("APIキーを入力してください。");
      return;
    }
    const finalTheme = isCustomTheme ? customTheme : theme;
    setStep("loading");
    setLoadingStatus("おはなしを かんがえています...");

    const friendsList = subChars.filter(c => c.trim() !== "").join("と");
    const systemPrompt = `あなたはプロの絵本作家です。${age}歳向け。${pages}ページ。主人公:${mainChar} 友達:${friendsList}。JSON形式で出力。{"title": "題名", "pages": [{"text": "本文", "imagePrompt": "英語プロンプト"}]}`;
    const userPrompt = `${finalTheme}での冒険。最後は「おしまい」で。`;

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

  const generateImageForPage = async (index, prompt) => {
    if (story[index]?.imageUrl || isGeneratingImage) return;
    setIsGeneratingImage(true);
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict?key=${apiKey}`;
      const res = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } })
      });
      const imageUrl = `data:image/png;base64,${res.predictions[0].bytesBase64Encoded}`;
      setStory(prev => {
        const newStory = [...prev];
        newStory[index] = { ...newStory[index], imageUrl };
        return newStory;
      });
    } catch (err) { console.error(err); } finally { setIsGeneratingImage(false); }
  };

  const playVoice = async (text, index) => {
    if (story[index]?.audioUrl) {
      new Audio(story[index].audioUrl).play();
      return;
    }
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent?key=${apiKey}`;
      const res = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ["AUDIO"] }
        })
      });
      const audioData = res.candidates[0].content.parts[0].inlineData.data;
      const audioUrl = `data:audio/wav;base64,${audioData}`;
      setStory(prev => {
        const newStory = [...prev];
        newStory[index] = { ...newStory[index], audioUrl };
        return newStory;
      });
      new Audio(audioUrl).play();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF5] text-[#4A3F35] font-sans p-4">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-rose-500 text-white rounded-2xl flex items-center justify-center shadow-lg"><BookOpen size={28} /></div>
            <h1 className="text-2xl font-black">AIえほんメーカー</h1>
          </div>
        </header>

        {step === "setup" && (
          <div className="bg-white rounded-[2rem] shadow-xl p-6 space-y-6">
            <section className="bg-amber-50 p-4 rounded-xl border-2 border-amber-200">
               <label className="flex items-center gap-2 text-sm font-black text-amber-700 mb-2"><Key size={16}/> Gemini APIキー</label>
               <input 
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full p-2 rounded bg-white border border-amber-300"
                placeholder="AIを動かす鍵を入力してください"
               />
               <p className="text-[10px] mt-1 text-amber-600">※キーは保存されません。ブラウザを閉じると消えるので安心です。</p>
            </section>
            
            <div className="grid md:grid-cols-2 gap-6">
              <section>
                <label className="text-xs font-black text-slate-400">しゅじんこう</label>
                <input value={mainChar} onChange={e => setMainChar(e.target.value)} className="w-full p-3 bg-rose-50 rounded-xl mt-1 font-bold" />
              </section>
              <section>
                <label className="text-xs font-black text-slate-400">ぼうけんの ばしょ</label>
                <input value={isCustomTheme ? customTheme : theme} onChange={e => {setCustomTheme(e.target.value); setIsCustomTheme(true);}} className="w-full p-3 bg-sky-50 rounded-xl mt-1 font-bold" />
              </section>
            </div>

            <button onClick={generateStory} className="w-full bg-rose-500 text-white font-black py-4 rounded-2xl text-xl shadow-lg hover:bg-rose-600 transition-all">
              えほんを つくる！
            </button>
          </div>
        )}

        {step === "loading" && <div className="text-center p-20"><Loader2 className="animate-spin mx-auto text-rose-500 mb-4" size={48} /><p className="font-bold">{loadingStatus}</p></div>}

        {step === "reader" && (
          <div className="space-y-4">
            <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl aspect-[4/3] relative border-8 border-white">
              {story[pageIndex]?.imageUrl ? <img src={story[pageIndex].imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full bg-slate-100 flex items-center justify-center">えを かいています...</div>}
              <button onClick={() => playVoice(story[pageIndex].text, pageIndex)} className="absolute bottom-4 right-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center text-rose-500"><Volume2 /></button>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-lg text-center">
              <p className="text-xl font-black">{story[pageIndex].text}</p>
            </div>
            <div className="flex justify-between mt-4">
              <button onClick={() => setPageIndex(Math.max(0, pageIndex - 1))} className="p-4 bg-white rounded-xl shadow-md"><ChevronLeft /></button>
              <button onClick={() => { if(pageIndex < story.length-1) { setPageIndex(pageIndex + 1); generateImageForPage(pageIndex + 1, story[pageIndex + 1].imagePrompt); } }} className="p-4 bg-rose-500 text-white rounded-xl shadow-md"><ChevronRight /></button>
            </div>
            <button onClick={() => setStep("setup")} className="w-full text-slate-400 text-sm font-bold mt-8">最初から作り直す</button>
          </div>
        )}
      </div>
    </div>
  );
}
// これを最後に追加してReactにレンダリングを任せます
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
