(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QbpContentRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LATEX_COMMAND = /\\(?:begin|dfrac|frac|sqrt|int|sum|prod|lim|sin|cos|tan|cot|sec|csc|log|ln|alpha|beta|gamma|theta|lambda|omega|pi|mu|sigma|phi|delta|epsilon|mathrm|mathbf|text|vec|hat|bar|left|right|cdot|times|div|rightarrow|leftarrow|leftrightarrow|geq|leq|neq|infty|partial|nabla)(?![A-Za-z])/;

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
      (_, expression) => `$$${normalizeMathEscapes(expression.trim())}$$`
    );
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

  function wrapLatexEnvironments(text) {
    return String(text || '').replace(
      /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g,
      expression => `$$${normalizeMathEscapes(expression)}$$`
    );
  }

  function ensureMathDelimiters(text) {
    let source = String(text || '');
    source = source.replace(/\\\\([\[\]()])/g, '\\$1');
    source = normalizeFencedMath(source);
    source = source.replace(/`thenfor`/gi, ' then for ');
    source = source.replace(/`([^`\r\n]+)`/g, '$1');
    source = source.replace(/\bthenfor\b/gi, 'then for');
    source = source.replace(/\b([xyz]\s*=\s*[+-]?\d+(?:\.\d+)?)\$(?=\s|$)/gi, '$$$1$');
    source = pairTrailingDisplayDelimiter(source);
    source = wrapLatexEnvironments(source);

    const hasDollarMath = source.includes('$') && source.indexOf('$') !== source.lastIndexOf('$');
    const hasParenthesizedMath = source.includes('\\(') && source.includes('\\)');
    const hasDisplayMath = source.includes('\\[') && source.includes('\\]');
    if (hasDollarMath || hasParenthesizedMath || hasDisplayMath) return source;

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

    const repairedDisplayMath = source.includes('\\[') && source.includes('\\]');
    const repairedInlineMath = source.includes('\\(') && source.includes('\\)');
    if (!source || repairedDisplayMath || repairedInlineMath) return source;
    if (LATEX_COMMAND.test(source)) return `$${source.trim()}$`;
    return source;
  }

  return { LATEX_COMMAND, tokenizeMarkdown, ensureMathDelimiters };
});
