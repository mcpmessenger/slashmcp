/**
 * Memory Service for State & Memory Agent
 * 
 * Provides functions for storing and retrieving persistent user context,
 * preferences, conversation summaries, and cross-session memory.
 */

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface MemoryService {
  getMemory(key: string): Promise<unknown | null>;
  setMemory(key: string, value: unknown): Promise<void>;
  deleteMemory(key: string): Promise<void>;
  getAllMemory(): Promise<Array<{ key: string; value: unknown; updated_at: string }>>;
  summarizeConversation(history: Array<{ role: string; content: string }>): Promise<string>;
  getUserPreferences(): Promise<Record<string, unknown>>;
  setUserPreferences(preferences: Record<string, unknown>): Promise<void>;
}

/**
 * Create a memory service instance for a user
 */
export function createMemoryService(
  supabase: SupabaseClient,
  userId: string,
): MemoryService {
  return {
    /**
     * Retrieve stored memory by key
     */
    async getMemory(key: string): Promise<unknown | null> {
      const { data, error } = await supabase
        .from("user_memory")
        .select("value")
        .eq("user_id", userId)
        .eq("key", key)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          // No rows returned
          return null;
        }
        console.error("Error retrieving memory:", error);
        throw error;
      }

      return data?.value ?? null;
    },

    /**
     * Store or update memory by key
     */
    async setMemory(key: string, value: unknown): Promise<void> {
      const { error } = await supabase
        .from("user_memory")
        .upsert(
          {
            user_id: userId,
            key,
            value: value as Record<string, unknown>,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "user_id,key",
          },
        );

      if (error) {
        console.error("Error storing memory:", error);
        throw error;
      }
    },

    /**
     * Delete memory by key
     */
    async deleteMemory(key: string): Promise<void> {
      const { error } = await supabase
        .from("user_memory")
        .delete()
        .eq("user_id", userId)
        .eq("key", key);

      if (error) {
        console.error("Error deleting memory:", error);
        throw error;
      }
    },

    /**
     * Get all memory entries for the user
     */
    async getAllMemory(): Promise<Array<{ key: string; value: unknown; updated_at: string }>> {
      const { data, error } = await supabase
        .from("user_memory")
        .select("key, value, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error retrieving all memory:", error);
        throw error;
      }

      return (data ?? []).map((item) => ({
        key: item.key,
        value: item.value,
        updated_at: item.updated_at,
      }));
    },

    /**
     * Summarize a conversation history
     * This is a simple implementation - can be enhanced with LLM calls later
     */
    async summarizeConversation(
      history: Array<{ role: string; content: string }>,
    ): Promise<string> {
      if (history.length === 0) {
        return "";
      }

      // Simple summarization: extract key points from user messages
      // In Phase 2, this could use an LLM to create intelligent summaries
      const userMessages = history
        .filter((msg) => msg.role === "user")
        .map((msg) => msg.content)
        .slice(0, 10); // Limit to last 10 user messages

      const summary = `Recent conversation topics: ${userMessages.join("; ")}`;
      
      // Store the summary
      const summaryKey = `conversation_summary_${new Date().toISOString().split("T")[0]}`;
      await this.setMemory(summaryKey, {
        summary,
        message_count: history.length,
        last_updated: new Date().toISOString(),
      });

      return summary;
    },

    /**
     * Get user preferences
     */
    async getUserPreferences(): Promise<Record<string, unknown>> {
      const preferences = await this.getMemory("preferences");
      return (preferences as Record<string, unknown>) ?? {};
    },

    /**
     * Set user preferences
     */
    async setUserPreferences(preferences: Record<string, unknown>): Promise<void> {
      await this.setMemory("preferences", preferences);
    },
  };
}

