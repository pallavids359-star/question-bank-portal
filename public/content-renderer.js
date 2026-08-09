(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QbpContentRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LATEX_COMMAND = /\\(?:dfrac|frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|theta|lambda|omega|pi|mu|sigma|phi|delta|epsilon|mathrm|mathbf|text|vec|hat|bar|left|right|cdot|times|div|rightarrow|leftarrow|leftrightarrow|geq|leq|neq|infty|partial|nabla)(?![A-Za-z])/;

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

  function ensureMathDelimiters(text) {
    const source = String(text || '');
    const hasDollarMath = source.includes('$') && source.indexOf('$') !== source.lastIndexOf('$');
    const hasParenthesizedMath = source.includes('\\(') && source.includes('\\)');
    const hasDisplayMath = source.includes('\\[') && source.includes('\\]');
    if (!source || hasDollarMath || hasParenthesizedMath || hasDisplayMath) return source;
    if (LATEX_COMMAND.test(source)) return `$${source.trim()}$`;
    return source;
  }

  return { LATEX_COMMAND, tokenizeMarkdown, ensureMathDelimiters };
});
