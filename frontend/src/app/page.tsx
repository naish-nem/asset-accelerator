'use client';
import { useState } from 'react';
import SidebarLeft from '@/components/SidebarLeft';
import SidebarRight, { type WorkspaceAsset } from '@/components/SidebarRight';
import InteractiveCanvas from '@/components/InteractiveCanvas';
import { API_BASE } from '@/lib/api';

export default function Home() {
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedAssets, setExtractedAssets] = useState<WorkspaceAsset[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedForUnityIds, setSelectedForUnityIds] = useState<number[]>([]);
  const [isUnityImporting, setIsUnityImporting] = useState(false);
  const [isConverting3D, setIsConverting3D] = useState(false);

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
            kind: 'image',
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

  const handleConvertTo3D = async () => {
    const pngOnly = extractedAssets.filter((a) => a.kind !== 'glb');
    if (pngOnly.length === 0) return;

    setIsConverting3D(true);
    try {
      const res = await fetch(`${API_BASE}/convert-3d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: pngOnly.map((a) => ({ extracted_base64: a.url })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = (data as { detail?: unknown }).detail;
        const msg =
          typeof detail === 'string'
            ? detail
            : res.statusText;
        throw new Error(msg || '3D conversion failed');
      }
      const items = (data as {
        items?: { glb_base64: string; glb_byte_length?: number }[];
      }).items;
      if (!items || items.length !== pngOnly.length) {
        throw new Error('Unexpected response from 3D conversion');
      }
      const glbById = new Map<number, string>();
      pngOnly.forEach((a, i) => {
        const row = items[i];
        const b64 = row?.glb_base64;
        if (!b64 || !b64.includes('base64,')) {
          throw new Error(`Empty or invalid GLB for asset ${i + 1}`);
        }
        if (typeof row.glb_byte_length === 'number' && row.glb_byte_length < 500) {
          console.warn('Small GLB from server', row.glb_byte_length);
        }
        glbById.set(a.id, b64);
      });
      setExtractedAssets((prev) =>
        prev.map((a) => {
          const glb = glbById.get(a.id);
          if (!glb) return a;
          return {
            ...a,
            url: glb,
            kind: 'glb' as const,
            name: a.name.startsWith('3D ') ? a.name : `3D · ${a.name}`,
          };
        })
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : '3D conversion failed.');
    } finally {
      setIsConverting3D(false);
    }
  };

  const handleImportSelectedToUnity = async () => {
    const selected = extractedAssets.filter((a) => selectedForUnityIds.includes(a.id));
    if (selected.length === 0) return;
    if (selected.some((a) => a.kind === 'glb')) {
      alert(
        'Unity import in this app expects 2D PNG extracts. Use Export All to download GLB files for 3D assets.'
      );
      return;
    }

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
        onConvertTo3D={handleConvertTo3D}
        isConverting3D={isConverting3D}
      />
    </main>
  );
}
