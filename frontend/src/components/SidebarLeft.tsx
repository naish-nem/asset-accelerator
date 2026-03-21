'use client';
import { useState } from 'react';
import { Layers, Wand2, Loader2 } from 'lucide-react';
import { API_BASE } from '@/lib/api';

export default function SidebarLeft({ isGenerating, setIsGenerating, setGeneratedImageUrl }: any) {
  const [prompt, setPrompt] = useState("");

  const handleGenerate = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    setGeneratedImageUrl(null);
    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, style_preset: "Isometric Game Asset" })
      });
      const data = await res.json();
      if (data.image_url) {
        setGeneratedImageUrl(data.image_url);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to generate image. Is backend running?");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <aside className="panel">
      <div className="panel-header">
        Generation Settings
      </div>
      <div className="panel-content">
        <div className="input-group">
          <label>Prompt</label>
          <textarea 
            rows={4} 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. Cyberpunk back-alley with neon signs...">
          </textarea>
        </div>
        <div className="input-group">
          <label>Style Preset</label>
          <select>
            <option>Isometric Game Asset</option>
            <option>Pixel Art Isometric</option>
            <option>Low Poly 3D</option>
          </select>
        </div>
        <button onClick={handleGenerate} disabled={isGenerating}>
          {isGenerating ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
          {isGenerating ? "Generating..." : "Generate Scene"}
        </button>
      </div>
    </aside>
  );
}
