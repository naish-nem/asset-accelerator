'use client';
import { Download, Package, Loader2 } from 'lucide-react';

export default function SidebarRight({ extractedAssets = [], isExtracting }: any) {
  const downloadAll = () => {
    extractedAssets.forEach((asset, i) => {
      const a = document.createElement("a");
      a.href = asset.url;
      a.download = `extracted_obj_${i}.png`;
      a.click();
    });
  };

  return (
    <aside className="panel panel-right">
      <div className="panel-header">
        Extracted Assets
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
          {extractedAssets.map((asset: any) => (
            <div key={asset.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', overflow: 'hidden', padding: '0.5rem', textAlign: 'center', backgroundColor: '#22262d' }}>
              <img src={asset.url} alt="Extracted" style={{ width: '100%', height: '80px', objectFit: 'contain' }} />
              <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{asset.name}</div>
            </div>
          ))}
          {isExtracting && (
            <div style={{ border: '1px solid var(--accent)', borderRadius: '6px', overflow: 'hidden', padding: '0.5rem', textAlign: 'center', backgroundColor: '#22262d', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px' }}>
              <Loader2 className="animate-spin" style={{ color: 'var(--accent)' }} size={24} />
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <button onClick={downloadAll} disabled={extractedAssets.length === 0}>
          <Download size={16} /> Export All (PNGs)
        </button>
      </div>
    </aside>
  );
}
