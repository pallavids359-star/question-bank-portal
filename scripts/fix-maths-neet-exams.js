'use strict';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const applyChanges = process.argv.includes('--apply');

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY are required in .env.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function correctedExams(exams) {
  const values = Array.isArray(exams) ? exams.map(String) : [];
  const corrected = values.filter(exam =>
    exam !== 'NEET' && exam !== 'JEE Main' && exam !== 'JEE Advanced'
  );
  if (!corrected.includes('JEE')) corrected.push('JEE');
  return [...new Set(corrected)];
}

async function loadAffectedQuestions() {
  const rows = [];
  const pageSize = 500;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('questions')
      .select('id, subject, exams')
      .in('subject', ['Mathematics', 'Maths'])
      .range(from, from + pageSize - 1);

    if (error) throw error;
    rows.push(...(data || []).filter(question => {
      const exams = Array.isArray(question.exams) ? question.exams : [];
      return exams.some(exam =>
        exam === 'NEET' || exam === 'JEE Main' || exam === 'JEE Advanced'
      );
    }));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

async function main() {
  const questions = await loadAffectedQuestions();
  console.log(`Found ${questions.length} Mathematics question(s) using NEET or a legacy JEE label.`);

  if (!questions.length) return;
  if (!applyChanges) {
    console.log('Preview only: no records were changed.');
    console.log('Run again with --apply to change them to JEE.');
    return;
  }

  let updated = 0;
  for (const question of questions) {
    const { error } = await supabase
      .from('questions')
      .update({ exams: correctedExams(question.exams) })
      .eq('id', question.id);
    if (error) throw new Error(`Question ${question.id}: ${error.message}`);
    updated += 1;
  }

  console.log(`Successfully corrected ${updated} Mathematics question(s).`);
}

main().catch(error => {
  console.error('Correction failed:', error.message || error);
  process.exitCode = 1;
});
