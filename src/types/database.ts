export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_route_limits: {
        Row: {
          count: number
          created_at: string
          id: string
          route: string
          updated_at: string
          user_id: string
          window_start: string
        }
        Insert: {
          count?: number
          created_at?: string
          id?: string
          route: string
          updated_at?: string
          user_id: string
          window_start: string
        }
        Update: {
          count?: number
          created_at?: string
          id?: string
          route?: string
          updated_at?: string
          user_id?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_route_limits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_commands: {
        Row: {
          actions: Json
          annule_at: string | null
          annule_by: string | null
          couple_id: string
          created_at: string
          id: string
          statut: string
          texte_dicte: string
          undo_data: Json | null
          user_id: string | null
        }
        Insert: {
          actions?: Json
          annule_at?: string | null
          annule_by?: string | null
          couple_id: string
          created_at?: string
          id?: string
          statut?: string
          texte_dicte: string
          undo_data?: Json | null
          user_id?: string | null
        }
        Update: {
          actions?: Json
          annule_at?: string | null
          annule_by?: string | null
          couple_id?: string
          created_at?: string
          id?: string
          statut?: string
          texte_dicte?: string
          undo_data?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_commands_annule_by_fkey"
            columns: ["annule_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_commands_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_commands_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          couple_id: string
          created_at: string
          id: string
          name: string
          position: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      couple_join_attempts: {
        Row: {
          attempts: number
          user_id: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          user_id: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          user_id?: string
          window_started_at?: string
        }
        Relationships: []
      }
      couples: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "couples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      library_items: {
        Row: {
          category_id: string | null
          couple_id: string
          created_at: string
          deleted_at: string | null
          id: string
          last_used_at: string
          name: string
          nom_normalise: string
          usage_count: number
        }
        Insert: {
          category_id?: string | null
          couple_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_used_at?: string
          name: string
          nom_normalise?: string
          usage_count?: number
        }
        Update: {
          category_id?: string | null
          couple_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          last_used_at?: string
          name?: string
          nom_normalise?: string
          usage_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "library_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_items_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      list_items: {
        Row: {
          added_by: string | null
          checked_at: string | null
          checked_by: string | null
          created_at: string
          deleted_at: string | null
          id: string
          is_checked: boolean
          library_item_id: string
          list_id: string
          note: string | null
          quantities: Json | null
          quantity: string | null
        }
        Insert: {
          added_by?: string | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_checked?: boolean
          library_item_id: string
          list_id: string
          note?: string | null
          quantities?: Json | null
          quantity?: string | null
        }
        Update: {
          added_by?: string | null
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_checked?: boolean
          library_item_id?: string
          list_id?: string
          note?: string | null
          quantities?: Json | null
          quantity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "list_items_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_library_item_id_fkey"
            columns: ["library_item_id"]
            isOneToOne: false
            referencedRelation: "library_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_shared: boolean
          kind: string
          name: string
          owner_id: string | null
          position: number
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_shared?: boolean
          kind?: string
          name: string
          owner_id?: string | null
          position?: number
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_shared?: boolean
          kind?: string
          name?: string
          owner_id?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "lists_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lists_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_slot_sources: {
        Row: {
          created_at: string
          id: string
          list_item_id: string
          meal_slot_id: string
          origine: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_item_id: string
          meal_slot_id: string
          origine: string
        }
        Update: {
          created_at?: string
          id?: string
          list_item_id?: string
          meal_slot_id?: string
          origine?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_slot_sources_list_item_id_fkey"
            columns: ["list_item_id"]
            isOneToOne: false
            referencedRelation: "list_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slot_sources_meal_slot_id_fkey"
            columns: ["meal_slot_id"]
            isOneToOne: false
            referencedRelation: "meal_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_slots: {
        Row: {
          couple_id: string
          created_at: string
          created_by: string | null
          creneau: string
          date: string
          id: string
          recipe_id: string | null
          texte: string | null
          type: string
        }
        Insert: {
          couple_id: string
          created_at?: string
          created_by?: string | null
          creneau: string
          date: string
          id?: string
          recipe_id?: string | null
          texte?: string | null
          type: string
        }
        Update: {
          couple_id?: string
          created_at?: string
          created_by?: string | null
          creneau?: string
          date?: string
          id?: string
          recipe_id?: string | null
          texte?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_slots_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_slots_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          color: string
          couple_id: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          color?: string
          couple_id?: string | null
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          color?: string
          couple_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_ingredients: {
        Row: {
          id: string
          nom_affiche: string
          nom_normalise: string
          ordre: number
          quantite: number | null
          recipe_id: string
          unite: string | null
        }
        Insert: {
          id?: string
          nom_affiche: string
          nom_normalise: string
          ordre?: number
          quantite?: number | null
          recipe_id: string
          unite?: string | null
        }
        Update: {
          id?: string
          nom_affiche?: string
          nom_normalise?: string
          ordre?: number
          quantite?: number | null
          recipe_id?: string
          unite?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_ingredients_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          calories_par_portion: number | null
          couple_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          duree_minutes: number | null
          etapes: Json
          glucides_g: number | null
          id: string
          lipides_g: number | null
          nombre_personnes: number
          notes: string | null
          photo_url: string | null
          proteines_g: number | null
          source: string
          tags: string[]
          titre: string
          type_plat: string
        }
        Insert: {
          calories_par_portion?: number | null
          couple_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duree_minutes?: number | null
          etapes?: Json
          glucides_g?: number | null
          id?: string
          lipides_g?: number | null
          nombre_personnes?: number
          notes?: string | null
          photo_url?: string | null
          proteines_g?: number | null
          source: string
          tags?: string[]
          titre: string
          type_plat: string
        }
        Update: {
          calories_par_portion?: number | null
          couple_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          duree_minutes?: number | null
          etapes?: Json
          glucides_g?: number | null
          id?: string
          lipides_g?: number | null
          nombre_personnes?: number
          notes?: string | null
          photo_url?: string | null
          proteines_g?: number | null
          source?: string
          tags?: string[]
          titre?: string
          type_plat?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_couple_id_fkey"
            columns: ["couple_id"]
            isOneToOne: false
            referencedRelation: "couples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          added_by: string | null
          assigned_to: string | null
          created_at: string | null
          deleted_at: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          is_done: boolean
          list_id: string
          note: string | null
          position: number
          recurrence_day_of_month: number | null
          recurrence_end_date: string | null
          recurrence_interval: number
          recurrence_type: string
          recurrence_weekday: number | null
          title: string
        }
        Insert: {
          added_by?: string | null
          assigned_to?: string | null
          created_at?: string | null
          deleted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          list_id: string
          note?: string | null
          position?: number
          recurrence_day_of_month?: number | null
          recurrence_end_date?: string | null
          recurrence_interval?: number
          recurrence_type?: string
          recurrence_weekday?: number | null
          title: string
        }
        Update: {
          added_by?: string | null
          assigned_to?: string | null
          created_at?: string | null
          deleted_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          list_id?: string
          note?: string | null
          position?: number
          recurrence_day_of_month?: number | null
          recurrence_end_date?: string | null
          recurrence_interval?: number
          recurrence_type?: string
          recurrence_weekday?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "lists"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_or_merge_list_item: {
        Args: {
          p_added_by: string
          p_additions: Json
          p_category_name: string
          p_count_usage?: boolean
          p_list_id: string
          p_name: string
          p_nom_normalise: string
        }
        Returns: Json
      }
      check_ai_rate_limit: {
        Args: { p_limit?: number; p_route: string; p_window_seconds?: number }
        Returns: Json
      }
      commit_week_list_lines: {
        Args: { p_added_by: string; p_lines: Json; p_list_id: string }
        Returns: Json
      }
      confirm_meal_removal: {
        Args: {
          p_created_by: string
          p_list_item_ids: string[]
          p_mode: string
          p_recipe_id: string
          p_slot_id: string
          p_texte: string
        }
        Returns: Json
      }
      create_couple: {
        Args: { p_color: string; p_display_name: string }
        Returns: Json
      }
      create_default_categories: {
        Args: { p_couple_id: string }
        Returns: undefined
      }
      current_couple_id: { Args: never; Returns: string }
      delete_category_with_replacement: {
        Args: { p_category_id: string; p_replacement_id?: string }
        Returns: Json
      }
      generate_invite_code: { Args: never; Returns: string }
      increment_library_usage: {
        Args: { p_item_id: string }
        Returns: undefined
      }
      join_couple: {
        Args: { p_code: string; p_display_name: string }
        Returns: Json
      }
      merge_quantities: {
        Args: { p_additions: Json; p_existing: Json }
        Returns: Json
      }
      move_category: {
        Args: { p_category_id: string; p_direction: string }
        Returns: boolean
      }
      normaliser_nom: { Args: { raw: string }; Returns: string }
      swap_couple_colors: { Args: never; Returns: Json }
      update_recipe_with_ingredients: {
        Args: {
          p_calories_par_portion: number
          p_duree_minutes: number
          p_etapes: Json
          p_glucides_g: number
          p_ingredients: Json
          p_lipides_g: number
          p_nombre_personnes: number
          p_proteines_g: number
          p_recipe_id: string
          p_tags: string[]
          p_titre: string
          p_type_plat: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
