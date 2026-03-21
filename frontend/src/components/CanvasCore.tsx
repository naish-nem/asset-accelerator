'use client';
import { useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';

export default function CanvasCore({ imageUrl, onExtract }: any) {
  const [image] = useImage(imageUrl, 'anonymous');
  const [isDrawing, setIsDrawing] = useState(false);
  const [rect, setRect] = useState<any>(null);
  
  const handleMouseDown = (e: any) => {
    if (!image) return;
    const pos = e.target.getStage().getPointerPosition();
    setIsDrawing(true);
    setRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  };
  
  const handleMouseMove = (e: any) => {
    if (!isDrawing || !rect) return;
    const pos = e.target.getStage().getPointerPosition();
    setRect({
      ...rect,
      w: pos.x - rect.x,
      h: pos.y - rect.y,
    });
  };
  
  const handleMouseUp = () => {
    setIsDrawing(false);
    if (rect && Math.abs(rect.w) > 5 && Math.abs(rect.h) > 5) {
      const stageWidth = 600;
      const stageHeight = 600;
      const scale = Math.min(stageWidth / image.width, stageHeight / image.height);
      
      const finalX = (rect.w < 0 ? rect.x + rect.w : rect.x) / scale;
      const finalY = (rect.h < 0 ? rect.y + rect.h : rect.y) / scale;
      const finalW = Math.abs(rect.w) / scale;
      const finalH = Math.abs(rect.h) / scale;
      
      onExtract({ x: finalX, y: finalY, w: finalW, h: finalH });
    }
  };

  if (!image) return <div style={{ color: 'white' }}>Loading image...</div>;
  
  const stageWidth = 600;
  const stageHeight = 600;
  const scale = Math.min(stageWidth / image.width, stageHeight / image.height);
  const w = image.width * scale;
  const h = image.height * scale;

  return (
    <Stage 
      width={w} 
      height={h} 
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: 'crosshair', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
    >
      <Layer>
        <KonvaImage image={image} width={w} height={h} />
        {rect && (
          <Rect 
            x={rect.x} 
            y={rect.y} 
            width={rect.w} 
            height={rect.h} 
            stroke="#3b82f6" 
            strokeWidth={2}
            dash={[4, 4]}
            fill="rgba(59, 130, 246, 0.2)"
          />
        )}
      </Layer>
    </Stage>
  );
}
