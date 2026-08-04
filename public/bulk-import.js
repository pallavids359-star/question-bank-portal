/* ================================================================
   BULK QUESTION IMPORT MODULE v3 (MODULAR PIPELINE ARCHITECTURE)
   ================================================================ */

(function () {
  'use strict';

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

  function getMeta() {
    const sEl =
      document.getElementById('bqMetaSubject') ||
      document.getElementById('subject');

    const kEl =
      document.getElementById('bqMetaClass') ||
      document.getElementById('klass');

    const cEl =
      document.getElementById('bqMetaChapter') ||
      document.getElementById('chapter');

    const eEl =
      document.getElementById('bqMetaExam');

    return {
      subject:
        sEl && sEl.value
          ? sEl.value.trim()
          : 'Physics',

      klass:
        kEl && kEl.value
          ? kEl.value.trim()
          : '11',

      chapter:
        cEl && cEl.value
          ? cEl.value.trim()
          : 'General',

      exams:
        eEl && eEl.value
          ? [eEl.value.trim()]
          : ['NEET'],

      language:
        val('bqMetaLanguage') ||
        'English',

      source:
        val('bqMetaSource') ||
        '',

      referenceBook:
        val('bqMetaRefBook') ||
        '',

      author:
        val('bqMetaAuthor') ||
        '',

      defaultMarks:
        val('bqMetaMarks') ||
        '4',

      negMarks:
        val('bqMetaNegMarks') ||
        '1',

      defaultDiff:
        val('bqMetaDiff') ||
        'Medium',
    };
  }

  function val(id) {
    const element =
      document.getElementById(id);

    return element
      ? element.value.trim()
      : '';
  }

  const QTYPE_LABELS = {
    mcq_single:
      'Standard MCQ',

    mcq_multiple:
      'Multiple Correct',

    statement_based:
      'Statement Based',

    assertion_reason:
      'Assertion Reason',

    match:
      'Match the Following',

    matrix:
      'Matrix Match',

    numerical:
      'Numerical / Float',

    integer:
      'Integer Type',

    true_false:
      'True / False',

    case_study:
      'Case Study / Passage',

    paragraph:
      'Paragraph Based',

    comprehension:
      'Comprehension',

    diagram:
      'Diagram Based',

    image:
      'Image Based',

    table:
      'Table Based',

    graph:
      'Graph Based',

    sequence:
      'Sequence Based',

    reasoning:
      'Reasoning Based',

    data_interpretation:
      'Data Interpretation',

    fill_blank:
      'Fill in the Blank',

    multi_part:
      'Multi-Part Question',
  };

  const OPT_PATTERNS = [
    /^\s*\(([A-Da-d1-4])\)\s+/,
    /^\s*([A-Da-d])[.\):]\s+/,
    /^\s*([a-d])\s*[\)\.]\s+/,
    /^\s*\[([A-Da-d1-4])\]\s+/,
    /^\s*Option\s+([A-Da-d1-4])\s*[:\.]\s*/i,
  ];

  function detectOptionKey(
    line,
    isFirstLine = false
  ) {
    if (isFirstLine) {
      return null;
    }

    for (const pattern of OPT_PATTERNS) {
      const match =
        line.match(pattern);

      if (match) {
        let key =
          match[1].toUpperCase();

        if (key === '1') {
          key = 'A';
        } else if (key === '2') {
          key = 'B';
        } else if (key === '3') {
          key = 'C';
        } else if (key === '4') {
          key = 'D';
        }

        return key;
      }
    }

    return null;
  }

  function stripOptionPrefix(line) {
    for (const pattern of OPT_PATTERNS) {
      if (pattern.test(line)) {
        return line
          .replace(pattern, '')
          .trim();
      }
    }

    return line.trim();
  }

  const Q_START_PATTERNS = [
    /^\s*(?:Q|Question|Que|Problem|Item)\s*#?\s*(\d{1,4})?\s*[:\.]?\s*/i,
    /^\s*@question\s*[:\.]?\s*/i,
  ];

  function looksLikeQStart(line) {
    return Q_START_PATTERNS.some(
      (pattern) =>
        pattern.test(line)
    );
  }

  function stripQNumber(line) {
    for (
      const pattern
      of Q_START_PATTERNS
    ) {
      const match =
        line.match(pattern);

      if (match) {
        return line
          .replace(pattern, '')
          .trim();
      }
    }

    return line.trim();
  }

  const ANS_PATTERNS = [
    /^\s*(?:Answer|Ans|Correct\s*Answer|Correct\s*Option|Ans\.:?)\s*[:\.\-]?\s*/i,
  ];

  const SOL_PATTERNS = [
    /^\s*(?:Solution|Detailed\s*Solution|Explanation|Reason|Working|Answer\s*Explanation|Sol\.|Expl\.)\s*[:\.\-]?/i,
  ];

  const IGNORE_PATTERNS = [
    /^\s*Page\s+\d+\s*of\s*\d+/i,
    /^\s*\d+\s*$/,
    /^\s*Coaching\s+Institute\s+Question\s+Bank/i,
  ];

  function shouldIgnoreLine(line) {
    return IGNORE_PATTERNS.some(
      (pattern) =>
        pattern.test(line)
    );
  }

  function isAnsLine(line) {
    return ANS_PATTERNS.some(
      (pattern) =>
        pattern.test(line)
    );
  }

  function isSolLine(line) {
    return SOL_PATTERNS.some(
      (pattern) =>
        pattern.test(line)
    );
  }

  function stripAnsPrefix(line) {
    for (
      const pattern
      of ANS_PATTERNS
    ) {
      if (pattern.test(line)) {
        return line
          .replace(pattern, '')
          .trim();
      }
    }

    return line.trim();
  }

  function stripSolPrefix(line) {
    for (
      const pattern
      of SOL_PATTERNS
    ) {
      if (pattern.test(line)) {
        return line
          .replace(pattern, '')
          .trim();
      }
    }

    return line.trim();
  }

  function extractInlineMetadata(lines) {
    const metadata = {
      concept: null,
      type: null,
      difficulty: null,
      subject: null,
      chapter: null,
      klass: null,
      cleanLines: [],
    };

    const tagPatterns = [
      {
        key: 'concept',
        regex:
          /^\s*(?:@concept|@topic|concept|topic|sub-topic)\s*[:=]\s*(.+)/i,
      },
      {
        key: 'type',
        regex:
          /^\s*(?:@type|@qtype|type|question\s*type)\s*[:=]\s*(.+)/i,
      },
      {
        key: 'difficulty',
        regex:
          /^\s*(?:@difficulty|@level|difficulty|level)\s*[:=]\s*(.+)/i,
      },
      {
        key: 'subject',
        regex:
          /^\s*(?:@subject|subject)\s*[:=]\s*(.+)/i,
      },
      {
        key: 'chapter',
        regex:
          /^\s*(?:@chapter|chapter)\s*[:=]\s*(.+)/i,
      },
      {
        key: 'klass',
        regex:
          /^\s*(?:@class|@klass|class|grade)\s*[:=]\s*(.+)/i,
      },
    ];

    for (const item of lines) {
      const text =
        typeof item === 'string'
          ? item
          : item.text;

      let isTag = false;

      for (
        const {
          key,
          regex,
        } of tagPatterns
      ) {
        const match =
          text.match(regex);

        if (match) {
          metadata[key] =
            match[1].trim();

          isTag = true;
          break;
        }
      }

      if (!isTag) {
        metadata.cleanLines.push(
          item
        );
      }
    }

    return metadata;
  }

  const CHAPTER_CONCEPTS_MAP = {
    'Alternating Current': [
      'lcr circuit',
      'phasor',
      'impedance',
      'reactance',
      'inductor',
      'capacitor',
      'rms voltage',
      'resonance',
      'peak voltage',
      'power factor',
      'transformer',
      'ac generator',
    ],

    Electrostatics: [
      'coulomb law',
      'electric field',
      'potential difference',
      'capacitor',
      'gauss law',
      'electric charge',
      'electric dipole',
      'equipotential',
    ],

    Kinematics: [
      'velocity',
      'acceleration',
      'displacement',
      'projectile motion',
      'relative motion',
      'speed',
      'distance',
      'v-t graph',
      'x-t graph',
    ],

    'Laws of Motion': [
      'newtons laws',
      'friction',
      'tension',
      'inertia',
      'impulse',
      'momentum',
      'pulley system',
      'free body diagram',
    ],

    Thermodynamics: [
      'entropy',
      'enthalpy',
      'gibbs free energy',
      'hess law',
      'internal energy',
      'spontaneous process',
      'first law',
      'second law',
      'heat capacity',
      'calorimetry',
    ],

    'Periodic Classification': [
      'electronegativity',
      'ionization energy',
      'atomic radius',
      'electron affinity',
      'pauling scale',
      'mendeleev',
      'modern periodic law',
      's-block',
      'p-block',
      'd-block',
      'f-block',
      'periodicity',
      'valency',
      'effective nuclear charge',
      'shielding effect',
    ],

    'Chemical Bonding': [
      'hybridization',
      'vsepr',
      'dipole moment',
      'bond order',
      'molecular orbital theory',
      'mot',
      'resonance',
      'lewis structure',
      'covalent bond',
      'ionic bond',
      'hydrogen bonding',
      'lattice energy',
      'diamagnetic',
      'paramagnetic',
    ],

    'Atomic Structure': [
      'orbitals',
      'quantum numbers',
      'schrodinger equation',
      'bohr model',
      'de broglie',
      'heisenberg uncertainty',
      'photoelectric effect',
      'spectrum',
      'rydberg constant',
    ],

    'Cell Biology': [
      'mitosis',
      'meiosis',
      'cell cycle',
      'organelles',
      'cell membrane',
      'nucleus',
      'mitochondria',
      'ribosome',
      'endoplasmic reticulum',
    ],

    Genetics: [
      'mendelian genetics',
      'dna',
      'rna',
      'replication',
      'transcription',
      'translation',
      'alleles',
      'genes',
      'chromosomes',
      'pedigree analysis',
    ],

    Calculus: [
      'derivatives',
      'integrals',
      'limits',
      'continuity',
      'differential equations',
      'rate of change',
      'maxima and minima',
    ],
  };

  function detectConcept(
    questionText,
    selectedChapter,
    inlineConcept
  ) {
    if (inlineConcept) {
      return {
        concept:
          inlineConcept,
        confidence:
          100,
      };
    }

    const text =
      questionText.toLowerCase();

    if (
      selectedChapter &&
      selectedChapter !== 'General' &&
      CHAPTER_CONCEPTS_MAP[selectedChapter]
    ) {
      const keywords =
        CHAPTER_CONCEPTS_MAP[
          selectedChapter
        ];

      const matches =
        keywords.filter(
          (keyword) =>
            text.includes(keyword)
        );

      if (matches.length > 0) {
        const best =
          matches[0]
            .split(' ')
            .map(
              (word) =>
                word
                  .charAt(0)
                  .toUpperCase() +
                word.slice(1)
            )
            .join(' ');

        return {
          concept: best,
          confidence:
            Math.min(
              95,
              75 +
                matches.length * 5
            ),
        };
      }

      return {
        concept:
          selectedChapter,
        confidence:
          70,
      };
    }

    for (
      const [
        chapter,
        keywords,
      ] of Object.entries(
        CHAPTER_CONCEPTS_MAP
      )
    ) {
      const matches =
        keywords.filter(
          (keyword) =>
            text.includes(keyword)
        );

      if (matches.length > 0) {
        const best =
          matches[0]
            .split(' ')
            .map(
              (word) =>
                word
                  .charAt(0)
                  .toUpperCase() +
                word.slice(1)
            )
            .join(' ');

        return {
          concept: best,
          confidence:
            Math.min(
              95,
              70 +
                matches.length * 5
            ),
        };
      }
    }

    return {
      concept:
        selectedChapter &&
        selectedChapter !== 'General'
          ? selectedChapter
          : 'General Concept',

      confidence:
        60,
    };
  }

  function detectDifficulty(
    questionText,
    options,
    solution,
    inlineDifficulty
  ) {
    if (inlineDifficulty) {
      const formatted =
        inlineDifficulty
          .charAt(0)
          .toUpperCase() +
        inlineDifficulty
          .slice(1)
          .toLowerCase();

      if (
        [
          'Easy',
          'Medium',
          'Hard',
        ].includes(formatted)
      ) {
        return formatted;
      }
    }

    let score = 0;

    const combined =
      (
        questionText +
        ' ' +
        (solution || '')
      ).toLowerCase();

    if (
      questionText.length > 350
    ) {
      score += 2;
    } else if (
      questionText.length > 180
    ) {
      score += 1;
    }

    if (
      /calculate|determine|evaluate|find the value|derived/.test(
        combined
      )
    ) {
      score += 1;
    }

    if (
      /\\frac|\\int|\\sum|\\sqrt|\\matrix/.test(
        combined
      )
    ) {
      score += 1;
    }

    if (
      Object.keys(
        options || {}
      ).length === 0
    ) {
      score += 1;
    }

    if (
      (solution || '').length >
      250
    ) {
      score += 1;
    }

    if (score >= 4) {
      return 'Hard';
    }

    if (score >= 2) {
      return 'Medium';
    }

    return 'Easy';
  }
    // ================================================================
  // STAGE 1: QUESTION BOUNDARY DETECTION
  // ================================================================

  function blockHasQuestionBody(block) {
    if (
      !block ||
      !block.lines ||
      block.lines.length === 0
    ) {
      return false;
    }

    const hasAnsOrSol =
      block.lines.some(
        (line) =>
          isAnsLine(line.text) ||
          isSolLine(line.text)
      );

    if (hasAnsOrSol) {
      return true;
    }

    const hasOptions =
      block.lines.some(
        (line, index) =>
          detectOptionKey(
            line.text,
            index === 0
          )
      );

    if (hasOptions) {
      return true;
    }

    const nonTagLines =
      block.lines.filter((line) => {
        const text =
          line.text.trim();

        if (
          /^\s*(?:@chapter|chapter|unit|@topic|topic|@concept|concept|sub-topic|@type|@qtype|type|question\s*type|@subject|subject|@class|@klass|class|grade|@difficulty|@level|difficulty|level)\s*[:=]/i.test(
            text
          )
        ) {
          return false;
        }

        if (
          /^\s*(?:Question|Q|Que|Problem|Item)\s*[:\.]?\s*$/i.test(
            text
          )
        ) {
          return false;
        }

        return true;
      });

    return nonTagLines.length > 0;
  }

  function splitIntoRawBlocks(rawText) {
    const lines =
      rawText.split('\n');

    const blocks = [];

    let currentBlock = null;
    let inColumnSection = false;
    let inAnswerOrSolution = false;

    function isDelimiterLine(line) {
      return /^\s*(?:-{3,}|={3,}|_{3,}|\*{3,}|#{3,})\s*$/.test(
        line
      );
    }

    function isBlockStartHeader(line) {
      if (
        /^\s*(?:@topic|topic|@concept|concept|sub-topic)\s*[:=]/i.test(
          line
        )
      ) {
        return true;
      }

      if (
        /^\s*(?:@type|@qtype|type|question\s*type)\s*[:=]/i.test(
          line
        )
      ) {
        return true;
      }

      if (
        /^\s*(?:@subject|subject|@class|@klass|class|grade|@chapter|chapter)\s*[:=]/i.test(
          line
        )
      ) {
        return true;
      }

      if (
        /^\s*@question\b/i.test(
          line
        )
      ) {
        return true;
      }

      if (
        /^\s*(?:Q|Question|Que|Problem|Item)\s*#?\s*\d{1,4}\b/i.test(
          line
        )
      ) {
        return true;
      }

      if (
        /^\s*\d{1,4}\s*[\.:\)]\s+/i.test(
          line
        )
      ) {
        return true;
      }

      return false;
    }

    for (
      let index = 0;
      index < lines.length;
      index++
    ) {
      const trimmed =
        lines[index].trim();

      if (!trimmed) {
        continue;
      }

      if (
        isDelimiterLine(trimmed)
      ) {
        if (
          currentBlock &&
          currentBlock.lines.length > 0
        ) {
          blocks.push(
            currentBlock
          );

          currentBlock = null;
        }

        inColumnSection = false;
        inAnswerOrSolution = false;
        continue;
      }

      if (
        shouldIgnoreLine(trimmed)
      ) {
        continue;
      }

      if (
        /\b(Column|List)\s+(I{1,3}|[1234AB])\b/i.test(
          trimmed
        )
      ) {
        inColumnSection = true;
      }

      if (
        isAnsLine(trimmed) ||
        isSolLine(trimmed)
      ) {
        inAnswerOrSolution = true;
        inColumnSection = false;
      }

      let isNewQuestion = false;

      if (!currentBlock) {
        isNewQuestion = true;
      } else {
        const isHeader =
          isBlockStartHeader(
            trimmed
          );

        if (isHeader) {
          const isNumberedItem =
            /^\s*\d{1,4}\s*[\.:\)]\s+/i.test(
              trimmed
            );

          if (
            isNumberedItem &&
            inColumnSection &&
            !inAnswerOrSolution
          ) {
            isNewQuestion = false;
          } else {
            isNewQuestion =
              blockHasQuestionBody(
                currentBlock
              );
          }
        } else if (
          /^\s*(?:Question|Q|Que|Problem|Item)\s*[:\.]?\s*$/i.test(
            trimmed
          )
        ) {
          const hasAnswerOrSolution =
            inAnswerOrSolution ||
            currentBlock.lines.some(
              (line) =>
                isAnsLine(line.text) ||
                isSolLine(line.text)
            );

          const hasOptions =
            currentBlock.lines.some(
              (line, itemIndex) =>
                detectOptionKey(
                  line.text,
                  itemIndex === 0
                )
            );

          if (
            hasAnswerOrSolution ||
            hasOptions
          ) {
            isNewQuestion = true;
          }
        }
      }

      if (isNewQuestion) {
        if (
          currentBlock &&
          currentBlock.lines.length > 0
        ) {
          blocks.push(
            currentBlock
          );
        }

        currentBlock = {
          lines: [
            {
              text: trimmed,
              lineNumber:
                index + 1,
            },
          ],
          startLine:
            index + 1,
        };

        inColumnSection = false;
        inAnswerOrSolution = false;
      } else {
        currentBlock.lines.push({
          text: trimmed,
          lineNumber:
            index + 1,
        });
      }
    }

    if (
      currentBlock &&
      currentBlock.lines.length > 0
    ) {
      blocks.push(
        currentBlock
      );
    }

    return blocks;
  }

  // ================================================================
  // STAGE 2: QUESTION TYPE DETECTION
  // ================================================================

  function detectBlockType(block) {
    const rawLines =
      block.lines.map(
        (line) =>
          line.text
      );

    const inline =
      extractInlineMetadata(
        rawLines
      );

    if (inline.type) {
      const rawType =
        inline.type
          .toLowerCase()
          .replace(
            /[^a-z0-9]/g,
            '_'
          )
          .replace(
            /_+/g,
            '_'
          )
          .replace(
            /^_+|_+$/g,
            ''
          );

      const typeMap = {
        mcq:
          'mcq_single',
        mcq_single:
          'mcq_single',
        single_correct:
          'mcq_single',
        standard_mcq:
          'mcq_single',
        mcq_single_correct:
          'mcq_single',
        single:
          'mcq_single',

        mcq_multiple:
          'mcq_multiple',
        multiple_correct:
          'mcq_multiple',
        mcq_multiple_correct:
          'mcq_multiple',
        multiple:
          'mcq_multiple',

        matrix:
          'matrix',
        matrix_match:
          'matrix',
        matrix_match_question:
          'matrix',

        match:
          'match',
        match_following:
          'match',
        match_the_following:
          'match',
        matching:
          'match',

        assertion_reason:
          'assertion_reason',
        assertion_and_reason:
          'assertion_reason',
        assertion_reason_question:
          'assertion_reason',
        assertion:
          'assertion_reason',

        statement_based:
          'statement_based',
        statement_based_question:
          'statement_based',
        statement:
          'statement_based',

        numerical:
          'numerical',
        numerical_integer_type:
          'numerical',
        numerical_type:
          'numerical',
        float:
          'numerical',

        integer:
          'integer',
        integer_type:
          'integer',
        integer_question:
          'integer',

        true_false:
          'true_false',
        true_or_false:
          'true_false',
        tf:
          'true_false',

        case_study:
          'case_study',
        case_study_passage:
          'case_study',
        passage:
          'case_study',
        comprehension:
          'case_study',

        diagram:
          'diagram',
        diagram_based:
          'diagram',
        diagram_based_question:
          'diagram',

        graph:
          'graph',
        graph_based:
          'graph',

        table:
          'table',
      };

      if (typeMap[rawType]) {
        return typeMap[rawType];
      }
    }

    const text =
      block.lines
        .map(
          (line) =>
            line.text
        )
        .join('\n');

    if (
      /\b(column|list)\s+(?:I|A)\b/i.test(
        text
      ) &&
      /\b(column|list)\s+(?:II|B)\b/i.test(
        text
      ) &&
      (
        /\b[A-D]\s*(?:→|->|=>|-|:)\s*[1-4P-S]/i.test(
          text
        ) ||
        /matrix\s+match/i.test(
          text
        )
      )
    ) {
      return 'matrix';
    }

    if (
      /\b(column|list)\s+(?:I|A)\b/i.test(
        text
      ) &&
      /\b(column|list)\s+(?:II|B)\b/i.test(
        text
      )
    ) {
      return 'match';
    }

    if (
      /\b(assertion|reason)\b.*\b(assertion|reason)\b/is.test(
        text
      ) ||
      /^A:\s*Assertion/i.test(
        text
      ) ||
      /\bassertion\s*\([aA]\)/i.test(
        text
      )
    ) {
      return 'assertion_reason';
    }

    if (
      /\bstatement\s+(i|ii|1|2)\b/i.test(
        text
      )
    ) {
      return 'statement_based';
    }

    if (
      /\b(case\s+study|read\s+the\s+following\s+passage|comprehension|passage\s+based)\b/i.test(
        text
      )
    ) {
      return 'case_study';
    }

    if (
      /\btrue\b.*\bfalse\b/i.test(
        text
      ) ||
      block.lines.some(
        (line) =>
          /^\s*(?:Ans|Answer)?\s*[:\.-]?\s*(True|False)\s*$/i.test(
            line.text
          )
      )
    ) {
      return 'true_false';
    }

    if (
      /more\s+than\s+one\s+correct|multiple\s+correct/i.test(
        text
      ) ||
      /\bAns(?:wer)?\s*[:\.-]?\s*\(?[A-D]\s*[,;\s]\s*[A-D]\b/i.test(
        text
      )
    ) {
      return 'mcq_multiple';
    }

    if (
      /\b(diagram|circuit|figure|refer\s+to\s+the\s+image)\b/i.test(
        text
      ) ||
      /\{\{IMG::/i.test(
        text
      )
    ) {
      return 'diagram';
    }

    if (
      /\b(graph|curve|plot|v-t\s+graph|p-v\s+diagram)\b/i.test(
        text
      )
    ) {
      return 'graph';
    }

    if (
      /\|.*\|.*\|/.test(
        text
      ) ||
      /\btable\b/i.test(
        text
      )
    ) {
      return 'table';
    }

    const hasOptions =
      block.lines.some(
        (line, index) =>
          detectOptionKey(
            line.text,
            index === 0
          )
      );

    if (!hasOptions) {
      const hasNumericAnswer =
        block.lines.some(
          (line) =>
            isAnsLine(
              line.text
            ) &&
            /[-+]?\d+/.test(
              line.text
            )
        );

      if (
        hasNumericAnswer ||
        /\b(numerical|integer|find\s+the\s+value|calculate)\b/i.test(
          text
        )
      ) {
        const answerLine =
          block.lines.find(
            (line) =>
              isAnsLine(
                line.text
              )
          );

        const rawAnswer =
          answerLine
            ? stripAnsPrefix(
                answerLine.text
              )
            : '';

        return /^\d+$/.test(
          rawAnswer.trim()
        )
          ? 'integer'
          : 'numerical';
      }
    }

    return 'mcq_single';
  }

  // ================================================================
  // STAGE 3: MODULAR PARSERS
  // ================================================================

  class BaseQuestionParser {
    createBaseObject(
      block,
      metadata,
      overrides = {}
    ) {
      const inline =
        extractInlineMetadata(
          block.lines
        );

      const questionText =
        overrides.question ||
        '';

      const solutionText =
        overrides.solutionText ||
        '';

      const options =
        overrides.options ||
        {};

      const finalSubject =
        inline.subject ||
        overrides.subject ||
        metadata.subject;

      const finalClass =
        inline.klass ||
        overrides.klass ||
        metadata.klass;

      const finalChapter =
        inline.chapter ||
        overrides.chapter ||
        metadata.chapter;

      const {
        concept,
        confidence,
      } = detectConcept(
        questionText,
        finalChapter,
        inline.concept
      );

      const difficulty =
        detectDifficulty(
          questionText,
          options,
          solutionText,
          inline.difficulty ||
            overrides.difficulty
        );

      return {
        subject:
          finalSubject,

        klass:
          finalClass,

        chapter:
          finalChapter,

        topic:
          concept,

        exams:
          metadata.exams,

        language:
          metadata.language,

        source:
          metadata.source,

        referenceBook:
          metadata.referenceBook,

        author:
          metadata.author,

        marks:
          metadata.defaultMarks,

        negMarks:
          metadata.negMarks,

        difficulty,

        qType:
          inline.type
            ? detectBlockType(block)
            : (
                overrides.qType ||
                'mcq_single'
              ),

        question:
          questionText,

        optA:
          overrides.optA ||
          options.A ||
          '',

        optB:
          overrides.optB ||
          options.B ||
          '',

        optC:
          overrides.optC ||
          options.C ||
          '',

        optD:
          overrides.optD ||
          options.D ||
          '',

        answer:
          overrides.answer ||
          '',

        answers:
          overrides.answers ||
          null,

        matrixAnswer:
          overrides.matrixAnswer ||
          null,

        matchOptions:
          overrides.matchOptions ||
          null,

        columnA:
          overrides.columnA ||
          null,

        columnB:
          overrides.columnB ||
          null,

        assertion:
          overrides.assertion ||
          '',

        reason:
          overrides.reason ||
          '',

        statement1:
          overrides.statement1 ||
          '',

        statement2:
          overrides.statement2 ||
          '',

        numAnswer:
          overrides.numAnswer ||
          '',

        solutionText,

        concept,

        confidenceScore:
          confidence,

        startLine:
          block.startLine,

        errors: [],
        isValid: true,
        isDuplicate: false,
        ignored: false,
        dupAction: 'skip',
        collapsed: false,
      };
    }

    parseStandard(
      block,
      metadata
    ) {
      const inline =
        extractInlineMetadata(
          block.lines
        );

      const lines =
        inline.cleanLines;

      const questionLines = [];
      const solutionLines = [];
      const options = {};

      let answer = '';
      let mode = 'question';

      for (
        let index = 0;
        index < lines.length;
        index++
      ) {
        let line =
          (
            typeof lines[index] ===
            'string'
              ? lines[index]
              : lines[index].text
          ).trim();

        if (!line) {
          continue;
        }

        if (
          index === 0 ||
          mode === 'question'
        ) {
          if (
            /^\s*(?:Question|Q|Que|Problem|Item)\s*[:\.]?\s*$/i.test(
              line
            )
          ) {
            continue;
          }

          const stripped =
            stripQNumber(line);

          if (
            stripped !== line
          ) {
            line = stripped;
          }

          if (!line) {
            continue;
          }
        }

        if (
          /^\s*(?:Options|Choices|Select\s+Option)\s*[:\.-]?\s*$/i.test(
            line
          )
        ) {
          mode = 'options';
          continue;
        }

        if (isAnsLine(line)) {
          mode = 'answer';

          const rawAnswer =
            stripAnsPrefix(line)
              .toUpperCase();

          const match =
            rawAnswer.match(
              /([A-D]|TRUE|FALSE|[-+]?\d+(?:\.\d+)?)/i
            );

          if (match) {
            answer =
              match[1].toUpperCase();
          }

          continue;
        }

        if (isSolLine(line)) {
          mode = 'solution';

          const remaining =
            stripSolPrefix(line);

          if (remaining) {
            solutionLines.push(
              remaining
            );
          }

          continue;
        }

        const optionKey =
          detectOptionKey(
            line,
            index === 0
          );

        if (optionKey) {
          mode = 'options';

          options[optionKey] =
            stripOptionPrefix(
              line
            );

          continue;
        }

        if (
          mode === 'solution'
        ) {
          solutionLines.push(
            line
          );
        } else if (
          mode === 'options'
        ) {
          const optionKeys =
            Object.keys(options);

          const lastKey =
            optionKeys[
              optionKeys.length - 1
            ];

          if (lastKey) {
            options[lastKey] +=
              ' ' + line;
          } else {
            questionLines.push(
              line
            );
          }
        } else {
          questionLines.push(
            line
          );
        }
      }

      const questionText =
        questionLines
          .join('\n')
          .trim();

      return this.createBaseObject(
        block,
        metadata,
        {
          question:
            questionText,

          options,

          answer,

          solutionText:
            solutionLines
              .join('\n')
              .trim(),
        }
      );
    }
  }

  class StandardMCQParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const result =
        this.parseStandard(
          block,
          metadata
        );

      result.qType =
        'mcq_single';

      return result;
    }
  }

  class MultipleCorrectParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const result =
        this.parseStandard(
          block,
          metadata
        );

      result.qType =
        'mcq_multiple';

      const rawAnswer =
        result.answer ||
        block.lines
          .map(
            (line) =>
              line.text
          )
          .join('\n');

      const matches =
        rawAnswer.match(
          /[A-D]/gi
        ) || [];

      const uniqueAnswers =
        Array.from(
          new Set(
            matches.map(
              (value) =>
                value.toUpperCase()
            )
          )
        );

      if (
        uniqueAnswers.length > 0
      ) {
        result.answers =
          uniqueAnswers;

        result.answer =
          uniqueAnswers.join(', ');
      }

      return result;
    }
  }

  class AssertionReasonParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const inline =
        extractInlineMetadata(
          block.lines
        );

      const lines =
        inline.cleanLines;

      let assertion = '';
      let reason = '';
      let answer = '';

      const options = {};
      const solutionLines = [];
      const rawText = [];

      for (
        let index = 0;
        index < lines.length;
        index++
      ) {
        let line =
          (
            typeof lines[index] ===
            'string'
              ? lines[index]
              : lines[index].text
          ).trim();

        if (!line) {
          continue;
        }

        if (index === 0) {
          line =
            stripQNumber(line);
        }

        const assertionMatch =
          line.match(
            /^(?:Assertion|\(A\)|A)\s*[:\.-]\s*(.+)/i
          );

        if (
          assertionMatch &&
          !assertion
        ) {
          assertion =
            assertionMatch[1]
              .trim();

          continue;
        }

        const reasonMatch =
          line.match(
            /^(?:Reason|\(R\)|R)\s*[:\.-]\s*(.+)/i
          );

        if (
          reasonMatch &&
          !reason
        ) {
          reason =
            reasonMatch[1]
              .trim();

          continue;
        }

        if (isAnsLine(line)) {
          const answerMatch =
            stripAnsPrefix(line)
              .toUpperCase()
              .match(
                /([A-D])/i
              );

          if (answerMatch) {
            answer =
              answerMatch[1]
                .toUpperCase();
          }

          continue;
        }

        if (isSolLine(line)) {
          solutionLines.push(
            stripSolPrefix(
              line
            )
          );

          continue;
        }

        const optionKey =
          detectOptionKey(
            line,
            false
          );

        if (optionKey) {
          options[optionKey] =
            stripOptionPrefix(
              line
            );

          continue;
        }

        rawText.push(line);
      }

      const joinedText =
        rawText.join('\n');

      if (!assertion) {
        const match =
          joinedText.match(
            /(?:Assertion|\(A\))\s*[:\.-]\s*([^\n]+(?:\n(?!Reason|\(R\)|A:|R:)[^\n]+)*)/i
          );

        if (match) {
          assertion =
            match[1].trim();
        }
      }

      if (!reason) {
        const match =
          joinedText.match(
            /(?:Reason|\(R\))\s*[:\.-]\s*([^\n]+)+/i
          );

        if (match) {
          reason =
            match[1].trim();
        }
      }

      if (
        !assertion &&
        rawText.length > 0
      ) {
        assertion =
          rawText[0];

        if (
          rawText.length > 1 &&
          !reason
        ) {
          reason =
            rawText
              .slice(1)
              .join('\n');
        }
      }

      const questionText =
        assertion
          ? `Assertion: ${assertion}\nReason: ${reason}`
          : joinedText;

      return this.createBaseObject(
        block,
        metadata,
        {
          qType:
            'assertion_reason',

          question:
            questionText,

          assertion,

          reason,

          options,

          answer:
            answer || 'A',

          solutionText:
            solutionLines
              .join('\n')
              .trim(),
        }
      );
    }
  }

  class StatementBasedParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const result =
        this.parseStandard(
          block,
          metadata
        );

      result.qType =
        'statement_based';

      const text =
        result.question;

      const statementOne =
        text.match(
          /Statement\s+(?:I|1)\s*[:\.]?\s*([^\n]+)/i
        );

      const statementTwo =
        text.match(
          /Statement\s+(?:II|2)\s*[:\.]?\s*([^\n]+)/i
        );

      if (statementOne) {
        result.statement1 =
          statementOne[1].trim();
      }

      if (statementTwo) {
        result.statement2 =
          statementTwo[1].trim();
      }

      return result;
    }
  }

  class MatrixMatchParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const inline =
        extractInlineMetadata(
          block.lines
        );

      const lines =
        inline.cleanLines;

      const questionLines = [];
      const columnA = [];
      const columnB = [];
      const solutionLines = [];
      const matrixAnswer = {};
      const optionCombinations = {};

      let correctAnswer = '';
      let mode = 'question';

      for (
        let index = 0;
        index < lines.length;
        index++
      ) {
        let line =
          (
            typeof lines[index] ===
            'string'
              ? lines[index]
              : lines[index].text
          ).trim();

        if (!line) {
          continue;
        }

        if (index === 0) {
          line =
            stripQNumber(line);
        }

        if (
          /^\s*(?:Option\s+Combinations?|Options|Choices)\s*[:.-]?\s*$/i.test(
            line
          )
        ) {
          mode = 'options';
          continue;
        }

        if (isAnsLine(line)) {
          mode = 'answer';

          const rawAnswer =
            stripAnsPrefix(
              line
            ).trim();

          const singleOption =
            rawAnswer.match(
              /^\(?([A-D])\)?$/i
            );

          if (singleOption) {
            correctAnswer =
              singleOption[1]
                .toUpperCase();
          } else {
            this.extractMatrixPair(
              rawAnswer,
              matrixAnswer
            );
          }

          continue;
        }

        if (isSolLine(line)) {
          mode = 'solution';

          const remaining =
            stripSolPrefix(line);

          if (remaining) {
            solutionLines.push(
              remaining
            );
          }

          continue;
        }

        if (
          mode === 'answer'
        ) {
          if (
            /^\s*[A-D]\s*(?:→|->|=>|-|:)\s*[1-4]/i.test(
              line
            )
          ) {
            this.extractMatrixPair(
              line,
              matrixAnswer
            );
          }

          continue;
        }

        if (
          mode === 'solution'
        ) {
          solutionLines.push(
            line
          );

          continue;
        }

        if (
          /^\s*(?:Column|List)\s+(?:I|A)\b/i.test(
            line
          )
        ) {
          mode = 'columnA';
          continue;
        }

        if (
          /^\s*(?:Column|List)\s+(?:II|B)\b/i.test(
            line
          )
        ) {
          mode = 'columnB';
          continue;
        }

        const taggedOption =
          line.match(
            /^\s*@?option\s*([A-D])\s*[:.=]\s*(.+)$/i
          );

        const detectedOption =
          detectOptionKey(
            line,
            false
          );

        const isLetterOption =
          /^\s*(?:\([A-D]\)|[A-D][.):]|\[[A-D]\]|Option\s+[A-D]\b)/i.test(
            line
          );

        if (
          taggedOption ||
          (
            detectedOption &&
            isLetterOption &&
            (
              mode === 'options' ||
              (
                mode === 'columnB' &&
                columnB.length > 0
              )
            )
          )
        ) {
          const key =
            taggedOption
              ? taggedOption[1]
                  .toUpperCase()
              : detectedOption;

          optionCombinations[key] =
            taggedOption
              ? taggedOption[2]
                  .trim()
              : stripOptionPrefix(
                  line
                );

          mode = 'options';
          continue;
        }

        if (
          mode === 'options'
        ) {
          const keys =
            Object.keys(
              optionCombinations
            );

          const lastKey =
            keys[
              keys.length - 1
            ];

          if (lastKey) {
            optionCombinations[
              lastKey
            ] +=
              ' ' + line;
          }

          continue;
        }

        if (
          mode === 'columnA'
        ) {
          const newRow =
            /^\s*\(?[A-D1-4]\)?[\.\):\-]/i.test(
              line
            );

          const cleanValue =
            line.replace(
              /^\s*\(?[A-D1-4]\)?[\.\):\-]\s*/i,
              ''
            );

          if (
            newRow ||
            columnA.length === 0
          ) {
            columnA.push(
              cleanValue
            );
          } else {
            columnA[
              columnA.length - 1
            ] +=
              ' ' + line;
          }

          continue;
        }

        if (
          mode === 'columnB'
        ) {
          const newRow =
            /^\s*\(?[1-4P-S]\)?[\.\):\-]/i.test(
              line
            );

          const cleanValue =
            line.replace(
              /^\s*\(?[1-4P-S]\)?[\.\):\-]\s*/i,
              ''
            );

          if (
            newRow ||
            columnB.length === 0
          ) {
            columnB.push(
              cleanValue
            );
          } else {
            columnB[
              columnB.length - 1
            ] +=
              ' ' + line;
          }

          continue;
        }

        questionLines.push(
          line
        );
      }

      const answerParts = [];

      [
        'A',
        'B',
        'C',
        'D',
      ].forEach((key) => {
        if (
          matrixAnswer[key] &&
          matrixAnswer[key]
            .length > 0
        ) {
          answerParts.push(
            `${key} → ${matrixAnswer[
              key
            ].join(',')}`
          );
        }
      });

      const formattedAnswer =
        answerParts.join('; ');

      let questionText =
        questionLines
          .join('\n')
          .trim();

      if (
        columnA.length > 0 ||
        columnB.length > 0
      ) {
        questionText +=
          '\n\n**Column I**\n' +
          columnA.join('\n') +
          '\n\n**Column II**\n' +
          columnB.join('\n');
      }

      return this.createBaseObject(
        block,
        metadata,
        {
          qType:
            'matrix',

          question:
            questionText,

          columnA,

          columnB,

          matrixAnswer:
            Object.keys(
              optionCombinations
            ).length
              ? null
              : matrixAnswer,

          matchOptions:
            optionCombinations,

          answer:
            correctAnswer ||
            formattedAnswer,

          solutionText:
            solutionLines
              .join('\n')
              .trim(),
        }
      );
    }

    extractMatrixPair(
      line,
      map
    ) {
      const cleaned =
        stripAnsPrefix(line);

      const regex =
        /([A-D])\s*(?:→|->|=>|-|:)\s*([1-4](?:\s*[,;&]\s*[1-4])*)/gi;

      let match;

      while (
        (
          match =
            regex.exec(cleaned)
        ) !== null
      ) {
        const key =
          match[1].toUpperCase();

        const values =
          match[2].match(
            /[1-4]/g
          ) || [];

        if (!map[key]) {
          map[key] = [];
        }

        values.forEach(
          (value) => {
            if (
              !map[key].includes(
                value
              )
            ) {
              map[key].push(
                value
              );
            }
          }
        );
      }
    }
  }

  class MatchFollowingParser
    extends MatrixMatchParser {
    parse(block, metadata) {
      const result =
        super.parse(
          block,
          metadata
        );

      result.qType =
        'match';

      return result;
    }
  }

  class NumericalParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const inline =
        extractInlineMetadata(
          block.lines
        );

      const lines =
        inline.cleanLines;

      const questionLines = [];
      const solutionLines = [];

      let answer = '';

      for (
        let index = 0;
        index < lines.length;
        index++
      ) {
        let line =
          (
            typeof lines[index] ===
            'string'
              ? lines[index]
              : lines[index].text
          ).trim();

        if (!line) {
          continue;
        }

        if (index === 0) {
          line =
            stripQNumber(line);
        }

        if (isAnsLine(line)) {
          answer =
            stripAnsPrefix(
              line
            ).trim();

          continue;
        }

        if (isSolLine(line)) {
          const remaining =
            stripSolPrefix(
              line
            );

          if (remaining) {
            solutionLines.push(
              remaining
            );
          }

          for (
            let solutionIndex =
              index + 1;
            solutionIndex <
            lines.length;
            solutionIndex++
          ) {
            const solutionLine =
              (
                typeof lines[
                  solutionIndex
                ] === 'string'
                  ? lines[
                      solutionIndex
                    ]
                  : lines[
                      solutionIndex
                    ].text
              ).trim();

            if (solutionLine) {
              solutionLines.push(
                solutionLine
              );
            }
          }

          break;
        }

        questionLines.push(
          line
        );
      }

      const questionText =
        questionLines
          .join('\n')
          .trim();

      const numericalValue =
        answer.trim();

      return this.createBaseObject(
        block,
        metadata,
        {
          qType:
            'numerical',

          question:
            questionText,

          answer:
            numericalValue,

          numAnswer:
            numericalValue,

          solutionText:
            solutionLines
              .join('\n')
              .trim(),
        }
      );
    }
  }
    class TrueFalseParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const result =
        this.parseStandard(
          block,
          metadata
        );

      result.qType =
        'true_false';

      return result;
    }
  }

  class CaseStudyParser
    extends BaseQuestionParser {
    parse(block, metadata) {
      const result =
        this.parseStandard(
          block,
          metadata
        );

      result.qType =
        'case_study';

      return result;
    }
  }

  const ParserRegistry = {
    parsers: {
      mcq_single:
        new StandardMCQParser(),

      mcq_multiple:
        new MultipleCorrectParser(),

      assertion_reason:
        new AssertionReasonParser(),

      statement_based:
        new StatementBasedParser(),

      matrix:
        new MatrixMatchParser(),

      match:
        new MatchFollowingParser(),

      numerical:
        new NumericalParser(),

      integer:
        new NumericalParser(),

      true_false:
        new TrueFalseParser(),

      case_study:
        new CaseStudyParser(),

      paragraph:
        new CaseStudyParser(),

      comprehension:
        new CaseStudyParser(),

      diagram:
        new StandardMCQParser(),

      image:
        new StandardMCQParser(),

      graph:
        new StandardMCQParser(),

      table:
        new StandardMCQParser(),

      sequence:
        new StandardMCQParser(),

      reasoning:
        new StandardMCQParser(),

      data_interpretation:
        new StandardMCQParser(),

      fill_blank:
        new NumericalParser(),

      multi_part:
        new StandardMCQParser(),
    },

    register(
      type,
      parserInstance
    ) {
      this.parsers[type] =
        parserInstance;
    },

    get(type) {
      return (
        this.parsers[type] ||
        this.parsers.mcq_single
      );
    },
  };

  function parseText(rawText) {
    const metadata =
      getMeta();

    const rawBlocks =
      splitIntoRawBlocks(
        rawText
      );

    return rawBlocks.map(
      (block) => {
        const questionType =
          detectBlockType(block);

        const parser =
          ParserRegistry.get(
            questionType
          );

        return parser.parse(
          block,
          metadata
        );
      }
    );
  }

  function validateAll(questions) {
    const metadata =
      getMeta();

    questions.forEach(
      (question, index) => {
        question.errors = [];

        const number =
          index + 1;

        if (
          !question.subject &&
          !metadata.subject
        ) {
          question.errors.push(
            `Question #${number}: Subject is required.`
          );
        }

        if (
          !question.klass &&
          !metadata.klass
        ) {
          question.errors.push(
            `Question #${number}: Class is required.`
          );
        }

        if (
          !question.chapter &&
          !metadata.chapter
        ) {
          question.errors.push(
            `Question #${number}: Chapter is required.`
          );
        }

        if (
          !question.question ||
          question.question.length < 5
        ) {
          question.errors.push(
            `Question #${number}: Question text is missing or too short.`
          );
        }

        if (
          question.qType ===
            'mcq_single' ||
          question.qType ===
            'mcq_multiple'
        ) {
          if (!question.optA) {
            question.errors.push(
              `Question #${number}: Option A is missing.`
            );
          }

          if (!question.optB) {
            question.errors.push(
              `Question #${number}: Option B is missing.`
            );
          }

          if (!question.answer) {
            question.errors.push(
              `Question #${number}: Correct answer is missing.`
            );
          }
        } else if (
          question.qType ===
            'matrix' ||
          question.qType ===
            'match'
        ) {
          const hasMatrixMap =
            question.matrixAnswer &&
            Object.keys(
              question.matrixAnswer
            ).length > 0;

          const hasCombinations =
            question.matchOptions &&
            Object.keys(
              question.matchOptions
            ).length > 0;

          if (
            !question.answer &&
            !hasMatrixMap
          ) {
            question.errors.push(
              `Question #${number}: Matrix/Match answer is missing.`
            );
          }

          if (
            question.qType ===
              'match' &&
            !hasCombinations
          ) {
            question.errors.push(
              `Question #${number}: Match option combinations are missing.`
            );
          }
        } else if (
          question.qType ===
            'numerical' ||
          question.qType ===
            'integer'
        ) {
          if (
            !question.answer &&
            !question.numAnswer
          ) {
            question.errors.push(
              `Question #${number}: Numerical answer is missing.`
            );
          }
        } else if (
          question.qType ===
          'true_false'
        ) {
          if (!question.answer) {
            question.errors.push(
              `Question #${number}: Correct answer (True/False) is missing.`
            );
          }
        }

        question.isValid =
          question.errors.length ===
          0;
      }
    );
  }

  function checkDuplicates(
    questions,
    databaseQuestions
  ) {
    if (
      !databaseQuestions ||
      !databaseQuestions.length
    ) {
      return;
    }

    questions.forEach(
      (question) => {
        const normalizedQuestion =
          (
            question.question ||
            ''
          )
            .toLowerCase()
            .replace(
              /[^a-z0-9]/g,
              ''
            );

        if (!normalizedQuestion) {
          return;
        }

        const match =
          databaseQuestions.find(
            (databaseQuestion) => {
              if (
                question.subject &&
                databaseQuestion.subject !==
                  question.subject
              ) {
                return false;
              }

              const normalizedDatabase =
                (
                  databaseQuestion.question ||
                  ''
                )
                  .toLowerCase()
                  .replace(
                    /[^a-z0-9]/g,
                    ''
                  );

              return (
                normalizedDatabase ===
                normalizedQuestion
              );
            }
          );

        question.isDuplicate =
          Boolean(match);

        question.existingId =
          match
            ? match.id
            : null;
      }
    );
  }

  function autoWrapStandaloneLatex(
    text
  ) {
    if (!text) {
      return '';
    }

    let index = 0;
    const length = text.length;
    let result = '';
    let buffer = '';

    function processBuffer(value) {
      return value.replace(
        /(?<![\$\w\\])(\\[a-zA-Z]+(?:\{[^{}]*\}|\[[^\[\]]*\])*)(?![\$\w\\])/g,
        (match) => {
          if (
            match === '\\n' ||
            match === '\\r' ||
            match === '\\t'
          ) {
            return match;
          }

          return `$${match}$`;
        }
      );
    }

    while (index < length) {
      if (text[index] === '$') {
        const display =
          text[index + 1] ===
          '$';

        const delimiter =
          display
            ? '$$'
            : '$';

        const end =
          text.indexOf(
            delimiter,
            index +
              delimiter.length
          );

        if (end !== -1) {
          if (buffer) {
            result +=
              processBuffer(
                buffer
              );

            buffer = '';
          }

          result +=
            text.slice(
              index,
              end +
                delimiter.length
            );

          index =
            end +
            delimiter.length;

          continue;
        }
      }

      if (
        text.startsWith(
          '\\(',
          index
        ) ||
        text.startsWith(
          '\\[',
          index
        )
      ) {
        const display =
          text.startsWith(
            '\\[',
            index
          );

        const closing =
          display
            ? '\\]'
            : '\\)';

        const end =
          text.indexOf(
            closing,
            index + 2
          );

        if (end !== -1) {
          if (buffer) {
            result +=
              processBuffer(
                buffer
              );

            buffer = '';
          }

          result +=
            text.slice(
              index,
              end +
                closing.length
            );

          index =
            end +
            closing.length;

          continue;
        }
      }

      buffer += text[index];
      index++;
    }

    if (buffer) {
      result +=
        processBuffer(buffer);
    }

    return result;
  }

  function renderCardNode(text) {
    if (!text) {
      return document.createTextNode(
        ''
      );
    }

    const processedText =
      autoWrapStandaloneLatex(
        text
      );

    const container =
      document.createElement(
        'span'
      );

    const parts =
      processedText.split(
        /({{IMG::[^}]+}})/g
      );

    parts.forEach((part) => {
      if (
        part.startsWith(
          '{{IMG::'
        ) &&
        part.endsWith('}}')
      ) {
        const imageUrl =
          part.slice(7, -2);

        const image =
          document.createElement(
            'img'
          );

        image.src =
          imageUrl;

        image.style.cssText =
          'max-width:100%;max-height:220px;display:block;margin:6px 0;border-radius:6px;border:1px solid #2e364a;';

        container.appendChild(
          image
        );
      } else if (part) {
        if (
          typeof buildEquationFragment ===
          'function'
        ) {
          container.appendChild(
            buildEquationFragment(
              part
            )
          );
        } else {
          container.appendChild(
            document.createTextNode(
              part
            )
          );
        }
      }
    });

    return container;
  }

  function renderCard(
    question,
    index
  ) {
    const card =
      document.createElement(
        'div'
      );

    card.className =
      'bq-card' +
      (
        question.isValid
          ? ''
          : ' is-invalid'
      ) +
      (
        question.isDuplicate
          ? ' is-duplicate'
          : ''
      ) +
      (
        question.ignored
          ? ' is-ignored'
          : ''
      );

    card.id =
      'bqCard_' + index;

    const top =
      document.createElement(
        'div'
      );

    top.className =
      'bq-card-top';

    top.appendChild(
      createBadge(
        'num',
        '#' + (index + 1)
      )
    );

    top.appendChild(
      createBadge(
        'type',
        QTYPE_LABELS[
          question.qType
        ] ||
          question.qType
      )
    );

    top.appendChild(
      createBadge(
        (
          question.difficulty ||
          'Medium'
        ).toLowerCase(),

        question.difficulty ||
          'Medium'
      )
    );

    top.appendChild(
      createBadge(
        question.isValid
          ? 'valid'
          : 'invalid',

        question.isValid
          ? '✓ Valid'
          : '✕ Invalid'
      )
    );

    if (
      question.isDuplicate
    ) {
      top.appendChild(
        createBadge(
          'dup',
          '⚠ Duplicate'
        )
      );
    }

    top.appendChild(
      createBadge(
        'conf',
        'AI Conf: ' +
          (
            question.confidenceScore ||
            70
          ) +
          '%'
      )
    );

    const actions =
      document.createElement(
        'div'
      );

    actions.className =
      'bq-card-actions';

    const selectLabel =
      document.createElement(
        'label'
      );

    selectLabel.style.cssText =
      'font-size:11px;color:var(--muted);display:flex;align-items:center;gap:4px;cursor:pointer;';

    const checkbox =
      document.createElement(
        'input'
      );

    checkbox.type =
      'checkbox';

    checkbox.checked =
      !question.ignored;

    checkbox.onchange =
      () => {
        question.ignored =
          !checkbox.checked;

        updateStats();
        renderCards();
      };

    selectLabel.appendChild(
      checkbox
    );

    selectLabel.appendChild(
      document.createTextNode(
        'Select'
      )
    );

    actions.appendChild(
      selectLabel
    );

    actions.appendChild(
      createToolButton(
        question.collapsed
          ? '▼'
          : '▲',

        'Expand/Collapse',

        () => {
          question.collapsed =
            !question.collapsed;

          renderCards();
        }
      )
    );

    actions.appendChild(
      createToolButton(
        '💾 Save',
        'Import this question to Database',
        () =>
          saveSingleQuestionToDb(
            index
          )
      )
    );

    actions.appendChild(
      createToolButton(
        '✎',
        'Edit',
        () =>
          openCardEditor(
            index
          )
      )
    );

    actions.appendChild(
      createToolButton(
        '✕',
        'Delete',
        () => {
          state.parsedQuestions.splice(
            index,
            1
          );

          renderCards();
          updateStats();
        },
        true
      )
    );

    top.appendChild(actions);
    card.appendChild(top);

    const metadataLine =
      document.createElement(
        'div'
      );

    metadataLine.className =
      'bq-card-meta';

    metadataLine.textContent =
      (
        question.subject ||
        ''
      ) +
      ' · Class ' +
      (
        question.klass ||
        ''
      ) +
      ' · Chapter: ' +
      (
        question.chapter ||
        ''
      ) +
      (
        question.concept
          ? ' · Concept: ' +
            question.concept
          : ''
      );

    card.appendChild(
      metadataLine
    );

    if (question.collapsed) {
      return card;
    }

    const body =
      document.createElement(
        'div'
      );

    body.className =
      'bq-card-body';

    const questionText =
      document.createElement(
        'div'
      );

    questionText.className =
      'bq-card-qtext';

    questionText.appendChild(
      renderCardNode(
        question.question ||
        ''
      )
    );

    body.appendChild(
      questionText
    );

    if (
      question.optA ||
      question.optB ||
      question.optC ||
      question.optD
    ) {
      const optionsGrid =
        document.createElement(
          'div'
        );

      optionsGrid.className =
        'bq-card-opts';

      [
        'A',
        'B',
        'C',
        'D',
      ].forEach((letter) => {
        const optionValue =
          question[
            'opt' + letter
          ];

        if (!optionValue) {
          return;
        }

        const correct =
          (
            question.answer ||
            ''
          )
            .toUpperCase()
            .includes(letter);

        const optionElement =
          document.createElement(
            'div'
          );

        optionElement.className =
          'bq-opt' +
          (
            correct
              ? ' correct'
              : ''
          );

        optionElement.appendChild(
          document.createTextNode(
            letter + ': '
          )
        );

        optionElement.appendChild(
          renderCardNode(
            optionValue
          )
        );

        if (correct) {
          const check =
            document.createElement(
              'span'
            );

          check.textContent =
            ' ✓';

          optionElement.appendChild(
            check
          );
        }

        optionsGrid.appendChild(
          optionElement
        );
      });

      body.appendChild(
        optionsGrid
      );
    }

    if (question.answer) {
      const answerElement =
        document.createElement(
          'div'
        );

      answerElement.className =
        'bq-card-answer';

      answerElement.textContent =
        '✓ Correct Answer: ' +
        question.answer;

      body.appendChild(
        answerElement
      );
    }

    if (
      question.solutionText
    ) {
      const solutionElement =
        document.createElement(
          'div'
        );

      solutionElement.className =
        'bq-card-solution';

      solutionElement.appendChild(
        document.createTextNode(
          'SOLUTION: '
        )
      );

      solutionElement.appendChild(
        renderCardNode(
          question.solutionText
        )
      );

      body.appendChild(
        solutionElement
      );
    }

    card.appendChild(body);

    if (
      question.errors &&
      question.errors.length > 0
    ) {
      const errorBox =
        document.createElement(
          'div'
        );

      errorBox.className =
        'bq-card-errors';

      question.errors.forEach(
        (error) => {
          const item =
            document.createElement(
              'div'
            );

          item.className =
            'bq-err-item';

          item.textContent =
            '⚠ ' + error;

          errorBox.appendChild(
            item
          );
        }
      );

      card.appendChild(
        errorBox
      );
    }

    if (
      question.isDuplicate
    ) {
      const duplicateBanner =
        document.createElement(
          'div'
        );

      duplicateBanner.className =
        'bq-card-dup-banner';

      duplicateBanner.appendChild(
        document.createTextNode(
          '⚠ Duplicate question detected in database. Action: '
        )
      );

      [
        'skip',
        'overwrite',
        'keep_both',
      ].forEach((action) => {
        const button =
          document.createElement(
            'button'
          );

        button.className =
          'bq-dup-btn' +
          (
            question.dupAction ===
            action
              ? ' active'
              : ''
          );

        button.textContent =
          action
            .replace(
              '_',
              ' '
            )
            .toUpperCase();

        button.onclick =
          () => {
            question.dupAction =
              action;

            renderCards();
          };

        duplicateBanner.appendChild(
          button
        );
      });

      card.appendChild(
        duplicateBanner
      );
    }

    return card;
  }

  function createBadge(
    className,
    text
  ) {
    const badge =
      document.createElement(
        'span'
      );

    badge.className =
      'bq-badge ' +
      className;

    badge.textContent =
      text;

    return badge;
  }

  function createToolButton(
    text,
    title,
    onClick,
    isDanger
  ) {
    const button =
      document.createElement(
        'button'
      );

    button.className =
      'bq-tool-btn' +
      (
        isDanger
          ? ' danger'
          : ''
      );

    button.title =
      title;

    button.textContent =
      text;

    button.onclick =
      onClick;

    return button;
  }

  function getFiltered() {
    const search =
      state.filterSearch
        .toLowerCase();

    return state.parsedQuestions.filter(
      (question) => {
        if (
          state.filterType &&
          question.qType !==
            state.filterType
        ) {
          return false;
        }

        if (
          state.filterDiff &&
          (
            question.difficulty ||
            'Medium'
          ).toLowerCase() !==
            state.filterDiff
        ) {
          return false;
        }

        if (
          state.filterStatus ===
            'valid' &&
          !question.isValid
        ) {
          return false;
        }

        if (
          state.filterStatus ===
            'invalid' &&
          question.isValid
        ) {
          return false;
        }

        if (
          state.filterDup ===
            'duplicate' &&
          !question.isDuplicate
        ) {
          return false;
        }

        if (
          state.filterDup ===
            'unique' &&
          question.isDuplicate
        ) {
          return false;
        }

        if (
          search &&
          !(
            question.question ||
            ''
          )
            .toLowerCase()
            .includes(search) &&
          !(
            question.concept ||
            ''
          )
            .toLowerCase()
            .includes(search)
        ) {
          return false;
        }

        return true;
      }
    );
  }

  function renderCards() {
    const container =
      document.getElementById(
        'bqCardsContainer'
      ) ||
      document.getElementById(
        'bulkCardsContainer'
      );

    if (!container) {
      return;
    }

    const filtered =
      getFiltered();

    if (
      filtered.length === 0
    ) {
      container.innerHTML =
        '<div class="bq-empty">' +
        '<div class="bq-empty-icon">📭</div>' +
        '<div class="bq-empty-text">' +
        (
          state.parsedQuestions
            .length === 0
            ? 'Paste questions in the editor to parse and preview.'
            : 'No questions match the selected filters.'
        ) +
        '</div></div>';

      updateStats();
      renderErrorPanel();
      return;
    }

    const fragment =
      document.createDocumentFragment();

    filtered.forEach(
      (question) => {
        const realIndex =
          state.parsedQuestions.indexOf(
            question
          );

        fragment.appendChild(
          renderCard(
            question,
            realIndex
          )
        );
      }
    );

    container.innerHTML = '';

    container.appendChild(
      fragment
    );

    updateStats();
    renderErrorPanel();
  }

  function updateStats() {
    const questions =
      state.parsedQuestions;

    const total =
      questions.length;

    const valid =
      questions.filter(
        (question) =>
          question.isValid &&
          !question.ignored
      ).length;

    const invalid =
      questions.filter(
        (question) =>
          !question.isValid
      ).length;

    const duplicates =
      questions.filter(
        (question) =>
          question.isDuplicate
      ).length;

    const ready =
      questions.filter(
        (question) =>
          question.isValid &&
          !question.ignored &&
          (
            !question.isDuplicate ||
            question.dupAction !==
              'skip'
          )
      ).length;

    [
      'bqStatTotal',
      'bulkStatTotal',
    ].forEach(
      (id) =>
        setText(id, total)
    );

    [
      'bqStatValid',
      'bulkStatValid',
    ].forEach(
      (id) =>
        setText(id, valid)
    );

    [
      'bqStatInvalid',
      'bulkStatInvalid',
    ].forEach(
      (id) =>
        setText(id, invalid)
    );

    [
      'bqStatDup',
      'bulkStatDup',
    ].forEach(
      (id) =>
        setText(
          id,
          duplicates
        )
    );

    [
      'bqStatReady',
      'bulkStatReady',
    ].forEach(
      (id) =>
        setText(id, ready)
    );

    const progress =
      document.getElementById(
        'bqProgressFill'
      );

    if (progress) {
      progress.style.width =
        total > 0
          ? (
              valid /
              total *
              100
            ) +
            '%'
          : '0%';
    }
  }

  function setText(id, value) {
    const element =
      document.getElementById(id);

    if (element) {
      element.textContent =
        value;
    }
  }

  function escapeHtml(value) {
    return String(
      value || ''
    ).replace(
      /[&<>"']/g,
      (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]
    );
  }

  function renderErrorPanel() {
    const panel =
      document.getElementById(
        'bqErrorPanel'
      ) ||
      document.getElementById(
        'bulkErrorCard'
      );

    const list =
      document.getElementById(
        'bqErrorList'
      ) ||
      document.getElementById(
        'bulkErrorList'
      );

    const count =
      document.getElementById(
        'bqErrorCount'
      ) ||
      document.getElementById(
        'bulkErrorCount'
      );

    if (
      !panel ||
      !list
    ) {
      return;
    }

    const allErrors = [];

    state.parsedQuestions.forEach(
      (question) => {
        (
          question.errors ||
          []
        ).forEach((error) => {
          allErrors.push({
            question,
            error,
          });
        });
      }
    );

    if (
      allErrors.length === 0
    ) {
      panel.style.display =
        'none';

      return;
    }

    panel.style.display =
      'block';

    if (count) {
      count.textContent =
        allErrors.length +
        ' Issues';
    }

    list.innerHTML = '';

    allErrors.forEach(
      ({
        question,
        error,
      }) => {
        const index =
          state.parsedQuestions.indexOf(
            question
          );

        const row =
          document.createElement(
            'div'
          );

        row.className =
          'bq-error-row';

        row.innerHTML =
          '<span class="bq-err-qnum">Q#' +
          (index + 1) +
          '</span>' +
          '<span class="bq-err-msg">' +
          escapeHtml(error) +
          '</span>';

        row.onclick =
          () => {
            const card =
              document.getElementById(
                'bqCard_' +
                index
              );

            if (card) {
              card.scrollIntoView({
                behavior:
                  'smooth',
                block:
                  'center',
              });
            }
          };

        list.appendChild(row);
      }
    );
  }

  function runParse() {
    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    if (!textarea) {
      return;
    }

    const text =
      textarea.value;

    if (!text.trim()) {
      state.parsedQuestions =
        [];

      renderCards();
      return;
    }

    const questions =
      parseText(text);

    validateAll(questions);

    checkDuplicates(
      questions,
      state.existingQuestions
    );

    state.parsedQuestions =
      questions;

    renderCards();
  }

  function scheduleReparse() {
    clearTimeout(
      state.debounceTimer
    );

    state.debounceTimer =
      setTimeout(
        runParse,
        800
      );
  }

  function initEditor() {
    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    const lineNumbers =
      document.getElementById(
        'bqLineNumbers'
      ) ||
      document.getElementById(
        'bulkLineNumbers'
      );

    if (!textarea) {
      return;
    }

    function updateLineNumbers() {
      if (!lineNumbers) {
        return;
      }

      const count =
        textarea.value
          .split('\n')
          .length;

      let numbers = '';

      for (
        let index = 1;
        index <= count;
        index++
      ) {
        numbers +=
          index + '\n';
      }

      lineNumbers.textContent =
        numbers;

      lineNumbers.scrollTop =
        textarea.scrollTop;
    }

    textarea.addEventListener(
      'input',
      () => {
        updateLineNumbers();
        scheduleReparse();
        autoSave();
        pushHistory(
          textarea.value
        );
      }
    );

    textarea.addEventListener(
      'scroll',
      () => {
        if (lineNumbers) {
          lineNumbers.scrollTop =
            textarea.scrollTop;
        }
      }
    );

    textarea.addEventListener(
      'keydown',
      (event) => {
        if (
          event.ctrlKey &&
          event.key === 'z'
        ) {
          event.preventDefault();
          undoHistory();
        } else if (
          event.ctrlKey &&
          event.key === 'y'
        ) {
          event.preventDefault();
          redoHistory();
        } else if (
          event.key === 'Tab'
        ) {
          event.preventDefault();

          const start =
            textarea.selectionStart;

          const end =
            textarea.selectionEnd;

          textarea.value =
            textarea.value.substring(
              0,
              start
            ) +
            '  ' +
            textarea.value.substring(
              end
            );

          textarea.selectionStart =
            textarea.selectionEnd =
              start + 2;

          updateLineNumbers();
        }
      }
    );

    const draft =
      localStorage.getItem(
        'bq_draft_v2'
      );

    if (draft) {
      textarea.value =
        draft;

      updateLineNumbers();
      scheduleReparse();
    } else {
      updateLineNumbers();
    }
  }

  function pushHistory(text) {
    if (
      state.historyStack[
        state.historyIndex
      ] === text
    ) {
      return;
    }

    state.historyStack =
      state.historyStack.slice(
        0,
        state.historyIndex + 1
      );

    state.historyStack.push(
      text
    );

    if (
      state.historyStack.length >
      100
    ) {
      state.historyStack.shift();
    }

    state.historyIndex =
      state.historyStack.length -
      1;
  }

  function undoHistory() {
    if (
      state.historyIndex <= 0
    ) {
      return;
    }

    state.historyIndex--;

    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    if (textarea) {
      textarea.value =
        state.historyStack[
          state.historyIndex
        ];

      scheduleReparse();
    }
  }

  function redoHistory() {
    if (
      state.historyIndex >=
      state.historyStack.length -
        1
    ) {
      return;
    }

    state.historyIndex++;

    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    if (textarea) {
      textarea.value =
        state.historyStack[
          state.historyIndex
        ];

      scheduleReparse();
    }
  }

  function autoSave() {
    clearTimeout(
      state.autoSaveTimer
    );

    state.autoSaveTimer =
      setTimeout(
        () => {
          const textarea =
            document.getElementById(
              'bqTextarea'
            ) ||
            document.getElementById(
              'bulkEditorTextarea'
            );

          if (textarea) {
            localStorage.setItem(
              'bq_draft_v2',
              textarea.value
            );
          }
        },
        1500
      );
  }
    function toggleWordWrap() {
    state.wordWrap =
      !state.wordWrap;

    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    const button =
      document.getElementById(
        'bqWrapBtn'
      ) ||
      document.getElementById(
        'bulkWrapBtn'
      );

    if (textarea) {
      textarea.classList.toggle(
        'word-wrap',
        state.wordWrap
      );
    }

    if (button) {
      button.classList.toggle(
        'active',
        state.wordWrap
      );
    }
  }

  function clearEditor() {
    if (
      !confirm(
        'Clear editor content?'
      )
    ) {
      return;
    }

    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    if (textarea) {
      textarea.value = '';

      pushHistory('');
      scheduleReparse();
    }

    localStorage.removeItem(
      'bq_draft_v2'
    );
  }

  function restoreSample() {
    const sample = `@subject: Physics
@chapter: Alternating Current
@concept: LCR Circuit and Phasor Analysis
@type: Standard MCQ
@difficulty: Medium

A 220 V, 50 Hz a.c. generator is connected to an inductor and a 50 ohm resistance in series. The current in the circuit is 1.0 A. What is the potential difference across the inductor?

(A) 102.2 V
(B) 186.4 V
(C) 213.6 V
(D) 302 V

Answer: C

Solution: Voltage across the resistor is VR = IR = 1.0 × 50 = 50 V. Since V, VR and VL form a right triangle, VL = 213.6 V.

---

@subject: Chemistry
@chapter: Periodic Classification
@concept: Periodic Table
@type: match
@difficulty: Medium

Match the following elements with their correct group.

Column A
1. Sodium
2. Potassium
3. Calcium
4. Magnesium

Column B
P. Group 1 and Period 3
Q. Group 1 and Period 4
R. Group 2 and Period 4
S. Group 2 and Period 3

Option Combinations
A. 1-P, 2-Q, 3-R, 4-S
B. 1-Q, 2-P, 3-S, 4-R
C. 1-R, 2-S, 3-P, 4-Q
D. 1-S, 2-R, 3-Q, 4-P

Answer: A

Solution: Sodium belongs to Group 1 and Period 3. Potassium belongs to Group 1 and Period 4. Calcium belongs to Group 2 and Period 4. Magnesium belongs to Group 2 and Period 3.

---

@subject: Physics
@chapter: Electromagnetic Waves
@concept: Light Propagation
@type: assertion_reason
@difficulty: Easy

Assertion: Light waves can travel through vacuum.

Reason: Light is an electromagnetic wave and does not require a material medium for propagation.

(A) Both A and R are true and R is the correct explanation.
(B) Both A and R are true but R is not the correct explanation.
(C) A is true but R is false.
(D) A is false but R is true.

Answer: A

Solution: Electromagnetic waves can propagate through vacuum because they do not require a material medium.

---

@subject: Physics
@chapter: Electromagnetic Waves
@concept: Properties of Electromagnetic Waves
@type: true_false
@difficulty: Easy

Electromagnetic waves require a material medium for propagation.

(A) True
(B) False

Answer: B

Solution: Electromagnetic waves can travel through vacuum and therefore do not require a material medium.`;

    const textarea =
      document.getElementById(
        'bqTextarea'
      ) ||
      document.getElementById(
        'bulkEditorTextarea'
      );

    if (textarea) {
      textarea.value =
        sample;

      pushHistory(sample);
      scheduleReparse();
    }
  }

  function openCardEditor(index) {
    if (
      typeof Auth !==
        'undefined' &&
      Auth.can &&
      !Auth.can(
        'bulk_import'
      )
    ) {
      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          'Only Question Adders or Admins can prepare imports.',
          true
        );
      }

      return;
    }

    state.editingIndex =
      index;

    const question =
      state.parsedQuestions[
        index
      ];

    if (!question) {
      return;
    }

    const modal =
      document.getElementById(
        'bqEditModal'
      ) ||
      document.getElementById(
        'bulkEditModal'
      );

    if (!modal) {
      return;
    }

    const questionType =
      question.qType ||
      'mcq_single';

    setValue(
      'bqEditQType',
      questionType
    );

    setValue(
      'bqEditConcept',
      question.concept ||
        question.topic ||
        ''
    );

    setValue(
      'bqEditDifficulty',
      question.difficulty ||
        'Medium'
    );

    const assertionBlock =
      document.getElementById(
        'bqEditARBlock'
      );

    const questionGroup =
      document.getElementById(
        'bqEditQuestionGroup'
      );

    const optionsBlock =
      document.getElementById(
        'bqEditOptionsBlock'
      );

    const answerLabel =
      document.getElementById(
        'bqEditAnswerLabel'
      );

    if (
      questionType ===
      'assertion_reason'
    ) {
      if (assertionBlock) {
        assertionBlock.style.display =
          'block';
      }

      if (questionGroup) {
        questionGroup.style.display =
          'none';
      }

      if (optionsBlock) {
        optionsBlock.style.display =
          'grid';
      }

      if (answerLabel) {
        answerLabel.textContent =
          'Correct Option (A, B, C or D)';
      }

      let assertion =
        question.assertion ||
        '';

      let reason =
        question.reason ||
        '';

      if (
        !assertion &&
        question.question
      ) {
        const match =
          question.question.match(
            /(?:Assertion|\(A\)|A)\s*[:.\-]\s*([^\n]+(?:\n(?!Reason|\(R\)|R:)[^\n]+)*)/i
          );

        if (match) {
          assertion =
            match[1].trim();
        }
      }

      if (
        !reason &&
        question.question
      ) {
        const match =
          question.question.match(
            /(?:Reason|\(R\)|R)\s*[:.\-]\s*([^\n]+)+/i
          );

        if (match) {
          reason =
            match[1].trim();
        }
      }

      setValue(
        'bqEditAssertion',
        assertion
      );

      setValue(
        'bqEditReason',
        reason
      );

      const defaultOptions = {
        A:
          'Both Assertion and Reason are true and Reason is the correct explanation of Assertion.',

        B:
          'Both Assertion and Reason are true but Reason is not the correct explanation of Assertion.',

        C:
          'Assertion is true but Reason is false.',

        D:
          'Assertion is false but Reason is true.',
      };

      setValue(
        'bqEditOptA',
        question.optA ||
          defaultOptions.A
      );

      setValue(
        'bqEditOptB',
        question.optB ||
          defaultOptions.B
      );

      setValue(
        'bqEditOptC',
        question.optC ||
          defaultOptions.C
      );

      setValue(
        'bqEditOptD',
        question.optD ||
          defaultOptions.D
      );

      setValue(
        'bqEditAnswer',
        question.answer ||
          'A'
      );
    } else if (
      questionType ===
        'numerical' ||
      questionType ===
        'integer'
    ) {
      if (assertionBlock) {
        assertionBlock.style.display =
          'none';
      }

      if (questionGroup) {
        questionGroup.style.display =
          'block';
      }

      if (optionsBlock) {
        optionsBlock.style.display =
          'none';
      }

      if (answerLabel) {
        answerLabel.textContent =
          'Correct Numerical Value';
      }

      setValue(
        'bqEditQuestion',
        question.question ||
          ''
      );

      setValue(
        'bqEditAnswer',
        question.numAnswer ||
          question.answer ||
          ''
      );
    } else {
      if (assertionBlock) {
        assertionBlock.style.display =
          'none';
      }

      if (questionGroup) {
        questionGroup.style.display =
          'block';
      }

      if (optionsBlock) {
        optionsBlock.style.display =
          'grid';
      }

      if (answerLabel) {
        answerLabel.textContent =
          'Correct Answer';
      }

      setValue(
        'bqEditQuestion',
        question.question ||
          ''
      );

      setValue(
        'bqEditOptA',
        question.optA ||
          ''
      );

      setValue(
        'bqEditOptB',
        question.optB ||
          ''
      );

      setValue(
        'bqEditOptC',
        question.optC ||
          ''
      );

      setValue(
        'bqEditOptD',
        question.optD ||
          ''
      );

      setValue(
        'bqEditAnswer',
        question.answer ||
          'A'
      );
    }

    setValue(
      'bqEditSolution',
      question.solutionText ||
        ''
    );

    modal.style.display =
      'flex';

    modal.classList.add(
      'open'
    );
  }

  function closeCardEditor() {
    const modal =
      document.getElementById(
        'bqEditModal'
      ) ||
      document.getElementById(
        'bulkEditModal'
      );

    if (modal) {
      modal.style.display =
        'none';

      modal.classList.remove(
        'open'
      );
    }

    state.editingIndex =
      null;
  }

  function saveCardEditor() {
    const index =
      state.editingIndex;

    if (
      index === null ||
      !state.parsedQuestions[
        index
      ]
    ) {
      closeCardEditor();
      return;
    }

    const question =
      state.parsedQuestions[
        index
      ];

    const newType =
      getValue(
        'bqEditQType'
      );

    question.qType =
      newType;

    question.concept =
      getValue(
        'bqEditConcept'
      );

    question.topic =
      question.concept;

    question.difficulty =
      getValue(
        'bqEditDifficulty'
      );

    question.solutionText =
      getValue(
        'bqEditSolution'
      );

    if (
      newType ===
      'assertion_reason'
    ) {
      question.assertion =
        getValue(
          'bqEditAssertion'
        );

      question.reason =
        getValue(
          'bqEditReason'
        );

      question.question =
        'Assertion: ' +
        question.assertion +
        '\nReason: ' +
        question.reason;

      question.optA =
        getValue(
          'bqEditOptA'
        );

      question.optB =
        getValue(
          'bqEditOptB'
        );

      question.optC =
        getValue(
          'bqEditOptC'
        );

      question.optD =
        getValue(
          'bqEditOptD'
        );

      question.answer =
        getValue(
          'bqEditAnswer'
        ) ||
        'A';
    } else if (
      newType ===
        'numerical' ||
      newType ===
        'integer'
    ) {
      question.question =
        getValue(
          'bqEditQuestion'
        );

      question.numAnswer =
        getValue(
          'bqEditAnswer'
        );

      question.answer =
        question.numAnswer;

      question.optA = '';
      question.optB = '';
      question.optC = '';
      question.optD = '';
    } else {
      question.question =
        getValue(
          'bqEditQuestion'
        );

      question.optA =
        getValue(
          'bqEditOptA'
        );

      question.optB =
        getValue(
          'bqEditOptB'
        );

      question.optC =
        getValue(
          'bqEditOptC'
        );

      question.optD =
        getValue(
          'bqEditOptD'
        );

      question.answer =
        getValue(
          'bqEditAnswer'
        );
    }

    validateAll(
      state.parsedQuestions
    );

    closeCardEditor();
    renderCards();
  }

  async function saveSingleQuestionToDb(
    index
  ) {
    if (
      typeof Auth !==
        'undefined' &&
      Auth.can &&
      !Auth.can(
        'bulk_import'
      )
    ) {
      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          'You do not have permission to save questions.',
          true
        );
      }

      return;
    }

    const question =
      state.parsedQuestions[
        index
      ];

    if (!question) {
      return;
    }

    if (!question.isValid) {
      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          `Question #${index + 1} has validation issues: ${
            (
              question.errors ||
              []
            ).join(', ')
          }`,
          true
        );
      }

      return;
    }

    const metadata =
      getMeta();

    const payload = {
      subject:
        question.subject ||
        metadata.subject,

      klass:
        question.klass ||
        metadata.klass,

      chapter:
        question.chapter ||
        metadata.chapter,

      topic:
        question.concept ||
        question.topic ||
        'General',

      exams:
        question.exams &&
        question.exams.length
          ? question.exams
          : metadata.exams,

      qType:
        question.qType ||
        'mcq_single',

      question:
        question.question,

      optA:
        question.optA ||
        '',

      optB:
        question.optB ||
        '',

      optC:
        question.optC ||
        '',

      optD:
        question.optD ||
        '',

      assertion:
        question.assertion ||
        '',

      reason:
        question.reason ||
        '',

      statement1:
        question.statement1 ||
        '',

      statement2:
        question.statement2 ||
        '',

      predefOptions:
        question.predefOptions ||
        '',

      columnA:
        question.columnA ||
        [],

      columnB:
        question.columnB ||
        [],

      matchOptions:
        question.matchOptions ||
        question.matrixAnswer ||
        {},

      numAnswer:
        question.numAnswer ||
        question.answer ||
        '',

      correctOption:
        (
          question.qType ===
            'numerical' ||
          question.qType ===
            'integer'
        )
          ? (
              question.numAnswer ||
              question.answer ||
              ''
            )
          : (
              question.answer ||
              question.correctOption ||
              'A'
            ),

      solutionText:
        question.solutionText ||
        '',

      difficulty:
        question.difficulty ||
        metadata.defaultDiff,
    };

    try {
      await apiReq(
        '/api/questions',
        {
          method:
            'POST',

          body:
            JSON.stringify(
              payload
            ),
        }
      );

      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          `Question #${index + 1} saved successfully to database!`
        );
      }

      question.isDuplicate =
        true;

      renderCards();

      if (
        typeof window.loadQuestions ===
        'function'
      ) {
        window.loadQuestions();
      }
    } catch (error) {
      console.error(
        'Save single question error:',
        error
      );

      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          'Failed to save question: ' +
            error.message,
          true
        );
      }
    }
  }

  function setValue(id, value) {
    const element =
      document.getElementById(id);

    if (element) {
      element.value =
        value;
    }
  }

  function getValue(id) {
    const element =
      document.getElementById(id);

    return element
      ? element.value.trim()
      : '';
  }

  async function executeBulkImport() {
    if (
      typeof Auth !==
        'undefined' &&
      Auth.can &&
      !Auth.can(
        'bulk_import'
      )
    ) {
      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          'You do not have permission to import questions.',
          true
        );
      }

      return;
    }

    const importList =
      state.parsedQuestions.filter(
        (question) => {
          if (question.ignored) {
            return false;
          }

          if (!question.isValid) {
            return false;
          }

          if (
            question.isDuplicate &&
            question.dupAction ===
              'skip'
          ) {
            return false;
          }

          return true;
        }
      );

    if (!importList.length) {
      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          'No valid questions ready to import.',
          true
        );
      }

      return;
    }

    if (
      !confirm(
        `Import ${importList.length} validated question(s) into database?`
      )
    ) {
      return;
    }

    const button =
      document.getElementById(
        'bqImportBtn'
      ) ||
      document.getElementById(
        'bulkImportBtn'
      );

    if (button) {
      button.disabled = true;

      button.textContent =
        'Importing...';
    }

    const metadata =
      getMeta();

    const payload =
      importList.map(
        (question) => ({
          subject:
            question.subject ||
            metadata.subject,

          klass:
            question.klass ||
            metadata.klass,

          chapter:
            question.chapter ||
            metadata.chapter,

          topic:
            question.concept ||
            question.topic ||
            'General',

          exams:
            question.exams &&
            question.exams.length
              ? question.exams
              : metadata.exams,

          qType:
            question.qType ||
            'mcq_single',

          question:
            question.question,

          optA:
            question.optA ||
            '',

          optB:
            question.optB ||
            '',

          optC:
            question.optC ||
            '',

          optD:
            question.optD ||
            '',

          assertion:
            question.assertion ||
            '',

          reason:
            question.reason ||
            '',

          statement1:
            question.statement1 ||
            '',

          statement2:
            question.statement2 ||
            '',

          predefOptions:
            question.predefOptions ||
            '',

          columnA:
            question.columnA ||
            [],

          columnB:
            question.columnB ||
            [],

          matchOptions:
            question.matchOptions ||
            question.matrixAnswer ||
            {},

          numAnswer:
            question.numAnswer ||
            question.answer ||
            '',

          correctOption:
            (
              question.qType ===
                'numerical' ||
              question.qType ===
                'integer'
            )
              ? (
                  question.numAnswer ||
                  question.answer ||
                  ''
                )
              : question.answer,

          solutionText:
            question.solutionText ||
            '',

          difficulty:
            question.difficulty ||
            metadata.defaultDiff,
        })
      );

    try {
      const response =
        await apiReq(
          '/api/questions/batch',
          {
            method:
              'POST',

            body:
              JSON.stringify(
                payload
              ),
          }
        );

      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          `Successfully imported ${
            response.count ||
            payload.length
          } questions!`
        );
      }

      if (
        typeof window.loadQuestions ===
        'function'
      ) {
        window.loadQuestions();
      }

      const textarea =
        document.getElementById(
          'bqTextarea'
        ) ||
        document.getElementById(
          'bulkEditorTextarea'
        );

      if (textarea) {
        textarea.value = '';

        localStorage.removeItem(
          'bq_draft_v2'
        );

        scheduleReparse();
      }
    } catch (error) {
      console.error(
        'Bulk Import error:',
        error
      );

      if (
        typeof showToast ===
        'function'
      ) {
        showToast(
          'Import failed: ' +
            error.message,
          true
        );
      }
    } finally {
      if (button) {
        button.disabled =
          false;

        button.textContent =
          '⚡ Import All Validated Questions';
      }
    }
  }

  async function fetchExistingQuestions() {
    try {
      const response =
        await apiReq(
          '/api/questions'
        );

      state.existingQuestions =
        response || [];
    } catch (error) {
      state.existingQuestions =
        [];
    }
  }

  function initialize() {
    initEditor();
    fetchExistingQuestions();

    const searchInput =
      document.getElementById(
        'bqFilterSearch'
      ) ||
      document.getElementById(
        'bulkSearchInput'
      );

    const typeFilter =
      document.getElementById(
        'bqFilterType'
      );

    const difficultyFilter =
      document.getElementById(
        'bqFilterDiff'
      ) ||
      document.getElementById(
        'bulkFilterDiff'
      );

    const statusFilter =
      document.getElementById(
        'bqFilterStatus'
      ) ||
      document.getElementById(
        'bulkFilterStatus'
      );

    const duplicateFilter =
      document.getElementById(
        'bqFilterDup'
      ) ||
      document.getElementById(
        'bulkFilterDup'
      );

    const conceptFilter =
      document.getElementById(
        'bqFilterConcept'
      ) ||
      document.getElementById(
        'bulkFilterConcept'
      );

    if (searchInput) {
      searchInput.addEventListener(
        'input',
        (event) => {
          state.filterSearch =
            event.target.value;

          renderCards();
        }
      );
    }

    if (typeFilter) {
      typeFilter.addEventListener(
        'change',
        (event) => {
          state.filterType =
            event.target.value;

          renderCards();
        }
      );
    }

    if (difficultyFilter) {
      difficultyFilter.addEventListener(
        'change',
        (event) => {
          state.filterDiff =
            event.target.value;

          renderCards();
        }
      );
    }

    if (statusFilter) {
      statusFilter.addEventListener(
        'change',
        (event) => {
          state.filterStatus =
            event.target.value;

          renderCards();
        }
      );
    }

    if (duplicateFilter) {
      duplicateFilter.addEventListener(
        'change',
        (event) => {
          state.filterDup =
            event.target.value;

          renderCards();
        }
      );
    }

    if (conceptFilter) {
      conceptFilter.addEventListener(
        'change',
        (event) => {
          state.filterSearch =
            event.target.value;

          renderCards();
        }
      );
    }
  }

  const globalObject =
    typeof window !==
      'undefined'
      ? window
      : globalThis;

  globalObject.ParserRegistry =
    ParserRegistry;

  globalObject.BaseQuestionParser =
    BaseQuestionParser;

  globalObject.parseText =
    parseText;

  globalObject.validateAll =
    validateAll;

  globalObject.BulkModule = {
    init:
      initialize,

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

    exportQuestions:
      () => {},

    toggleCardCollapse:
      (index) => {
        if (
          state.parsedQuestions[
            index
          ]
        ) {
          state.parsedQuestions[
            index
          ].collapsed =
            !state.parsedQuestions[
              index
            ].collapsed;

          renderCards();
        }
      },

    toggleIgnore:
      (index) => {
        if (
          state.parsedQuestions[
            index
          ]
        ) {
          state.parsedQuestions[
            index
          ].ignored =
            !state.parsedQuestions[
              index
            ].ignored;

          updateStats();
          renderCards();
        }
      },

    deleteCard:
      (index) => {
        state.parsedQuestions.splice(
          index,
          1
        );

        renderCards();
        updateStats();
      },
  };
})();