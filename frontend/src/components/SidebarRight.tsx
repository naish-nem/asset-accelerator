'use client';
import GlbModelPreview from '@/components/GlbModelPreview';
import { Download, Package, Loader2, Upload, Box } from 'lucide-react';

export type WorkspaceAsset = {
  id: number;
  url: string;
  name: string;
  kind?: 'image' | 'glb';
};

export type SidebarRightProps = {
  extractedAssets?: WorkspaceAsset[];
  isExtracting?: boolean;
  selectedForUnityIds?: number[];
  onToggleUnitySelect?: (id: number) => void;
  onSelectAllForUnity?: () => void;
  onSelectNoneForUnity?: () => void;
  onImportSelectedToUnity?: () => void;
  isUnityImporting?: boolean;
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
  onImportSelectedToUnity,
  isUnityImporting,
  onConvertTo3D,
  isConverting3D,
}: SidebarRightProps) {
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
  const hasImageAssets = extractedAssets.some((a) => a.kind !== 'glb');
  const allGlb =
    extractedAssets.length > 0 && extractedAssets.every((a) => a.kind === 'glb');

  return (
    <aside className="panel panel-right">
      <div className="panel-header">
        <span>Extracted Assets</span>
        {extractedAssets.length > 0 && (
          <span style={{ display: 'flex', gap: '0.75rem', fontSize: '0.7rem', fontWeight: 500, textTransform: 'none' }}>
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
        {extractedAssets.length === 0 && !isExtracting && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem 0' }}>
            <Package size={32} style={{ marginBottom: '1rem', opacity: 0.5, marginLeft: 'auto', marginRight: 'auto' }} />
            <p style={{ fontSize: '0.85rem' }}>No assets extracted yet.</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem', opacity: 0.7 }}>Draw a box over objects on the canvas to segment them.</p>
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
                    <img src={asset.url} alt="Extracted" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{asset.name}</div>
              </div>
            );
          })}
          {isExtracting && (
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
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <button
          type="button"
          onClick={onConvertTo3D}
          disabled={
            extractedAssets.length === 0 ||
            !hasImageAssets ||
            isConverting3D ||
            isExtracting
          }
        >
          {isConverting3D ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Box size={16} />
          )}
          {isConverting3D ? 'Converting to 3D…' : 'Convert to 3D'}
        </button>
        <button
          type="button"
          onClick={onImportSelectedToUnity}
          disabled={
            extractedAssets.length === 0 ||
            selectedCount === 0 ||
            isUnityImporting ||
            allGlb
          }
          title={allGlb ? 'Unity import expects 2D PNG extracts. Export GLB files below.' : undefined}
        >
          {isUnityImporting ? (
            <Loader2 className="animate-spin" size={16} />
          ) : (
            <Upload size={16} />
          )}
          {isUnityImporting
            ? 'Importing to Unity…'
            : allGlb
              ? 'Unity import (PNG only)'
              : `Import selected to Unity${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </button>
        <button type="button" onClick={downloadAll} disabled={extractedAssets.length === 0}>
          <Download size={16} /> Export All{allGlb ? ' (GLB)' : ' (PNGs)'}
        </button>
      </div>
    </aside>
  );
}
