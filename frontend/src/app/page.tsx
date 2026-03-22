'use client';
import { useEffect, useRef, useState } from 'react';
import SidebarLeft from '@/components/SidebarLeft';
import SidebarRight, { type WorkspaceAsset } from '@/components/SidebarRight';
import InteractiveCanvas from '@/components/InteractiveCanvas';
import { API_BASE } from '@/lib/api';

/** Monotonic unique ids — Date.now() can collide when multiple extracts run in the same tick. */
function useAssetIdGenerator() {
  const seq = useRef(1);
  return () => seq.current++;
}

export default function Home() {
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [extractedAssets, setExtractedAssets] = useState<WorkspaceAsset[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedForUnityIds, setSelectedForUnityIds] = useState<number[]>([]);
  const nextAssetId = useAssetIdGenerator();
  const [isUnityImportingPng, setIsUnityImportingPng] = useState(false);
  const [isUnityImportingGlb, setIsUnityImportingGlb] = useState(false);
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
        const id = nextAssetId();
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
    setSelectedForUnityIds((prev) => {
      const set = new Set(prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return Array.from(set);
    });
  };

  useEffect(() => {
    const valid = new Set(extractedAssets.map((a) => a.id));
    setSelectedForUnityIds((prev) => {
      const next = prev.filter((id) => valid.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [extractedAssets]);

  const selectAllForUnity = () => {
    setSelectedForUnityIds(extractedAssets.map((a) => a.id));
  };

  const selectNoneForUnity = () => {
    setSelectedForUnityIds([]);
  };

  const handleConvertTo3D = async () => {
    const selectedPng = extractedAssets.filter(
      (a) => selectedForUnityIds.includes(a.id) && a.kind !== 'glb'
    );
    if (selectedPng.length === 0) {
      alert('Select at least one 2D (PNG) extract to convert to 3D.');
      return;
    }

    setIsConverting3D(true);
    try {
      const res = await fetch(`${API_BASE}/convert-3d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selectedPng.map((a) => ({ extracted_base64: a.url })),
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
        items?: {
          glb_base64: string;
          glb_byte_length?: number;
          texture_applied?: boolean;
        }[];
      }).items;
      if (!items || items.length !== selectedPng.length) {
        throw new Error('Unexpected response from 3D conversion');
      }
      const glbById = new Map<number, string>();
      selectedPng.forEach((a, i) => {
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
      const textureById = new Map<number, boolean>();
      selectedPng.forEach((a, i) => {
        textureById.set(a.id, Boolean(items[i]?.texture_applied));
      });
      const anyUntextured = selectedPng.some((a, i) => !items[i]?.texture_applied);
      if (anyUntextured) {
        console.info('[3D] Some models were returned without textures (check API response).');
      }
      setExtractedAssets((prev) =>
        prev.map((a) => {
          const glb = glbById.get(a.id);
          if (!glb) return a;
          return {
            ...a,
            url: glb,
            kind: 'glb' as const,
            name: a.name.startsWith('3D ') ? a.name : `3D · ${a.name}`,
            textureApplied: textureById.get(a.id),
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

  const parseApiError = (data: unknown, fallback: string): string => {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail))
      return detail.map((d: unknown) => JSON.stringify(d)).join(' ');
    return fallback;
  };

  const handleImportPngToUnity = async () => {
    const selected = extractedAssets.filter(
      (a) => selectedForUnityIds.includes(a.id) && a.kind !== 'glb'
    );
    if (selected.length === 0) {
      alert('Select at least one 2D (PNG) extract, or use “Import GLB to Unity” for 3D models.');
      return;
    }

    setIsUnityImportingPng(true);
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
        throw new Error(parseApiError(data, res.statusText) || 'Import failed');
      }
      const count = (data as { count?: number }).count ?? selected.length;
      alert(
        `Sent ${count} PNG(s) to Unity. Check Assets/AcceleratorImport/Sprites/ in the open project.`
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unity import failed.');
    } finally {
      setIsUnityImportingPng(false);
    }
  };

  const handleImportGlbToUnity = async () => {
    const selected = extractedAssets.filter(
      (a) => selectedForUnityIds.includes(a.id) && a.kind === 'glb'
    );
    if (selected.length === 0) {
      alert('Select at least one 3D (GLB) asset, or use “Import PNGs to Unity” for 2D extracts.');
      return;
    }

    setIsUnityImportingGlb(true);
    try {
      const res = await fetch(`${API_BASE}/unity/import-glb-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: selected.map((a) => ({
            glb_base64: a.url,
            label: a.name.replace(/^3D · /, '').replace(/[^\w\-.]+/g, '_').slice(0, 64),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(parseApiError(data, res.statusText) || 'Import failed');
      }
      const count = (data as { count?: number }).count ?? selected.length;
      alert(
        `Sent ${count} GLB model(s) to Unity. Check Assets/AcceleratorImport/Models/ and Prefabs/.`
      );
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unity import failed.');
    } finally {
      setIsUnityImportingGlb(false);
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
        onImportPngToUnity={handleImportPngToUnity}
        onImportGlbToUnity={handleImportGlbToUnity}
        isUnityImportingPng={isUnityImportingPng}
        isUnityImportingGlb={isUnityImportingGlb}
        onConvertTo3D={handleConvertTo3D}
        isConverting3D={isConverting3D}
      />
    </main>
  );
}
