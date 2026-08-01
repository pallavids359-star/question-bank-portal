/* ============================================================
   BULK QUESTION IMPORT MODULE - CORE LOGIC & PARSER
   ============================================================ */

(function () {
  'use strict';

  // State Management
  const state = {
    rawText: '',
    parsedQuestions: [],
    errors: [],
    existingQuestions: [],
    historyStack: [],
    historyIndex: -1,
    autoSaveTimer: null,
    debouncedParseTimer: null,
    currentConcept: '',
    wordWrap: true,
    filterSearch: '',
    filterConcept: '',
    filterDifficulty: '',
    filterStatus: '',
    filterDuplicate: '',
    editingIndex: null,
  };

  // Standard Format Sample Text
  const DEFAULT_SAMPLE_FORMAT = `@concept
Chemical Bonding

@question
Which of the following is diamagnetic in nature?

@optionA
$\\mathrm{Zn}^{2+}$

@optionB
$\\mathrm{Ni}^{2+}$

@optionC
$\\mathrm{Co}^{2+}$

@optionD
$\\mathrm{Cu}^{2+}$

@answer
A

@solution
Zn loses two 4s electrons and forms the configuration $[Ar]3d^{10}$.
All electrons become paired.
Hence it is diamagnetic.

@difficulty
Easy

@end

@question
Which statement is correct regarding ionic compounds?

@optionA
They have low melting points.

@optionB
They conduct electricity in solid state.

@optionC
They have high lattice energy.

@optionD
They are non-polar.

@answer
C

@solution
Ionic compounds have high electrostatic forces of attraction leading to high lattice energy.

@difficulty
Medium

@end
`;

  // ------------------------------------------------------------
  // 1. PARSER ENGINE
  // ------------------------------------------------------------
  function parseBulkText(text) {
    const lines = text.split('\n');
    const questions = [];
    const errors = [];

    let currentConcept = '';
    let currentQ = null;
    let currentTag = null;
    let currentTagContent = [];

    function flushTag() {
      if (!currentQ || !currentTag) return;
      const content = currentTagContent.join('\n').trim();
      currentTagContent = [];

      switch (currentTag) {
        case 'question':
          // Strip leading numbering e.g. "1.", "Q1", "Question 1", "(1)"
          currentQ.question = cleanQuestionText(content);
          break;
        case 'optiona':
        case 'option1':
        case 'opta':
          currentQ.optA = processImageInText(content);
          break;
        case 'optionb':
        case 'option2':
        case 'optb':
          currentQ.optB = processImageInText(content);
          break;
        case 'optionc':
        case 'option3':
        case 'optc':
          currentQ.optC = processImageInText(content);
          break;
        case 'optiond':
        case 'option4':
        case 'optd':
          currentQ.optD = processImageInText(content);
          break;
        case 'answer':
        case 'ans':
          currentQ.answer = content.toUpperCase();
          break;
        case 'solution':
        case 'sol':
          currentQ.solutionText = processImageInText(content);
          break;
        case 'difficulty':
        case 'diff':
          currentQ.difficulty = capitalize(content);
          break;
        case 'type':
        case 'qtype':
          const tVal = content.toLowerCase();
          if (tVal.includes('assertion')) currentQ.qType = 'assertion_reason';
          else if (tVal.includes('match')) currentQ.qType = 'match';
          else if (tVal.includes('num') || tVal.includes('integer')) currentQ.qType = 'numerical';
          else if (tVal.includes('true') || tVal.includes('false')) currentQ.qType = 'true_false';
          else currentQ.qType = 'mcq_single';
          break;
      }
    }

    function flushQuestion(endLineNum) {
      if (!currentQ) return;
      flushTag();
      currentQ.endLine = endLineNum;

      // Infer concept if missing
      if (!currentQ.concept) {
        currentQ.concept = currentConcept || getMetadataValue('topic') || 'General';
      }

      // Infer qType if missing
      if (!currentQ.qType) {
        if (currentQ.assertion && currentQ.reason) currentQ.qType = 'assertion_reason';
        else if (currentQ.numAnswer) currentQ.qType = 'numerical';
        else currentQ.qType = 'mcq_single';
      }

      questions.push(currentQ);
      currentQ = null;
      currentTag = null;
      currentTagContent = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i];
      const trimmed = rawLine.trim();

      if (!trimmed) continue;

      // Tag matching (case insensitive)
      const tagMatch = trimmed.match(/^@([a-zA-Z0-9]+)\b/i);

      if (tagMatch) {
        const tagName = tagMatch[1].toLowerCase();

        if (tagName === 'concept') {
          if (currentQ) flushQuestion(lineNum - 1);
          // Inline concept value or next lines
          const conceptValue = trimmed.replace(/^@concept\s*/i, '').trim();
          if (conceptValue) {
            currentConcept = conceptValue;
          } else {
            currentTag = 'concept_next';
          }
          continue;
        }

        if (currentTag === 'concept_next') {
          currentConcept = trimmed;
          currentTag = null;
          continue;
        }

        if (tagName === 'end') {
          flushQuestion(lineNum);
          continue;
        }

        if (tagName === 'question') {
          if (currentQ) flushQuestion(lineNum - 1);
          currentQ = {
            id: 'import_' + (questions.length + 1),
            startLine: lineNum,
            concept: currentConcept,
            question: '',
            optA: '',
            optB: '',
            optC: '',
            optD: '',
            answer: '',
            solutionText: '',
            difficulty: '',
            isValid: true,
            isDuplicate: false,
            dupAction: 'skip', // skip, overwrite, keep_both
            ignored: false,
            collapsed: false,
            errors: [],
          };
          currentTag = 'question';
          const rest = trimmed.replace(/^@question\s*/i, '').trim();
          if (rest) currentTagContent.push(rest);
          continue;
        }

        // Option / Answer / Solution / Difficulty tags
        if (currentQ) {
          flushTag();
          currentTag = tagName;
          const rest = trimmed.replace(new RegExp('^@' + tagName + '\\s*', 'i'), '').trim();
          if (rest) currentTagContent.push(rest);
        }
      } else {
        if (currentTag === 'concept_next') {
          currentConcept = trimmed;
          currentTag = null;
        } else if (currentQ && currentTag) {
          currentTagContent.push(rawLine);
        }
      }
    }

    if (currentQ) {
      flushQuestion(lines.length);
    }

    return questions;
  }

  // Helper: clean question numbering
  function cleanQuestionText(text) {
    if (!text) return '';
    // Strip "1.", "Q1.", "Question 1:", "(1)", etc.
    let cleaned = text.replace(/^\s*(?:(?:Q|Question)\s*\d+[\.\:\)\-]?|\d+[\.\:\)\-]?|\(\d+\))\s*/i, '');
    return processImageInText(cleaned);
  }

  // Helper: process base64 images inside text into {{IMG::...}} chips
  function processImageInText(text) {
    if (!text) return '';
    // Check for base64 data URI pattern
    const base64Regex = /(data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+)/g;
    return text.replace(base64Regex, (match) => {
      if (match.startsWith('{{IMG::')) return match;
      return `{{IMG::${match}}}`;
    });
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  // ------------------------------------------------------------
  // 2. VALIDATION ENGINE
  // ------------------------------------------------------------
  function validateQuestions(questions) {
    const allErrors = [];

    questions.forEach((q, idx) => {
      q.errors = [];
      q.isValid = true;

      const qNum = idx + 1;

      // 1. Question Text
      if (!q.question) {
        addErr(q, q.startLine, `Question #${qNum}: Question text is missing.`);
      }

      // 2. Options A-D
      if (!q.optA) addErr(q, q.startLine, `Question #${qNum}: Option A is missing.`);
      if (!q.optB) addErr(q, q.startLine, `Question #${qNum}: Option B is missing.`);
      if (!q.optC) addErr(q, q.startLine, `Question #${qNum}: Option C is missing.`);
      if (!q.optD) addErr(q, q.startLine, `Question #${qNum}: Option D is missing.`);

      // Duplicate options check
      if (q.optA && q.optB && q.optA === q.optB) addErr(q, q.startLine, `Question #${qNum}: Option A and Option B are identical.`);
      if (q.optA && q.optC && q.optA === q.optC) addErr(q, q.startLine, `Question #${qNum}: Option A and Option C are identical.`);
      if (q.optA && q.optD && q.optA === q.optD) addErr(q, q.startLine, `Question #${qNum}: Option A and Option D are identical.`);
      if (q.optB && q.optC && q.optB === q.optC) addErr(q, q.startLine, `Question #${qNum}: Option B and Option C are identical.`);
      if (q.optB && q.optD && q.optB === q.optD) addErr(q, q.startLine, `Question #${qNum}: Option B and Option D are identical.`);
      if (q.optC && q.optD && q.optC === q.optD) addErr(q, q.startLine, `Question #${qNum}: Option C and Option D are identical.`);

      // 3. Answer
      if (!q.answer) {
        addErr(q, q.startLine, `Question #${qNum}: Correct answer is missing.`);
      } else {
        const normAns = q.answer.trim().toUpperCase();
        const validAnswers = ['A', 'B', 'C', 'D', '1', '2', '3', '4'];
        if (!validAnswers.includes(normAns)) {
          // Normalize 1->A, 2->B, etc.
          if (normAns === '1') q.answer = 'A';
          else if (normAns === '2') q.answer = 'B';
          else if (normAns === '3') q.answer = 'C';
          else if (normAns === '4') q.answer = 'D';
          else addErr(q, q.startLine, `Question #${qNum}: Invalid answer "${q.answer}". Must be A, B, C, or D.`);
        }
      }

      // 4. Solution
      if (!q.solutionText) {
        addErr(q, q.startLine, `Question #${qNum}: Detailed solution is missing.`);
      }

      // 5. Difficulty
      if (!q.difficulty) {
        q.difficulty = getMetadataValue('difficulty') || 'Medium';
      }

      // 6. Concept
      if (!q.concept) {
        q.concept = getMetadataValue('topic') || 'General';
      }

      // 7. KaTeX Compilation Check
      checkKaTeX(q, 'question', qNum);
      checkKaTeX(q, 'optA', qNum);
      checkKaTeX(q, 'optB', qNum);
      checkKaTeX(q, 'optC', qNum);
      checkKaTeX(q, 'optD', qNum);
      checkKaTeX(q, 'solutionText', qNum);

      if (q.errors.length > 0) {
        q.isValid = false;
        allErrors.push(...q.errors);
      }
    });

    return allErrors;
  }

  function addErr(q, lineNum, message) {
    const errObj = { line: lineNum, message };
    q.errors.push(errObj);
  }

  function checkKaTeX(q, fieldName, qNum) {
    const raw = q[fieldName];
    if (!raw || typeof window.katex === 'undefined') return;

    // Test KaTeX dollars
    const regex = /\$([^$]+)\$/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      const expr = match[1];
      try {
        window.katex.renderToString(expr, { throwOnError: true });
      } catch (err) {
        addErr(q, q.startLine, `Question #${qNum}: Invalid LaTeX math formula "$${expr.slice(0, 30)}...": ${err.message}`);
      }
    }
  }

  // ------------------------------------------------------------
  // 3. DUPLICATE CHECKER ENGINE
  // ------------------------------------------------------------
  function checkDuplicates(parsedList, dbList) {
    if (!dbList || !dbList.length) return;

    const normSubject = getMetadataValue('subject');
    const normChapter = getMetadataValue('chapter');

    parsedList.forEach((pq) => {
      const normText = normalizeForComparison(pq.question);
      if (!normText) return;

      const dup = dbList.find((dbq) => {
        if (normSubject && dbq.subject !== normSubject) return false;
        if (normChapter && dbq.chapter !== normChapter) return false;
        const dbNorm = normalizeForComparison(dbq.question);
        return dbNorm && dbNorm === normText;
      });

      if (dup) {
        pq.isDuplicate = true;
        pq.existingId = dup.id;
      } else {
        pq.isDuplicate = false;
        pq.existingId = null;
      }
    });
  }

  function normalizeForComparison(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .replace(/\{\{img::[^}]+\}\}/gi, '')
      .replace(/[^a-z0-9]/gi, '');
  }

  // ------------------------------------------------------------
  // 4. EDITOR WITH DYNAMIC LINE NUMBERS & AUTO-SAVE
  // ------------------------------------------------------------
  function initEditor() {
    const textarea = document.getElementById('bulkEditorTextarea');
    const lineNumEl = document.getElementById('bulkLineNumbers');
    if (!textarea || !lineNumEl) return;

    // Load initial draft or default sample
    const savedDraft = localStorage.getItem('bulk_import_draft');
    textarea.value = savedDraft && savedDraft.trim() ? savedDraft : DEFAULT_SAMPLE_FORMAT;

    updateLineNumbers();
    pushHistory(textarea.value);
    triggerReparse();

    textarea.addEventListener('input', () => {
      updateLineNumbers();
      scheduleAutoSave();
      triggerReparse();
    });

    textarea.addEventListener('scroll', () => {
      lineNumEl.scrollTop = textarea.scrollTop;
    });

    // Support tab indenting
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        updateLineNumbers();
        triggerReparse();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoHistory();
        else undoHistory();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redoHistory();
      }
    });
  }

  function updateLineNumbers() {
    const textarea = document.getElementById('bulkEditorTextarea');
    const lineNumEl = document.getElementById('bulkLineNumbers');
    if (!textarea || !lineNumEl) return;

    const lines = textarea.value.split('\n');
    const count = Math.max(lines.length, 1);

    // Get error line numbers set
    const errorLines = new Set((state.errors || []).map((e) => e.line));

    let html = '';
    for (let i = 1; i <= count; i++) {
      const isErr = errorLines.has(i);
      html += `<div class="bulk-line-number ${isErr ? 'has-error' : ''}" onclick="window.BulkModule.jumpToLine(${i})" title="${isErr ? 'Error on line ' + i : 'Line ' + i}">${i}</div>`;
    }
    lineNumEl.innerHTML = html;
    lineNumEl.scrollTop = textarea.scrollTop;
  }

  function jumpToLine(lineNum) {
    const textarea = document.getElementById('bulkEditorTextarea');
    if (!textarea) return;

    const lines = textarea.value.split('\n');
    let charCount = 0;

    for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
      charCount += lines[i].length + 1; // +1 for newline
    }

    textarea.focus();
    textarea.selectionStart = charCount;
    textarea.selectionEnd = charCount + (lines[lineNum - 1] ? lines[lineNum - 1].length : 0);

    // Scroll to position
    const lineHeight = 19.5;
    textarea.scrollTop = Math.max(0, (lineNum - 5) * lineHeight);
  }

  function scheduleAutoSave() {
    if (state.autoSaveTimer) clearTimeout(state.autoSaveTimer);
    const indicator = document.getElementById('bulkAutoSaveIndicator');
    if (indicator) indicator.textContent = 'Saving draft...';

    state.autoSaveTimer = setTimeout(() => {
      const textarea = document.getElementById('bulkEditorTextarea');
      if (textarea) {
        localStorage.setItem('bulk_import_draft', textarea.value);
        if (indicator) indicator.textContent = 'Draft auto-saved';
      }
    }, 1500);
  }

  function toggleWordWrap() {
    const textarea = document.getElementById('bulkEditorTextarea');
    const btn = document.getElementById('bulkWrapBtn');
    if (!textarea || !btn) return;

    state.wordWrap = !state.wordWrap;
    if (state.wordWrap) {
      textarea.classList.add('word-wrap');
      btn.classList.add('active');
    } else {
      textarea.classList.remove('word-wrap');
      btn.classList.remove('active');
    }
  }

  // History stack (Undo/Redo)
  function pushHistory(val) {
    if (state.historyStack[state.historyIndex] === val) return;
    state.historyStack = state.historyStack.slice(0, state.historyIndex + 1);
    state.historyStack.push(val);
    if (state.historyStack.length > 50) state.historyStack.shift();
    state.historyIndex = state.historyStack.length - 1;
  }

  function undoHistory() {
    if (state.historyIndex > 0) {
      state.historyIndex--;
      const val = state.historyStack[state.historyIndex];
      const textarea = document.getElementById('bulkEditorTextarea');
      if (textarea) {
        textarea.value = val;
        updateLineNumbers();
        triggerReparse();
      }
    }
  }

  function redoHistory() {
    if (state.historyIndex < state.historyStack.length - 1) {
      state.historyIndex++;
      const val = state.historyStack[state.historyIndex];
      const textarea = document.getElementById('bulkEditorTextarea');
      if (textarea) {
        textarea.value = val;
        updateLineNumbers();
        triggerReparse();
      }
    }
  }

  function clearEditor() {
    if (!confirm('Are you sure you want to clear the editor content?')) return;
    const textarea = document.getElementById('bulkEditorTextarea');
    if (textarea) {
      textarea.value = '';
      updateLineNumbers();
      triggerReparse();
    }
  }

  function restoreSample() {
    const textarea = document.getElementById('bulkEditorTextarea');
    if (textarea) {
      textarea.value = DEFAULT_SAMPLE_FORMAT;
      updateLineNumbers();
      triggerReparse();
    }
  }

  // ------------------------------------------------------------
  // 5. DEBOUNCED REPARSE & RENDER PIPELINE
  // ------------------------------------------------------------
  function triggerReparse() {
    if (state.debouncedParseTimer) clearTimeout(state.debouncedParseTimer);
    state.debouncedParseTimer = setTimeout(() => {
      runParsingAndRendering();
    }, 250);
  }

  function runParsingAndRendering() {
    const textarea = document.getElementById('bulkEditorTextarea');
    if (!textarea) return;

    state.rawText = textarea.value;

    // 1. Parse
    state.parsedQuestions = parseBulkText(state.rawText);

    // 2. Validate
    state.errors = validateQuestions(state.parsedQuestions);

    // 3. Duplicate Check against existing DB questions
    checkDuplicates(state.parsedQuestions, state.existingQuestions);

    // 4. Update Line numbers error highlight
    updateLineNumbers();

    // 5. Render Live Preview Cards
    renderPreviewCards();

    // 6. Render Error Panel
    renderErrorPanel();

    // 7. Render Import Summary & Stats
    renderSummaryBar();

    // 8. Update Concept Filter Dropdown
    updateConceptFilterDropdown();
  }

  // ------------------------------------------------------------
  // 6. PREVIEW RENDERER & QUESTION CARDS
  // ------------------------------------------------------------
  function renderPreviewCards() {
    const container = document.getElementById('bulkCardsContainer');
    if (!container) return;

    let filtered = state.parsedQuestions.filter((q) => {
      // Search
      if (state.filterSearch) {
        const term = state.filterSearch.toLowerCase();
        const text = (q.question + ' ' + q.concept + ' ' + q.optA + ' ' + q.optB + ' ' + q.optC + ' ' + q.optD + ' ' + q.solutionText).toLowerCase();
        if (!text.includes(term)) return false;
      }
      // Concept
      if (state.filterConcept && q.concept !== state.filterConcept) return false;
      // Difficulty
      if (state.filterDifficulty && q.difficulty.toLowerCase() !== state.filterDifficulty.toLowerCase()) return false;
      // Status
      if (state.filterStatus === 'valid' && !q.isValid) return false;
      if (state.filterStatus === 'invalid' && q.isValid) return false;
      // Duplicate
      if (state.filterDuplicate === 'duplicate' && !q.isDuplicate) return false;
      if (state.filterDuplicate === 'unique' && q.isDuplicate) return false;

      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state">No questions found ${state.parsedQuestions.length ? 'matching current filters' : 'in editor text. Paste LaTeX questions to begin.'}</div>`;
      return;
    }

    container.innerHTML = '';

    filtered.forEach((q, idx) => {
      const card = document.createElement('div');
      const cardClass = q.ignored
        ? 'ignored-card'
        : q.isDuplicate
        ? 'duplicate-card'
        : q.isValid
        ? 'valid-card'
        : 'invalid-card';

      card.className = `bulk-q-card ${cardClass}`;

      // Header row
      const topRow = document.createElement('div');
      topRow.className = 'bulk-card-top';

      const pillsRow = document.createElement('div');
      pillsRow.className = 'bulk-card-pills';

      const numBadge = document.createElement('span');
      numBadge.className = 'bulk-card-num-tag';
      numBadge.textContent = `#${idx + 1}`;

      const conceptPill = document.createElement('span');
      conceptPill.className = 'bulk-pill bulk-pill-concept';
      conceptPill.textContent = q.concept || 'General';

      const diffPill = document.createElement('span');
      const diffClass = (q.difficulty || 'Medium').toLowerCase();
      diffPill.className = `bulk-pill bulk-pill-${diffClass}`;
      diffPill.textContent = q.difficulty || 'Medium';

      const statusPill = document.createElement('span');
      statusPill.className = `bulk-pill ${q.isValid ? 'bulk-pill-status-valid' : 'bulk-pill-status-invalid'}`;
      statusPill.textContent = q.isValid ? '✓ Valid' : '✕ Invalid';

      pillsRow.appendChild(numBadge);
      pillsRow.appendChild(conceptPill);
      pillsRow.appendChild(diffPill);
      pillsRow.appendChild(statusPill);

      if (q.isDuplicate) {
        const dupPill = document.createElement('span');
        dupPill.className = 'bulk-pill bulk-pill-duplicate';
        dupPill.textContent = '⚠ Duplicate';
        pillsRow.appendChild(dupPill);
      }

      // Actions row (Checkbox, Expand, Edit, Delete, Ignore)
      const actionsRow = document.createElement('div');
      actionsRow.className = 'bulk-card-actions';

      actionsRow.innerHTML = `
        <label style="font-size:12px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;">
          <input type="checkbox" ${q.ignored ? '' : 'checked'} onchange="window.BulkModule.toggleIgnore(${state.parsedQuestions.indexOf(q)})" title="Include in import"> Select
        </label>
        <button class="bulk-tool-btn" onclick="window.BulkModule.toggleCardCollapse(${state.parsedQuestions.indexOf(q)})" title="Expand/Collapse">
          ${q.collapsed ? '▼' : '▲'}
        </button>
        <button class="bulk-tool-btn" onclick="window.BulkModule.openCardEditor(${state.parsedQuestions.indexOf(q)})" title="Edit Question">
          ✎
        </button>
        <button class="bulk-tool-btn" style="color:var(--danger);" onclick="window.BulkModule.deleteCard(${state.parsedQuestions.indexOf(q)})" title="Delete Question">
          ✕
        </button>
      `;

      topRow.appendChild(pillsRow);
      topRow.appendChild(actionsRow);
      card.appendChild(topRow);

      if (!q.collapsed) {
        // Question Body
        const qBody = document.createElement('div');
        qBody.className = 'bulk-card-qbody';
        qBody.appendChild(renderStaticPreviewNode(q.question || '(Empty question text)'));
        card.appendChild(qBody);

        // Options A-D
        const optsGrid = document.createElement('div');
        optsGrid.className = 'bulk-card-options';

        ['A', 'B', 'C', 'D'].forEach((letter) => {
          const optVal = q['opt' + letter] || '';
          const isCorrect = q.answer === letter;

          const optEl = document.createElement('div');
          optEl.className = `bulk-card-opt ${isCorrect ? 'is-correct' : ''}`;
          optEl.appendChild(document.createTextNode(`${letter}: `));
          optEl.appendChild(renderStaticPreviewNode(optVal));
          if (isCorrect) {
            const check = document.createElement('span');
            check.style.color = 'var(--ok)';
            check.style.marginLeft = '6px';
            check.textContent = '✓';
            optEl.appendChild(check);
          }
          optsGrid.appendChild(optEl);
        });

        card.appendChild(optsGrid);

        // Detailed Solution
        if (q.solutionText) {
          const solBox = document.createElement('div');
          solBox.className = 'bulk-card-solution';
          const solTitle = document.createElement('div');
          solTitle.className = 'bulk-card-sol-title';
          solTitle.textContent = 'Detailed Solution';
          solBox.appendChild(solTitle);
          solBox.appendChild(renderStaticPreviewNode(q.solutionText));
          card.appendChild(solBox);
        }

        // Duplicate Action Bar
        if (q.isDuplicate) {
          const dupBar = document.createElement('div');
          dupBar.className = 'bulk-dup-actions';
          dupBar.innerHTML = `
            <span class="bulk-dup-label">Duplicate Found in DB:</span>
            <select class="bulk-filter-select" style="padding:4px 24px 4px 8px;font-size:12px;" onchange="window.BulkModule.setDupAction(${state.parsedQuestions.indexOf(q)}, this.value)">
              <option value="skip" ${q.dupAction === 'skip' ? 'selected' : ''}>Skip (Do not import)</option>
              <option value="overwrite" ${q.dupAction === 'overwrite' ? 'selected' : ''}>Overwrite existing</option>
              <option value="keep_both" ${q.dupAction === 'keep_both' ? 'selected' : ''}>Keep both (Import as new)</option>
            </select>
          `;
          card.appendChild(dupBar);
        }
      }

      container.appendChild(card);
    });
  }

  function renderStaticPreviewNode(rawText) {
    if (typeof window.buildEquationFragment === 'function') {
      const span = document.createElement('span');
      span.className = 'li-preview';
      span.appendChild(window.buildEquationFragment(rawText || ''));
      return span;
    }
    const span = document.createElement('span');
    span.textContent = rawText || '';
    return span;
  }

  // ------------------------------------------------------------
  // 7. ERROR PANEL ENGINE
  // ------------------------------------------------------------
  function renderErrorPanel() {
    const panel = document.getElementById('bulkErrorCard');
    const listEl = document.getElementById('bulkErrorList');
    const countEl = document.getElementById('bulkErrorCount');
    if (!panel || !listEl) return;

    const totalErrors = state.errors.length;
    if (countEl) countEl.textContent = `${totalErrors} Issue${totalErrors === 1 ? '' : 's'} Found`;

    if (totalErrors === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'block';
    listEl.innerHTML = '';

    state.errors.forEach((err) => {
      const item = document.createElement('div');
      item.className = 'bulk-error-item';
      item.onclick = () => jumpToLine(err.line);

      item.innerHTML = `
        <span class="bulk-error-line">Line ${err.line}</span>
        <span class="bulk-error-msg">${escapeHtml(err.message)}</span>
      `;
      listEl.appendChild(item);
    });
  }

  // ------------------------------------------------------------
  // 8. IMPORT SUMMARY BAR
  // ------------------------------------------------------------
  function renderSummaryBar() {
    const totalEl = document.getElementById('bulkStatTotal');
    const validEl = document.getElementById('bulkStatValid');
    const invalidEl = document.getElementById('bulkStatInvalid');
    const dupEl = document.getElementById('bulkStatDup');
    const readyEl = document.getElementById('bulkStatReady');

    const total = state.parsedQuestions.length;
    const validCount = state.parsedQuestions.filter((q) => q.isValid).length;
    const invalidCount = state.parsedQuestions.filter((q) => !q.isValid).length;
    const dupCount = state.parsedQuestions.filter((q) => q.isDuplicate).length;

    const readyCount = state.parsedQuestions.filter((q) => {
      if (q.ignored || !q.isValid) return false;
      if (q.isDuplicate && q.dupAction === 'skip') return false;
      return true;
    }).length;

    if (totalEl) totalEl.textContent = total;
    if (validEl) validEl.textContent = validCount;
    if (invalidEl) invalidEl.textContent = invalidCount;
    if (dupEl) dupEl.textContent = dupCount;
    if (readyEl) readyEl.textContent = readyCount;

    const importBtn = document.getElementById('bulkImportBtn');
    if (importBtn) {
      importBtn.disabled = readyCount === 0;
    }
  }

  // ------------------------------------------------------------
  // 9. CARD INTERACTION HANDLERS
  // ------------------------------------------------------------
  function toggleCardCollapse(index) {
    if (state.parsedQuestions[index]) {
      state.parsedQuestions[index].collapsed = !state.parsedQuestions[index].collapsed;
      renderPreviewCards();
    }
  }

  function toggleIgnore(index) {
    if (state.parsedQuestions[index]) {
      state.parsedQuestions[index].ignored = !state.parsedQuestions[index].ignored;
      renderPreviewCards();
      renderSummaryBar();
    }
  }

  function deleteCard(index) {
    if (confirm('Delete this question from import list?')) {
      state.parsedQuestions.splice(index, 1);
      renderPreviewCards();
      renderErrorPanel();
      renderSummaryBar();
    }
  }

  function setDupAction(index, action) {
    if (state.parsedQuestions[index]) {
      state.parsedQuestions[index].dupAction = action;
      renderSummaryBar();
    }
  }

  function openCardEditor(index) {
    const q = state.parsedQuestions[index];
    if (!q) return;
    state.editingIndex = index;

    document.getElementById('bulkEditConcept').value = q.concept || '';
    document.getElementById('bulkEditDifficulty').value = q.difficulty || 'Medium';
    document.getElementById('bulkEditQuestion').value = q.question || '';
    document.getElementById('bulkEditOptA').value = q.optA || '';
    document.getElementById('bulkEditOptB').value = q.optB || '';
    document.getElementById('bulkEditOptC').value = q.optC || '';
    document.getElementById('bulkEditOptD').value = q.optD || '';
    document.getElementById('bulkEditAnswer').value = q.answer || 'A';
    document.getElementById('bulkEditSolution').value = q.solutionText || '';

    const modal = document.getElementById('bulkEditModal');
    if (modal) modal.classList.add('visible');
  }

  function closeCardEditor() {
    const modal = document.getElementById('bulkEditModal');
    if (modal) modal.classList.remove('visible');
    state.editingIndex = null;
  }

  function saveCardEditor() {
    if (state.editingIndex === null) return;
    const q = state.parsedQuestions[state.editingIndex];
    if (!q) return;

    q.concept = document.getElementById('bulkEditConcept').value.trim();
    q.difficulty = document.getElementById('bulkEditDifficulty').value;
    q.question = document.getElementById('bulkEditQuestion').value.trim();
    q.optA = document.getElementById('bulkEditOptA').value.trim();
    q.optB = document.getElementById('bulkEditOptB').value.trim();
    q.optC = document.getElementById('bulkEditOptC').value.trim();
    q.optD = document.getElementById('bulkEditOptD').value.trim();
    q.answer = document.getElementById('bulkEditAnswer').value;
    q.solutionText = document.getElementById('bulkEditSolution').value.trim();

    closeCardEditor();
    state.errors = validateQuestions(state.parsedQuestions);
    renderPreviewCards();
    renderErrorPanel();
    renderSummaryBar();
    if (typeof showToast === 'function') showToast('Question updated in preview.');
  }

  // ------------------------------------------------------------
  // 10. EXPORT & SEARCH ENGINE
  // ------------------------------------------------------------
  function updateConceptFilterDropdown() {
    const sel = document.getElementById('bulkFilterConcept');
    if (!sel) return;
    const current = sel.value;

    const concepts = Array.from(new Set(state.parsedQuestions.map((q) => q.concept).filter(Boolean)));
    sel.innerHTML = '<option value="">All Concepts</option>' + concepts.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (concepts.includes(current)) sel.value = current;
  }

  function exportQuestions(format) {
    const validQuestions = state.parsedQuestions.filter((q) => q.isValid && !q.ignored);
    if (!validQuestions.length) {
      if (typeof showToast === 'function') showToast('No valid questions to export.', true);
      return;
    }

    let fileContent = '';
    let fileName = `questions_export_${Date.now()}`;
    let mimeType = 'text/plain';

    if (format === 'json') {
      fileContent = JSON.stringify(validQuestions, null, 2);
      fileName += '.json';
      mimeType = 'application/json';
    } else if (format === 'txt') {
      let txt = '';
      let lastConcept = '';
      validQuestions.forEach((q) => {
        if (q.concept !== lastConcept) {
          txt += `@concept\n${q.concept}\n\n`;
          lastConcept = q.concept;
        }
        txt += `@question\n${q.question}\n\n`;
        txt += `@optionA\n${q.optA}\n\n`;
        txt += `@optionB\n${q.optB}\n\n`;
        txt += `@optionC\n${q.optC}\n\n`;
        txt += `@optionD\n${q.optD}\n\n`;
        txt += `@answer\n${q.answer}\n\n`;
        txt += `@solution\n${q.solutionText}\n\n`;
        txt += `@difficulty\n${q.difficulty}\n\n`;
        txt += `@end\n\n`;
      });
      fileContent = txt;
      fileName += '.txt';
    } else if (format === 'latex') {
      let latex = `\\documentclass{article}\n\\usepackage{amsmath,amssymb}\n\\begin{document}\n\n`;
      validQuestions.forEach((q, idx) => {
        latex += `\\section*{Question ${idx + 1} (${q.concept})}\n`;
        latex += `${q.question}\n\n`;
        latex += `\\begin{enumerate}[(A)]\n`;
        latex += `  \\item ${q.optA}\n  \\item ${q.optB}\n  \\item ${q.optC}\n  \\item ${q.optD}\n`;
        latex += `\\end{enumerate}\n\n`;
        latex += `\\textbf{Correct Answer:} ${q.answer}\\\\\n`;
        latex += `\\textbf{Solution:} ${q.solutionText}\n\n\\hrulefill\n\n`;
      });
      latex += `\\end{document}`;
      fileContent = latex;
      fileName += '.tex';
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast(`Exported ${validQuestions.length} questions as ${format.toUpperCase()}`);
  }

  // ------------------------------------------------------------
  // 11. BATCH DATABASE IMPORT EXECUTION
  // ------------------------------------------------------------
  async function executeBulkImport(selectedOnly = false) {
    if (typeof Auth !== 'undefined' && Auth.can && !Auth.can('edit')) {
      if (typeof showToast === 'function') showToast('You do not have permission to import questions.', true);
      return;
    }

    // Get top metadata
    const meta = {
      klass: getMetadataValue('klass'),
      subject: getMetadataValue('subject'),
      chapter: getMetadataValue('chapter'),
      topic: getMetadataValue('topic'),
      exams: getMetadataExams(),
      qType: getMetadataValue('qType') || 'mcq_single',
      difficulty: getMetadataValue('difficulty') || 'Medium',
      marks: getMetadataValue('marks') || '4',
      negMarks: getMetadataValue('negMarks') || '1',
      language: getMetadataValue('language') || 'English',
      source: getMetadataValue('source') || '',
      author: getMetadataValue('author') || '',
      referenceBook: getMetadataValue('referenceBook') || '',
      status: getMetadataValue('status') || 'Published',
      tags: getMetadataValue('tags') || '',
      year: getMetadataValue('year') || '',
      attemptLevel: getMetadataValue('attemptLevel') || '',
      board: getMetadataValue('board') || '',
    };

    if (!meta.subject || !meta.klass || !meta.chapter) {
      if (typeof showToast === 'function') showToast('Please select Subject, Class, and Chapter in Question Metadata first.', true);
      return;
    }

    // Filter ready questions
    const importList = state.parsedQuestions.filter((q) => {
      if (q.ignored) return false;
      if (!q.isValid) return false;
      if (q.isDuplicate && q.dupAction === 'skip') return false;
      return true;
    });

    if (!importList.length) {
      if (typeof showToast === 'function') showToast('No ready valid questions to import.', true);
      return;
    }

    if (!confirm(`Import ${importList.length} validated question(s) into the database?`)) return;

    const importBtn = document.getElementById('bulkImportBtn');
    if (importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = 'Importing...';
    }

    // Map each parsed question into backend JSON contract
    const payloadArray = importList.map((q) => {
      return {
        subject: meta.subject,
        klass: meta.klass,
        chapter: meta.chapter,
        topic: q.concept || meta.topic || 'General',
        exams: meta.exams,
        qType: meta.qType,
        question: q.question,
        optA: q.optA,
        optB: q.optB,
        optC: q.optC,
        optD: q.optD,
        assertion: '',
        reason: '',
        predefOptions: '',
        columnA: [],
        columnB: [],
        matchOptions: {},
        numAnswer: '',
        correctOption: q.answer,
        solutionText: q.solutionText,
        difficulty: q.difficulty || meta.difficulty,
        marks: meta.marks,
        negMarks: meta.negMarks,
        language: meta.language,
        source: meta.source,
        author: meta.author,
        referenceBook: meta.referenceBook,
        status: meta.status,
        tags: meta.tags,
        year: meta.year,
        attemptLevel: meta.attemptLevel,
        board: meta.board,
      };
    });

    try {
      const res = await apiReq('/api/questions/batch', {
        method: 'POST',
        body: JSON.stringify(payloadArray),
      });

      if (typeof showToast === 'function') {
        showToast(`Successfully imported ${res.count || payloadArray.length} questions!`);
      }

      // Refresh saved questions list in parent system
      if (typeof window.loadQuestions === 'function') {
        window.loadQuestions();
      }

      // Clear draft editor text after successful import
      const textarea = document.getElementById('bulkEditorTextarea');
      if (textarea) {
        textarea.value = '';
        localStorage.removeItem('bulk_import_draft');
        updateLineNumbers();
        triggerReparse();
      }
    } catch (err) {
      console.error('Bulk Import Error:', err);
      if (typeof showToast === 'function') {
        showToast('Bulk import failed: ' + err.message, true);
      }
    } finally {
      if (importBtn) {
        importBtn.disabled = false;
        importBtn.textContent = '⚡ Import All Validated Questions';
      }
    }
  }

  // ------------------------------------------------------------
  // 12. METADATA HELPERS
  // ------------------------------------------------------------
  function getMetadataValue(id) {
    const el = document.getElementById('bulkMeta_' + id);
    return el ? el.value.trim() : '';
  }

  function getMetadataExams() {
    const toggles = document.querySelectorAll('#bulkExamToggles .toggle-btn.active');
    const exams = [];
    toggles.forEach((t) => exams.push(t.textContent.trim()));
    return exams.length ? exams : ['NEET'];
  }

  const LOCAL_SUBJECTS = ["Physics","Chemistry","Biology","Maths"];
  const LOCAL_CLASSES  = ["11","12"];
  const LOCAL_EXAMS    = ["NEET","JEE","KCET"];
  const LOCAL_NCERT    = {
    "Physics-11":["Physical World","Units and Measurements","Motion in a Straight Line","Motion in a Plane","Laws of Motion","Work, Energy and Power","System of Particles and Rotational Motion","Gravitation","Mechanical Properties of Solids","Mechanical Properties of Fluids","Thermal Properties of Matter","Thermodynamics","Kinetic Theory","Oscillations","Waves"],
    "Physics-12":["Electric Charges and Fields","Electrostatic Potential and Capacitance","Current Electricity","Moving Charges and Magnetism","Magnetism and Matter","Electromagnetic Induction","Alternating Current","Electromagnetic Waves","Ray Optics and Optical Instruments","Wave Optics","Dual Nature of Radiation and Matter","Atoms","Nuclei","Semiconductor Electronics: Materials, Devices and Simple Circuits"],
    "Chemistry-11":["Some Basic Concepts of Chemistry","Structure of Atom","Classification of Elements and Periodicity in Properties","Chemical Bonding and Molecular Structure","Thermodynamics","Equilibrium","Redox Reactions","Organic Chemistry: Some Basic Principles and Techniques","Hydrocarbons"],
    "Chemistry-12":["Solutions","Electrochemistry","Chemical Kinetics","d- and f-Block Elements","Coordination Compounds","Haloalkanes and Haloarenes","Alcohols, Phenols and Ethers","Aldehydes, Ketones and Carboxylic Acids","Amines","Biomolecules"],
    "Biology-11":["The Living World","Biological Classification","Plant Kingdom","Animal Kingdom","Morphology of Flowering Plants","Anatomy of Flowering Plants","Structural Organisation in Animals","Cell: The Unit of Life","Biomolecules","Cell Cycle and Cell Division","Transport in Plants","Mineral Nutrition","Photosynthesis in Higher Plants","Respiration in Plants","Plant Growth and Development","Digestion and Absorption","Breathing and Exchange of Gases","Body Fluids and Circulation","Excretory Products and their Elimination","Locomotion and Movement","Neural Control and Coordination","Chemical Coordination and Integration"],
    "Biology-12":["Sexual Reproduction in Flowering Plants","Human Reproduction","Reproductive Health","Principles of Inheritance and Variation","Molecular Basis of Inheritance","Evolution","Human Health and Disease","Microbes in Human Welfare","Biotechnology: Principles and Processes","Biotechnology and its Applications","Organisms and Populations","Ecosystem","Biodiversity and Conservation"],
    "Maths-11":["Sets","Relations and Functions","Trigonometric Functions","Principle of Mathematical Induction","Complex Numbers and Quadratic Equations","Linear Inequalities","Permutations and Combinations","Binomial Theorem","Sequences and Series","Straight Lines","Conic Sections","Introduction to Three Dimensional Geometry","Limits and Derivatives","Statistics","Probability"],
    "Maths-12":["Relations and Functions","Inverse Trigonometric Functions","Matrices","Determinants","Continuity and Differentiability","Application of Derivatives","Integrals","Application of Integrals","Differential Equations","Vector Algebra","Three Dimensional Geometry","Linear Programming","Probability"]
  };

  function fillSelectLocal(sel, items, placeholder) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${placeholder}</option>` + items.map(i => `<option value="${i}">${i}</option>`).join('');
  }

  function initMetadataSelects() {
    const subjSel = document.getElementById('bulkMeta_subject');
    const klassSel = document.getElementById('bulkMeta_klass');
    const chapSel = document.getElementById('bulkMeta_chapter');

    if (!subjSel || !klassSel || !chapSel) return;

    const subjects = (typeof window.SUBJECTS !== 'undefined') ? window.SUBJECTS : LOCAL_SUBJECTS;
    const classes = (typeof window.CLASSES !== 'undefined') ? window.CLASSES : LOCAL_CLASSES;
    const ncert = (typeof window.NCERT_CHAPTERS !== 'undefined') ? window.NCERT_CHAPTERS : LOCAL_NCERT;
    const exams = (typeof window.EXAMS !== 'undefined') ? window.EXAMS : LOCAL_EXAMS;
    const fillFn = (typeof window.fillSelect === 'function') ? window.fillSelect : fillSelectLocal;

    fillFn(subjSel, subjects, 'Select Subject');
    fillFn(klassSel, classes, 'Select Class');

    function syncChapters() {
      const key = subjSel.value + '-' + klassSel.value;
      const chapters = ncert[key];
      if (chapters && chapters.length) {
        fillFn(chapSel, chapters, 'Select Chapter');
        chapSel.disabled = false;
      } else {
        chapSel.innerHTML = '<option value="">Select Subject &amp; Class first</option>';
        chapSel.disabled = true;
      }
    }

    subjSel.removeEventListener('change', syncChapters);
    klassSel.removeEventListener('change', syncChapters);
    subjSel.addEventListener('change', syncChapters);
    klassSel.addEventListener('change', syncChapters);

    // Exam toggles
    const examBox = document.getElementById('bulkExamToggles');
    if (examBox) {
      examBox.innerHTML = '';
      exams.forEach((ex) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toggle-btn' + (ex === 'NEET' ? ' active' : '');
        btn.textContent = ex;
        btn.onclick = () => btn.classList.toggle('active');
        examBox.appendChild(btn);
      });
    }
  }

  // Fetch existing DB questions for duplicate detection
  async function fetchExistingQuestions() {
    try {
      const res = await apiReq('/api/questions');
      state.existingQuestions = res || [];
    } catch (_) {
      state.existingQuestions = [];
    }
  }

  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ------------------------------------------------------------
  // 13. INITIALIZATION
  // ------------------------------------------------------------
  function init() {
    initMetadataSelects();
    initEditor();
    fetchExistingQuestions();

    // Event listeners for filter controls
    const searchInput = document.getElementById('bulkSearchInput');
    const conceptFilter = document.getElementById('bulkFilterConcept');
    const diffFilter = document.getElementById('bulkFilterDiff');
    const statusFilter = document.getElementById('bulkFilterStatus');
    const dupFilter = document.getElementById('bulkFilterDup');

    if (searchInput) searchInput.addEventListener('input', (e) => { state.filterSearch = e.target.value; renderPreviewCards(); });
    if (conceptFilter) conceptFilter.addEventListener('change', (e) => { state.filterConcept = e.target.value; renderPreviewCards(); });
    if (diffFilter) diffFilter.addEventListener('change', (e) => { state.filterDifficulty = e.target.value; renderPreviewCards(); });
    if (statusFilter) statusFilter.addEventListener('change', (e) => { state.filterStatus = e.target.value; renderPreviewCards(); });
    if (dupFilter) dupFilter.addEventListener('change', (e) => { state.filterDuplicate = e.target.value; renderPreviewCards(); });
  }

  // Export module API to global scope
  window.BulkModule = {
    init,
    jumpToLine,
    toggleWordWrap,
    undoHistory,
    redoHistory,
    clearEditor,
    restoreSample,
    toggleCardCollapse,
    toggleIgnore,
    deleteCard,
    setDupAction,
    openCardEditor,
    closeCardEditor,
    saveCardEditor,
    exportQuestions,
    executeBulkImport,
    runParsingAndRendering,
  };
})();
