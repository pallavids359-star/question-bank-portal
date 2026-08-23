(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.QbpContentRenderer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const LATEX_COMMAND = /\\(?:begin|end|dfrac|frac|sqrt|int|sum|prod|lim|alpha|beta|gamma|theta|lambda|omega|pi|mu|sigma|phi|delta|epsilon|mathrm|mathbf|text|vec|hat|bar|left|right|cdot|times|div|rightarrow|leftarrow|leftrightarrow|geq|leq|neq|infty|partial|nabla)(?![A-Za-z])/;

  function removeOrphanDisplayDollar(text) {
    const delimiters = String(text || '').match(/\$\$/g) || [];
    if (delimiters.length % 2 === 0) return String(text || '');
    if (/\$\$\s*$/.test(text)) return String(text).replace(/\$\$\s*$/, '').trimEnd();
    if (/^\s*\$\$/.test(text)) return String(text).replace(/^\s*\$\$/, '').trimStart();
    return String(text || '');
  }

  function removeOrphanInlineDollar(text) {
    const source = String(text || '');
    const positions = [];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== '$') continue;
      if (source[index - 1] === '$' || source[index + 1] === '$') continue;
      positions.push(index);
    }
    if (positions.length % 2 === 0) return source;
    const orphan = positions[positions.length - 1];
    return `${source.slice(0, orphan)}${source.slice(orphan + 1)}`;
  }

  function normalizePlainFractionPowers(text) {
    const source = String(text || '');
    if (!/^[A-Za-z0-9+\-*/().,\s]+$/.test(source)) return { text: source, changed: false };
    const normalized = source.replace(
      /([A-Za-z]|\))\s*(\d+)\s*\/\s*(\d+)(?=\s*(?:[+\-),]|$))/g,
      '$1^{$2/$3}'
    );
    return { text: normalized, changed: normalized !== source };
  }

  function normalizeFencedMath(text) {
    return String(text || '').replace(
      /```(?:math|latex)\s*\r?\n([\s\S]*?)\r?\n```/gi,
      (_, expression) => {
        const fractionalPowers = normalizePlainFractionPowers(expression.trim());
        return `$$${fractionalPowers.text}$$`;
      }
    );
  }

  function normalizeLatexEnvironments(text) {
    return String(text || '').replace(
      /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g,
      expression => `$$${expression}$$`
    );
  }

  function normalizePlainMathFragments(text) {
    const source = String(text || '');
    const parts = source.split(/(\$\$[\s\S]*?\$\$|\$[^$\r\n]+\$)/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        .replace(/\b([A-Za-z])\(([^()\r\n]+)\)/g, '$$$1($2)$$')
        .replace(/\b([xyz])\s*=\s*([+-]?\d+(?:\.\d+)?)/gi, '$$$1=$2$$');
    }).join('');
  }

  function normalizeInlineCode(text) {
    return String(text || '').replace(/`([^`\r\n]+)`/g, (_, expression) => {
      const trimmed = expression.trim();
      const fractionalPowers = normalizePlainFractionPowers(trimmed);
      const normalized = fractionalPowers.text;
      const isMath = fractionalPowers.changed || LATEX_COMMAND.test(normalized) || /[+\-*/=^_]/.test(normalized);
      return isMath ? `$${normalized}$` : normalized;
    });
  }

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
    let source = String(text || '');
    source = source.replace(/\\\\([\[\]()])/g, '\\$1');
    source = normalizeFencedMath(source);
    source = source.replace(/`thenfor`/gi, ' then for ');
    source = normalizeInlineCode(source);
    source = source.replace(/\bthenfor\b/gi, 'then for');
    source = normalizeLatexEnvironments(source);
    source = removeOrphanDisplayDollar(source);
    source = removeOrphanInlineDollar(source);
    if (source.includes('$$') || source.includes('\\[') || source.includes('\\(')) {
      source = normalizePlainMathFragments(source);
    }
    if (!source.includes('\\[') && source.includes('\\]')) {
      const closeIndex = source.indexOf('\\]');
      const beforeClose = source.slice(0, closeIndex);
      const commandMatch = beforeClose.match(LATEX_COMMAND);
      if (commandMatch) {
        source = `${source.slice(0, commandMatch.index)}\\[${source.slice(commandMatch.index)}`;
      }
    }
    if (!source.includes('\\(') && source.includes('\\)')) {
      const closeIndex = source.indexOf('\\)');
      const beforeClose = source.slice(0, closeIndex);
      const commandMatch = beforeClose.match(LATEX_COMMAND);
      if (commandMatch) {
        source = `${source.slice(0, commandMatch.index)}\\(${source.slice(commandMatch.index)}`;
      }
    }
    const dollarCount = (source.match(/\$/g) || []).length;
    const hasDollarMath = dollarCount >= 2 && dollarCount % 2 === 0;
    const hasParenthesizedMath = source.includes('\\(') && source.includes('\\)');
    const hasDisplayMath = source.includes('\\[') && source.includes('\\]');
    if (!source || hasDollarMath || hasParenthesizedMath || hasDisplayMath) return source;
    if (LATEX_COMMAND.test(source)) return `$${source.trim()}$`;
    const fractionalPowers = normalizePlainFractionPowers(source);
    if (fractionalPowers.changed) return `$${fractionalPowers.text.trim()}$`;
    return source;
  }

  return { LATEX_COMMAND, tokenizeMarkdown, ensureMathDelimiters };
});
