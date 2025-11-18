export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      analysis_results: {
        Row: {
          id: string;
          job_id: string | null;
          ocr_text: string | null;
          textract_response: Json | null;
          summary: Json | null;
          vision_summary: string | null;
          vision_metadata: Json | null;
          vision_provider: string | null;
          vision_cost: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_id?: string | null;
          ocr_text?: string | null;
          textract_response?: Json | null;
          summary?: Json | null;
          vision_summary?: string | null;
          vision_metadata?: Json | null;
          vision_provider?: string | null;
          vision_cost?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_id?: string | null;
          ocr_text?: string | null;
          textract_response?: Json | null;
          summary?: Json | null;
          vision_summary?: string | null;
          vision_metadata?: Json | null;
          vision_provider?: string | null;
          vision_cost?: Json | null;
          created_at?: string;
        };
      };
      processing_jobs: {
        Row: {
          id: string;
          user_id: string | null;
          file_name: string;
          file_type: string;
          file_size: number;
          storage_path: string | null;
          analysis_target: string;
          status: string;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          file_name: string;
          file_type: string;
          file_size: number;
          storage_path?: string | null;
          analysis_target: string;
          status?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          file_name?: string;
          file_type?: string;
          file_size?: number;
          storage_path?: string | null;
          analysis_target?: string;
          status?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_memory: {
        Row: {
          id: string;
          user_id: string;
          key: string;
          value: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key: string;
          value: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          key?: string;
          value?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

