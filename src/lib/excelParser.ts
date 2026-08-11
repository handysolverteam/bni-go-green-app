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

    // Auto-detect header row (scans rows 0 to 15)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const rowText = rows[i].map(c => String(c).toLowerCase()).join(' ');
      if (
        rowText.includes('name') ||
        rowText.includes('member') ||
        rowText.includes('attendance rate') ||
        rowText.includes('121 rate') ||
        rowText.includes('referrals given rate') ||
        rowText.includes('tyfcb')
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
    const phoneIdx = findCol(['mobile', 'phone', 'whatsapp', 'contact', 'tel']);
    const emailIdx = findCol(['email', 'mail']);
    
    // Traffic Light Report columns
    const attRateIdx = findCol(['attendance rate', 'attendance']);
    const ceuRateIdx = findCol(['ceu rate', 'ceu']);
    const otoRateIdx = findCol(['121 rate', '1-2-1', '121', 'one to one']);
    const refRateIdx = findCol(['referrals given rate', 'referral given rate', 'referrals given', 'rgt']);
    const tyfcbIdx = findCol(['tyfcb', 'thank you for closed business']);
    const visitorIdx = findCol(['visitors', 'visitor']);
    const sponsorIdx = findCol(['sponsors', 'sponsor']);

    // Standard PALMS columns fallback
    const pIdx = findCol(['p', 'present']);
    const aIdx = findCol(['a', 'absent']);
    const sIdx = findCol(['s', 'substitute']);
    const mIdx = findCol(['m', 'medical']);

    if (nameIdx === -1) {
      errors.push('Could not detect "Name" column header in Excel sheet.');
    }

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const nameVal = String(row[nameIdx] || '').trim();
      if (
        !nameVal ||
        nameVal.toLowerCase().includes('total') ||
        nameVal.toLowerCase().includes('average') ||
        nameVal.toLowerCase().includes('summary') ||
        nameVal.toLowerCase().includes('traffic lights of')
      ) {
        continue;
      }

      // Convert rates or PALMS metrics
      const attRate = attRateIdx !== -1 ? cleanNumber(row[attRateIdx]) : 0;
      const ceuVal = ceuRateIdx !== -1 ? cleanNumber(row[ceuRateIdx]) : 0;
      const otoVal = otoRateIdx !== -1 ? cleanNumber(row[otoRateIdx]) : 0;
      const refVal = refRateIdx !== -1 ? cleanNumber(row[refRateIdx]) : 0;
      const tyfcbVal = tyfcbIdx !== -1 ? cleanNumber(row[tyfcbIdx]) : 0;
      const visitorVal = visitorIdx !== -1 ? cleanNumber(row[visitorIdx]) : 0;
      const sponsorVal = sponsorIdx !== -1 ? cleanNumber(row[sponsorIdx]) : 0;

      // Estimate P/A if Attendance Rate is given
      const presentCount = pIdx !== -1 ? cleanNumber(row[pIdx]) : (attRate >= 0.9 ? 12 : attRate >= 0.8 ? 10 : 8);

      const rawMember: Member = {
        Name: nameVal,
        Phone: phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '',
        Email: emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '',
        P: presentCount,
        A: aIdx !== -1 ? cleanNumber(row[aIdx]) : (12 - presentCount),
        S: sIdx !== -1 ? cleanNumber(row[sIdx]) : 0,
        M: mIdx !== -1 ? cleanNumber(row[mIdx]) : 0,
        RGT: refVal,
        V: visitorVal,
        TYFCB: tyfcbVal,
        CEU: ceuVal,
        OneToOnes: otoVal,
        Sponsors: sponsorVal,
      };

      const scored = scoreMember(rawMember);
      members.push(scored);
    }

    return { members, errors };
  } catch (err: any) {
    return { members: [], errors: [`Excel Parse Error: ${err.message || err}`] };
  }
}

// Generates 10 realistic sample members using EXACT headers from BNI Traffic Light Reports
export function generateSampleExcelBuffer(): ArrayBuffer {
  const sampleData = [
    {
      "Chapter": "Champions",
      "Name": "Amit Patel",
      "Total Score": 100,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 9.5,
      "CEU Score": 10,
      "121 Rate": 3.5,
      "121 Score": 20,
      "Referrals Given Rate": 2.4,
      "Referrals Given Score": 25,
      "TYFCB": 2950000,
      "TYFCB Score": 5,
      "Visitors": 8,
      "Visitor Score": 25,
      "Sponsors": 4,
      "Sponsor Score": 5
    },
    {
      "Chapter": "Champions",
      "Name": "Priya Sharma",
      "Total Score": 99,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 0.85,
      "CEU Score": 10,
      "121 Rate": 1.5,
      "121 Score": 20,
      "Referrals Given Rate": 1.95,
      "Referrals Given Score": 25,
      "TYFCB": 915000,
      "TYFCB Score": 4,
      "Visitors": 20,
      "Visitor Score": 25,
      "Sponsors": 1,
      "Sponsor Score": 5
    },
    {
      "Chapter": "Champions",
      "Name": "Rohan Mehta",
      "Total Score": 95,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 1.5,
      "CEU Score": 10,
      "121 Rate": 1.3,
      "121 Score": 20,
      "Referrals Given Rate": 2.1,
      "Referrals Given Score": 25,
      "TYFCB": 5220000,
      "TYFCB Score": 5,
      "Visitors": 5,
      "Visitor Score": 25,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Champions",
      "Name": "Neha Gupta",
      "Total Score": 95,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 0.35,
      "CEU Score": 5,
      "121 Rate": 2.2,
      "121 Score": 20,
      "Referrals Given Rate": 1.65,
      "Referrals Given Score": 25,
      "TYFCB": 5038000,
      "TYFCB Score": 5,
      "Visitors": 15,
      "Visitor Score": 25,
      "Sponsors": 2,
      "Sponsor Score": 5
    },
    {
      "Chapter": "Champions",
      "Name": "Vikram Singh",
      "Total Score": 91,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 0.85,
      "CEU Score": 10,
      "121 Rate": 1.7,
      "121 Score": 20,
      "Referrals Given Rate": 2.0,
      "Referrals Given Score": 25,
      "TYFCB": 70425,
      "TYFCB Score": 1,
      "Visitors": 10,
      "Visitor Score": 25,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Champions",
      "Name": "Ananya Verma",
      "Total Score": 90,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 1.35,
      "CEU Score": 10,
      "121 Rate": 1.5,
      "121 Score": 20,
      "Referrals Given Rate": 1.2,
      "Referrals Given Score": 20,
      "TYFCB": 3069000,
      "TYFCB Score": 5,
      "Visitors": 7,
      "Visitor Score": 25,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Champions",
      "Name": "Deepak Kumar",
      "Total Score": 75,
      "Attendance Rate": 0.96,
      "Attendance Score": 10,
      "CEU Rate": 0.2,
      "CEU Score": 5,
      "121 Rate": 1.25,
      "121 Score": 20,
      "Referrals Given Rate": 1.4,
      "Referrals Given Score": 25,
      "TYFCB": 1740000,
      "TYFCB Score": 5,
      "Visitors": 5,
      "Visitor Score": 25,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Champions",
      "Name": "Sneha Reddy",
      "Total Score": 65,
      "Attendance Rate": 0.88,
      "Attendance Score": 5,
      "CEU Rate": 0.1,
      "CEU Score": 5,
      "121 Rate": 0.75,
      "121 Score": 15,
      "Referrals Given Rate": 0.75,
      "Referrals Given Score": 15,
      "TYFCB": 210000,
      "TYFCB Score": 3,
      "Visitors": 3,
      "Visitor Score": 15,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Champions",
      "Name": "Arjun Nair",
      "Total Score": 55,
      "Attendance Rate": 0.85,
      "Attendance Score": 0,
      "CEU Rate": 0.05,
      "CEU Score": 5,
      "121 Rate": 0.5,
      "121 Score": 10,
      "Referrals Given Rate": 0.5,
      "Referrals Given Score": 10,
      "TYFCB": 85000,
      "TYFCB Score": 2,
      "Visitors": 2,
      "Visitor Score": 10,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Champions",
      "Name": "Kavita Joshi",
      "Total Score": 42,
      "Attendance Rate": 0.80,
      "Attendance Score": 0,
      "CEU Rate": 0.0,
      "CEU Score": 0,
      "121 Rate": 0.25,
      "121 Score": 5,
      "Referrals Given Rate": 0.25,
      "Referrals Given Score": 5,
      "TYFCB": 10000,
      "TYFCB Score": 1,
      "Visitors": 1,
      "Visitor Score": 5,
      "Sponsors": 0,
      "Sponsor Score": 0
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Traffic Lights");
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
