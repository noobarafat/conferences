/* ============================================================
   Static data for all 7 shortlisted Erasmus Mundus programmes.
   Lives in code (not the Sheet) so pages render instantly —
   no network round-trip needed just to show programme content.
   Only the "status" mark (researching/applied/accepted/rejected)
   is written back to the Sheet, via sheetId below, when the user
   changes it on a programme's detail page.
   Shared by: erasmus.html, erasmus/program.html, conferences.html
   ============================================================ */
const ERASMUS_PROGRAMS = [
  {
    id: 'emmie',
    sheetId: '291e9489-7ff7-4aca-a874-dde5944b1bc8',
    label: 'EMMIE — Erasmus Mundus Master in Impact Entrepreneurship',
    shortName: 'EMMIE',
    name: 'Erasmus Mundus Master in Impact Entrepreneurship',
    country: 'Belgium', flag: '🇧🇪',
    priorityTier: 'A — safe, GPA-friendly',
    coordinator: 'HEC Liege (Belgium)',
    universities: ['ZSEM Zagreb (Croatia, start)', 'ISM Vilnius (Lithuania)', 'HEC Liege (Belgium)'],
    duration: '18 months, 90 ECTS',
    trackForMe: 'Open to any academic background',
    degree: 'Masters',
    about: 'EMMIE trains students to launch and run ventures that solve social and environmental problems — social entrepreneurship, impact investing, and sustainable business design. It mixes core business/management courses with hands-on venture-building, moving each year to a different partner university (Croatia → Lithuania → Belgium) so students build a real cross-border founder network alongside the degree.',
    funding: 'full',
    amount: 'Full Erasmus Mundus scholarship (tuition, stipend, travel, insurance). Max 2 candidates per country.',
    deadlineNote: 'Scholarship round ~6 Oct 2025 – 6 Jan 2026 (2026 cycle) — confirm new call date on official site when it opens.',
    eligibility: [
      'Bachelor of 240 ECTS (a 4-year degree qualifies), any field',
      'English: IELTS/TOEFL, minimum B2, C1 recommended — waived if degree fully taught in English',
      'No GPA cutoff on the official site'
    ],
    documents: [
      'CV in English, Europass format (studies, employment, certificates/awards last 5 years)',
      'Motivation letter, one page, 1500–2500 characters including spaces, no AI',
      'All higher education diplomas plus transcript of records in English, officially certified',
      'English proficiency test (IELTS or TOEFL, not Duolingo)',
      'Scholarship interest description, one page maximum (if applying for scholarship)',
      'Two recommendation letters from two different people, academic and/or professional (not co-workers/family/friends), uploaded by me',
      'Optional: one-page entrepreneurial project description (problem, solution, current stage)',
      'Passport scan (jpg)',
      'Photo (jpg)',
      'Birth certificate in English if available (PDF)',
      'Residence document if I live outside my nationality country'
    ],
    motivation: { type: 'written letter', spec: '1500–2500 characters, one page, no AI' },
    recommendationLetters: { count: 2, type: 'academic and/or professional' },
    video: { required: false },
    links: {
      official: 'https://www.emmie.uliege.be',
      apply: 'https://www.emmie.uliege.be/cms/c_7961868/en/emmie-guidelines'
    },
    fitNote: 'Strongest business-side pick. Founder profile is their target; use the optional project description to feature the agency.'
  },
  {
    id: 'dclead',
    sheetId: 'f0ea9a51-a055-4e4d-adcf-f0e8164fda92',
    label: 'DCLead (TECMAN) — Digital Communication Leadership',
    shortName: 'DCLead (TECMAN)',
    name: 'Digital Communication Leadership',
    country: 'Austria', flag: '🇦🇹',
    priorityTier: 'A — safe, GPA-friendly',
    coordinator: 'Paris Lodron University of Salzburg (Austria)',
    universities: ['University of Salzburg (Austria, start)', 'Aalborg University Copenhagen (Denmark)', 'Vrije Universiteit Brussel (Belgium)', 'Wageningen University (Netherlands)'],
    duration: '2 years, 120 ECTS',
    trackForMe: 'TECMAN (Digital Technology and Management)',
    degree: 'Masters',
    about: "DCLead is about leading digital transformation inside organisations — strategic communication, digital tools, and change management, not hands-on coding. The TECMAN track leans more technical/managerial: how technology gets adopted, planned and led at organisation level. Students move across Austria, Denmark, Belgium and the Netherlands, picking a specialisation track in year two.",
    funding: 'partial',
    amount: 'Full Erasmus Mundus scholarship; roughly 50-50 scholarship to self-funded per intake.',
    deadlineNote: 'Not published for next cycle — historically ~Dec to mid-Jan. Two-phase process (application then registration).',
    eligibility: [
      'Bachelor of at least 180 ECTS in IT, telecom, informatics or similar',
      'GPA required only for ICT4D track (min 70%). TECMAN and POLINN need no GPA — my 2.96 is about 74%.',
      'IELTS or TOEFL needed only at shortlist (phase 2) — state level in CV for phase 1'
    ],
    documents: [
      'Motivation letter, 4000–6000 characters — Times New Roman/Book Antiqua 12pt, A4, 1.5 spacing, bold title "Motivation Letter by (name)", numbered pages, PDF, no handwriting',
      'CV in Europass format',
      "Bachelor's diploma and transcripts with certified English translation (legalised/Apostille for Salzburg)",
      'Two recommendation letters (academic or professional); referees confirm via work email or LinkedIn',
      'English test proof (only at phase 2 shortlist)',
      'Passport, all pages (only if shortlisted for scholarship phase 2)'
    ],
    motivation: { type: 'written letter', spec: '4000–6000 characters, strict formatting' },
    recommendationLetters: { count: 2, type: 'academic or professional' },
    video: { required: false },
    links: {
      official: 'https://dclead.eu',
      apply: 'https://dclead.eu/programme/tracks/digital-technology-and-management-tecman/',
      faq: 'https://dclead.eu/faq/'
    },
    fitNote: 'Strongest overall fit. TECMAN suits CSE, no GPA needed, professional references allowed.'
  },
  {
    id: 'se4gd',
    sheetId: '434b45ef-6e5a-4856-b1a1-ec936d74b032',
    label: 'SE4GD — Software Engineers for Green Deal',
    shortName: 'SE4GD',
    name: 'Software Engineers for Green Deal',
    country: 'Finland', flag: '🇫🇮',
    priorityTier: 'A — realistic, points-based',
    coordinator: 'LUT University (Finland)',
    universities: ["University of L'Aquila (Italy, start)", 'LUT University (Finland)', 'VU Amsterdam (Netherlands)'],
    duration: '2 years, 120 ECTS',
    trackForMe: 'Software engineering with sustainability',
    degree: 'Masters',
    about: 'SE4GD is straight software engineering, aimed at the EU Green Deal — building software for renewable energy, emissions tracking, sustainable logistics and similar climate-tech systems. Core CS content (software architecture, engineering practice) stays central; the "green" angle shapes the projects and case studies, not the fundamentals. Studies run across Italy, Finland and the Netherlands.',
    funding: 'full',
    amount: 'Full Erasmus Mundus scholarship.',
    deadlineNote: 'Scholarship round ~Dec–Jan (2026 cycle); English test result by 31 Jan.',
    eligibility: [
      'Bachelor of 180 ECTS in CS, IT, Information Engineering, Software Engineering, Business Informatics or similar; university on WHED database',
      'No hard GPA minimum — scored up to 30 of 100; my 2.96/4.0 converts to about 3.7/5 (~11 points)',
      'IELTS Academic 6.5 or TOEFL iBT 93 — strict, university certificates not accepted, can supplement within ~2 weeks after deadline'
    ],
    documents: [
      'Degree certificate',
      'Transcript of records',
      'Motivation letter (scored up to 20 of 100)',
      'CV',
      'References and evidence of work experience (feed the track record score, up to 20)',
      'English test proof (IELTS 6.5 / TOEFL 93)'
    ],
    motivation: { type: 'written letter', spec: 'scored up to 20 of 100 points' },
    recommendationLetters: { count: null, type: 'references count within track record score' },
    video: { required: false },
    selection: '100 pre-selection points (academic 60, motivation 20, track record 20) then RecRight interview up to 40. Need at least 50% total and must attend.',
    links: {
      official: 'https://se4gd.eu',
      apply: 'https://se4gd.lutsoftware.com/application-process/how-to-apply/',
      requirements: 'https://se4gd.lutsoftware.com/application-process/admissions-requirements/'
    },
    fitNote: 'Realistic. CS degree and work experience offset the GPA points lost.'
  },
  {
    id: 'clide',
    sheetId: '32aff2d5-3fd1-4766-b35f-85b65029ee30',
    label: 'CLIDE — Intercultural Leadership in the Digital Era',
    shortName: 'CLIDE',
    name: 'Intercultural Leadership in the Digital Era',
    country: 'Poland', flag: '🇵🇱',
    priorityTier: 'B — holistic backup',
    coordinator: 'Nicolaus Copernicus University Torun (Poland)',
    universities: ['Nicolaus Copernicus University Torun (Poland, coordinator)', 'partner in Spain', 'partner in Austria', 'partner in Morocco'],
    duration: '2 years, 120 ECTS',
    trackForMe: 'Leadership in Digital Economy',
    degree: 'Masters',
    about: 'CLIDE is about leading people and organisations through digital and cultural change — a management/leadership degree with a digital-economy lens, not a technical CS programme. Expect courses in cross-cultural management, digital business strategy and leadership, delivered across Poland plus partners in Spain, Austria and Morocco. Good fit for someone pairing a technical background with a leadership/business pivot.',
    funding: 'full',
    amount: 'Full Erasmus Mundus scholarship (approx €1,400/month).',
    deadlineNote: '2026 intake opened 29 Mar 2026, closed 15 Apr 2026. Spring cycle (different from the others) — 2027/2028 round opens ~Feb 2027.',
    eligibility: [
      'Bachelor in economics, finance, IT, communication, management or related',
      'English B2 (IELTS or TOEFL)',
      'No fixed GPA cutoff, holistic selection',
      'No previous Erasmus Mundus scholarship'
    ],
    documents: [
      'Online application form, including chosen track',
      'Motivation letter, around 3000 characters',
      'CV, Europass format',
      'Two recommendation letters: one academic and one professional',
      'Diploma and transcripts with English translation',
      "Eligibility statement confirming the Bachelor qualifies for master's entry in Bangladesh",
      'Video business card, about 2 minutes',
      'English proficiency proof'
    ],
    motivation: { type: 'written letter', spec: 'around 3000 characters' },
    recommendationLetters: { count: 2, type: 'one academic, one professional' },
    video: { required: true, spec: 'video business card, about 2 minutes' },
    links: {
      official: 'https://clide.umk.pl',
      apply: 'https://clide.umk.pl/pages/apply/'
    },
    fitNote: 'Good holistic fit; professional reference and video let me show strengths, GPA not a barrier.'
  },
  {
    id: 'emildai',
    sheetId: '7d17bf38-82f4-49d8-a406-642e88cdcbe0',
    label: 'EMILDAI (Computing Stream) — Law, Data and Artificial Intelligence',
    shortName: 'EMILDAI (Computing Stream)',
    name: 'European Master in Law, Data and Artificial Intelligence',
    country: 'Ireland', flag: '🇮🇪',
    priorityTier: 'B — interdisciplinary backup',
    coordinator: 'Dublin City University (Ireland)',
    universities: ['Dublin City University (Ireland, coordinator)', 'University of Leon (Spain)', 'partner in Italy', 'partner in France', 'Erasmus University Rotterdam (Netherlands)', 'FGV Rio (Brazil)'],
    duration: '2 years, 120 ECTS',
    trackForMe: 'Computing Stream',
    degree: 'Masters',
    about: 'EMILDAI sits at the intersection of law, data and AI — how AI/data systems get regulated, and how technical people should build them with legal and ethical constraints in mind (GDPR, AI Act, data governance). The Computing Stream keeps the technical core (data/AI engineering) while adding law-and-policy coursework around it, taught across Ireland, Spain, Italy, France, the Netherlands and Brazil.',
    funding: 'partial',
    amount: '2026-2028 page lists 24 partial fee waivers + EMILDAI Merit Scholarships + health insurance — confirm full-scholarship availability for my intake.',
    deadlineNote: '2026-2028 round 1 opened 10 Nov 2025, deadline 25 Jan 2026. Second self-funded round in spring 2026.',
    eligibility: [
      'Bachelor in law, computing or related (I apply Computing Stream)',
      'English B2 or higher; French or Spanish may be needed for some second-year tracks',
      'No cutoff emphasised; holistic'
    ],
    documents: [
      'Online application form (personal and academic background)',
      "Bachelor's degree certificate and transcripts in English",
      'Motivation letter tailored to law, data and AI',
      'CV',
      'Referee contact details; referees then provide recommendation letters (plan for 2)',
      'English proficiency proof',
      'Additional language certificate if required for chosen track'
    ],
    motivation: { type: 'written letter', spec: 'tailored to law, data and AI' },
    recommendationLetters: { count: 2, type: 'referees provide; academic and/or professional' },
    video: { required: false },
    links: {
      official: 'https://emildai.eu',
      apply: 'https://emildai.eu/admissions/how-to-apply/',
      computingStream: 'https://emildai.eu/programme/computing-stream/'
    },
    fitNote: 'Interdisciplinary hedge bridging data and business/policy; accepts computing profiles. Check the funding type carefully.'
  },
  {
    id: 'ediss',
    sheetId: '8dcd7b69-b7fa-43f4-9c98-e2607fb585c1',
    label: 'EDISS — Engineering of Data-intensive Intelligent Software Systems',
    shortName: 'EDISS',
    name: 'Engineering of Data-intensive Intelligent Software Systems',
    country: 'Finland', flag: '🇫🇮',
    priorityTier: 'B — realistic data option',
    coordinator: 'Abo Akademi University (Finland)',
    universities: ['Abo Akademi University (Finland, coordinator)', 'University of the Balearic Islands (Spain)', "University of L'Aquila (Italy)", 'Malardalen University (Sweden)'],
    duration: '2 years, 120 ECTS',
    trackForMe: 'Software and AI',
    degree: 'Masters',
    about: 'EDISS is software engineering for data-intensive systems — designing and building the software architecture that large-scale, AI/data-driven applications run on (distributed systems, data pipelines, intelligent software design), rather than the data science/modelling side itself. Straight continuation of a CS degree, taught across Finland, Spain, Italy and Sweden.',
    funding: 'full',
    amount: 'Full Erasmus Mundus scholarship.',
    deadlineNote: 'Scholarship round ~Dec–Jan; self-funded round opened 13 Apr 2026; conditional final documents by 31 Jul 2026.',
    eligibility: [
      'Bachelor of 180 ECTS in CS, Software Engineering or equivalent, with programming/algorithms/data structures/architecture/networks/software engineering/maths coursework',
      'No hard GPA cutoff; CGPA, max CGPA and grading scale must be stated',
      'TOEFL iBT 93 or IELTS Academic 6.5 with no band below 6 — home editions not accepted'
    ],
    documents: [
      'Degree certificate, certified, plus English translation',
      'Transcript of records, certified, plus English translation; state CGPA, max CGPA and grading scale',
      'Diploma supplement if available',
      'English test proof (TOEFL 93 / IELTS 6.5, no band below 6)',
      'Passport copy',
      'CV using the official EDISS template (5 sections incl. work/entrepreneurial experience, up to 4 entries)',
      'Two academic recommendation letters only, signed, letterhead and stamp preferred',
      'Motivation VIDEO, 2 minutes plus or minus 30 seconds (3 set questions), no written letter',
      'Certificates proving every experience listed in the CV'
    ],
    motivation: { type: 'video', spec: '2 minutes ± 30 seconds; motivation, main interest, suitability' },
    recommendationLetters: { count: 2, type: 'academic only' },
    video: { required: true, spec: '2-minute motivation video answering 3 questions' },
    links: {
      official: 'https://www.master-ediss.eu',
      apply: 'https://www.master-ediss.eu/application-process/',
      requirements: 'https://www.master-ediss.eu/admission-requirements/'
    },
    fitNote: 'Content matches CS degree, but wants two academic references and a video. Line up two professors early.'
  },
  {
    id: 'deai',
    sheetId: '86949311-c8c8-4fac-860c-10881e6fefb6',
    label: 'DEAI — Data Engineering and Artificial Intelligence',
    shortName: 'DEAI',
    name: 'Data Engineering and Artificial Intelligence (successor to BDMA)',
    country: 'Belgium', flag: '🇧🇪',
    priorityTier: 'C — ambitious reach',
    coordinator: 'Universite libre de Bruxelles (Belgium)',
    universities: ['ULB Brussels (Belgium, coordinator)', 'UPC Barcelona (Spain)', 'TU Wien (Austria)', 'University of Padova (Italy)', 'University Claude Bernard Lyon 1 (France)'],
    duration: '2 years, 120 ECTS',
    trackForMe: 'Data engineering and AI',
    degree: 'Masters',
    about: 'DEAI (successor to BDMA) is big-data and AI engineering — building and managing the pipelines, infrastructure and machine learning systems that turn raw data into products, at scale. Strongly technical and academic-leaning, taught across Belgium, Spain, Austria, Italy and France. Closest of the seven to a pure data engineering / applied ML degree.',
    funding: 'full',
    amount: 'Full Erasmus Mundus scholarship for the grant round.',
    deadlineNote: 'Scholarship (grant) round ~Nov–Jan. Self-funded strict deadlines: non-EU 30 Apr 2026, EU 30 Jun 2026.',
    eligibility: [
      'Bachelor of 180 ECTS, major in Computer Science preferred, university listed in IAU handbook or recognised rankings',
      'English B2 by a recognised test',
      'No published cutoff, but very competitive and academic-leaning'
    ],
    documents: [
      'Online application form (portal provides templates; do not email documents)',
      'CV in English, PDF',
      'Motivation or cover letter in English (competitive background, professional goals, why DEAI)',
      "Certified English translation of Bachelor's degree",
      'Transcript or academic results entered in the provided Excel template',
      'Reference letters, uploaded by referees using the provided template',
      'English proficiency proof',
      'Passport'
    ],
    motivation: { type: 'written cover letter', spec: 'scored on organisation, sequencing, content, vocabulary, critical thinking, originality, accuracy' },
    recommendationLetters: { count: 2, type: 'referees upload themselves; academic standing (H-factor) is scored' },
    video: { required: false },
    links: {
      official: 'https://deai.ulb.be',
      apply: 'https://deai.ulb.ac.be/emundus/',
      admission: 'https://deai.ulb.be/home/students/admission/',
      faq: 'https://deai.ulb.be/home/learn-more-deai/faq/'
    },
    fitNote: 'Strong data/AI content but very competitive and academic. My reach choice. Make the cover letter show concrete agency data and analytics work.'
  }
];

function programById(id) { return ERASMUS_PROGRAMS.find(p => p.id === id); }
function docsKey(label) { return 'sch_docs::' + label; }

// Checkbox state goes through DB (Sheet-backed) so it follows you across
// devices; plain localStorage is the fallback if db.js has not loaded.
function docsRead(key) {
  if (window.DB) return DB.load(key, []);
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { return []; }
}
function docsWrite(key, arr) {
  if (window.DB) return DB.save(key, arr);
  localStorage.setItem(key, JSON.stringify(arr));
}
function getDocChecks(label, count) {
  let arr = docsRead(docsKey(label));
  if (!Array.isArray(arr)) arr = [];
  else arr = arr.slice();
  while (arr.length < count) arr.push(false);
  return arr;
}
function toggleDocCheck(id, idx) {
  const p = programById(id);
  if (!p) return null;
  const arr = getDocChecks(p.label, p.documents.length);
  arr[idx] = !arr[idx];
  docsWrite(docsKey(p.label), arr);
  return arr;
}
function docsProgress(p) {
  const checks = getDocChecks(p.label, p.documents.length);
  return { done: checks.filter(Boolean).length, total: p.documents.length, checks };
}
