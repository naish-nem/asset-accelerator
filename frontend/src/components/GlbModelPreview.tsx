'use client';

import { createElement, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

type GlbModelPreviewProps = {
  dataUrl: string;
  name: string;
};

/**
 * model-viewer often fails on huge data: URLs; use a Blob URL and revoke on change.
 */
export default function GlbModelPreview({ dataUrl, name }: GlbModelPreviewProps) {
  const [blobSrc, setBlobSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void import('@google/model-viewer');
  }, []);

  useEffect(() => {
    setErr(null);
    if (!dataUrl) {
      setBlobSrc(null);
      return;
    }
    if (dataUrl.startsWith('blob:') || dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
      setBlobSrc(dataUrl);
      return () => {};
    }
    if (!dataUrl.startsWith('data:')) {
      setBlobSrc(null);
      setErr('Invalid model URL');
      return () => {};
    }
    try {
      const comma = dataUrl.indexOf(',');
      if (comma === -1) throw new Error('Malformed data URL');
      const b64 = dataUrl.slice(comma + 1).replace(/\s/g, '');
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const magic = String.fromCharCode(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0, arr[3] ?? 0);
      if (magic !== 'glTF') {
        throw new Error('Response is not a binary GLB');
      }
      const blob = new Blob([arr], { type: 'model/gltf-binary' });
      const u = URL.createObjectURL(blob);
      setBlobSrc(u);
      return () => URL.revokeObjectURL(u);
    } catch (e) {
      console.error('GLB preview decode failed', e);
      setErr('Could not load 3D preview');
      setBlobSrc(null);
      return () => {};
    }
  }, [dataUrl]);

  if (err) {
    return (
      <div
        style={{
          fontSize: '0.65rem',
          color: 'var(--text-secondary)',
          padding: '0.35rem',
          lineHeight: 1.3,
        }}
      >
        {err}. Try <strong>Export All</strong> and open the .glb in a 3D viewer.
      </div>
    );
  }

  if (!blobSrc) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: 'var(--accent)',
        }}
      >
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  return createElement('model-viewer', {
    src: blobSrc,
    alt: name,
    'camera-controls': true,
    'auto-rotate': true,
    'shadow-intensity': '0.6',
    exposure: '1',
    'environment-image': 'neutral',
    style: { width: '100%', height: '100%', background: '#1a1d22' },
  });
}
