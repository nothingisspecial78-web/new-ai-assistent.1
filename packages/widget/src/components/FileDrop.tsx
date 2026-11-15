import React, { useState } from 'react';
import { Upload } from 'lucide-react';

export interface FileDropProps {
  onDropFiles: (files: FileList) => void;
  children: React.ReactNode;
}

export function FileDrop({ onDropFiles, children }: FileDropProps) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          onDropFiles(e.dataTransfer.files);
        }
      }}
    >
      {children}
      {dragging && (
        <div
          style={{
            position: 'absolute',
            inset: '8px',
            borderRadius: '10px',
            border: '2px dashed #1d4ed8',
            background: 'rgba(239, 246, 255, 0.94)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            zIndex: 20,
            pointerEvents: 'none',
            color: '#1e3a8a',
          }}
        >
          <Upload size={24} />
          <div style={{ fontSize: '14px', fontWeight: 600 }}>
            Drop screenshot (.png/.jpg) or spreadsheet (.xlsx/.csv)
          </div>
        </div>
      )}
    </div>
  );
}
