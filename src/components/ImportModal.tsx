import React, { useState } from 'react';
import { Member } from '../types';
import { parsePalmsExcel } from '../lib/excelParser';
import { GlassCard } from './GlassCard';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ImportModalProps {
  onImportComplete: (members: Member[]) => void;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ onImportComplete, onClose }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [parsedMembers, setParsedMembers] = useState<Member[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (buffer) {
        const res = parsePalmsExcel(buffer);
        setParsedMembers(res.members);
        setErrors(res.errors);
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
    const sampleData = [
      {
        "Member Name": "Rajesh Sharma",
        "Phone": "9876543210",
        "P": 24, "A": 2, "S": 0, "M": 0,
        "Referrals Given": 18,
        "Visitors": 4,
        "TYFCB": 500000,
        "CEU": 15,
        "1-2-1": 12,
        "Sponsors": 1
      },
      {
        "Member Name": "Priya Patel",
        "Phone": "9123456789",
        "P": 18, "A": 8, "S": 0, "M": 0,
        "Referrals Given": 5,
        "Visitors": 0,
        "TYFCB": 50000,
        "CEU": 2,
        "1-2-1": 3,
        "Sponsors": 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PALMS Sample");
    XLSX.writeFile(wb, "BNI_PALMS_Sample.xlsx");
  };

  const handleConfirmImport = () => {
    if (parsedMembers.length > 0) {
      onImportComplete(parsedMembers);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <GlassCard className="w-full max-w-2xl p-6 space-y-6 relative border-emerald-500/30">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-1">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
            <FileSpreadsheet className="w-5 h-5" />
            <span>PALMS Import Engine</span>
          </div>
          <h2 className="text-xl font-black text-white">Upload Weekly Member Report</h2>
          <p className="text-xs text-slate-400">
            Upload BNI Chapter PALMS Excel/CSV report to recalculate scores and update WhatsApp nudges.
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
          <Upload className="w-10 h-10 text-emerald-400 mx-auto mb-3 animate-bounce" />
          <p className="text-sm font-bold text-white mb-1">
            {fileName ? fileName : 'Click to select or drop PALMS Excel file (.xlsx / .csv)'}
          </p>
          <p className="text-xs text-slate-400">Supports standard BNI PALMS format columns</p>
        </div>

        {/* Download Sample */}
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-300">
          <span>Need a starting template?</span>
          <button
            onClick={handleDownloadSample}
            className="flex items-center space-x-1 font-bold text-emerald-400 hover:text-emerald-300"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Sample Excel</span>
          </button>
        </div>

        {/* Errors display */}
        {errors.length > 0 && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-1 text-xs">
            <div className="font-bold flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              <span>Import Warning:</span>
            </div>
            {errors.map((err, i) => <p key={i}>&bull; {err}</p>)}
          </div>
        )}

        {/* Preview of Parsed Members */}
        {parsedMembers.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Successfully Parsed {parsedMembers.length} Members</span>
              </span>
            </div>

            <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 p-2 space-y-1 bg-slate-950/60">
              {parsedMembers.slice(0, 5).map((m, idx) => (
                <div key={idx} className="text-xs text-slate-300 flex items-center justify-between px-2 py-1 bg-slate-900/40 rounded">
                  <span className="font-semibold text-white">{m.Name}</span>
                  <span className="text-emerald-400 font-bold">Score: {m.score}/100</span>
                </div>
              ))}
              {parsedMembers.length > 5 && (
                <p className="text-[11px] text-slate-500 text-center pt-1">+ {parsedMembers.length - 5} more members</p>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 pt-2 border-t border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
          >
            Cancel
          </button>

          <button
            onClick={handleConfirmImport}
            disabled={parsedMembers.length === 0}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/25 hover:scale-105 transition-all disabled:opacity-40"
          >
            Import {parsedMembers.length > 0 ? `${parsedMembers.length} Members` : ''}
          </button>
        </div>
      </GlassCard>
    </div>
  );
};
