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
      apartments: {
        Row: {
          apartment_number: string
          created_at: string | null
          daily_rate: number
          id: string
          location_id: string | null
          monthly_rate: number | null
          notes: string | null
          status: string | null
          type: string | null
          weekly_rate: number | null
        }
        Insert: {
          apartment_number: string
          created_at?: string | null
          daily_rate: number
          id?: string
          location_id?: string | null
          monthly_rate?: number | null
          notes?: string | null
          status?: string | null
          type?: string | null
          weekly_rate?: number | null
        }
        Update: {
          apartment_number?: string
          created_at?: string | null
          daily_rate?: number
          id?: string
          location_id?: string | null
          monthly_rate?: number | null
          notes?: string | null
          status?: string | null
          type?: string | null
          weekly_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apartments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_paid: number | null
          apartment_id: string | null
          booking_reference: string
          booking_status: string | null
          check_in_date: string
          check_out_date: string
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          number_of_days: number | null
          outstanding_balance: number | null
          payment_status: string | null
          rate_per_day: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          amount_paid?: number | null
          apartment_id?: string | null
          booking_reference: string
          booking_status?: string | null
          check_in_date: string
          check_out_date: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          number_of_days?: number | null
          outstanding_balance?: number | null
          payment_status?: string | null
          rate_per_day: number
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          amount_paid?: number | null
          apartment_id?: string | null
          booking_reference?: string
          booking_status?: string | null
          check_in_date?: string
          check_out_date?: string
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          number_of_days?: number | null
          outstanding_balance?: number | null
          payment_status?: string | null
          rate_per_day?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_apartment_id_fkey"
            columns: ["apartment_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          nrc_or_passport: string | null
          phone: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          nrc_or_passport?: string | null
          phone: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          nrc_or_passport?: string | null
          phone?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          city: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          city?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          client_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          receipt_number: string
          recorded_by: string | null
        }
        Insert: {
          amount: number
          booking_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_number: string
          recorded_by?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          receipt_number?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_name: string
          metric_type: string
          path: string | null
          rating: string | null
          recorded_by: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_type: string
          path?: string | null
          rating?: string | null
          recorded_by?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_type?: string
          path?: string | null
          rating?: string | null
          recorded_by?: string | null
          value?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          location_id: string | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          location_id?: string | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          location_id?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      log_client_metric: {
        Args: {
          p_metadata?: Json
          p_metric_name: string
          p_metric_type: string
          p_path?: string
          p_rating?: string
          p_value: number
        }
        Returns: undefined
      }
      next_booking_ref: { Args: never; Returns: string }
      record_payment: {
        Args: {
          p_amount: number
          p_booking_id: string
          p_payment_date: string
          p_payment_method: string
        }
        Returns: Json
      }
      update_booking_status: {
        Args: { p_booking_id: string; p_new_status: string; p_notes?: string }
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
