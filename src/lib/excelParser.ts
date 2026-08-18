import * as XLSX from 'xlsx';
import { Member } from '../types';
import { scoreMember, parseDateValue } from './scoringEngine';
import { formatPhoneWithCountryCode } from './whatsappUtils';

export interface ParseResult {
  members: Member[];
  errors: string[];
  reportDates?: { from?: string; to?: string };
}

function cleanNumber(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim();
  if (str === '-' || str === '–' || str === '—') return 0;
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeHeader(val: any): string {
  return String(val || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dateToISO(val: any): string {
  const parsed = parseDateValue(val);
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`;
}

const IGNORED_NAMES = new Set([
  'visitors', 'bni', 'total', 'average', 'summary', 'traffic lights of',
  'member traffic lights', 'chapter', 'name', 'total score', 'score',
  'chapter total', 'chapter average', 'regional average'
]);

function isIgnoredName(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!normalized) return true;
  if (IGNORED_NAMES.has(normalized)) return true;
  if (normalized.startsWith('member traffic lights of')) return true;
  if (normalized.startsWith('chapter total') || normalized.startsWith('chapter average')) return true;
  return false;
}

function parseSheetData(sheet: XLSX.WorkSheet, defaultCountryCode: string = '+91'): ParseResult {
  const errors: string[] = [];
  const members: Member[] = [];

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (!rows || rows.length < 2) {
    return { members: [], errors: ['Sheet is empty or missing data'] };
  }

  // 1. Extract metadata (Report Dates) from top 15 rows
  let reportFromDate = '';
  let reportToDate = '';

  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const row = rows[i] || [];
    for (let j = 0; j < row.length; j++) {
      const cellStr = String(row[j] || '').toLowerCase();
      if (cellStr.includes('from') && row[j + 1]) {
        const iso = dateToISO(row[j + 1]);
        if (iso) reportFromDate = iso;
      }
      if (cellStr.includes('to') && row[j + 1]) {
        const iso = dateToISO(row[j + 1]);
        if (iso) reportToDate = iso;
      }
    }
  }

  // 2. Auto-detect column headers row (scans rows 0 to 30)
  let headerIndex = -1;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i] || [];
    if (row.length < 3) continue; // Skip single-cell title rows

    const nonBlankCells = row.filter(c => String(c).trim() !== '').length;
    if (nonBlankCells < 3) continue; // Must have at least 3 distinct column cells

    const normalizedRow = row.map(normalizeHeader);
    
    const hasName = normalizedRow.some(h => h === 'name' || h === 'membername' || h === 'firstname' || h === 'fullname' || h === 'member' || h.includes('name'));
    const hasScoreOrRate = normalizedRow.some(h => h.includes('score') || h.includes('rate') || h.includes('tyfcb') || h.includes('attendance') || h.includes('121') || h.includes('ceu') || h.includes('referral') || h.includes('visitor') || h.includes('sponsor'));

    if (hasName && hasScoreOrRate) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    for (let i = 0; i < Math.min(30, rows.length); i++) {
      const row = rows[i] || [];
      const nonBlank = row.filter(c => String(c).trim() !== '').length;
      if (nonBlank < 3) continue;

      const rowText = row.map(c => String(c).toLowerCase()).join(' ');
      if (rowText.includes('name') && (rowText.includes('score') || rowText.includes('rate') || rowText.includes('attendance'))) {
        headerIndex = i;
        break;
      }
    }
  }

  if (headerIndex === -1) headerIndex = 0;

  const rawHeaders = (rows[headerIndex] || []).map(h => String(h).trim());
  const headers = rawHeaders.map(normalizeHeader);

  // Helper to find column index by exact or partial alias
  const getColIndex = (aliases: string[]) => {
    const normAliases = aliases.map(normalizeHeader);
    const exactIdx = headers.findIndex(h => normAliases.includes(h));
    if (exactIdx !== -1) return exactIdx;
    return headers.findIndex(h => normAliases.some(a => h.includes(a)));
  };

  // Column Indices for EXACT BNI Traffic Light Reports
  const chapterIdx = getColIndex(['chapter', 'chapter name']);
  const fnIdx = getColIndex(['first name', 'firstname']);
  const lnIdx = getColIndex(['last name', 'lastname']);
  
  // Explicitly exclude 'chapter' when finding 'name'
  let nameIdx = getColIndex(['name', 'member name', 'full name', 'member']);
  if (nameIdx !== -1 && (headers[nameIdx] === 'chapter' || headers[nameIdx] === 'chaptername')) {
    nameIdx = headers.findIndex((h, idx) => {
      if (idx === fnIdx || idx === lnIdx || h === 'chapter' || h === 'chaptername' || h === 'region') return false;
      return h.includes('name') || h.includes('member');
    });
  }

  const totalScoreIdx = getColIndex(['total score', 'totalscore']);
  const regionIdx = getColIndex(['region', 'region name']);
  const phoneIdx = getColIndex(['mobile', 'phone', 'whatsapp', 'contact', 'tel']);
  const emailIdx = getColIndex(['email', 'mail']);
  const joinDateIdx = getColIndex(['join date', 'joining date', 'date joined', 'join_date', 'induction date']);

  // Exact BNI Rates and Scores
  const attRateIdx = getColIndex(['attendance rate', 'attendancerate']);
  const attScoreIdx = getColIndex(['attendance score', 'attendancescore']);
  
  const ceuRateIdx = getColIndex(['ceu rate', 'ceurate']);
  const ceuScoreIdx = getColIndex(['ceu score', 'ceuscore']);

  const otoRateIdx = getColIndex(['121 rate', '121rate', '1-2-1 rate', 'one to one rate']);
  const otoScoreIdx = getColIndex(['121 score', '121score', '1-2-1 score', 'one to one score']);

  const refRateIdx = getColIndex(['referrals given rate', 'referralsgivenrate', 'referral given rate']);
  const refScoreIdx = getColIndex(['referrals given score', 'referralsgivenscore', 'referral given score']);

  const tyfcbIdx = getColIndex(['tyfcb', 'thank you for closed business']);
  const tyfcbScoreIdx = getColIndex(['tyfcb score', 'tyfcbscore']);

  const visitorIdx = getColIndex(['visitors', 'visitor']);
  const visitorScoreIdx = getColIndex(['visitor score', 'visitorscore']);

  const sponsorIdx = getColIndex(['sponsors', 'sponsor']);
  const sponsorScoreIdx = getColIndex(['sponsor score', 'sponsorscore']);

  // Standard PALMS raw counts fallback
  const pIdx = getColIndex(['p', 'present']);
  const aIdx = getColIndex(['a', 'absent']);
  const sIdx = getColIndex(['s', 'substitute']);
  const mIdx = getColIndex(['m', 'medical']);

  // Process Data Rows
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.some(c => String(c).trim() !== '')) continue;

    let memberName = '';
    if (fnIdx !== -1 || lnIdx !== -1) {
      const fn = String(fnIdx !== -1 ? row[fnIdx] : '').trim();
      const ln = String(lnIdx !== -1 ? row[lnIdx] : '').trim();
      memberName = `${fn} ${ln}`.trim();
    }
    
    if (!memberName && nameIdx !== -1) {
      memberName = String(row[nameIdx] || '').trim();
    }

    const chapterVal = chapterIdx !== -1 ? String(row[chapterIdx] || '').trim() : '';
    const regionVal = regionIdx !== -1 ? String(row[regionIdx] || '').trim() : '';

    // Bulletproof smart column scanner for member name
    if (!memberName || isIgnoredName(memberName) || memberName.toLowerCase() === chapterVal.toLowerCase()) {
      memberName = '';
      for (let col = 0; col < row.length; col++) {
        const val = String(row[col] || '').trim();
        if (!val) continue;
        const normVal = val.toLowerCase();

        if (isIgnoredName(val)) continue;
        if (normVal === chapterVal.toLowerCase() || normVal === regionVal.toLowerCase()) continue;
        if (!isNaN(Number(val))) continue;
        if (val.length < 2) continue;

        memberName = val;
        break;
      }
    }

    if (!memberName || isIgnoredName(memberName)) continue;

    const rawPhone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : '';
    const phoneVal = rawPhone ? formatPhoneWithCountryCode(rawPhone, defaultCountryCode) : '';
    const emailVal = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : '';
    const joinDateVal = joinDateIdx !== -1 ? String(row[joinDateIdx] || '').trim() : '';
    const totalScoreVal = totalScoreIdx !== -1 ? cleanNumber(row[totalScoreIdx]) : undefined;

    // Extract Rates
    const attendanceRateVal = attRateIdx !== -1 ? cleanNumber(row[attRateIdx]) : undefined;
    const ceuRateVal = ceuRateIdx !== -1 ? cleanNumber(row[ceuRateIdx]) : undefined;
    const oneToOneRateVal = otoRateIdx !== -1 ? cleanNumber(row[otoRateIdx]) : undefined;
    const refRateVal = refRateIdx !== -1 ? cleanNumber(row[refRateIdx]) : undefined;

    // Extract Component Scores from Excel if provided
    const attScore = attScoreIdx !== -1 ? cleanNumber(row[attScoreIdx]) : undefined;
    const ceuScore = ceuScoreIdx !== -1 ? cleanNumber(row[ceuScoreIdx]) : undefined;
    const otoScore = otoScoreIdx !== -1 ? cleanNumber(row[otoScoreIdx]) : undefined;
    const refScore = refScoreIdx !== -1 ? cleanNumber(row[refScoreIdx]) : undefined;
    const tyfcbScore = tyfcbScoreIdx !== -1 ? cleanNumber(row[tyfcbScoreIdx]) : undefined;
    const visitorScore = visitorScoreIdx !== -1 ? cleanNumber(row[visitorScoreIdx]) : undefined;
    const sponsorScore = sponsorScoreIdx !== -1 ? cleanNumber(row[sponsorScoreIdx]) : undefined;

    // Extract Metrics
    const tyfcbVal = tyfcbIdx !== -1 ? cleanNumber(row[tyfcbIdx]) : 0;
    const visitorVal = visitorIdx !== -1 ? cleanNumber(row[visitorIdx]) : 0;
    const sponsorVal = sponsorIdx !== -1 ? cleanNumber(row[sponsorIdx]) : 0;

    const pVal = pIdx !== -1 ? cleanNumber(row[pIdx]) : 0;
    const aVal = aIdx !== -1 ? cleanNumber(row[aIdx]) : 0;
    const sVal = sIdx !== -1 ? cleanNumber(row[sIdx]) : 0;
    const mVal = mIdx !== -1 ? cleanNumber(row[mIdx]) : 0;

    // Build JSON representation of ALL raw columns from the Excel row
    const rawObj: Record<string, any> = { excel_row_index: i };
    rawHeaders.forEach((h, idx) => {
      if (h && row[idx] !== undefined) {
        rawObj[h] = row[idx];
      }
    });

    const rawMember: Member = {
      Name: memberName,
      Chapter: chapterVal || 'Influencers',
      Region: regionVal,
      Phone: phoneVal,
      Email: emailVal,
      JoinDate: joinDateVal,
      P: pVal,
      A: aVal,
      S: sVal,
      M: mVal,
      RGT: refRateVal ?? 0,
      V: visitorVal,
      TYFCB: tyfcbVal,
      CEU: ceuRateVal ?? 0,
      OneToOnes: oneToOneRateVal ?? 0,
      Sponsors: sponsorVal,
      AttendanceRate: attendanceRateVal,
      CEURate: ceuRateVal,
      OneToOneRate: oneToOneRateVal,
      ReferralsGivenRate: refRateVal,
      AttendanceScore: attScore,
      CEUScore: ceuScore,
      OneToOneScore: otoScore,
      ReferralsGivenScore: refScore,
      TYFCBScore: tyfcbScore,
      VisitorScore: visitorScore,
      SponsorScore: sponsorScore,
      workbookTotalScore: totalScoreVal,
      reportFromDate,
      reportToDate,
      raw_data: rawObj,
    };

    const scored = scoreMember(rawMember);
    
    // If workbook total score is provided and higher, ensure total score is preserved
    if (totalScoreVal !== undefined && totalScoreVal > 0) {
      scored.workbookTotalScore = totalScoreVal;
    }

    members.push(scored);
  }

  return {
    members,
    errors,
    reportDates: { from: reportFromDate, to: reportToDate }
  };
}

export function parsePalmsExcel(fileData: ArrayBuffer, defaultCountryCode: string = '+91'): ParseResult {
  try {
    const workbook = XLSX.read(fileData, { type: 'array', cellDates: true });
    if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
      return { members: [], errors: ['No sheets found in Excel file'] };
    }

    let bestResult: ParseResult = { members: [], errors: [] };

    // Multi-sheet scanner: Try all sheets in workbook and select the sheet with maximum members
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const res = parseSheetData(sheet, defaultCountryCode);
      if (res.members.length > bestResult.members.length) {
        bestResult = res;
      }
    }

    if (bestResult.members.length === 0) {
      return { members: [], errors: bestResult.errors.length > 0 ? bestResult.errors : ['No member records found across any sheet in Excel workbook'] };
    }

    return bestResult;
  } catch (err: any) {
    return { members: [], errors: [`Excel Parse Error: ${err.message || err}`] };
  }
}

// Generates realistic sample Excel buffer matching the EXACT 17 BNI Traffic Light columns
export function generateSampleExcelBuffer(): ArrayBuffer {
  const sampleRows = [
    {
      "Chapter": "Influencers",
      "Name": "Neraj K Anand",
      "Total Score": 100,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 9.6154,
      "CEU Score": 10,
      "121 Rate": 3.5385,
      "121 Score": 20,
      "Referrals Given Rate": 2.3846,
      "Referrals Given Score": 25,
      "TYFCB": 2959575,
      "TYFCB Score": 5,
      "Visitors": 8,
      "Visitor Score": 25,
      "Sponsors": 4,
      "Sponsor Score": 5
    },
    {
      "Chapter": "Influencers",
      "Name": "Monica Singh",
      "Total Score": 99,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 0.8462,
      "CEU Score": 10,
      "121 Rate": 1.5385,
      "121 Score": 20,
      "Referrals Given Rate": 1.9615,
      "Referrals Given Score": 25,
      "TYFCB": 915425,
      "TYFCB Score": 4,
      "Visitors": 20,
      "Visitor Score": 25,
      "Sponsors": 1,
      "Sponsor Score": 5
    },
    {
      "Chapter": "Influencers",
      "Name": "Richa Mongia",
      "Total Score": 95,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 1.5,
      "CEU Score": 10,
      "121 Rate": 1.3077,
      "121 Score": 20,
      "Referrals Given Rate": 2.1154,
      "Referrals Given Score": 25,
      "TYFCB": 5228040,
      "TYFCB Score": 5,
      "Visitors": 5,
      "Visitor Score": 25,
      "Sponsors": 0,
      "Sponsor Score": 0
    },
    {
      "Chapter": "Influencers",
      "Name": "Ranjan Sapra",
      "Total Score": 95,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 0.3462,
      "CEU Score": 5,
      "121 Rate": 2.1923,
      "121 Score": 20,
      "Referrals Given Rate": 1.6538,
      "Referrals Given Score": 25,
      "TYFCB": 5038222,
      "TYFCB Score": 5,
      "Visitors": 15,
      "Visitor Score": 25,
      "Sponsors": 2,
      "Sponsor Score": 5
    },
    {
      "Chapter": "Influencers",
      "Name": "Nitin Sharma- Chef",
      "Total Score": 95,
      "Attendance Rate": 1.0,
      "Attendance Score": 10,
      "CEU Rate": 0.2692,
      "CEU Score": 5,
      "121 Rate": 1.2692,
      "121 Score": 20,
      "Referrals Given Rate": 1.6154,
      "Referrals Given Score": 25,
      "TYFCB": 2330116,
      "TYFCB Score": 5,
      "Visitors": 5,
      "Visitor Score": 25,
      "Sponsors": 1,
      "Sponsor Score": 5
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleRows, {
    header: [
      "Chapter", "Name", "Total Score",
      "Attendance Rate", "Attendance Score",
      "CEU Rate", "CEU Score",
      "121 Rate", "121 Score",
      "Referrals Given Rate", "Referrals Given Score",
      "TYFCB", "TYFCB Score",
      "Visitors", "Visitor Score",
      "Sponsors", "Sponsor Score"
    ]
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Traffic Lights");
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}
