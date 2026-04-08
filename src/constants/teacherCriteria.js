export const TEACHER_CRITERIA = [
  { key: 'problem_understanding', label: 'Problem Understanding & Initial Approach', max: 10 },
  { key: 'novelty', label: 'Novelty', max: 15 },
  { key: 'technical_depth', label: 'Technical Depth & Feasibility', max: 25 },
  { key: 'social_relevance', label: 'Social relevance & impact', max: 15 },
  { key: 'presentation', label: 'Presentation and Communication', max: 15 },
  { key: 'github', label: 'GitHub', max: 10 },
  { key: 'documentation', label: 'Documentation', max: 10 },
]

export const TEACHER_CRITERIA_TOTAL = TEACHER_CRITERIA.reduce((sum, item) => sum + item.max, 0)