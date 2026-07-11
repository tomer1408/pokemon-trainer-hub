export interface QuizAnswer {
  id: string;
  label: string;
  weights: {
    types?: Record<string, number>;
    stats?: Record<string, number>;
    style?: Record<string, number>;
  };
}

export interface QuizQuestion {
  id: string;
  question: string;
  answers: QuizAnswer[];
}

// Fixed rule-based questionnaire — every answer's point weights are declared
// here, in one place, so the scoring logic never needs to special-case a
// question. Nothing about the final recommendation is hardcoded: these
// weights only build a QuizPreferenceProfile (see quiz-preferences.ts),
// which is then scored against real Pokémon data (see
// quiz-recommendation.service.ts).
export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'q1',
    question: 'What kind of trainer are you?',
    answers: [
      { id: 'q1a', label: 'Fast and bold', weights: { stats: { speed: 3, attack: 2 }, types: { electric: 1, fire: 1 } } },
      { id: 'q1b', label: 'Calm and strategic', weights: { stats: { defense: 3, hp: 2 }, types: { water: 1, psychic: 1 } } },
      { id: 'q1c', label: 'Loyal and balanced', weights: { style: { balanced: 3 }, stats: { hp: 1 }, types: { normal: 1, grass: 1 } } },
      { id: 'q1d', label: 'Aggressive and fearless', weights: { stats: { attack: 3, baseExperience: 2 }, types: { fire: 2, fighting: 1 } } },
    ],
  },
  {
    id: 'q2',
    question: 'What matters most in your Dream Team?',
    answers: [
      { id: 'q2a', label: 'Speed', weights: { stats: { speed: 4 }, types: { electric: 1, flying: 1 } } },
      { id: 'q2b', label: 'Raw power', weights: { stats: { attack: 3, baseExperience: 3 }, types: { fire: 1, dragon: 1 } } },
      { id: 'q2c', label: 'Defense and survival', weights: { stats: { defense: 3, hp: 3 }, types: { rock: 1, water: 1 } } },
      { id: 'q2d', label: 'Type balance', weights: { style: { balanced: 4 }, types: { grass: 1, water: 1, electric: 1 } } },
    ],
  },
  {
    id: 'q3',
    question: 'Which environment do you feel most connected to?',
    answers: [
      { id: 'q3a', label: 'Forest', weights: { types: { grass: 4, bug: 1, poison: 1 } } },
      { id: 'q3b', label: 'Ocean', weights: { types: { water: 4, ice: 1 } } },
      { id: 'q3c', label: 'Volcano', weights: { types: { fire: 4, rock: 1, ground: 1 } } },
      { id: 'q3d', label: 'City / technology', weights: { types: { electric: 4, steel: 1, psychic: 1 } } },
    ],
  },
  {
    id: 'q4',
    question: 'How do you prefer to win a battle?',
    answers: [
      { id: 'q4a', label: 'Strike first', weights: { stats: { speed: 4, attack: 1 } } },
      { id: 'q4b', label: 'Hit hard', weights: { stats: { attack: 4, baseExperience: 2 } } },
      { id: 'q4c', label: 'Outlast the opponent', weights: { stats: { defense: 3, hp: 3 } } },
      { id: 'q4d', label: 'Use clever advantages', weights: { stats: { specialAttack: 3 }, types: { psychic: 2, ghost: 1 } } },
    ],
  },
  {
    id: 'q5',
    question: 'What kind of Pokémon personality do you like?',
    answers: [
      { id: 'q5a', label: 'Cute and friendly', weights: { types: { normal: 2, fairy: 2, electric: 1 }, stats: { hp: 1 } } },
      { id: 'q5b', label: 'Cool and powerful', weights: { types: { fire: 2, dragon: 2 }, stats: { attack: 2, baseExperience: 1 } } },
      { id: 'q5c', label: 'Mysterious and smart', weights: { types: { psychic: 3, ghost: 2 }, stats: { specialAttack: 2 } } },
      { id: 'q5d', label: 'Natural and loyal', weights: { types: { grass: 3, water: 1 }, stats: { defense: 1 }, style: { balanced: 1 } } },
    ],
  },
  {
    id: 'q6',
    question: 'Which Pokémon type do you usually prefer?',
    answers: [
      { id: 'q6a', label: 'Fire', weights: { types: { fire: 5 } } },
      { id: 'q6b', label: 'Water', weights: { types: { water: 5 } } },
      { id: 'q6c', label: 'Electric', weights: { types: { electric: 5 } } },
      { id: 'q6d', label: 'Grass', weights: { types: { grass: 5 } } },
      { id: 'q6e', label: 'I do not have a favorite type', weights: { style: { balanced: 3 } } },
    ],
  },
];
