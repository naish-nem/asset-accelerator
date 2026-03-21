'use client';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const CanvasCore = dynamic(() => import('./CanvasCore'), { 
  ssr: false, 
  loading: () => <Loader2 className="animate-spin" style={{color: 'var(--accent)'}} size={32} /> 
});

export default function InteractiveCanvas({ imageUrl, isGenerating, onExtractAsset }: any) {
  return (
    <div className="canvas-container">
      {!imageUrl && !isGenerating && (
        <div style={{ color: 'var(--text-secondary)', zIndex: 1, pointerEvents: 'none', position: 'absolute' }}>
          No image generated. Please enter a prompt and click Generate.
        </div>
      )}
      {isGenerating && (
        <div style={{ color: 'var(--accent)', zIndex: 1, pointerEvents: 'none', position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <Loader2 className="animate-spin" size={32} />
          <div>Generating your scene...</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>This usually takes about 10 seconds.</div>
        </div>
      )}
      {imageUrl && !isGenerating && (
        <CanvasCore imageUrl={imageUrl} onExtract={(bbox: any) => onExtractAsset(imageUrl, bbox)} />
      )}
    </div>
  );
}
