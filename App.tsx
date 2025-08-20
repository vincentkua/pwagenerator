import React, { useState, useCallback, useMemo } from 'react';
import JSZip from 'jszip';
import { UploadIcon, DownloadIcon, ImageIcon, RefreshCwIcon, AlertTriangleIcon } from './components/Icons';

type Status = 'idle' | 'converting' | 'success' | 'error';

const ActionButton: React.FC<{
  onClick?: () => void;
  href?: string;
  download?: string;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary';
}> = ({ onClick, href, download, disabled = false, children, className = '', variant = 'primary' }) => {
  const baseClasses = 'w-full flex items-center justify-center gap-2 px-6 py-3 font-semibold rounded-lg shadow-md transition-all duration-300 focus:outline-none focus:ring-4';
  const variantClasses = {
    primary: 'bg-brand-secondary hover:bg-blue-500 text-white focus:ring-blue-400',
    secondary: 'bg-base-300 hover:bg-slate-600 text-content-100 focus:ring-slate-500',
  };
  const disabledClasses = 'disabled:bg-base-300 disabled:cursor-not-allowed disabled:opacity-50';

  const commonProps = {
    className: `${baseClasses} ${variantClasses[variant]} ${disabledClasses} ${className}`,
    disabled,
  };

  if (href) {
    return (
      <a href={href} download={download} {...commonProps}>
        {children}
      </a>
    );
  }

  return (
    <button onClick={onClick} {...commonProps}>
      {children}
    </button>
  );
};

const FileUpload: React.FC<{ onFileSelect: (file: File) => void; disabled: boolean }> = ({ onFileSelect, disabled }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onFileSelect(e.target.files[0]);
        }
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (disabled) return;
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileSelect(e.dataTransfer.files[0]);
        }
    };

    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>, isEntering: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) {
            setIsDragging(isEntering);
        }
    };

    return (
        <div
            className={`relative w-full p-8 border-2 border-dashed rounded-xl transition-colors duration-300 ${isDragging ? 'border-brand-secondary bg-base-200' : 'border-base-300 hover:border-brand-secondary'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
            onDrop={handleDrop}
            onDragOver={(e) => handleDragEvents(e, true)}
            onDragEnter={(e) => handleDragEvents(e, true)}
            onDragLeave={(e) => handleDragEvents(e, false)}
        >
            <input
                type="file"
                id="file-upload"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileChange}
                accept="image/png"
                disabled={disabled}
            />
            <label htmlFor="file-upload" className={`flex flex-col items-center justify-center text-center text-content-200 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <UploadIcon className="w-12 h-12 mb-4" />
                <span className="font-semibold text-content-100">Click to upload or drag & drop</span>
                <p className="text-sm mt-1">PNG files only</p>
            </label>
        </div>
    );
};

export default function App() {
  const [pngFile, setPngFile] = useState<File | null>(null);
  const [zipBlobUrl, setZipBlobUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const pngPreviewUrl = useMemo(() => {
    if (pngFile) {
      return URL.createObjectURL(pngFile);
    }
    return null;
  }, [pngFile]);

  const handleConvert = useCallback(async (file: File) => {
    setStatus('converting');
    setError(null);
    try {
      const img = await loadImage(file);

      const [icoBlob, png192Blob, png512Blob, manifestResponse] = await Promise.all([
        generateIcoBlob(img),
        generatePngBlob(img, 192),
        generatePngBlob(img, 512),
        fetch('manifest.json')
      ]);

      if (!manifestResponse.ok) {
        throw new Error(`Failed to fetch manifest.json: ${manifestResponse.statusText}`);
      }
      const manifestBlob = await manifestResponse.blob();

      const zip = new JSZip();
      zip.file("favicon.ico", icoBlob);
      zip.file("192.png", png192Blob);
      zip.file("512.png", png512Blob);
      zip.file("manifest.json", manifestBlob);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      
      setZipBlobUrl(url);
      setStatus('success');
    } catch (e: any) {
      setError(e.message || "An unknown error occurred during conversion.");
      setStatus('error');
    }
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    // Clean up previous state
    if (pngPreviewUrl) URL.revokeObjectURL(pngPreviewUrl);
    if (zipBlobUrl) URL.revokeObjectURL(zipBlobUrl);
    setZipBlobUrl(null);
    setError(null);
    
    if (file.type !== 'image/png') {
      setError('Invalid file type. Please upload a PNG file.');
      setStatus('error');
      setPngFile(null); // Ensure no preview for invalid file
      return;
    }

    setPngFile(file); // Set new file for preview
    await handleConvert(file); // Start conversion immediately
  }, [pngPreviewUrl, zipBlobUrl, handleConvert]);
    
  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image. The file might be corrupted."));
        reader.onload = (e) => {
            if (typeof e.target?.result === 'string') img.src = e.target.result;
            else reject(new Error("Failed to read file data."));
        };
        reader.onerror = () => reject(new Error("Failed to read the file."));
        reader.readAsDataURL(file);
    });
  };

  const generatePngBlob = (img: HTMLImageElement, size: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not get canvas context'));

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, size, size);

        canvas.toBlob((blob) => {
            if (!blob) return reject(new Error(`Failed to create blob for size ${size}x${size}`));
            resolve(blob);
        }, 'image/png');
    });
  };
  
  const generateIcoBlob = async (img: HTMLImageElement): Promise<Blob> => {
      if (img.width < 16 || img.height < 16) {
        throw new Error("Image too small. Please use an image that is at least 16x16 pixels.");
      }
      
      const standardSizes = [256, 128, 64, 48, 32, 16];
      const sizes = standardSizes.filter(s => s <= img.width && s <= img.height);

      if (sizes.length === 0) {
         throw new Error("Could not determine appropriate icon sizes for the given image.");
      }

      const pngPromises = sizes.map(size => {
        return new Promise<{ size: number; buffer: ArrayBuffer }>(async (resolvePng, rejectPng) => {
            try {
                const blob = await generatePngBlob(img, size);
                const buffer = await blob.arrayBuffer();
                resolvePng({ size, buffer });
            } catch (err) {
                rejectPng(err);
            }
        });
      });

      const imageEntries = await Promise.all(pngPromises);
      
      const headerSize = 6;
      const directorySize = 16 * imageEntries.length;
      let totalSize = headerSize + directorySize;
      imageEntries.forEach(entry => totalSize += entry.buffer.byteLength);

      const finalBuffer = new ArrayBuffer(totalSize);
      const finalView = new DataView(finalBuffer);
      let fileOffset = headerSize + directorySize;

      finalView.setUint16(0, 0, true); // reserved
      finalView.setUint16(2, 1, true); // type 1 for ICO
      finalView.setUint16(4, imageEntries.length, true); // number of images

      let entryOffset = headerSize;
      for (const entry of imageEntries) {
          const displaySize = entry.size === 256 ? 0 : entry.size;
          finalView.setUint8(entryOffset, displaySize);
          finalView.setUint8(entryOffset + 1, displaySize);
          finalView.setUint8(entryOffset + 2, 0);
          finalView.setUint8(entryOffset + 3, 0);
          finalView.setUint16(entryOffset + 4, 0, true);
          finalView.setUint16(entryOffset + 6, 0, true);
          finalView.setUint32(entryOffset + 8, entry.buffer.byteLength, true);
          finalView.setUint32(entryOffset + 12, fileOffset, true);
          fileOffset += entry.buffer.byteLength;
          entryOffset += 16;
      }

      let dataOffset = headerSize + directorySize;
      for (const entry of imageEntries) {
          const sourceArray = new Uint8Array(entry.buffer);
          const destArray = new Uint8Array(finalBuffer, dataOffset, entry.buffer.byteLength);
          destArray.set(sourceArray);
          dataOffset += entry.buffer.byteLength;
      }

      return new Blob([finalBuffer], { type: 'image/x-icon' });
  };
  
  return (
    <div className="min-h-screen bg-base-100 text-content-100 flex flex-col items-center justify-center p-4 font-sans animate-fade-in">
      <div className="w-full max-w-2xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            PWA Icon Generator
          </h1>
          <p className="text-lg text-content-200 mt-2">
            Create your PWA icons and manifest in one click.
          </p>
        </header>

        <main className="bg-base-200 p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6">
            <FileUpload onFileSelect={handleFileSelect} disabled={status === 'converting'} />

            {pngPreviewUrl && (
              <div className="text-center animate-fade-in">
                <h2 className="text-xl font-semibold mb-4 text-white">Your Image</h2>
                <div className="relative w-40 h-40 mx-auto bg-base-300 rounded-lg flex items-center justify-center p-2 shadow-inner">
                    <img src={pngPreviewUrl} alt="PNG Preview" className="max-w-full max-h-full object-contain rounded-md" />
                </div>
              </div>
            )}
            
            {status === 'converting' && (
              <div className="text-center p-4 rounded-lg bg-base-300">
                <div className="flex items-center justify-center gap-3">
                  <div className="w-5 h-5 border-2 border-t-brand-secondary border-r-brand-secondary border-b-brand-secondary border-base-100 rounded-full animate-spin"></div>
                  <p className="font-semibold text-content-100">Converting...</p>
                </div>
              </div>
            )}

            {status === 'success' && zipBlobUrl && (
              <div className="text-center p-4 rounded-lg bg-green-900/50 border border-green-700 animate-fade-in space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-green-300">Conversion Successful!</h3>
                    <p className="text-green-400 text-sm">Your icon package (ZIP) is ready for download.</p>
                </div>
                <ActionButton href={zipBlobUrl} download="icons.zip" >
                    <DownloadIcon className="w-5 h-5" /> Download ZIP
                </ActionButton>
              </div>
            )}

            {status === 'error' && (
               <div className="flex items-center gap-3 p-4 rounded-lg bg-red-900/50 border border-red-700 animate-fade-in">
                <AlertTriangleIcon className="w-6 h-6 text-red-400 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-red-300">Conversion Failed</h3>
                  <p className="text-sm text-red-400">{error}</p>
                </div>
               </div>
            )}

        </main>
        <footer className="text-center mt-8 text-sm text-content-200">
          <p>&copy; {new Date().getFullYear()} PWA Icon Generator. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}