
export enum Importance {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH'
}

export enum Subject {
  MATHEMATICS = 'Matemática',
  PHYSICS = 'Física',
  BIOLOGY = 'Biologia',
  CHEMISTRY = 'Química',
  HISTORY = 'História',
  GEOGRAPHY = 'Geografia',
  LITERATURE = 'Literatura',
  PHILOSOPHY = 'Filosofia',
  SOCIOLOGY = 'Sociologia',
  THEOLOGY = 'Teologia',
  LAW = 'Direito',
  ECONOMICS = 'Economia',
  OTHERS = 'Outros'
}

export enum UserRole {
  PROFESSOR = 'Professor',
  ALUNO = 'Aluno',
  CURIOSO = 'Curioso'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface Flashcard {
  question: string;
  answer: string;
}

export interface SummaryOption {
  label: string;
  content: string;
}

export interface Summary {
  id: string;
  title: string;
  content: string;
  subject: Subject;
  importance: Importance;
  // Changed to snake_case to align with typical Supabase responses and App.tsx usage
  created_at: string;
  flashcards: Flashcard[];
  url?: string;
}

export interface GenerationResult {
  options: SummaryOption[];
  flashcards: Flashcard[];
}
