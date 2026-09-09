// Generated from the live Supabase project (sama-crm / vsxesrhoovabgsmvodvh)
// via the Supabase MCP `generate_typescript_types` (2026-09-07, after
// migrations 0005–0007). Regenerate after schema changes.
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
      bk_addons: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          details: Json
          id: string
          image: string | null
          is_active: boolean
          kind: string
          max_quantity: number
          name_ar: string
          name_en: string
          note_hint_ar: string | null
          note_hint_en: string | null
          price_omr: number
          requires_note: boolean
          slug: string
          sort_order: number
          tagline_ar: string | null
          tagline_en: string | null
          taxable: boolean
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          details?: Json
          id?: string
          image?: string | null
          is_active?: boolean
          kind?: string
          max_quantity?: number
          name_ar: string
          name_en: string
          note_hint_ar?: string | null
          note_hint_en?: string | null
          price_omr: number
          requires_note?: boolean
          slug: string
          sort_order?: number
          tagline_ar?: string | null
          tagline_en?: string | null
          taxable?: boolean
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          details?: Json
          id?: string
          image?: string | null
          is_active?: boolean
          kind?: string
          max_quantity?: number
          name_ar?: string
          name_en?: string
          note_hint_ar?: string | null
          note_hint_en?: string | null
          price_omr?: number
          requires_note?: boolean
          slug?: string
          sort_order?: number
          tagline_ar?: string | null
          tagline_en?: string | null
          taxable?: boolean
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      bk_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          diff: Json | null
          entity: string
          entity_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          diff?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          diff?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
        }
        Relationships: []
      }
      bk_booking_addons: {
        Row: {
          addon_id: string
          booking_id: string
          created_at: string
          id: string
          note: string | null
          quantity: number
          status: string
          taxable: boolean
          total_omr: number
          unit_price_omr: number
          updated_at: string
        }
        Insert: {
          addon_id: string
          booking_id: string
          created_at?: string
          id?: string
          note?: string | null
          quantity: number
          status?: string
          taxable?: boolean
          total_omr: number
          unit_price_omr: number
          updated_at?: string
        }
        Update: {
          addon_id?: string
          booking_id?: string
          created_at?: string
          id?: string
          note?: string | null
          quantity?: number
          status?: string
          taxable?: boolean
          total_omr?: number
          unit_price_omr?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bk_booking_addons_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "bk_addons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bk_booking_addons_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bk_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_bookings: {
        Row: {
          addons_omr: number
          adults: number
          bed_preference: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          check_in: string
          check_out: string
          checked_in_at: string | null
          checked_out_at: string | null
          children: number
          contact_id: string | null
          created_at: string
          created_by: string | null
          discount_omr: number
          guest_email: string | null
          guest_name: string
          guest_phone: string
          id: string
          internal_notes: string | null
          nationality: string | null
          nightly_rates: Json
          nights: number | null
          preferred_lang: string
          promo_code: string | null
          ref: string
          room_id: string | null
          room_subtotal_omr: number
          room_type_id: string
          service_charge_omr: number
          source: string
          special_requests: string | null
          status: string
          total_omr: number
          tourism_fee_omr: number
          updated_at: string
          vat_omr: number
        }
        Insert: {
          addons_omr?: number
          adults?: number
          bed_preference?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          check_in: string
          check_out: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          children?: number
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_omr?: number
          guest_email?: string | null
          guest_name: string
          guest_phone: string
          id?: string
          internal_notes?: string | null
          nationality?: string | null
          nightly_rates?: Json
          nights?: number | null
          preferred_lang?: string
          promo_code?: string | null
          ref: string
          room_id?: string | null
          room_subtotal_omr?: number
          room_type_id: string
          service_charge_omr?: number
          source?: string
          special_requests?: string | null
          status?: string
          total_omr?: number
          tourism_fee_omr?: number
          updated_at?: string
          vat_omr?: number
        }
        Update: {
          addons_omr?: number
          adults?: number
          bed_preference?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          check_in?: string
          check_out?: string
          checked_in_at?: string | null
          checked_out_at?: string | null
          children?: number
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          discount_omr?: number
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string
          id?: string
          internal_notes?: string | null
          nationality?: string | null
          nightly_rates?: Json
          nights?: number | null
          preferred_lang?: string
          promo_code?: string | null
          ref?: string
          room_id?: string | null
          room_subtotal_omr?: number
          room_type_id?: string
          service_charge_omr?: number
          source?: string
          special_requests?: string | null
          status?: string
          total_omr?: number
          tourism_fee_omr?: number
          updated_at?: string
          vat_omr?: number
        }
        Relationships: [
          {
            foreignKeyName: "bk_bookings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bk_bookings_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "bk_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bk_bookings_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "bk_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_inventory_blocks: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          kind: string
          reason: string | null
          room_id: string | null
          room_type_id: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          kind?: string
          reason?: string | null
          room_id?: string | null
          room_type_id?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          kind?: string
          reason?: string | null
          room_id?: string | null
          room_type_id?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "bk_inventory_blocks_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "bk_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bk_inventory_blocks_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "bk_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_message_log: {
        Row: {
          booking_id: string | null
          channel: string
          created_at: string
          error: string | null
          id: string
          kind: string
          payload: Json | null
          provider_message_id: string | null
          recipient: string | null
          scheduled_id: string | null
          status: string
        }
        Insert: {
          booking_id?: string | null
          channel: string
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          payload?: Json | null
          provider_message_id?: string | null
          recipient?: string | null
          scheduled_id?: string | null
          status: string
        }
        Update: {
          booking_id?: string | null
          channel?: string
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          payload?: Json | null
          provider_message_id?: string | null
          recipient?: string | null
          scheduled_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bk_message_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bk_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bk_message_log_scheduled_id_fkey"
            columns: ["scheduled_id"]
            isOneToOne: false
            referencedRelation: "bk_scheduled_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_rate_plans: {
        Row: {
          adjust_pct: number | null
          created_at: string
          created_by: string | null
          days_of_week: number[] | null
          end_date: string
          id: string
          is_active: boolean
          min_stay: number
          name: string
          priority: number
          rate_omr: number | null
          room_type_id: string | null
          start_date: string
          updated_at: string
        }
        Insert: {
          adjust_pct?: number | null
          created_at?: string
          created_by?: string | null
          days_of_week?: number[] | null
          end_date: string
          id?: string
          is_active?: boolean
          min_stay?: number
          name: string
          priority?: number
          rate_omr?: number | null
          room_type_id?: string | null
          start_date: string
          updated_at?: string
        }
        Update: {
          adjust_pct?: number | null
          created_at?: string
          created_by?: string | null
          days_of_week?: number[] | null
          end_date?: string
          id?: string
          is_active?: boolean
          min_stay?: number
          name?: string
          priority?: number
          rate_omr?: number | null
          room_type_id?: string | null
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bk_rate_plans_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "bk_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_room_types: {
        Row: {
          amenities: Json
          bed_options: string[]
          base_rate_omr: number
          bed_config_ar: string | null
          bed_config_en: string | null
          created_at: string
          crm_value: string
          description_ar: string | null
          description_en: string | null
          id: string
          images: string[]
          is_active: boolean
          max_adults: number
          max_children: number
          name_ar: string
          name_en: string
          size_sqm: number | null
          slug: string
          sort_order: number
          tagline_ar: string | null
          tagline_en: string | null
          updated_at: string
          view_ar: string | null
          view_en: string | null
        }
        Insert: {
          amenities?: Json
          bed_options?: string[]
          base_rate_omr: number
          bed_config_ar?: string | null
          bed_config_en?: string | null
          created_at?: string
          crm_value: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          images?: string[]
          is_active?: boolean
          max_adults?: number
          max_children?: number
          name_ar: string
          name_en: string
          size_sqm?: number | null
          slug: string
          sort_order?: number
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          view_ar?: string | null
          view_en?: string | null
        }
        Update: {
          amenities?: Json
          bed_options?: string[]
          base_rate_omr?: number
          bed_config_ar?: string | null
          bed_config_en?: string | null
          created_at?: string
          crm_value?: string
          description_ar?: string | null
          description_en?: string | null
          id?: string
          images?: string[]
          is_active?: boolean
          max_adults?: number
          max_children?: number
          name_ar?: string
          name_en?: string
          size_sqm?: number | null
          slug?: string
          sort_order?: number
          tagline_ar?: string | null
          tagline_en?: string | null
          updated_at?: string
          view_ar?: string | null
          view_en?: string | null
        }
        Relationships: []
      }
      bk_rooms: {
        Row: {
          created_at: string
          floor: string | null
          bed_type: string | null
          id: string
          notes: string | null
          room_number: string
          room_type_id: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor?: string | null
          bed_type?: string | null
          id?: string
          notes?: string | null
          room_number: string
          room_type_id: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor?: string | null
          bed_type?: string | null
          id?: string
          notes?: string | null
          room_number?: string
          room_type_id?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bk_rooms_room_type_id_fkey"
            columns: ["room_type_id"]
            isOneToOne: false
            referencedRelation: "bk_room_types"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_scheduled_messages: {
        Row: {
          attempts: number
          booking_id: string
          channel: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          locked_at: string | null
          send_at: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          channel: string
          created_at?: string
          id?: string
          kind: string
          last_error?: string | null
          locked_at?: string | null
          send_at: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          locked_at?: string | null
          send_at?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bk_scheduled_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bk_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bk_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
          wa_template_language: string | null
          wa_template_name: string | null
          wa_template_params: Json | null
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
          wa_template_language?: string | null
          wa_template_name?: string | null
          wa_template_params?: Json | null
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
          wa_template_language?: string | null
          wa_template_name?: string | null
          wa_template_params?: Json | null
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
      bk_availability: {
        Args: {
          p_adults?: number
          p_check_in: string
          p_check_out: string
          p_children?: number
        }
        Returns: {
          available_count: number
          fits_capacity: boolean
          min_stay: number
          min_stay_ok: boolean
          nightly: Json
          room_subtotal: number
          room_type_id: string
          slug: string
        }[]
      }
      bk_available_count: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_exclude_booking?: string
          p_room_type_id: string
        }
        Returns: number
      }
      bk_cancel_booking: {
        Args: { p_actor?: string; p_booking_id: string; p_reason?: string }
        Returns: Json
      }
      bk_create_booking: { Args: { p: Json }; Returns: Json }
      bk_effective_rate: {
        Args: { p_date: string; p_room_type_id: string }
        Returns: number
      }
      bk_generate_ref: { Args: never; Returns: string }
      bk_min_stay: {
        Args: { p_check_in: string; p_room_type_id: string }
        Returns: number
      }
      bk_muscat_today: { Args: never; Returns: string }
      bk_nightly_rates: {
        Args: {
          p_check_in: string
          p_check_out: string
          p_room_type_id: string
        }
        Returns: Json
      }
      bk_public_settings: { Args: never; Returns: Json }
      bk_quote: {
        Args: {
          p_addons?: Json
          p_adults?: number
          p_check_in: string
          p_check_out: string
          p_children?: number
          p_promo_code?: string
          p_room_type_id: string
        }
        Returns: Json
      }
      bk_schedule_booking_messages: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      bk_send_at: {
        Args: { p_check_in: string; p_check_out: string; p_kind: string }
        Returns: string
      }
      bk_setting: { Args: { p_key: string }; Returns: Json }
      bk_upsert_contact: {
        Args: {
          p_email: string
          p_lang: string
          p_name: string
          p_nationality: string
          p_phone: string
        }
        Returns: string
      }
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

// Booking-engine aliases
export type BkRoomType = Tables<"bk_room_types">
export type BkRoom = Tables<"bk_rooms">
export type BkRatePlan = Tables<"bk_rate_plans">
export type BkInventoryBlock = Tables<"bk_inventory_blocks">
export type BkBooking = Tables<"bk_bookings">
export type BkSetting = Tables<"bk_settings">
export type BkScheduledMessage = Tables<"bk_scheduled_messages">
export type BkMessageLog = Tables<"bk_message_log">
export type BkAuditLog = Tables<"bk_audit_log">
export type BkAddon = Tables<"bk_addons">
export type BkBookingAddon = Tables<"bk_booking_addons">

export type BkBookingStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "checked_out"
  | "cancelled"
  | "no_show"
export type BkBookingSource = "website" | "staff" | "phone" | "walk_in" | "ota"
export type BkMessageKind = "confirmation" | "pre_arrival" | "post_stay"
export type BkScheduledStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "stubbed"
  | "cancelled"
  | "skipped"
export type BkLocale = "en" | "ar"
export type BkBedType = "twin" | "king"
export type BkAddonKind = "activity" | "transfer" | "other"
export type BkAddonUnit = "per_person" | "per_car" | "per_booking" | "per_night"
export type BkBookingAddonStatus = "requested" | "confirmed" | "done" | "cancelled"
