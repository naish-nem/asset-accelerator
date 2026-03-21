'use client';
import { useState } from 'react';
import SidebarLeft from '@/components/SidebarLeft';
import SidebarRight from '@/components/SidebarRight';
import InteractiveCanvas from '@/components/InteractiveCanvas';
import { API_BASE } from '@/lib/api';

export default function Home() {
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedAssets, setExtractedAssets] = useState<any[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedForUnityIds, setSelectedForUnityIds] = useState<number[]>([]);
  const [isUnityImporting, setIsUnityImporting] = useState(false);

  const handleExtractAsset = async (imageUrl: string, bbox: any) => {
    setIsExtracting(true);
    try {
      const res = await fetch(`${API_BASE}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_url: imageUrl, bbox })
      });
      const data = await res.json();
      if (data.extracted_base64) {
        const id = Date.now();
        setExtractedAssets((prev) => [
          ...prev,
          {
            id,
            url: data.extracted_base64,
            name: `Extracted ${prev.length + 1}`,
          },
        ]);
        setSelectedForUnityIds((s) => [...s, id]);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to extract asset.");
    } finally {
      setIsExtracting(false);
    }
  };

  const toggleUnitySelection = (id: number) => {
    setSelectedForUnityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAllForUnity = () => {
    setSelectedForUnityIds(extractedAssets.map((a) => a.id));
  };

  const selectNoneForUnity = () => {
    setSelectedForUnityIds([]);
  };

  const handleImportSelectedToUnity = async () => {
    const selected = extractedAssets.filter((a) => selectedForUnityIds.includes(a.id));
    if (selected.length === 0) return;

    setIsUnityImporting(true);
    try {
      const res = await fetch(`${API_BASE}/unity/import-extract-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((a) => ({ extracted_base64: a.url })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data as { detail?: unknown }).detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: unknown) => JSON.stringify(d)).join(' ')
              : res.statusText;
        throw new Error(msg || 'Import failed');
      }
      const count = (data as { count?: number }).count ?? selected.length;
      alert(
        `Sent ${count} image(s) to Unity. Check Assets/AcceleratorImport/ in the open project.`
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unity import failed.');
    } finally {
      setIsUnityImporting(false);
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
        selectedForUnityIds={selectedForUnityIds}
        onToggleUnitySelect={toggleUnitySelection}
        onSelectAllForUnity={selectAllForUnity}
        onSelectNoneForUnity={selectNoneForUnity}
        onImportSelectedToUnity={handleImportSelectedToUnity}
        isUnityImporting={isUnityImporting}
      />
    </main>
  );
}
