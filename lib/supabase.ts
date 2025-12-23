
import { createClient } from '@supabase/supabase-js';

// Credenciais fornecidas pelo usuário para conexão direta
const supabaseUrl = 'https://zuyqgilxmlzyzcprvjaw.supabase.co';
const supabaseAnonKey = 'sb_publishable_9Dbxg_E2V4TgX58dGhFNwA_9TKLgh8d';

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Inicializa o cliente com as credenciais garantidas
export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;
