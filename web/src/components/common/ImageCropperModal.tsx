import { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Check } from 'lucide-react';

interface ImageCropperModalProps {
  src: string;
  isOpen: boolean;
  onClose: () => void;
  onCrop: (croppedBlob: Blob) => void;
}

export default function ImageCropperModal({ src, isOpen, onClose, onCrop }: ImageCropperModalProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragStartRef = useRef({ x: 0, y: 0 });

  // Reset state when new image source is loaded
  useEffect(() => {
    if (src) {
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        drawCanvas();
      };
      img.src = src;
    }
  }, [src]);

  // Redraw whenever canvas state, zoom or offset changes
  useEffect(() => {
    drawCanvas();
  }, [zoom, offset, src]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Viewport is 350x350, crop area is 250x250 (centered at 50,50)
    const viewSize = 350;
    const cropSize = 250;
    const cropOffset = (viewSize - cropSize) / 2; // 50

    // Clear background
    ctx.fillStyle = '#1e293b'; // slate-800
    ctx.fillRect(0, 0, viewSize, viewSize);

    // Calculate base scale to fit the image to the 250x250 crop area
    const fitScale = Math.max(cropSize / img.width, cropSize / img.height);
    const effectiveScale = fitScale * zoom;

    // Draw the panned and scaled image
    ctx.save();
    ctx.translate(viewSize / 2 + offset.x, viewSize / 2 + offset.y);
    ctx.scale(effectiveScale, effectiveScale);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Draw dark transparent overlay outside the crop area
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)'; // darker overlay
    ctx.beginPath();
    ctx.rect(0, 0, viewSize, viewSize);
    ctx.rect(cropOffset, cropOffset, cropSize, cropSize);
    ctx.fill('evenodd');

    // Draw crop boundary line
    ctx.strokeStyle = '#0097b2'; // Dozemate teal
    ctx.lineWidth = 2;
    ctx.strokeRect(cropOffset, cropOffset, cropSize, cropSize);
  };

  const handlePointerDown = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStartRef.current = { x: clientX - offset.x, y: clientY - offset.y };
  };

  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    setOffset({
      x: clientX - dragStartRef.current.x,
      y: clientY - dragStartRef.current.y
    });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const handleCrop = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = 250;
    cropCanvas.height = 250;
    const cropCtx = cropCanvas.getContext('2d');
    if (!cropCtx) return;

    // Viewport is 350x350, crop zone starts at x=50, y=50, width=250, height=250
    cropCtx.drawImage(
      canvas,
      50, 50, 250, 250, // source
      0, 0, 250, 250    // destination
    );

    cropCanvas.toBlob(
      (blob) => {
        if (blob) {
          onCrop(blob);
        }
      },
      'image/png',
      1.0
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl border border-gray-100 flex flex-col scale-in duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Crop Logo</h3>
          <button 
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-50 rounded-lg transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Canvas Body */}
        <div className="p-6 flex flex-col items-center bg-gray-50">
          <div 
            className="relative cursor-move overflow-hidden rounded-xl border border-gray-200 shadow-inner bg-[#1e293b] select-none touch-none"
            style={{ width: '350px', height: '350px' }}
            onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
            onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              handlePointerDown(touch.clientX, touch.clientY);
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              handlePointerMove(touch.clientX, touch.clientY);
            }}
            onTouchEnd={handlePointerUp}
          >
            <canvas 
              ref={canvasRef} 
              width={350} 
              height={350} 
              className="block"
            />
          </div>

          {/* Zoom Slider */}
          <div className="w-full max-w-[350px] mt-6 flex items-center space-x-3">
            <ZoomOut className="w-4 h-4 text-gray-400" />
            <input 
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-[#0097b2] h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-gray-400" />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end space-x-3 bg-white">
          <button 
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="button"
            onClick={handleCrop}
            className="bg-[#004f5e] hover:bg-[#003d4a] text-white px-5 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm flex items-center"
          >
            <Check className="w-4 h-4 mr-2" />
            Crop & Save
          </button>
        </div>

      </div>
    </div>
  );
}
