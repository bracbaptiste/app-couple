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
          created_at: string | null
          done_at: string | null
          done_by: string | null
          due_date: string | null
          id: string
          is_done: boolean
          list_id: string
          note: string | null
          position: number
          title: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          list_id: string
          note?: string | null
          position?: number
          title: string
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          done_at?: string | null
          done_by?: string | null
          due_date?: string | null
          id?: string
          is_done?: boolean
          list_id?: string
          note?: string | null
          position?: number
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
      move_category: {
        Args: { p_category_id: string; p_direction: string }
        Returns: boolean
      }
      normaliser_nom: { Args: { raw: string }; Returns: string }
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
