(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.QPMatchDisplay = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const PAIR_RE = /\(?\s*([A-Za-z]+|\d+)\s*\)?\s*(?:→|->|=>|–|—|-)\s*\(?\s*([A-Za-z]+|\d+)\s*\)?/g;

  function optionValues(question) {
    const source = question && (question.matchOptions || question.match_options);
    let options = source;
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch (_) { options = null; }
    }
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      options = {};
    }
    return ['A', 'B', 'C', 'D']
      .map(letter => options[letter] || options[letter.toLowerCase()] || (question && (question['opt' + letter] || question['opt_' + letter.toLowerCase()])) || '')
      .filter(Boolean)
      .map(String);
  }

  function optionFor(question, letter) {
    const source = question && (question.matchOptions || question.match_options);
    let options = source;
    if (typeof options === 'string') {
      try { options = JSON.parse(options); } catch (_) { options = null; }
    }
    const key = String(letter || '').toUpperCase();
    return String(
      (options && typeof options === 'object' && !Array.isArray(options) && (options[key] || options[key.toLowerCase()])) ||
      (question && (question['opt' + key] || question['opt_' + key.toLowerCase()])) ||
      ''
    );
  }

  function parsePairs(value) {
    const pairs = [];
    const regex = new RegExp(PAIR_RE.source, 'g');
    let match;
    while ((match = regex.exec(String(value || ''))) !== null) {
      pairs.push([match[1], match[2]]);
    }
    return pairs;
  }

  function tokenRank(token) {
    if (/^\d+$/.test(token)) return Number(token);
    const roman = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
    const normalized = String(token || '').toLowerCase();
    if (roman[normalized]) return roman[normalized];
    if (/^[A-Za-z]$/.test(token)) return token.toUpperCase().charCodeAt(0) - 64;
    return 999;
  }

  function uniqueSorted(tokens) {
    const seen = new Set();
    return tokens.filter(token => {
      const key = String(token).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => tokenRank(a) - tokenRank(b));
  }

  function labelsFor(question, side, count) {
    const pairs = optionValues(question).flatMap(parsePairs);
    const inferred = uniqueSorted(pairs.map(pair => pair[side === 'right' ? 1 : 0]));
    if (inferred.length === count) return inferred;
    if (side === 'left') return Array.from({ length: count }, (_, index) => String(index + 1));
    return Array.from({ length: count }, (_, index) => String.fromCharCode(97 + index));
  }

  function inferredLabels(question, side) {
    const pairs = optionValues(question).flatMap(parsePairs);
    return uniqueSorted(pairs.map(pair => pair[side === 'right' ? 1 : 0]));
  }

  function plainStart(value) {
    return String(value || '')
      .replace(/^\s*(?:\$+|\\\(|\\\[)?\s*/, '')
      .replace(/^\s*[({[]+\s*/, '')
      .trim();
  }

  function isLikelyStatementStart(value) {
    const text = plainStart(value);
    if (!text) return false;
    // A chemical symbol/formula such as CO2, Na+ or H2O is normally a
    // continuation, not the beginning of a new matching statement.
    if (/^(?:[A-Z][a-z]?\d*|[A-Z]{2,}\d+)(?:\^?[+\-]\d*)?\$?[,.;:]?$/.test(text)) return false;
    return /^[A-Z][A-Za-z'’\-]*(?:\s|$)/.test(text);
  }

  function joinFragments(parts) {
    return parts.map(part => String(part || '').trim()).filter(Boolean).join(' ')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/([([])\s+/g, '$1')
      .trim();
  }

  function partitionEvenly(entries, count) {
    const groups = [];
    let cursor = 0;
    for (let groupIndex = 0; groupIndex < count; groupIndex++) {
      const remainingEntries = entries.length - cursor;
      const remainingGroups = count - groupIndex;
      const take = Math.max(1, Math.ceil(remainingEntries / remainingGroups));
      groups.push(joinFragments(entries.slice(cursor, cursor + take)));
      cursor += take;
    }
    return groups;
  }

  function reconstructEntries(question, side, rawEntries) {
    const entries = Array.isArray(rawEntries)
      ? rawEntries.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    const labels = inferredLabels(question, side);
    const expectedCount = labels.length;
    if (expectedCount && entries.length < expectedCount) {
      const expectedLabels = new Set(labels.map(label => String(label).toLowerCase()));
      const valuesByLabel = new Map();
      const unlabeledEntries = [];
      let expandedNestedRows = false;

      entries.forEach(entry => {
        const nestedRows = extractLabeledRows(entry);
        const allExpected = nestedRows.length > 1 && nestedRows.every(row =>
          expectedLabels.has(String(row.label).toLowerCase())
        );
        if (!allExpected) {
          unlabeledEntries.push(entry);
          return;
        }
        expandedNestedRows = true;
        nestedRows.forEach(row => {
          valuesByLabel.set(String(row.label).toLowerCase(), row.value);
        });
      });

      if (expandedNestedRows) {
        const missingLabels = labels.filter(label => !valuesByLabel.has(String(label).toLowerCase()));
        if (missingLabels.length === unlabeledEntries.length) {
          missingLabels.forEach((label, index) => {
            valuesByLabel.set(String(label).toLowerCase(), unlabeledEntries[index]);
          });
          return {
            entries: labels.map(label => valuesByLabel.get(String(label).toLowerCase())),
            labels
          };
        }
      }
    }
    if (!expectedCount || entries.length <= expectedCount) {
      return { entries, labels: labels.length === entries.length ? labels : labelsFor(question, side, entries.length) };
    }

    // Bad legacy Biology imports frequently split a statement at every word.
    // Their real entries still start with title-case words, while following
    // fragments remain lower-case. Use those starts only when they produce the
    // exact number of rows required by this question's option mappings.
    const starts = [0];
    for (let index = 1; index < entries.length; index++) {
      if (isLikelyStatementStart(entries[index])) starts.push(index);
    }

    let reconstructed;
    if (starts.length === expectedCount) {
      reconstructed = starts.map((start, index) => joinFragments(
        entries.slice(start, index + 1 < starts.length ? starts[index + 1] : entries.length)
      ));
    } else {
      // If capitalization is incomplete, preserve order and form exactly the
      // number of rows referenced by the options. This is display-only.
      reconstructed = partitionEvenly(entries, expectedCount);
    }

    return { entries: reconstructed, labels };
  }

  function formatMapping(value) {
    return String(value || '').replace(
      /\(?\s*([A-Za-z]+|\d+)\s*\)?\s*(?:→|->|=>|–|—|-)\s*\(?\s*([A-Za-z]+|\d+)\s*\)?/g,
      '$1 → $2'
    ).replace(/,\s*/g, ', ');
  }

  function extractLabeledRows(line) {
    const text = String(line || '').trim();
    if (!text) return [];
    // A delimiter is mandatory unless the row begins with the word "Row".
    // This prevents ordinary Biology phrases from being split at every word.
    const marker = /(^|\s)(?:Row\s+([A-Za-z0-9]+)\s*(?:[.:\-–—)]\s*|\s+)|\(\s*([A-Za-z0-9]+)\s*\)\s*|\[\s*([A-Za-z0-9]+)\s*\]\s*|((?:[A-Za-z]|\d+|[IVXLCDM]+))\s*[.:\-–—)]\s*)/gi;
    const matches = Array.from(text.matchAll(marker));
    if (!matches.length) return [];
    return matches.map((current, index) => {
      const start = current.index + current[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index : text.length;
      return {
        label: current[2] || current[3] || current[4] || current[5] || '',
        value: text.slice(start, end).trim()
      };
    }).filter(row => row.value);
  }

  function romanRank(label) {
    const source = String(label || '').toUpperCase();
    if (!/^(?=[IVXLCDM]+$)M{0,4}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/.test(source)) {
      return 0;
    }
    const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
    let total = 0;
    for (let index = 0; index < source.length; index += 1) {
      const current = values[source[index]];
      const next = values[source[index + 1]] || 0;
      total += current < next ? -current : current;
    }
    return total;
  }

  function orderedSequentialRows(rows) {
    const labels = rows.map(row => String(row.label || ''));
    if (labels.length < 2) return [];

    let ranked = [];
    if (labels.every(label => /^\d+$/.test(label))) {
      ranked = rows.map(row => ({ row, rank: Number(row.label) }));
    } else {
      const romanRanks = labels.map(romanRank);
      const isRomanSeries = romanRanks.every(Boolean) &&
        (labels.some(label => label.length > 1) || Math.min(...romanRanks) <= 5);
      if (isRomanSeries) {
        ranked = rows.map((row, index) => ({ row, rank: romanRanks[index] }));
      } else if (labels.every(label => /^[A-Za-z]$/.test(label))) {
        ranked = rows.map(row => ({
          row,
          rank: String(row.label).toLowerCase().charCodeAt(0) - 96
        }));
      } else {
        return [];
      }
    }

    const ranks = ranked.map(item => item.rank);
    if (new Set(ranks).size !== ranks.length) return [];
    const sorted = ranked.slice().sort((a, b) => a.rank - b.rank);
    const consecutive = sorted.every((item, index) => index === 0 || item.rank === sorted[index - 1].rank + 1);
    return consecutive ? sorted.map(item => item.row) : [];
  }

  function extractSequentialRows(line) {
    const rows = extractLabeledRows(line);
    return orderedSequentialRows(rows).map(row => row.value);
  }

  function extractExplicitRows(line) {
    return extractLabeledRows(line).map(row => row.value);
  }

  return {
    optionValues,
    optionFor,
    parsePairs,
    labelsFor,
    inferredLabels,
    reconstructEntries,
    formatMapping,
    extractExplicitRows,
    extractSequentialRows
  };
});
