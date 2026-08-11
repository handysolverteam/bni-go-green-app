import * as XLSX from 'xlsx';
import { Member } from '../types';
import { scoreMember } from './scoringEngine';

export interface ParseResult {
  members: Member[];
  errors: string[];
  reportDates?: { from?: string; to?: string };
}

function cleanNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  // Remove currency symbols (₹, $), commas, spaces
  const str = String(val).replace(/[^0-9.-]/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

export function parsePalmsExcel(fileData: ArrayBuffer): ParseResult {
  const errors: string[] = [];
  const members: Member[] = [];

  try {
    const workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { members: [], errors: ['No sheets found in Excel file'] };
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (!rows || rows.length < 2) {
      return { members: [], errors: ['Sheet is empty or missing data'] };
    }

    // Header row auto-detection (scans rows 0 to 12)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(12, rows.length); i++) {
      const rowText = rows[i].map(c => String(c).toLowerCase()).join(' ');
      if (
        rowText.includes('name') ||
        rowText.includes('member') ||
        (rowText.includes('p') && rowText.includes('a') && (rowText.includes('v') || rowText.includes('tyfcb')))
      ) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) headerIndex = 0;

    const headers = rows[headerIndex].map(h => String(h).trim());

    // Flexible column finder
    const findCol = (keys: string[]) => {
      return headers.findIndex(h => {
        const hLower = h.toLowerCase();
        return keys.some(k => hLower === k || hLower.includes(k));
      });
    };

    const nameIdx = findCol(['name', 'member name', 'member', 'full name']);
    const phoneIdx = findCol(['phone', 'mobile', 'whatsapp', 'contact', 'tel']);
    const emailIdx = findCol(['email', 'mail']);
    const pIdx = findCol(['p', 'present']);
    const aIdx = findCol(['a', 'absent']);
    const sIdx = findCol(['s', 'substitute', 'sub']);
    const mIdx = findCol(['m', 'medical', 'leave']);
    const rgtIdx = findCol(['rgt', 'referrals given', 'referral given', 'rg', 'referral', 'refs']);
    const vIdx = findCol(['v', 'visitors', 'visitor']);
    const tyfcbIdx = findCol(['tyfcb', 'thank you for closed business', 'closed business', 'business', 'tyfcb (rs)']);
    const ceuIdx = findCol(['ceu', 'ceus', 'trainings', 'chapter education']);
    const otoIdx = findCol(['1-2-1', '121', 'rrt', 'one to one', 'one-to-one', '1-2-1s']);
    const sponsorIdx = findCol(['sponsors', 'sponsor', 'sponsored']);

    if (nameIdx === -1) {
      errors.push('Could not detect "Member Name" column header in Excel sheet.');
    }

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const nameVal = String(row[nameIdx] || '').trim();
      if (
        !nameVal ||
        nameVal.toLowerCase().includes('total') ||
        nameVal.toLowerCase().includes('average') ||
        nameVal.toLowerCase().includes('summary')
      ) {
        continue;
      }

      const rawMember: Member = {
        Name: nameVal,
        Phone: phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '',
        Email: emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '',
        P: pIdx !== -1 ? cleanNumber(row[pIdx]) : 0,
        A: aIdx !== -1 ? cleanNumber(row[aIdx]) : 0,
        S: sIdx !== -1 ? cleanNumber(row[sIdx]) : 0,
        M: mIdx !== -1 ? cleanNumber(row[mIdx]) : 0,
        RGT: rgtIdx !== -1 ? cleanNumber(row[rgtIdx]) : 0,
        V: vIdx !== -1 ? cleanNumber(row[vIdx]) : 0,
        TYFCB: tyfcbIdx !== -1 ? cleanNumber(row[tyfcbIdx]) : 0,
        CEU: ceuIdx !== -1 ? cleanNumber(row[ceuIdx]) : 0,
        OneToOnes: otoIdx !== -1 ? cleanNumber(row[otoIdx]) : 0,
        Sponsors: sponsorIdx !== -1 ? cleanNumber(row[sponsorIdx]) : 0,
      };

      const scored = scoreMember(rawMember);
      members.push(scored);
    }

    return { members, errors };
  } catch (err: any) {
    return { members: [], errors: [`Excel Parse Error: ${err.message || err}`] };
  }
}

// Generates 10 realistic sample members in Excel format
export function generateSampleExcelBuffer(): ArrayBuffer {
  const sampleData = [
    {
      "Member Name": "Amit Patel",
      "Phone": "9876543210",
      "Email": "amit.patel@example.com",
      "P": 12,
      "A": 0,
      "S": 0,
      "M": 0,
      "Referrals Given": 14,
      "Visitors": 3,
      "TYFCB (Rs)": 850000,
      "CEU": 8,
      "1-2-1s": 9,
      "Sponsors": 1
    },
    {
      "Member Name": "Priya Sharma",
      "Phone": "9812345678",
      "Email": "priya.sharma@example.com",
      "P": 11,
      "A": 1,
      "S": 0,
      "M": 0,
      "Referrals Given": 10,
      "Visitors": 2,
      "TYFCB (Rs)": 450000,
      "CEU": 6,
      "1-2-1s": 7,
      "Sponsors": 0
    },
    {
      "Member Name": "Rohan Mehta",
      "Phone": "9898989898",
      "Email": "rohan.mehta@example.com",
      "P": 10,
      "A": 2,
      "S": 0,
      "M": 0,
      "Referrals Given": 6,
      "Visitors": 1,
      "TYFCB (Rs)": 210000,
      "CEU": 4,
      "1-2-1s": 5,
      "Sponsors": 0
    },
    {
      "Member Name": "Neha Gupta",
      "Phone": "9765432109",
      "Email": "neha.gupta@example.com",
      "P": 12,
      "A": 0,
      "S": 0,
      "M": 0,
      "Referrals Given": 16,
      "Visitors": 4,
      "TYFCB (Rs)": 1250000,
      "CEU": 10,
      "1-2-1s": 12,
      "Sponsors": 2
    },
    {
      "Member Name": "Vikram Singh",
      "Phone": "9823012345",
      "Email": "vikram.singh@example.com",
      "P": 9,
      "A": 3,
      "S": 0,
      "M": 0,
      "Referrals Given": 4,
      "Visitors": 0,
      "TYFCB (Rs)": 95000,
      "CEU": 2,
      "1-2-1s": 3,
      "Sponsors": 0
    },
    {
      "Member Name": "Ananya Verma",
      "Phone": "9988776655",
      "Email": "ananya.v@example.com",
      "P": 12,
      "A": 0,
      "S": 0,
      "M": 0,
      "Referrals Given": 12,
      "Visitors": 2,
      "TYFCB (Rs)": 620000,
      "CEU": 7,
      "1-2-1s": 8,
      "Sponsors": 1
    },
    {
      "Member Name": "Deepak Kumar",
      "Phone": "9811223344",
      "Email": "deepak.k@example.com",
      "P": 8,
      "A": 4,
      "S": 0,
      "M": 0,
      "Referrals Given": 2,
      "Visitors": 0,
      "TYFCB (Rs)": 40000,
      "CEU": 1,
      "1-2-1s": 2,
      "Sponsors": 0
    },
    {
      "Member Name": "Sneha Reddy",
      "Phone": "9744332211",
      "Email": "sneha.reddy@example.com",
      "P": 11,
      "A": 1,
      "S": 0,
      "M": 0,
      "Referrals Given": 8,
      "Visitors": 1,
      "TYFCB (Rs)": 310000,
      "CEU": 5,
      "1-2-1s": 6,
      "Sponsors": 0
    },
    {
      "Member Name": "Arjun Nair",
      "Phone": "9655443322",
      "Email": "arjun.nair@example.com",
      "P": 12,
      "A": 0,
      "S": 0,
      "M": 0,
      "Referrals Given": 15,
      "Visitors": 5,
      "TYFCB (Rs)": 1500000,
      "CEU": 9,
      "1-2-1s": 10,
      "Sponsors": 2
    },
    {
      "Member Name": "Kavita Joshi",
      "Phone": "9544332211",
      "Email": "kavita.j@example.com",
      "P": 10,
      "A": 2,
      "S": 0,
      "M": 0,
      "Referrals Given": 5,
      "Visitors": 1,
      "TYFCB (Rs)": 180000,
      "CEU": 3,
      "1-2-1s": 4,
      "Sponsors": 0
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sample Report");
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
