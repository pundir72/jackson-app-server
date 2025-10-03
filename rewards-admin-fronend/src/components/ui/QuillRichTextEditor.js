'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import MD Editor to avoid SSR issues
const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { 
  ssr: false,
  loading: () => <div className="h-32 bg-gray-100 animate-pulse rounded"></div>
});

export default function QuillRichTextEditor({ 
  value, 
  onChange, 
  placeholder, 
  className = '', 
  minLength = 0 
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Get plain text length for validation
  const getTextLength = () => {
    if (!value) return 0;
    // Remove markdown syntax to get approximate text length
    const plainText = value.replace(/[#*_`\[\]()]/g, '').replace(/\n/g, ' ').trim();
    return plainText.length;
  };

  if (!mounted) {
    return (
      <div className={`border rounded-lg ${className}`}>
        <div className="h-32 bg-gray-100 animate-pulse rounded flex items-center justify-center">
          <span className="text-gray-500 text-sm">Loading editor...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <div className="md-editor-wrapper">
        <MDEditor
          value={value || ''}
          onChange={(val) => onChange(val || '')}
          preview="edit"
          hideToolbar={false}
          textareaProps={{
            placeholder: placeholder,
            style: {
              fontSize: 14,
              lineHeight: '1.6'
            }
          }}
          height={200}
          data-color-mode="light"
        />
      </div>
      
      {/* Character count */}
      <div className="mt-2 text-xs text-gray-500 text-right">
        {getTextLength()} characters
        {minLength > 0 && getTextLength() < minLength && (
          <span className="text-red-500 ml-1">
            (minimum {minLength} required)
          </span>
        )}
      </div>

      {/* Custom styles */}
      <style jsx global>{`
        .md-editor-wrapper {
          border-radius: 0.5rem;
          overflow: hidden;
        }
        
        .md-editor-wrapper .w-md-editor {
          background-color: white;
        }
        
        .md-editor-wrapper .w-md-editor.w-md-editor-focus {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }
        
        /* Error state */
        .border-red-300 .md-editor-wrapper .w-md-editor {
          border-color: #fca5a5;
        }
        
        .border-red-300 .md-editor-wrapper .w-md-editor.w-md-editor-focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2);
        }
        
        /* Toolbar customization */
        .md-editor-wrapper .w-md-editor-toolbar {
          background-color: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
        }
        
        .md-editor-wrapper .w-md-editor-text-area {
          font-size: 14px !important;
          line-height: 1.6 !important;
        }
        
        /* Hide preview pane in edit mode */
        .md-editor-wrapper .w-md-editor-text-container .w-md-editor-text-area {
          width: 100% !important;
        }
      `}</style>
    </div>
  );
}