import React, { useCallback, useRef, useState } from 'react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import { ocrPrescription } from '../utils/api';
import { useToast } from '../components/Toast';
import { DocumentArrowUpIcon, DocumentTextIcon, XCircleIcon } from '@heroicons/react/24/outline';

const PrescriptionOCR = () => {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const { addToast } = useToast();

  const handleFile = (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setText('');
    setError('');
    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview('');
    }
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const clearFile = () => {
    setFile(null);
    setPreview('');
    setText('');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setLoading(true); setError(''); setText('');
    try {
      const res = await ocrPrescription(file);
      setText(res.text || '');
      addToast({ title: 'OCR complete — text extracted', variant: 'success' });
    } catch (err) {
      const msg = err.message || 'OCR failed';
      setError(msg);
      addToast({ title: 'OCR failed', description: msg, variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen py-12 bg-gray-50/50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Prescription Reader</h1>
          <p className="text-lg text-gray-600">
            Upload a photo or scan of any prescription. Our AI will extract the text instantly.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Upload Card */}
          <Card variant="glass">
            <CardContent className="p-6 space-y-4">
              <CardTitle className="mb-2">Upload Prescription</CardTitle>

              {/* Drag & Drop Zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => !file && inputRef.current?.click()}
                className={`relative rounded-2xl border-2 border-dashed transition-all cursor-pointer ${
                  dragOver
                    ? 'border-primary-500 bg-primary-50'
                    : file
                    ? 'border-green-400 bg-green-50 cursor-default'
                    : 'border-gray-300 hover:border-primary-400 hover:bg-primary-50/40'
                } flex flex-col items-center justify-center gap-3 p-8`}
              >
                {file ? (
                  <>
                    {preview ? (
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-h-48 rounded-xl object-contain shadow"
                      />
                    ) : (
                      <DocumentTextIcon className="h-16 w-16 text-green-400" />
                    )}
                    <div className="text-center">
                      <p className="font-semibold text-gray-800 text-sm truncate max-w-[200px]">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); clearFile(); }}
                      className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium"
                    >
                      <XCircleIcon className="h-4 w-4" />
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <DocumentArrowUpIcon className="h-14 w-14 text-gray-300" />
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">Drag & drop your prescription here</p>
                      <p className="text-sm text-gray-500 mt-1">or <span className="text-primary-600 font-medium">browse files</span></p>
                      <p className="text-xs text-gray-400 mt-2">Supports JPG, PNG, PDF • Max 10 MB</p>
                    </div>
                  </>
                )}
              </div>

              {/* Hidden file input */}
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
              />

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <Button
                type="button"
                onClick={onSubmit}
                disabled={!file || loading}
                loading={loading}
                className="w-full justify-center"
              >
                {loading ? 'Extracting text...' : 'Extract Text from Prescription'}
              </Button>
            </CardContent>
          </Card>

          {/* Results Card */}
          <Card variant="glass">
            <CardContent className="p-6 h-full flex flex-col">
              <CardTitle className="mb-4">Extracted Text</CardTitle>

              {loading && (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-500">
                  <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  <p className="text-sm">Analysing prescription...</p>
                </div>
              )}

              {!loading && !text && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center text-gray-400 border-2 border-dashed border-gray-200 rounded-xl p-8">
                  <DocumentTextIcon className="h-12 w-12 text-gray-200" />
                  <p className="text-sm font-medium">Extracted text will appear here</p>
                  <p className="text-xs">Upload a prescription and click "Extract Text"</p>
                </div>
              )}

              {!loading && text && (
                <div className="flex-1 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                      ✓ Extraction complete
                    </span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(text); addToast({ title: 'Copied to clipboard', variant: 'success' }); }}
                      className="text-xs text-primary-600 hover:underline font-medium"
                    >
                      Copy text
                    </button>
                  </div>
                  <pre className="flex-1 whitespace-pre-wrap text-sm text-gray-700 bg-white/70 p-4 rounded-xl border border-gray-200 max-h-[350px] overflow-auto leading-relaxed">
                    {text}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info strip */}
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <span className="text-base">⚠️</span>
          <span>Always verify extracted medication names and dosages with your pharmacist. This tool is for reference only.</span>
        </div>
      </div>
    </div>
  );
};

export default PrescriptionOCR;
