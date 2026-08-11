import * as XLSX from 'xlsx';
import { Member } from '../types';
import { scoreMember } from './scoringEngine';

export interface ParseResult {
  members: Member[];
  errors: string[];
  reportDates?: { from?: string; to?: string };
}

export function parsePalmsExcel(fileData: ArrayBuffer): ParseResult {
  const errors: string[] = [];
  const members: Member[] = [];
  let reportFromDate: string | undefined;
  let reportToDate: string | undefined;

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

    // Try to find header row (contains Name/Member/P/A/V/TYFCB)
    let headerIndex = -1;
    for (let i = 0; i < Math.min(15, rows.length); i++) {
      const rowText = rows[i].map(c => String(c).toLowerCase()).join(' ');
      if (rowText.includes('name') || rowText.includes('member') || (rowText.includes('p') && rowText.includes('a') && rowText.includes('v'))) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) headerIndex = 0;

    const headers = rows[headerIndex].map(h => String(h).trim());

    // Find column indexes
    const findCol = (keys: string[]) => {
      return headers.findIndex(h => {
        const hLower = h.toLowerCase();
        return keys.some(k => hLower === k || hLower.includes(k));
      });
    };

    const nameIdx = findCol(['name', 'member name', 'member']);
    const phoneIdx = findCol(['phone', 'mobile', 'whatsapp', 'contact']);
    const emailIdx = findCol(['email', 'mail']);
    const pIdx = findCol(['p', 'present']);
    const aIdx = findCol(['a', 'absent']);
    const sIdx = findCol(['s', 'substitute', 'sub']);
    const mIdx = findCol(['m', 'medical', 'leave']);
    const rgtIdx = findCol(['rgt', 'referrals given', 'referral given', 'rg']);
    const vIdx = findCol(['v', 'visitors', 'visitor']);
    const tyfcbIdx = findCol(['tyfcb', 'thank you for closed business', 'business']);
    const ceuIdx = findCol(['ceu', 'trainings', 'chapter education']);
    const otoIdx = findCol(['1-2-1', '121', 'rrt', 'one to one', 'one-to-one']);
    const sponsorIdx = findCol(['sponsors', 'sponsor', 'sponsored']);

    if (nameIdx === -1) {
      errors.push('Could not detect "Name" or "Member" column in Excel sheet.');
    }

    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const nameVal = String(row[nameIdx] || '').trim();
      if (!nameVal || nameVal.toLowerCase().includes('total') || nameVal.toLowerCase().includes('average')) {
        continue;
      }

      const rawMember: Member = {
        Name: nameVal,
        Phone: phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '',
        Email: emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '',
        P: pIdx !== -1 ? Number(row[pIdx]) || 0 : 0,
        A: aIdx !== -1 ? Number(row[aIdx]) || 0 : 0,
        S: sIdx !== -1 ? Number(row[sIdx]) || 0 : 0,
        M: mIdx !== -1 ? Number(row[mIdx]) || 0 : 0,
        RGT: rgtIdx !== -1 ? Number(row[rgtIdx]) || 0 : 0,
        V: vIdx !== -1 ? Number(row[vIdx]) || 0 : 0,
        TYFCB: tyfcbIdx !== -1 ? Number(row[tyfcbIdx]) || 0 : 0,
        CEU: ceuIdx !== -1 ? Number(row[ceuIdx]) || 0 : 0,
        OneToOnes: otoIdx !== -1 ? Number(row[otoIdx]) || 0 : 0,
        Sponsors: sponsorIdx !== -1 ? Number(row[sponsorIdx]) || 0 : 0,
        reportFromDate,
        reportToDate,
      };

      const scored = scoreMember(rawMember);
      members.push(scored);
    }

    return { members, errors, reportDates: { from: reportFromDate, to: reportToDate } };
  } catch (err: any) {
    return { members: [], errors: [`Excel Parse Error: ${err.message || err}`] };
  }
}
