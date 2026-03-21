'use client';
import { useState } from 'react';
import SidebarLeft from '@/components/SidebarLeft';
import SidebarRight from '@/components/SidebarRight';
import InteractiveCanvas from '@/components/InteractiveCanvas';

export default function Home() {
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedAssets, setExtractedAssets] = useState<any[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtractAsset = async (imageUrl: string, bbox: any) => {
    setIsExtracting(true);
    try {
      const res = await fetch("http://localhost:8000/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, bbox })
      });
      const data = await res.json();
      if (data.extracted_base64) {
        setExtractedAssets((prev) => [...prev, {
          id: Date.now(),
          url: data.extracted_base64,
          name: "Extracted Asset"
        }]);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to extract asset.");
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <main className="workspace">
      <SidebarLeft 
        isGenerating={isGenerating} 
        setIsGenerating={setIsGenerating} 
        setGeneratedImageUrl={setGeneratedImageUrl} 
      />
      <InteractiveCanvas 
        imageUrl={generatedImageUrl} 
        isGenerating={isGenerating} 
        onExtractAsset={handleExtractAsset}
      />
      <SidebarRight 
        extractedAssets={extractedAssets} 
        isExtracting={isExtracting} 
      />
    </main>
  );
}
