import React, { useState } from 'react';
import { GlassCard } from './GlassCard';
import { Upload, FileSpreadsheet, Download, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { parsePalmsExcel, generateSampleExcelBuffer } from '../lib/excelParser';
import { Member } from '../types';

interface ImportModalProps {
  onImportComplete: (members: Member[]) => void;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ onImportComplete, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedMembers, setParsedMembers] = useState<Member[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleFile = (file: File) => {
    if (!file) return;
    setFileName(file.name);
    setIsProcessing(true);
    setErrors([]);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result as ArrayBuffer;
        const result = parsePalmsExcel(data);

        if (result.errors && result.errors.length > 0) {
          setErrors(result.errors);
          setParsedMembers([]);
        } else if (result.members.length === 0) {
          setErrors(['No valid member rows found in the report file.']);
          setParsedMembers([]);
        } else {
          setParsedMembers(result.members);
          setSuccessMsg(`Successfully parsed ${result.members.length} members from "${file.name}"!`);
        }
      } catch (err: any) {
        setErrors([`File error: ${err.message || 'Could not process file'}`]);
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
    a.download = 'BNI_Sample_Report.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmImport = () => {
    if (parsedMembers.length > 0) {
      onImportComplete(parsedMembers);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <GlassCard className="w-full max-w-2xl p-6 space-y-6 relative border-emerald-500/30 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
            <FileSpreadsheet className="w-5 h-5" />
            <span>Excel Import Engine</span>
          </div>
          <h2 className="text-xl font-black text-white">Upload Member Report</h2>
          <p className="text-xs text-slate-400">
            Upload BNI Chapter Excel/CSV report to recalculate scores and sync with your chapter organization.
          </p>
        </div>

        {/* File Dropzone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
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
              <p className="text-xs font-bold text-slate-300">Parsing member metrics from Excel...</p>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-emerald-400 mx-auto mb-3 animate-bounce" />
              <p className="text-sm font-bold text-white mb-1">
                {fileName ? fileName : 'Click to select or drop Excel file (.xlsx / .csv)'}
              </p>
              <p className="text-xs text-slate-400">Supports standard BNI report format columns</p>
            </>
          )}
        </div>

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
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Download Sample & Action Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <button
            onClick={handleDownloadSample}
            className="flex items-center space-x-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download 10-Member Sample Excel</span>
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
              disabled={parsedMembers.length === 0}
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
