/* ================================================================
   BULK QUESTION IMPORT MODULE v2 (SMART PARSER & METADATA ENGINE)
   ================================================================ */

(function () {
  'use strict';

  // ── STATE ────────────────────────────────────────────────────────
  const state = {
    rawText: '',
    parsedQuestions: [],
    existingQuestions: [],
    historyStack: [],
    historyIndex: -1,
    autoSaveTimer: null,
    debounceTimer: null,
    wordWrap: true,
    filterSearch: '',
    filterType: '',
    filterDiff: '',
    filterStatus: '',
    filterDup: '',
    editingIndex: null,
  };

  // ── METADATA PANEL HELPERS ───────────────────────────────────────
  function getMeta() {
    const sEl = document.getElementById('bqMetaSubject') || document.getElementById('subject');
    const kEl = document.getElementById('bqMetaClass') || document.getElementById('klass');
    const cEl = document.getElementById('bqMetaChapter') || document.getElementById('chapter');
    const eEl = document.getElementById('bqMetaExam');

    return {
      subject:        sEl && sEl.value ? sEl.value.trim() : 'Physics',
      klass:          kEl && kEl.value ? kEl.value.trim() : '11',
      chapter:        cEl && cEl.value ? cEl.value.trim() : 'General',
      exams:          eEl && eEl.value ? [eEl.value.trim()] : ['NEET'],
      language:       val('bqMetaLanguage') || 'English',
      source:         val('bqMetaSource') || '',
      referenceBook:  val('bqMetaRefBook') || '',
      author:         val('bqMetaAuthor') || '',
      defaultMarks:   val('bqMetaMarks') || '4',
      negMarks:       val('bqMetaNegMarks') || '1',
      defaultDiff:    val('bqMetaDiff') || 'Medium',
    };
  }

  function val(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  // ── QUESTION TYPE DEFINITIONS & DETECTORS ─────────────────────────
  const QTYPE_LABELS = {
    mcq_single: 'Standard MCQ',
    mcq_multiple: 'Multiple Correct',
    statement_based: 'Statement Based',
    assertion_reason: 'Assertion Reason',
    match: 'Match the Following',
    numerical: 'Numerical / Integer',
    true_false: 'True / False',
    case_study: 'Case Study / Passage',
    paragraph: 'Paragraph Based',
    comprehension: 'Comprehension',
    matrix: 'Matrix Match',
    diagram: 'Diagram Based',
    image: 'Image Based',
    table: 'Table Based',
    graph: 'Graph Based',
    sequence: 'Sequence Based',
    reasoning: 'Reasoning Based',
    data_interpretation: 'Data Interpretation',
  };

  const TYPE_RULES = [
    {
      type: 'assertion_reason',
      test: (q) => /\b(assertion|reason)\b.*\b(assertion|reason)\b/is.test(q) || /^A:\s*Assertion/i.test(q)
    },
    {
      type: 'statement_based',
      test: (q) => /\bstatement\s+(i|ii|1|2)\b/i.test(q) || /statement\s+I\b/i.test(q)
    },
    {
      type: 'match',
      test: (q) => /\b(column|list)\s+(i{1,3}|[1234])\b/i.test(q) || /match\s+the\s+following/i.test(q)
    },
    {
      type: 'matrix',
      test: (q) => /\bmatrix\s+match\b/i.test(q) || /column\s+I.*column\s+II.*column\s+III/is.test(q)
    },
    {
      type: 'true_false',
      test: (q, opts) => {
        const optVals = Object.values(opts).map(v => v.toLowerCase().trim());
        return (optVals.includes('true') && optVals.includes('false')) || /^\s*(true|false)\s*$/i.test(q.trim());
      }
    },
    {
      type: 'mcq_multiple',
      test: (q, opts, ans) => /[A-D]\s*,\s*[A-D]/i.test(ans || '') || /more\s+than\s+one\s+correct|multiple\s+correct/i.test(q)
    },
    {
      type: 'case_study',
      test: (q) => /\b(case\s+study|read\s+the\s+following\s+passage|comprehension|passage\s+based)\b/i.test(q)
    },
    {
      type: 'diagram',
      test: (q) => /\b(diagram|circuit|figure|refer\s+to\s+the\s+image|given\s+figure)\b/i.test(q) || /\{\{IMG::/i.test(q)
    },
    {
      type: 'graph',
      test: (q) => /\b(graph|curve|plot|v-t\s+graph|x-t\s+graph|p-v\s+diagram)\b/i.test(q)
    },
    {
      type: 'table',
      test: (q) => /\b(table|data\s+given\s+below|following\s+data)\b/i.test(q) || /\|.*\|.*\|/.test(q)
    },
    {
      type: 'numerical',
      test: (q, opts, ans) => Object.keys(opts).length === 0 || /^\d+(\.\d+)?$/.test((ans || '').trim()) || /\b(numerical\s+value|integer\s+type|find\s+the\s+value)\b/i.test(q)
    },
    {
      type: 'mcq_single',
      test: () => true
    }
  ];

  function detectQType(questionText, options, answer) {
    for (const rule of TYPE_RULES) {
      if (rule.test(questionText, options, answer)) {
        return rule.type;
      }
    }
    return 'mcq_single';
  }

  // ── OPTION PATTERNS ───────────────────────────────────────────────
  const OPT_PATTERNS = [
    /^\s*\(([A-Da-d1-4])\)\s+/,      // (A) (1)
    /^\s*([A-Da-d1-4])[\.\):]\s+/,   // A. A) A:
    /^\s*([a-dA-D])\s*[\)\.]\s+/,   // a) b.
    /^\s*\[([A-Da-d1-4])\]\s+/,     // [A]
    /^\s*Option\s+([A-Da-d1-4])\s*[:\.]\s*/i,
  ];

  function detectOption(line) {
    for (const pat of OPT_PATTERNS) {
      const m = line.match(pat);
      if (m) {
        let key = m[1].toUpperCase();
        if (key === '1') key = 'A';
        else if (key === '2') key = 'B';
        else if (key === '3') key = 'C';
        else if (key === '4') key = 'D';
        return key;
      }
    }
    return null;
  }

  function stripOptionPrefix(line) {
    for (const pat of OPT_PATTERNS) {
      if (pat.test(line)) {
        return line.replace(pat, '').trim();
      }
    }
    return line.trim();
  }

  // ── BOUNDARY PATTERNS ─────────────────────────────────────────────
  const Q_START_PATTERNS = [
    /^\s*(?:Q|Question|Que|Problem|Item)?\s*\.?\s*(\d{1,4})\s*[\.:\)]\s+/i,
    /^\s*Q(\d{1,4})\s*[:\.]\s+/i,
  ];

  function looksLikeQStart(line) {
    return Q_START_PATTERNS.some(p => p.test(line));
  }

  function stripQNumber(line) {
    for (const p of Q_START_PATTERNS) {
      const m = line.match(p);
      if (m) return line.replace(p, '').trim();
    }
    return line.trim();
  }

  const ANS_PATTERNS = [
    /^\s*(?:Answer|Ans|Correct\s*Answer|Correct\s*Option|Ans\.:?)\s*[:\.\-]?\s*\(?([A-Da-d1-4]|True|False|[0-9\.,]+)\)?/i,
  ];

  const SOL_PATTERNS = [
    /^\s*(?:Solution|Detailed\s*Solution|Explanation|Reason|Working|Answer\s*Explanation|Sol\.|Expl\.)\s*[:\.\-]?/i,
  ];

  const IGNORE_PATTERNS = [
    /^\s*Page\s+\d+\s*of\s*\d+/i,
    /^\s*\d+\s*$/,
    /^\s*Coaching\s+Institute\s+Question\s+Bank/i,
    /^={3,}$/, /^_{3,}$/, /^-{3,}$/, /^\*{3,}$/,
  ];

  function shouldIgnoreLine(line) {
    return IGNORE_PATTERNS.some(p => p.test(line));
  }

  // ── CONCEPT & DIFFICULTY DETECTORS ────────────────────────────────
  const CONCEPT_KEYWORDS = {
    'Chemical Bonding': ['hybridization', 'vsepr', 'dipole', 'bond order', 'mot', 'resonance', 'lewis', 'electronegativity', 'covalent', 'ionic'],
    'Atomic Structure': ['orbital', 'quantum number', 'schrodinger', 'bohr', 'de broglie', 'heisenberg', 'photoelectric'],
    'Thermodynamics': ['entropy', 'enthalpy', 'gibbs', 'hess', 'internal energy', 'spontaneous', 'first law', 'second law'],
    'Kinematics': ['velocity', 'acceleration', 'displacement', 'projectile', 'relative motion', 'speed', 'distance'],
    'Laws of Motion': ['newton', 'friction', 'tension', 'inertia', 'impulse', 'momentum', 'pulley'],
    'Electrostatics': ['coulomb', 'electric field', 'potential', 'capacitor', 'gauss', 'charge', 'dipole'],
    'Cell Biology': ['mitosis', 'meiosis', 'cell cycle', 'organelle', 'membrane', 'nucleus', 'mitochondria'],
    'Genetics': ['mendel', 'dna', 'rna', 'replication', 'transcription', 'translation', 'allele', 'gene'],
    'Calculus': ['derivative', 'integral', 'limit', 'continuity', 'differential', 'rate of change'],
  };

  function detectConcept(qText, chapter) {
    const text = (qText + ' ' + chapter).toLowerCase();
    let bestMatch = { concept: chapter || 'General', confidence: 65 };
    
    for (const [concept, keywords] of Object.entries(CONCEPT_KEYWORDS)) {
      const matches = keywords.filter(kw => text.includes(kw));
      if (matches.length > 0) {
        const conf = Math.min(95, 70 + matches.length * 8);
        if (conf > bestMatch.confidence) {
          bestMatch = { concept, confidence: conf };
        }
      }
    }
    return bestMatch;
  }

  function detectDifficulty(qText, options, solution) {
    let score = 0;
    const combined = (qText + ' ' + solution).toLowerCase();
    if (qText.length > 350) score += 2;
    else if (qText.length > 180) score += 1;

    if (/calculate|determine|evaluate|find the value|derived/.test(combined)) score += 1;
    if (/\\frac|\\int|\\sum|\\sqrt|\\matrix/.test(combined)) score += 1;
    if (Object.keys(options).length === 0) score += 1;
    if (solution.length > 250) score += 1;

    if (score >= 4) return 'Hard';
    if (score >= 2) return 'Medium';
    return 'Easy';
  }

  // ── SMART PARSER CORE ──────────────────────────────────────────────
  function parseText(rawText) {
    const meta = getMeta();
    const lines = rawText.split('\n');
    const questions = [];
    let cur = null;
    let mode = 'q';

    function pushCur() {
      if (cur && cur.qLines.length > 0) {
        const qText = cur.qLines.join('\n').trim();
        const solText = cur.solLines.join('\n').trim();
        const qType = detectQType(qText, cur.options, cur.answer);
        const { concept, confidence } = detectConcept(qText, meta.chapter);
        const difficulty = detectDifficulty(qText, cur.options, solText);

        questions.push({
          subject: meta.subject,
          klass: meta.klass,
          chapter: meta.chapter,
          topic: concept,
          exams: meta.exams,
          language: meta.language,
          source: meta.source,
          referenceBook: meta.referenceBook,
          author: meta.author,
          marks: meta.defaultMarks,
          negMarks: meta.negMarks,
          difficulty: difficulty,
          qType: qType,
          question: qText,
          optA: cur.options['A'] || '',
          optB: cur.options['B'] || '',
          optC: cur.options['C'] || '',
          optD: cur.options['D'] || '',
          answer: cur.answer || '',
          solutionText: solText,
          concept: concept,
          confidenceScore: confidence,
          startLine: cur.startLine,
          errors: [],
          isValid: true,
          isDuplicate: false,
          ignored: false,
          dupAction: 'skip',
          collapsed: false,
        });
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();
      if (!line || shouldIgnoreLine(line)) continue;

      if (/^@question\b/i.test(line)) {
        pushCur();
        cur = { qLines: [], solLines: [], options: {}, answer: '', startLine: i + 1 };
        mode = 'q';
        const rest = line.replace(/^@question\s*/i, '').trim();
        if (rest) cur.qLines.push(rest);
        continue;
      }

      let isAns = false;
      for (const p of ANS_PATTERNS) {
        const m = line.match(p);
        if (m && cur) {
          let ansVal = m[1].toUpperCase().trim();
          if (ansVal === '1') ansVal = 'A';
          else if (ansVal === '2') ansVal = 'B';
          else if (ansVal === '3') ansVal = 'C';
          else if (ansVal === '4') ansVal = 'D';
          cur.answer = ansVal;
          isAns = true;
          break;
        }
      }
      if (isAns) continue;

      let isSol = false;
      for (const p of SOL_PATTERNS) {
        if (p.test(line)) {
          if (cur) {
            mode = 'sol';
            const rest = line.replace(p, '').trim();
            if (rest) cur.solLines.push(rest);
            isSol = true;
            break;
          }
        }
      }
      if (isSol) continue;

      const optKey = detectOption(line);
      if (optKey && cur) {
        mode = 'opt';
        const optVal = stripOptionPrefix(line);
        cur.options[optKey] = optVal;
        continue;
      }

      if (looksLikeQStart(line)) {
        pushCur();
        cur = { qLines: [], solLines: [], options: {}, answer: '', startLine: i + 1 };
        mode = 'q';
        cur.qLines.push(stripQNumber(line));
        continue;
      }

      if (cur) {
        if (mode === 'sol') {
          cur.solLines.push(line);
        } else if (mode === 'opt') {
          const lastKey = Object.keys(cur.options).pop();
          if (lastKey) cur.options[lastKey] += ' ' + line;
          else cur.qLines.push(line);
        } else {
          cur.qLines.push(line);
        }
      } else {
        cur = { qLines: [line], solLines: [], options: {}, answer: '', startLine: i + 1 };
        mode = 'q';
      }
    }
    pushCur();

    return questions;
  }

  // ── VALIDATION & DUPLICATE CHECKING ────────────────────────────────
  function validateAll(questions) {
    const meta = getMeta();
    questions.forEach((q, idx) => {
      q.errors = [];
      const num = idx + 1;
      if (!q.subject && !meta.subject) q.errors.push(`Question #${num}: Subject is required.`);
      if (!q.klass && !meta.klass) q.errors.push(`Question #${num}: Class is required.`);
      if (!q.chapter && !meta.chapter) q.errors.push(`Question #${num}: Chapter is required.`);
      if (!q.question || q.question.length < 5) q.errors.push(`Question #${num}: Question text is missing or too short.`);
      if (q.qType === 'mcq_single' || q.qType === 'mcq_multiple') {
        if (!q.optA) q.errors.push(`Question #${num}: Option A is missing.`);
        if (!q.optB) q.errors.push(`Question #${num}: Option B is missing.`);
      }
      if (!q.answer && q.qType !== 'numerical') q.errors.push(`Question #${num}: Correct answer is missing.`);
      q.isValid = q.errors.length === 0;
    });
  }

  function checkDuplicates(questions, dbList) {
    if (!dbList || !dbList.length) return;
    questions.forEach(q => {
      const normQ = (q.question || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!normQ) return;
      const match = dbList.find(dbq => {
        if (q.subject && dbq.subject !== q.subject) return false;
        const normDB = (dbq.question || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return normDB === normQ;
      });
      q.isDuplicate = !!match;
      q.existingId = match ? match.id : null;
    });
  }

  // ── RENDER ENGINE ──────────────────────────────────────────────────
  function renderCardNode(text) {
    if (!text) return document.createTextNode('');
    if (typeof buildEquationFragment === 'function') {
      return buildEquationFragment(text);
    }
    const span = document.createElement('span');
    span.textContent = text;
    return span;
  }

  function renderCard(q, idx) {
    const card = document.createElement('div');
    card.className = 'bq-card' +
      (q.isValid ? '' : ' is-invalid') +
      (q.isDuplicate ? ' is-duplicate' : '') +
      (q.ignored ? ' is-ignored' : '');
    card.id = 'bqCard_' + idx;

    const top = document.createElement('div');
    top.className = 'bq-card-top';

    top.appendChild(createBadge('num', '#' + (idx + 1)));
    top.appendChild(createBadge('type', QTYPE_LABELS[q.qType] || q.qType));
    top.appendChild(createBadge((q.difficulty || 'Medium').toLowerCase(), q.difficulty));
    top.appendChild(createBadge(q.isValid ? 'valid' : 'invalid', q.isValid ? '✓ Valid' : '✕ Invalid'));
    if (q.isDuplicate) top.appendChild(createBadge('dup', '⚠ Duplicate'));
    top.appendChild(createBadge('conf', 'AI Conf: ' + (q.confidenceScore || 70) + '%'));

    const acts = document.createElement('div');
    acts.className = 'bq-card-actions';

    const selLabel = document.createElement('label');
    selLabel.style.cssText = 'font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !q.ignored;
    cb.onchange = () => {
      q.ignored = !cb.checked;
      updateStats();
      renderCards();
    };
    selLabel.appendChild(cb);
    selLabel.appendChild(document.createTextNode('Select'));
    acts.appendChild(selLabel);

    acts.appendChild(createToolBtn(q.collapsed ? '▼' : '▲', 'Expand/Collapse', () => {
      q.collapsed = !q.collapsed;
      renderCards();
    }));
    acts.appendChild(createToolBtn('✎', 'Edit', () => openCardEditor(idx)));
    acts.appendChild(createToolBtn('✕', 'Delete', () => {
      state.parsedQuestions.splice(idx, 1);
      renderCards();
      updateStats();
    }, true));

    top.appendChild(acts);
    card.appendChild(top);

    const metaLine = document.createElement('div');
    metaLine.className = 'bq-card-meta';
    metaLine.textContent = (q.subject || '') + ' · Class ' + (q.klass || '') + ' · Chapter: ' + (q.chapter || '') + (q.concept ? ' · Concept: ' + q.concept : '');
    card.appendChild(metaLine);

    if (q.collapsed) return card;

    const body = document.createElement('div');
    body.className = 'bq-card-body';

    const qtext = document.createElement('div');
    qtext.className = 'bq-card-qtext';
    qtext.appendChild(renderCardNode(q.question || ''));
    body.appendChild(qtext);

    if (q.optA || q.optB || q.optC || q.optD) {
      const optsGrid = document.createElement('div');
      optsGrid.className = 'bq-card-opts';
      ['A', 'B', 'C', 'D'].forEach(letter => {
        const optVal = q['opt' + letter];
        if (!optVal) return;
        const isCorrect = (q.answer || '').toUpperCase().includes(letter);
        const optEl = document.createElement('div');
        optEl.className = 'bq-opt' + (isCorrect ? ' correct' : '');
        optEl.appendChild(document.createTextNode(letter + ': '));
        optEl.appendChild(renderCardNode(optVal));
        if (isCorrect) {
          const ck = document.createElement('span');
          ck.textContent = ' ✓';
          optEl.appendChild(ck);
        }
        optsGrid.appendChild(optEl);
      });
      body.appendChild(optsGrid);
    }

    if (q.answer) {
      const ansEl = document.createElement('div');
      ansEl.className = 'bq-card-answer';
      ansEl.textContent = '✓ Correct Answer: ' + q.answer;
      body.appendChild(ansEl);
    }

    if (q.solutionText) {
      const solEl = document.createElement('div');
      solEl.className = 'bq-card-solution';
      solEl.appendChild(document.createTextNode('SOLUTION: '));
      solEl.appendChild(renderCardNode(q.solutionText));
      body.appendChild(solEl);
    }

    card.appendChild(body);

    if (q.errors && q.errors.length > 0) {
      const errBox = document.createElement('div');
      errBox.className = 'bq-card-errors';
      q.errors.forEach(e => {
        const item = document.createElement('div');
        item.className = 'bq-err-item';
        item.textContent = '⚠ ' + e;
        errBox.appendChild(item);
      });
      card.appendChild(errBox);
    }

    if (q.isDuplicate) {
      const dupBanner = document.createElement('div');
      dupBanner.className = 'bq-card-dup-banner';
      dupBanner.appendChild(document.createTextNode('⚠ Duplicate question detected in database. Action: '));
      ['skip', 'overwrite', 'keep_both'].forEach(act => {
        const btn = document.createElement('button');
        btn.className = 'bq-dup-btn' + (q.dupAction === act ? ' active' : '');
        btn.textContent = act.replace('_', ' ').toUpperCase();
        btn.onclick = () => {
          q.dupAction = act;
          renderCards();
        };
        dupBanner.appendChild(btn);
      });
      card.appendChild(dupBanner);
    }

    return card;
  }

  function createBadge(cls, text) {
    const s = document.createElement('span');
    s.className = 'bq-badge ' + cls;
    s.textContent = text;
    return s;
  }

  function createToolBtn(text, title, onClick, isDanger) {
    const btn = document.createElement('button');
    btn.className = 'bq-tool-btn' + (isDanger ? ' danger' : '');
    btn.title = title;
    btn.textContent = text;
    btn.onclick = onClick;
    return btn;
  }

  function getFiltered() {
    const search = state.filterSearch.toLowerCase();
    return state.parsedQuestions.filter(q => {
      if (state.filterType && q.qType !== state.filterType) return false;
      if (state.filterDiff && (q.difficulty || 'Medium').toLowerCase() !== state.filterDiff) return false;
      if (state.filterStatus === 'valid' && !q.isValid) return false;
      if (state.filterStatus === 'invalid' && q.isValid) return false;
      if (state.filterDup === 'duplicate' && !q.isDuplicate) return false;
      if (state.filterDup === 'unique' && q.isDuplicate) return false;
      if (search && !(q.question || '').toLowerCase().includes(search) && !(q.concept || '').toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function renderCards() {
    const container = document.getElementById('bqCardsContainer') || document.getElementById('bulkCardsContainer');
    if (!container) return;
    const filtered = getFiltered();
    if (filtered.length === 0) {
      container.innerHTML = '<div class="bq-empty"><div class="bq-empty-icon">📭</div><div class="bq-empty-text">' +
        (state.parsedQuestions.length === 0 ? 'Paste questions in the editor to parse and preview.' : 'No questions match the selected filters.') +
        '</div></div>';
      updateStats();
      renderErrorPanel();
      return;
    }

    const frag = document.createDocumentFragment();
    filtered.forEach((q) => {
      const realIdx = state.parsedQuestions.indexOf(q);
      frag.appendChild(renderCard(q, realIdx));
    });

    container.innerHTML = '';
    container.appendChild(frag);

    updateStats();
    renderErrorPanel();
  }

  function updateStats() {
    const qs = state.parsedQuestions;
    const total = qs.length;
    const valid = qs.filter(q => q.isValid && !q.ignored).length;
    const invalid = qs.filter(q => !q.isValid).length;
    const dup = qs.filter(q => q.isDuplicate).length;
    const ready = qs.filter(q => q.isValid && !q.ignored && (!q.isDuplicate || q.dupAction !== 'skip')).length;

    ['bqStatTotal', 'bulkStatTotal'].forEach(id => setTxt(id, total));
    ['bqStatValid', 'bulkStatValid'].forEach(id => setTxt(id, valid));
    ['bqStatInvalid', 'bulkStatInvalid'].forEach(id => setTxt(id, invalid));
    ['bqStatDup', 'bulkStatDup'].forEach(id => setTxt(id, dup));
    ['bqStatReady', 'bulkStatReady'].forEach(id => setTxt(id, ready));

    const fill = document.getElementById('bqProgressFill');
    if (fill) fill.style.width = total > 0 ? ((valid / total) * 100) + '%' : '0%';
  }

  function setTxt(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  function renderErrorPanel() {
    const panel = document.getElementById('bqErrorPanel') || document.getElementById('bulkErrorCard');
    const list = document.getElementById('bqErrorList') || document.getElementById('bulkErrorList');
    const count = document.getElementById('bqErrorCount') || document.getElementById('bulkErrorCount');
    if (!panel || !list) return;

    const allErrors = [];
    state.parsedQuestions.forEach(q => (q.errors || []).forEach(e => allErrors.push({ q, e })));

    if (allErrors.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    if (count) count.textContent = allErrors.length + ' Issues';

    list.innerHTML = '';
    allErrors.forEach(({ q, e }) => {
      const idx = state.parsedQuestions.indexOf(q);
      const row = document.createElement('div');
      row.className = 'bq-error-row';
      row.innerHTML = '<span class="bq-err-qnum">Q#' + (idx + 1) + '</span><span class="bq-err-msg">' + escapeHtml(e) + '</span>';
      row.onclick = () => {
        const cardEl = document.getElementById('bqCard_' + idx);
        if (cardEl) cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      list.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function runParse() {
    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    if (!ta) return;
    const text = ta.value;
    if (!text.trim()) {
      state.parsedQuestions = [];
      renderCards();
      return;
    }

    const questions = parseText(text);
    validateAll(questions);
    checkDuplicates(questions, state.existingQuestions);
    state.parsedQuestions = questions;
    renderCards();
  }

  function scheduleReparse() {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(runParse, 800);
  }

  function initEditor() {
    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    const ln = document.getElementById('bqLineNumbers') || document.getElementById('bulkLineNumbers');
    if (!ta) return;

    function updateLineNumbers() {
      if (!ln) return;
      const count = ta.value.split('\n').length;
      let nums = '';
      for (let i = 1; i <= count; i++) nums += i + '\n';
      ln.textContent = nums;
      ln.scrollTop = ta.scrollTop;
    }

    ta.addEventListener('input', () => {
      updateLineNumbers();
      scheduleReparse();
      autoSave();
      pushHistory(ta.value);
    });

    ta.addEventListener('scroll', () => {
      if (ln) ln.scrollTop = ta.scrollTop;
    });

    ta.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undoHistory();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redoHistory();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + 2;
        updateLineNumbers();
      }
    });

    const draft = localStorage.getItem('bq_draft_v2');
    if (draft) {
      ta.value = draft;
      updateLineNumbers();
      scheduleReparse();
    } else {
      updateLineNumbers();
    }
  }

  function pushHistory(text) {
    if (state.historyStack[state.historyIndex] === text) return;
    state.historyStack = state.historyStack.slice(0, state.historyIndex + 1);
    state.historyStack.push(text);
    if (state.historyStack.length > 100) state.historyStack.shift();
    state.historyIndex = state.historyStack.length - 1;
  }

  function undoHistory() {
    if (state.historyIndex <= 0) return;
    state.historyIndex--;
    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    if (ta) {
      ta.value = state.historyStack[state.historyIndex];
      scheduleReparse();
    }
  }

  function redoHistory() {
    if (state.historyIndex >= state.historyStack.length - 1) return;
    state.historyIndex++;
    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    if (ta) {
      ta.value = state.historyStack[state.historyIndex];
      scheduleReparse();
    }
  }

  function autoSave() {
    clearTimeout(state.autoSaveTimer);
    state.autoSaveTimer = setTimeout(() => {
      const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
      if (ta) localStorage.setItem('bq_draft_v2', ta.value);
    }, 1500);
  }

  function toggleWordWrap() {
    state.wordWrap = !state.wordWrap;
    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    const btn = document.getElementById('bqWrapBtn') || document.getElementById('bulkWrapBtn');
    if (ta) ta.classList.toggle('word-wrap', state.wordWrap);
    if (btn) btn.classList.toggle('active', state.wordWrap);
  }

  function clearEditor() {
    if (!confirm('Clear editor content?')) return;
    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    if (ta) {
      ta.value = '';
      pushHistory('');
      scheduleReparse();
    }
    localStorage.removeItem('bq_draft_v2');
  }

  function restoreSample() {
    const sample = `1. Which of the following is diamagnetic in nature?
(A) Zn2+
(B) Ni2+
(C) Co2+
(D) Cu2+
Answer: A
Solution: Zn loses two 4s electrons and forms configuration [Ar]3d10. All electrons become paired, making it diamagnetic.

2. Which statement is correct regarding ionic compounds?
(A) They have low melting points.
(B) They conduct electricity in solid state.
(C) They have high lattice energy.
(D) They are non-polar.
Answer: C
Solution: Ionic compounds have strong electrostatic forces leading to high lattice energy.

3. Assertion: Light waves can travel through vacuum.
Reason: Light is an electromagnetic wave and does not require a material medium for propagation.
(A) Both A and R are true and R is correct explanation.
(B) Both A and R are true but R is not correct explanation.
(C) A is true but R is false.
(D) A is false but R is true.
Answer: A
Solution: Electromagnetic waves self-propagate through electric and magnetic field oscillations.`;

    const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
    if (ta) {
      ta.value = sample;
      pushHistory(sample);
      scheduleReparse();
    }
  }

  function openCardEditor(idx) {
    state.editingIndex = idx;
    const q = state.parsedQuestions[idx];
    if (!q) return;

    const modal = document.getElementById('bqEditModal') || document.getElementById('bulkEditModal');
    if (!modal) return;

    setVal('bqEditQuestion', q.question || '');
    setVal('bqEditOptA', q.optA || '');
    setVal('bqEditOptB', q.optB || '');
    setVal('bqEditOptC', q.optC || '');
    setVal('bqEditOptD', q.optD || '');
    setVal('bqEditAnswer', q.answer || 'A');
    setVal('bqEditSolution', q.solutionText || '');
    setVal('bqEditConcept', q.concept || '');
    setVal('bqEditDifficulty', q.difficulty || 'Medium');
    setVal('bqEditQType', q.qType || 'mcq_single');

    modal.style.display = 'flex';
    modal.classList.add('open');
  }

  function closeCardEditor() {
    const modal = document.getElementById('bqEditModal') || document.getElementById('bulkEditModal');
    if (modal) {
      modal.style.display = 'none';
      modal.classList.remove('open');
    }
    state.editingIndex = null;
  }

  function saveCardEditor() {
    const idx = state.editingIndex;
    if (idx === null || !state.parsedQuestions[idx]) {
      closeCardEditor();
      return;
    }
    const q = state.parsedQuestions[idx];
    q.question = gVal('bqEditQuestion');
    q.optA = gVal('bqEditOptA');
    q.optB = gVal('bqEditOptB');
    q.optC = gVal('bqEditOptC');
    q.optD = gVal('bqEditOptD');
    q.answer = gVal('bqEditAnswer');
    q.solutionText = gVal('bqEditSolution');
    q.concept = gVal('bqEditConcept');
    q.topic = q.concept;
    q.difficulty = gVal('bqEditDifficulty');
    q.qType = gVal('bqEditQType');

    validateAll(state.parsedQuestions);
    closeCardEditor();
    renderCards();
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v;
  }
  function gVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  async function executeBulkImport() {
    if (typeof Auth !== 'undefined' && Auth.can && !Auth.can('edit')) {
      if (typeof showToast === 'function') showToast('You do not have permission to import questions.', true);
      return;
    }

    const importList = state.parsedQuestions.filter(q => {
      if (q.ignored) return false;
      if (!q.isValid) return false;
      if (q.isDuplicate && q.dupAction === 'skip') return false;
      return true;
    });

    if (!importList.length) {
      if (typeof showToast === 'function') showToast('No valid questions ready to import.', true);
      return;
    }

    if (!confirm(`Import ${importList.length} validated question(s) into database?`)) return;

    const btn = document.getElementById('bqImportBtn') || document.getElementById('bulkImportBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Importing...';
    }

    const meta = getMeta();
    const payload = importList.map(q => ({
      subject: q.subject || meta.subject,
      klass: q.klass || meta.klass,
      chapter: q.chapter || meta.chapter,
      topic: q.concept || q.topic || 'General',
      exams: q.exams && q.exams.length ? q.exams : meta.exams,
      qType: q.qType || 'mcq_single',
      question: q.question,
      optA: q.optA || '',
      optB: q.optB || '',
      optC: q.optC || '',
      optD: q.optD || '',
      assertion: q.assertion || '',
      reason: q.reason || '',
      statement1: q.statement1 || '',
      statement2: q.statement2 || '',
      predefOptions: q.predefOptions || '',
      columnA: q.columnA || [],
      columnB: q.columnB || [],
      matchOptions: q.matchOptions || {},
      numAnswer: q.numAnswer || '',
      correctOption: q.answer,
      solutionText: q.solutionText || '',
    }));

    try {
      const res = await apiReq('/api/questions/batch', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (typeof showToast === 'function') {
        showToast(`Successfully imported ${res.count || payload.length} questions!`);
      }

      if (typeof window.loadQuestions === 'function') {
        window.loadQuestions();
      }

      const ta = document.getElementById('bqTextarea') || document.getElementById('bulkEditorTextarea');
      if (ta) {
        ta.value = '';
        localStorage.removeItem('bq_draft_v2');
        scheduleReparse();
      }
    } catch (err) {
      console.error('Bulk Import error:', err);
      if (typeof showToast === 'function') showToast('Import failed: ' + err.message, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚡ Import All Validated Questions';
      }
    }
  }

  async function fetchExistingQuestions() {
    try {
      const res = await apiReq('/api/questions');
      state.existingQuestions = res || [];
    } catch (_) {
      state.existingQuestions = [];
    }
  }

  function init() {
    initEditor();
    fetchExistingQuestions();

    const searchInput = document.getElementById('bqFilterSearch') || document.getElementById('bulkSearchInput');
    const typeFilter = document.getElementById('bqFilterType');
    const diffFilter = document.getElementById('bqFilterDiff') || document.getElementById('bulkFilterDiff');
    const statusFilter = document.getElementById('bqFilterStatus') || document.getElementById('bulkFilterStatus');
    const dupFilter = document.getElementById('bqFilterDup') || document.getElementById('bulkFilterDup');
    const conceptFilter = document.getElementById('bqFilterConcept') || document.getElementById('bulkFilterConcept');

    if (searchInput) searchInput.addEventListener('input', (e) => { state.filterSearch = e.target.value; renderCards(); });
    if (typeFilter) typeFilter.addEventListener('change', (e) => { state.filterType = e.target.value; renderCards(); });
    if (diffFilter) diffFilter.addEventListener('change', (e) => { state.filterDiff = e.target.value; renderCards(); });
    if (statusFilter) statusFilter.addEventListener('change', (e) => { state.filterStatus = e.target.value; renderCards(); });
    if (dupFilter) dupFilter.addEventListener('change', (e) => { state.filterDup = e.target.value; renderCards(); });
    if (conceptFilter) conceptFilter.addEventListener('change', (e) => { state.filterSearch = e.target.value; renderCards(); });
  }

  window.BulkModule = {
    init,
    runParse,
    openCardEditor,
    closeCardEditor,
    saveCardEditor,
    clearEditor,
    restoreSample,
    toggleWordWrap,
    undoHistory,
    redoHistory,
    executeBulkImport,
    exportQuestions: () => {},
    toggleCardCollapse: (idx) => {
      if (state.parsedQuestions[idx]) {
        state.parsedQuestions[idx].collapsed = !state.parsedQuestions[idx].collapsed;
        renderCards();
      }
    },
    toggleIgnore: (idx) => {
      if (state.parsedQuestions[idx]) {
        state.parsedQuestions[idx].ignored = !state.parsedQuestions[idx].ignored;
        updateStats();
        renderCards();
      }
    },
    deleteCard: (idx) => {
      state.parsedQuestions.splice(idx, 1);
      renderCards();
      updateStats();
    },
  };
})();
