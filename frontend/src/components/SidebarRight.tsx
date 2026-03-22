'use client';
import GlbModelPreview from '@/components/GlbModelPreview';
import { Download, Package, Loader2, Upload, Box } from 'lucide-react';

export type WorkspaceAsset = {
  id: number;
  url: string;
  name: string;
  kind?: 'image' | 'glb';
  /** True when the GLB includes textures (Stable Fast 3D returns textured meshes). */
  textureApplied?: boolean;
};

export type SidebarRightProps = {
  extractedAssets?: WorkspaceAsset[];
  isExtracting?: boolean;
  selectedForUnityIds?: number[];
  onToggleUnitySelect?: (id: number) => void;
  onSelectAllForUnity?: () => void;
  onSelectNoneForUnity?: () => void;
  /** Import selected 2D PNG extracts to Unity (Sprites/). */
  onImportPngToUnity?: () => void;
  /** Import selected GLB models to Unity (Models/ + Prefabs/). */
  onImportGlbToUnity?: () => void;
  isUnityImportingPng?: boolean;
  isUnityImportingGlb?: boolean;
  onConvertTo3D?: () => void;
  isConverting3D?: boolean;
};

export default function SidebarRight({
  extractedAssets = [],
  isExtracting,
  selectedForUnityIds = [],
  onToggleUnitySelect,
  onSelectAllForUnity,
  onSelectNoneForUnity,
  onImportPngToUnity,
  onImportGlbToUnity,
  isUnityImportingPng,
  isUnityImportingGlb,
  onConvertTo3D,
  isConverting3D,
}: SidebarRightProps) {
  const extracting = isExtracting ?? false;
  const converting3d = isConverting3D ?? false;
  const unityPng = isUnityImportingPng ?? false;
  const unityGlb = isUnityImportingGlb ?? false;
  const unityBusy = unityPng || unityGlb;

  const downloadAll = () => {
    extractedAssets.forEach((asset, i) => {
      const a = document.createElement('a');
      a.href = asset.url;
      const ext = asset.kind === 'glb' ? 'glb' : 'png';
      a.download = `extracted_obj_${i}.${ext}`;
      a.click();
    });
  };

  const selectedCount = selectedForUnityIds.length;
  const selectedAssets = extractedAssets.filter((a) => selectedForUnityIds.includes(a.id));
  const selectedPngCount = selectedAssets.filter((a) => a.kind !== 'glb').length;
  const selectedGlbCount = selectedAssets.filter((a) => a.kind === 'glb').length;

  return (
    <aside className="panel panel-right">
      <div className="panel-header" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minWidth: 0 }}>
          <span>Extracted Assets</span>
          {extractedAssets.length > 0 && (
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 400,
                color: 'var(--text-secondary)',
                textTransform: 'none',
                lineHeight: 1.35,
              }}
            >
              Convert and Import use <strong style={{ color: 'var(--text-primary)' }}>checked</strong> items only. Export All uses the full list.
            </span>
          )}
        </div>
        {extractedAssets.length > 0 && (
          <span
            style={{
              display: 'flex',
              gap: '0.75rem',
              fontSize: '0.7rem',
              fontWeight: 500,
              textTransform: 'none',
            }}
          >
            <button
              type="button"
              onClick={onSelectAllForUnity}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                padding: 0,
                width: 'auto',
              }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={onSelectNoneForUnity}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: 0,
                width: 'auto',
              }}
            >
              Clear
            </button>
          </span>
        )}
      </div>
      <div className="panel-content">
        {extractedAssets.length === 0 && !extracting && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
            <Package
              size={32}
              style={{ marginBottom: '1rem', opacity: 0.5, marginLeft: 'auto', marginRight: 'auto' }}
            />
            <p style={{ fontSize: '0.85rem' }}>No assets extracted yet.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.7 }}>
              Draw a box over objects on the canvas to segment them.
            </p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {extractedAssets.map((asset) => {
            const checked = selectedForUnityIds.includes(asset.id);
            const isGlb = asset.kind === 'glb';
            return (
              <div
                key={asset.id}
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  padding: '0.5rem',
                  textAlign: 'center',
                  backgroundColor: '#22262d',
                  position: 'relative',
                }}
              >
                <label
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    zIndex: 2,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleUnitySelect?.(asset.id)}
                    style={{ width: '1rem', height: '1rem', accentColor: 'var(--accent)' }}
                  />
                </label>
                <div style={{ width: '100%', height: '120px', marginTop: '0.25rem' }}>
                  {isGlb ? (
                    <GlbModelPreview dataUrl={asset.url} name={asset.name} />
                  ) : (
                    <img
                      src={asset.url}
                      alt="Extracted"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                  {asset.name}
                </div>
                {isGlb && (
                  <div
                    style={{
                      fontSize: '0.65rem',
                      marginTop: '0.25rem',
                      color: asset.textureApplied ? 'var(--accent)' : 'var(--text-secondary)',
                      opacity: 0.9,
                    }}
                  >
                    {asset.textureApplied ? 'Textured (PBR)' : 'Untextured shape'}
                  </div>
                )}
              </div>
            );
          })}
          {extracting && (
            <div
              style={{
                border: '1px solid var(--accent)',
                borderRadius: '6px',
                overflow: 'hidden',
                padding: '0.5rem',
                textAlign: 'center',
                backgroundColor: '#22262d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100px',
              }}
            >
              <Loader2 className="animate-spin" style={{ color: 'var(--accent)' }} size={24} />
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          padding: '1rem',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <button
          type="button"
          onClick={onConvertTo3D}
          disabled={
            extractedAssets.length === 0 ||
            selectedPngCount === 0 ||
            converting3d ||
            extracting
          }
          title="Converts only the selected 2D PNG extracts into GLB models."
        >
          {converting3d ? <Loader2 className="animate-spin" size={16} /> : <Box size={16} />}
          {converting3d
            ? 'Converting to 3D...'
            : `Convert to 3D${selectedPngCount > 0 ? ` (${selectedPngCount})` : ''}`}
        </button>
        <button
          type="button"
          onClick={onImportPngToUnity}
          disabled={
            extractedAssets.length === 0 ||
            selectedCount === 0 ||
            selectedPngCount === 0 ||
            unityBusy
          }
          title="Imports selected 2D PNG extracts via the backend to Unity (Sprites folder)."
        >
          {unityPng ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
          {unityPng
            ? 'Importing PNGs...'
            : `Import PNGs to Unity${selectedPngCount > 0 ? ` (${selectedPngCount})` : ''}`}
        </button>
        <button
          type="button"
          onClick={onImportGlbToUnity}
          disabled={
            extractedAssets.length === 0 ||
            selectedCount === 0 ||
            selectedGlbCount === 0 ||
            unityBusy
          }
          title="Imports selected GLB models via the backend to Unity (Models + Prefabs)."
        >
          {unityGlb ? <Loader2 className="animate-spin" size={16} /> : <Box size={16} />}
          {unityGlb
            ? 'Importing GLB...'
            : `Import GLB to Unity${selectedGlbCount > 0 ? ` (${selectedGlbCount})` : ''}`}
        </button>
        <button
          type="button"
          onClick={downloadAll}
          disabled={extractedAssets.length === 0}
          title="Downloads every asset in the list (not limited to checked items)."
        >
          <Download size={16} /> Export All
        </button>
      </div>
    </aside>
  );
}
