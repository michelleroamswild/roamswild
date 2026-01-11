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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      campsite_photos: {
        Row: {
          campsite_id: string
          caption: string | null
          created_at: string | null
          id: string
          is_primary: boolean | null
          url: string
          user_id: string
        }
        Insert: {
          campsite_id: string
          caption?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          url: string
          user_id: string
        }
        Update: {
          campsite_id?: string
          caption?: string | null
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campsite_photos_campsite_id_fkey"
            columns: ["campsite_id"]
            isOneToOne: false
            referencedRelation: "campsites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campsite_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campsites: {
        Row: {
          cell_coverage: number | null
          created_at: string | null
          description: string | null
          fee_amount: string | null
          fee_required: boolean | null
          id: string
          lat: number
          lng: number
          max_stay_days: number | null
          max_vehicles: number | null
          metadata: Json | null
          name: string
          notes: string | null
          place_id: string | null
          road_access: string | null
          seasonal_access: string | null
          type: string | null
          updated_at: string | null
          user_id: string
          visibility: string
          water_available: boolean | null
        }
        Insert: {
          cell_coverage?: number | null
          created_at?: string | null
          description?: string | null
          fee_amount?: string | null
          fee_required?: boolean | null
          id?: string
          lat: number
          lng: number
          max_stay_days?: number | null
          max_vehicles?: number | null
          metadata?: Json | null
          name: string
          notes?: string | null
          place_id?: string | null
          road_access?: string | null
          seasonal_access?: string | null
          type?: string | null
          updated_at?: string | null
          user_id: string
          visibility?: string
          water_available?: boolean | null
        }
        Update: {
          cell_coverage?: number | null
          created_at?: string | null
          description?: string | null
          fee_amount?: string | null
          fee_required?: boolean | null
          id?: string
          lat?: number
          lng?: number
          max_stay_days?: number | null
          max_vehicles?: number | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          place_id?: string | null
          road_access?: string | null
          seasonal_access?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string
          visibility?: string
          water_available?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "campsites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          name: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      saved_locations: {
        Row: {
          address: string | null
          id: string
          lat: number
          lng: number
          name: string
          place_id: string
          saved_at: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          id?: string
          lat: number
          lng: number
          name: string
          place_id: string
          saved_at?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          place_id?: string
          saved_at?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_trips: {
        Row: {
          config: Json
          created_at: string | null
          days: Json
          id: string
          name: string
          owner_id: string | null
          total_distance: string | null
          total_driving_time: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          config: Json
          created_at?: string | null
          days: Json
          id?: string
          name: string
          owner_id?: string | null
          total_distance?: string | null
          total_driving_time?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string | null
          days?: Json
          id?: string
          name?: string
          owner_id?: string | null
          total_distance?: string | null
          total_driving_time?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_trips_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_trips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_activity: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_activity_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "saved_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_collaborators: {
        Row: {
          id: string
          invited_at: string | null
          invited_by: string | null
          permission: string
          trip_id: string
          user_id: string
        }
        Insert: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          permission: string
          trip_id: string
          user_id: string
        }
        Update: {
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          permission?: string
          trip_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_collaborators_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_collaborators_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "saved_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_collaborators_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_share_links: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          permission: string
          token: string
          trip_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          permission: string
          token?: string
          trip_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          permission?: string
          token?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_share_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_share_links_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "saved_trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_trip: { Args: { trip_id: string }; Returns: boolean }
      get_trip_members: {
        Args: { p_trip_id: string }
        Returns: {
          email: string
          name: string
          permission: string
          user_id: string
        }[]
      }
      get_trip_preview_by_token: {
        Args: { share_token: string }
        Returns: Json
      }
      is_trip_collaborator: { Args: { trip_id: string }; Returns: boolean }
      is_trip_owner: { Args: { trip_id: string }; Returns: boolean }
      join_trip_by_share_link: { Args: { share_token: string }; Returns: Json }
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
