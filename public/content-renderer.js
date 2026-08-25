(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QbpContentRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LATEX_COMMAND = /\\(?:begin|det|operatorname|overrightarrow|overset|underset|dfrac|tfrac|frac|binom|sqrt|int|sum|prod|lim|sin|cos|tan|cot|sec|csc|log|ln|alpha|beta|gamma|theta|lambda|omega|pi|mu|sigma|phi|delta|epsilon|Delta|mathrm|mathbf|text|vec|hat|bar|left|right|cdot|times|div|pm|equiv|rightarrow|leftarrow|leftrightarrow|rightleftharpoons|leftharpoons|geq|leq|neq|infty|partial|nabla)(?![A-Za-z])/;

  function tokenizeMarkdown(text) {
    const source = String(text || '');
    const tokens = [];
    let cursor = 0;
    const strong = /\*\*([^*\r\n][\s\S]*?)\*\*/g;
    let match;
    while ((match = strong.exec(source))) {
      if (match.index > cursor) tokens.push({ type: 'text', value: source.slice(cursor, match.index) });
      tokens.push({ type: 'strong', value: match[1] });
      cursor = match.index + match[0].length;
    }
    if (cursor < source.length) tokens.push({ type: 'text', value: source.slice(cursor) });
    return tokens.length ? tokens : [{ type: 'text', value: '' }];
  }

  function normalizeFencedMath(text) {
    return String(text || '').replace(
      /```(?:math|latex)\s*\r?\n([\s\S]*?)\r?\n```/gi,
      (_, expression) => {
        const normalized = normalizeMathEscapes(expression.trim());
        if (/^[A-Za-z][A-Za-z\s]*$/.test(normalized)) return normalized;
        return `$$${normalized}$$`;
      }
    );
  }

  function normalizeInlineCode(text) {
    return String(text || '').replace(/`([^`\r\n]+)`/g, (_, expression) => {
      let normalized = normalizeMathEscapes(expression.trim());
      if (/^\$[^$]+\$$/.test(normalized)) return normalized;
      normalized = normalized.replace(/^\$(?!.*\$$)/, '').replace(/(?<!^)\$$/, '');
      const looksLikeMath = LATEX_COMMAND.test(normalized)
        || /^[A-Za-z]\s*=/.test(normalized)
        || /^[+\-]?\d+(?:\.\d+)?$/.test(normalized)
        || /[=^_∫∑√]/.test(normalized);
      return looksLikeMath ? `$${normalized}$` : normalized;
    });
  }

  function repairJoinedMathProse(text) {
    return String(text || '')
      .replace(/\bThesolutionthrough\b/gi, 'The solution through')
      .replace(/\bdifferentiableat(?=[A-Za-z]\s*=)/gi, 'differentiable at ')
      .replace(/\bexistson(?=\s*[−-]?\s*(?:\\?pi|π|\$))/gi, 'exists on ')
      .replace(/\bforall(?=\s*(?:\$|\\|[A-Za-z]))/gi, 'for all ');
  }

  function repairCommonOrphanInlineMath(text) {
    let source = String(text || '');
    const expression = '[A-Za-z][A-Za-z0-9_{}\\\\^]*\\s*=\\s*[^$\\s,;:.!?]+';
    const missingOpening = new RegExp(`(^|[\\s([:;,])(${expression})\\$(?=$|[\\s,;:.!?)}\\]])`, 'g');
    const missingClosing = new RegExp(`\\$(${expression})(?=(?:\\s+(?:and|or|then|where|gives|at)\\b)|[,;:.!?)]|$)`, 'gi');
    source = source.replace(missingOpening, (_, prefix, value) => `${prefix}$${value}$`);
    source = source.replace(missingClosing, (_, value) => `$${value}$`);
    return source;
  }

  function removePlainTextFences(text) {
    return String(text || '')
      .replace(/[\u200B\uFEFF]/g, '')
      .replace(/^\s*```(?:text|plain|markdown)?\s*$/gim, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  function normalizeMathEscapes(text) {
    return String(text || '').replace(/\\_/g, '_').replace(/\\=/g, '=');
  }

  function pairTrailingDisplayDelimiter(text) {
    const source = String(text || '');
    const delimiters = [...source.matchAll(/\$\$/g)];
    if (delimiters.length % 2 === 0) return source;
    const closingIndex = delimiters[delimiters.length - 1].index;
    const beforeClosing = source.slice(0, closingIndex);
    const commandMatch = beforeClosing.match(LATEX_COMMAND);
    if (!commandMatch) return source;
    const expression = normalizeMathEscapes(source.slice(commandMatch.index, closingIndex));
    return `${source.slice(0, commandMatch.index)}$$${expression}${source.slice(closingIndex)}`;
  }

  function normalizeDollarRuns(text) {
    const source = String(text || '');
    let result = '';
    let activeDelimiter = '';
    let index = 0;

    while (index < source.length) {
      if (source[index] !== '$') {
        result += source[index];
        index += 1;
        continue;
      }

      let end = index;
      while (source[end] === '$') end += 1;
      const runLength = end - index;

      if (!activeDelimiter) {
        activeDelimiter = runLength >= 2 ? '$$' : '$';
        result += activeDelimiter;
      } else if (activeDelimiter === '$') {
        result += '$';
        activeDelimiter = '';
      } else if (runLength >= 2) {
        result += '$$';
        activeDelimiter = '';
      } else {
        result += '$';
      }

      index = end;
    }

    return result;
  }

  function isInsideDollarMath(source, offset) {
    let activeDelimiter = '';
    let index = 0;
    while (index < offset) {
      if (source[index] !== '$') {
        index += 1;
        continue;
      }
      const delimiter = source[index + 1] === '$' ? '$$' : '$';
      if (!activeDelimiter) activeDelimiter = delimiter;
      else if (activeDelimiter === delimiter) activeDelimiter = '';
      index += delimiter.length;
    }
    return Boolean(activeDelimiter);
  }

  function wrapLatexEnvironments(text) {
    const source = String(text || '');
    return source.replace(
      /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g,
      (expression, environmentName, offset, fullText) => {
        return isInsideDollarMath(fullText, offset)
          ? normalizeMathEscapes(expression)
          : `$$${normalizeMathEscapes(expression)}$$`;
      }
    );
  }

  function ensureMathDelimiters(text) {
    let source = String(text || '');
    source = source.replace(/\\\\([\[\]()])/g, '\\$1');
    source = normalizeFencedMath(source);
    source = removePlainTextFences(source);
    source = source.replace(/`thenfor`/gi, ' then for ');
    source = normalizeInlineCode(source);
    source = source.replace(/\bthenfor\b/gi, 'then for');
    source = repairJoinedMathProse(source);
    source = repairCommonOrphanInlineMath(source);
    source = source.replace(/(?<!\$)\b([xyz]\s*=\s*[+-]?\d+(?:\.\d+)?)\$(?=\s|$)/gi, '$$$1$');
    source = normalizeDollarRuns(source);
    source = pairTrailingDisplayDelimiter(source);

    if (!source.includes('\\[') && source.includes('\\]')) {
      const closeIndex = source.indexOf('\\]');
      const commandMatch = source.slice(0, closeIndex).match(LATEX_COMMAND);
      if (commandMatch) {
        source = `${source.slice(0, commandMatch.index)}\\[${source.slice(commandMatch.index)}`;
      }
    }
    if (!source.includes('\\(') && source.includes('\\)')) {
      const closeIndex = source.indexOf('\\)');
      const commandMatch = source.slice(0, closeIndex).match(LATEX_COMMAND);
      if (commandMatch) {
        source = `${source.slice(0, commandMatch.index)}\\(${source.slice(commandMatch.index)}`;
      }
    }

    let hasDollarMath = source.includes('$') && source.indexOf('$') !== source.lastIndexOf('$');
    let hasParenthesizedMath = source.includes('\\(') && source.includes('\\)');
    let hasDisplayMath = source.includes('\\[') && source.includes('\\]');
    if (!hasDollarMath && !hasParenthesizedMath && !hasDisplayMath && LATEX_COMMAND.test(source)) {
      if (/^\\begin\{([A-Za-z*]+)\}[\s\S]*\\end\{\1\}$/.test(source.trim())) {
        return `$$${normalizeMathEscapes(source.trim())}$$`;
      }
      return `$${source.trim()}$`;
    }

    source = wrapLatexEnvironments(source);
    hasDollarMath = source.includes('$') && source.indexOf('$') !== source.lastIndexOf('$');
    hasParenthesizedMath = source.includes('\\(') && source.includes('\\)');
    hasDisplayMath = source.includes('\\[') && source.includes('\\]');
    if (hasDollarMath || hasParenthesizedMath || hasDisplayMath) return source;

    const repairedDisplayMath = source.includes('\\[') && source.includes('\\]');
    const repairedInlineMath = source.includes('\\(') && source.includes('\\)');
    if (!source || repairedDisplayMath || repairedInlineMath) return source;
    if (LATEX_COMMAND.test(source)) return `$${source.trim()}$`;
    return source;
  }

  return { LATEX_COMMAND, tokenizeMarkdown, ensureMathDelimiters };
});
