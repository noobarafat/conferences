/* ============================================================
   Static per-country document checklist data. Same pattern as
   assets/erasmus-data.js — content lives in code, only the
   checked/unchecked state (and the user-added university list)
   persist, in localStorage.
   Shared by: country.html, country/germany.html
   ============================================================ */
const COUNTRIES = [
  {
    id: 'germany',
    name: 'Germany',
    flag: '🇩🇪',
    documents: [
      "Bachelor's Certificate (BSC)",
      "Bachelor's Transcript (BSC)",
      'Minimum Passing Grade',
      'Medium of Instruction Certificate (MOI)',
      "Bachelor's Course Module / Curriculum / Syllabus / Module Handbook",
      'Recommendation Letter (LOR) 1',
      'Recommendation Letter (LOR) 2',
      'Recommendation Letter (LOR) 3',
      'Passport',
      'Higher Secondary Certificate (HSC)',
      'Higher Secondary Transcript (HSC)',
      'Secondary School Certificate (SSC)',
      'Secondary School Transcript (SSC)',
      'Europass CV',
      'SOP / LOM for University Application',
      'IELTS',
      'Training Experience / Job Experience / Internship Experience',
      'Extra Curricular Activities (All Certificates)',
      'Appointment Reference Number (for VFS slot booking)',
      'Notary (if needed) — not mandatory',
      'Uni-Assist Account',
      'Multi-Currency Debit Card (with Dollar Endorsement)',
      'VPD Apply (University Application)',
      'Uni-Assist Evaluation Report'
    ]
  },
  {
    id: 'usa',
    name: 'USA',
    flag: '🇺🇸',
    documents: [
      "Bachelor's Certificate (BSC)",
      "Bachelor's Transcript (BSC)",
      'Higher Secondary Certificate (HSC)',
      'Higher Secondary Transcript (HSC)',
      'Secondary School Certificate (SSC)',
      'Secondary School Transcript (SSC)',
      'WES / ECE Credential Evaluation Report',
      'Recommendation Letter (LOR) 1',
      'Recommendation Letter (LOR) 2',
      'Recommendation Letter (LOR) 3',
      'Statement of Purpose (SOP)',
      'Resume / CV',
      'GRE Score Report (if required)',
      'TOEFL / IELTS Score Report',
      'Passport',
      'Financial Affidavit of Support',
      'Bank Statement / Sponsor Bank Statement',
      'Training Experience / Job Exp / Internship Exp',
      'Extra Curricular Activities (All Certificates)',
      'I-20 Form (after admission)',
      'SEVIS Fee Payment Receipt',
      'DS-160 Form',
      'Visa Interview Appointment (VFS/US Embassy)',
      'Notary (if needed) — not mandatory'
    ]
  }
];

function countryById(id) { return COUNTRIES.find(c => c.id === id); }
function countryDocsKey(name) { return 'country_docs::' + name; }
function getCountryDocChecks(name, count) {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(countryDocsKey(name)) || '[]'); } catch (e) { arr = []; }
  if (!Array.isArray(arr)) arr = [];
  while (arr.length < count) arr.push(false);
  return arr;
}
function toggleCountryDocCheck(id, idx) {
  const c = countryById(id);
  if (!c) return null;
  const arr = getCountryDocChecks(c.name, c.documents.length);
  arr[idx] = !arr[idx];
  localStorage.setItem(countryDocsKey(c.name), JSON.stringify(arr));
  return arr;
}
function countryDocsProgress(c) {
  const checks = getCountryDocChecks(c.name, c.documents.length);
  return { done: checks.filter(Boolean).length, total: c.documents.length, checks };
}

// Universities and professors now live in assets/outreach.js (Sheet-backed).
