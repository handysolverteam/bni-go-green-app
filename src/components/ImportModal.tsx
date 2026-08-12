import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { Upload, FileSpreadsheet, Download, X, AlertCircle, CheckCircle2, Loader2, Tag } from 'lucide-react';
import { parsePalmsExcel, generateSampleExcelBuffer } from '../lib/excelParser';
import { Member } from '../types';
import { useToast } from '../context/ToastContext';

interface ImportModalProps {
  existingBatchNames?: string[];
  onImportComplete: (batchName: string, members: Member[], fileName: string, fileData?: string) => void;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ existingBatchNames = [], onImportComplete, onClose }) => {
  const { showToast } = useToast();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [batchName, setBatchName] = useState<string>('');
  const [rawFileData, setRawFileData] = useState<string>('');
  const [parsedMembers, setParsedMembers] = useState<Member[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const isDuplicateBatchName = batchName.trim().length > 0 && existingBatchNames.some(
    existing => existing.trim().toLowerCase() === batchName.trim().toLowerCase()
  );

  const handleFile = (file: File) => {
    if (!file) return;
    const rawFileName = file.name;
    let defaultBatch = rawFileName.replace(/\.[^/.]+$/, '');

    // If batch name already exists, auto-suggest unique counter (e.g. Report #2)
    if (existingBatchNames && existingBatchNames.some(name => name.toLowerCase() === defaultBatch.toLowerCase())) {
      let counter = 2;
      while (existingBatchNames.some(name => name.toLowerCase() === `${defaultBatch} #${counter}`.toLowerCase())) {
        counter++;
      }
      defaultBatch = `${defaultBatch} #${counter}`;
    }

    setFileName(rawFileName);
    setBatchName(defaultBatch);
    setIsProcessing(true);
    setErrors([]);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const bytes = new Uint8Array(data);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64 = btoa(binary);
        setRawFileData(base64);

        const result = parsePalmsExcel(data);

        if (result.errors && result.errors.length > 0) {
          setErrors(result.errors);
          setParsedMembers([]);
          showToast(`File error: ${result.errors[0]}`, 'error');
        } else if (result.members.length === 0) {
          const err = 'No valid member rows found in the report file.';
          setErrors([err]);
          setParsedMembers([]);
          showToast(err, 'warning');
        } else {
          setParsedMembers(result.members);
          const msg = `Parsed ${result.members.length} members from "${rawFileName}"!`;
          setSuccessMsg(msg);
          showToast(msg, 'success');
        }
      } catch (err: any) {
        const errorMsg = `File error: ${err.message || 'Could not process file'}`;
        setErrors([errorMsg]);
        showToast(errorMsg, 'error');
      } finally {
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleDownloadSample = () => {
    const buffer = generateSampleExcelBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'BNI_Traffic_Lights_Sample.xlsx';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded 17-header sample Excel file', 'info');
  };

  const handleConfirmImport = () => {
    if (parsedMembers.length > 0 && fileName) {
      const finalName = batchName.trim() || fileName.replace(/\.[^/.]+$/, '');
      onImportComplete(finalName, parsedMembers, fileName, rawFileData);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-1.5 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden">
      <GlassCard className="w-full max-w-2xl max-h-[92vh] flex flex-col relative border-emerald-500/30 shadow-2xl overflow-hidden rounded-2xl sm:rounded-3xl">
        {/* Header with Close Button */}
        <div className="flex items-center justify-between p-3.5 sm:p-6 border-b border-white/10 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 sm:p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-black text-white">Upload Member Report</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">Import BNI Chapter Excel/CSV file to calculate scores</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors z-20 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-5">
          {/* File Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
              isDragging
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-white/15 bg-slate-900/40 hover:border-emerald-500/50 hover:bg-slate-900/60'
            }`}
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.xlsx, .xls, .csv';
              input.onchange = (e: any) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              };
              input.click();
            }}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center space-y-2 py-4">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                <p className="text-xs font-bold text-slate-300">Parsing 17 metrics from Excel sheet...</p>
              </div>
            ) : (
              <>
                <Upload className="w-9 h-9 text-emerald-400 mx-auto mb-2 animate-bounce" />
                <p className="text-xs sm:text-sm font-bold text-white mb-1">
                  {fileName ? fileName : 'Click to select or drop Excel file (.xlsx / .csv)'}
                </p>
                <p className="text-[11px] text-slate-400">Supports standard BNI Traffic Light 17-column format</p>
              </>
            )}
          </div>

          {/* Report / Batch Name Option */}
          {parsedMembers.length > 0 && (
            <div className={`p-4 rounded-2xl bg-slate-900/90 border space-y-2 animate-fadeIn transition-colors ${
              isDuplicateBatchName ? 'border-amber-500/50 bg-amber-500/5' : 'border-emerald-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Tag className="w-4 h-4 text-emerald-400" />
                  <span>Give This Report / Batch A Name *</span>
                </label>
                {isDuplicateBatchName && (
                  <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40">
                    Overwrites Existing Report
                  </span>
                )}
              </div>
              <input
                type="text"
                required
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. Influencers July 2026 Traffic Light Report"
                className={`w-full px-3.5 py-2.5 rounded-xl glass-input text-xs font-semibold text-white transition-all ${
                  isDuplicateBatchName ? 'border-amber-500/60 focus:border-amber-400 ring-1 ring-amber-500/30' : ''
                }`}
              />
              {isDuplicateBatchName ? (
                <p className="text-[11px] font-semibold text-amber-300">
                  ⚠️ A report named "{batchName}" already exists. Importing will update/overwrite this report. Change the name above (e.g. add a date or number) to save as a separate report card.
                </p>
              ) : (
                <p className="text-[11px] text-slate-400">
                  This report batch name will create a separate card on your Dashboard.
                </p>
              )}
            </div>
          )}

          {/* Feedback Messages */}
          {errors.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-rose-400">
                <AlertCircle className="w-4 h-4" />
                <span>Import Warnings / Errors:</span>
              </div>
              {errors.map((err, idx) => (
                <p key={idx}>&bull; {err}</p>
              ))}
            </div>
          )}

          {successMsg && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 sm:p-6 border-t border-white/10 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={handleDownloadSample}
            className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download 17-Header Sample Excel</span>
          </button>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-1/2 sm:w-auto px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={parsedMembers.length === 0 || !batchName.trim()}
              className="w-1/2 sm:w-auto px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all disabled:opacity-40"
            >
              Confirm Import ({parsedMembers.length})
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};
