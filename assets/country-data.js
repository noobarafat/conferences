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
    // No country-wide checklist for the US — requirements differ per
    // university, so documents are attached to each university card instead
    // (see assets/outreach.js). An empty list hides the Documents section.
    documents: []
  }
];

function countryById(id) { return COUNTRIES.find(c => c.id === id); }
function countryDocsKey(name) { return 'country_docs::' + name; }
// Sheet-backed via DB so checkbox state follows you across devices.
function getCountryDocChecks(name, count) {
  let arr = window.DB
    ? DB.load(countryDocsKey(name), [])
    : (function () { try { return JSON.parse(localStorage.getItem(countryDocsKey(name)) || '[]'); } catch (e) { return []; } })();
  if (!Array.isArray(arr)) arr = []; else arr = arr.slice();
  while (arr.length < count) arr.push(false);
  return arr;
}
function toggleCountryDocCheck(id, idx) {
  const c = countryById(id);
  if (!c) return null;
  const arr = getCountryDocChecks(c.name, c.documents.length);
  arr[idx] = !arr[idx];
  if (window.DB) DB.save(countryDocsKey(c.name), arr);
  else localStorage.setItem(countryDocsKey(c.name), JSON.stringify(arr));
  return arr;
}
function countryDocsProgress(c) {
  const checks = getCountryDocChecks(c.name, c.documents.length);
  return { done: checks.filter(Boolean).length, total: c.documents.length, checks };
}

// Universities and professors now live in assets/outreach.js (Sheet-backed).
