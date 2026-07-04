// Generated from the live Supabase project (sama-crm / vsxesrhoovabgsmvodvh)
// via `supabase gen types typescript`. Regenerate after schema changes.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      automations: {
        Row: {
          channel: string | null
          enabled: boolean | null
          id: string
          market: string | null
          msg_type: string | null
          name: string | null
          offset_days: number | null
          template: string | null
          trigger_kind: string | null
        }
        Insert: {
          channel?: string | null
          enabled?: boolean | null
          id?: string
          market?: string | null
          msg_type?: string | null
          name?: string | null
          offset_days?: number | null
          template?: string | null
          trigger_kind?: string | null
        }
        Update: {
          channel?: string | null
          enabled?: boolean | null
          id?: string
          market?: string | null
          msg_type?: string | null
          name?: string | null
          offset_days?: number | null
          template?: string | null
          trigger_kind?: string | null
        }
        Relationships: []
      }
      bookings: {
        Row: {
          check_in: string | null
          check_out: string | null
          contact_id: string | null
          created_at: string | null
          guest: string | null
          id: string
          phone: string | null
          ref: string
          room_type: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          contact_id?: string | null
          created_at?: string | null
          guest?: string | null
          id?: string
          phone?: string | null
          ref: string
          room_type?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          contact_id?: string | null
          created_at?: string | null
          guest?: string | null
          id?: string
          phone?: string | null
          ref?: string
          room_type?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          body: string | null
          channel: string | null
          clicked: number | null
          created_at: string | null
          id: string
          market: string | null
          name: string | null
          opened: number | null
          scheduled_for: string | null
          segment: string | null
          sent: number | null
          status: string | null
        }
        Insert: {
          body?: string | null
          channel?: string | null
          clicked?: number | null
          created_at?: string | null
          id?: string
          market?: string | null
          name?: string | null
          opened?: number | null
          scheduled_for?: string | null
          segment?: string | null
          sent?: number | null
          status?: string | null
        }
        Update: {
          body?: string | null
          channel?: string | null
          clicked?: number | null
          created_at?: string | null
          id?: string
          market?: string | null
          name?: string | null
          opened?: number | null
          scheduled_for?: string | null
          segment?: string | null
          sent?: number | null
          status?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          birthday: string | null
          consent: boolean | null
          consent_at: string | null
          consent_source: string | null
          created_at: string | null
          email: string | null
          id: string
          lang: string | null
          last_inbound_at: string | null
          last_stay: string | null
          market: string | null
          name: string
          nationality: string | null
          phone: string
          room_type: string | null
          tags: string[] | null
        }
        Insert: {
          birthday?: string | null
          consent?: boolean | null
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lang?: string | null
          last_inbound_at?: string | null
          last_stay?: string | null
          market?: string | null
          name: string
          nationality?: string | null
          phone: string
          room_type?: string | null
          tags?: string[] | null
        }
        Update: {
          birthday?: string | null
          consent?: boolean | null
          consent_at?: string | null
          consent_source?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lang?: string | null
          last_inbound_at?: string | null
          last_stay?: string | null
          market?: string | null
          name?: string
          nationality?: string | null
          phone?: string
          room_type?: string | null
          tags?: string[] | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          automation_id: string | null
          body: string | null
          booking_id: string | null
          campaign_id: string | null
          channel: string | null
          contact_id: string | null
          direction: string | null
          id: string
          provider_msg_id: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          automation_id?: string | null
          body?: string | null
          booking_id?: string | null
          campaign_id?: string | null
          channel?: string | null
          contact_id?: string | null
          direction?: string | null
          id?: string
          provider_msg_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          automation_id?: string | null
          body?: string | null
          booking_id?: string | null
          campaign_id?: string | null
          channel?: string | null
          contact_id?: string | null
          direction?: string | null
          id?: string
          provider_msg_id?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      my_role: { Args: never; Returns: string }
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

// ---------------------------------------------------------------------------
// App-level aliases and unions
// ---------------------------------------------------------------------------
export type Contact = Tables<"contacts">
export type Booking = Tables<"bookings">
export type Automation = Tables<"automations">
export type Campaign = Tables<"campaigns">
export type Message = Tables<"messages">
export type Profile = Tables<"profiles">

export type Role = "super_admin" | "reservation_desk"
export type Market = "Oman" | "GCC" | "International" | "Unknown"
export type BookingSource = "Website" | "OTA" | "Offline"
export type Channel = "whatsapp" | "email"
export type MsgType = "utility" | "marketing"
export type TriggerKind =
  | "booking_created"
  | "pre_arrival"
  | "post_stay"
  | "birthday"
  | "win_back"
